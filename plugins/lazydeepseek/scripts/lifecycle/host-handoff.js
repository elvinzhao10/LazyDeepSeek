'use strict';

const path = require('node:path');
const { LifecycleError } = require('./errors');
const { safeFile } = require('./files');
const {
  MCP_SERVERS,
  receiptTemplates,
  validateReceiptPath,
  validateDshReceipt,
} = require('./dsh-receipt');
const {
  defaultRouteForHost,
  fallbackPolicy,
  validateInstalledDshPackage,
  validateDshRoutes,
} = require('./route-contract');

const CONNECTORS = MCP_SERVERS;
const ROUTES = Object.freeze({
  'dsh-plugin-git-sha': 'dsh',
  'manual-skills-mcp-fallback': 'dsh',
});
const OBSERVATION_KEYS = ['artifact', 'host', 'observed_at', 'type'];

function routeSelection(routes) {
  const selected = [...new Set(routes)].sort();
  const hasDefault = selected.includes('dsh-plugin-git-sha');
  const hasFallback = selected.includes('manual-skills-mcp-fallback');
  if (hasDefault && hasFallback) {
    return {
      kind: 'conflict',
      routes: selected,
      nextAction: 'Use the host UI to remove the prior LazyDeepSeek route, start a fresh session, then select exactly one route.',
    };
  }
  if (selected.length === 0) return { kind: 'none' };
  if (selected.length !== 1) throw new LifecycleError('ROUTE_SELECTION_AMBIGUOUS', 'select exactly one host route');
  return { kind: 'route', route: selected[0], host: ROUTES[selected[0]] };
}

function parseObservation(receiptPath, host, context = {}) {
  if (receiptPath === undefined) return { status: 'pending' };
  try {
    validateReceiptPath(receiptPath);
  } catch (error) {
    throw new LifecycleError('OBSERVATION_RECEIPT_INVALID', error.message, error);
  }
  const routeContext = context && typeof context === 'object' && !(context instanceof Date) ? context : null;
  if (host === 'dsh' && routeContext && routeContext.route !== undefined) {
    if (routeContext.route !== 'dsh-plugin-git-sha') {
      throw new LifecycleError('LAZYDEEPSEEK_RECEIPT_INVALID', 'full-plugin receipt cannot validate a fallback route');
    }
    if (!routeContext.releaseRoot || !routeContext.manifestSha256 || !routeContext.build || !routeContext.session) {
      throw new LifecycleError('LAZYDEEPSEEK_RECEIPT_INVALID', 'current DeepSeek Harness build and session are required');
    }
    return validateDshReceipt(receiptPath, {
      ...routeContext,
      now: routeContext.now || new Date(),
    });
  }
  const now = context instanceof Date ? context : context.now || new Date();
  let receipt;
  try {
    receipt = JSON.parse(safeFile(receiptPath, 'OBSERVATION_RECEIPT_INVALID').bytes.toString('utf8'));
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    throw new LifecycleError('OBSERVATION_RECEIPT_INVALID', 'observation receipt must be valid JSON', error);
  }
  const observedAt = new Date(receipt?.observed_at);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(OBSERVATION_KEYS)
    || receipt.type !== 'host-observation' || receipt.host !== host
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(receipt.observed_at)
    || Number.isNaN(observedAt.getTime())
    || !/^[A-Za-z0-9._:-]+$/.test(receipt.artifact)) {
    throw new LifecycleError('OBSERVATION_RECEIPT_INVALID', 'observation receipt does not match the selected host');
  }
  const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (observedAt < currentDay || observedAt > now) return { status: 'pending' };
  return { status: 'observed', observation_receipt: receipt };
}

function connector(name, releaseRoot, projectRoot) {
  return {
    name,
    command: 'bash',
    args: [path.join(releaseRoot, 'plugins/lazydeepseek', 'mcp', name, 'server.sh')],
    cwd: projectRoot,
    env: { CWD: projectRoot, LAZYDEEPSEEK_PROJECT_DIR: projectRoot },
  };
}

function renderHandoff(route, releaseRoot, projectRoot, routeInfo = null) {
  const base = { namespace: 'lazydeepseek', route, host: ROUTES[route], host_mutation: 'none' };
  if (route === 'dsh-plugin-git-sha') {
    const templates = receiptTemplates(releaseRoot, routeInfo.package_manifest_sha256, routeInfo.version);
    return {
      ...base,
      route_priority: { rank: 1, fallback_rank: 2 },
      expected_artifacts: {
        package_manifest: path.join(releaseRoot, 'package.json'),
        bundle_patch: path.join(releaseRoot, 'cordis.patch.yml'),
        plugin: routeInfo.install_id,
        version: routeInfo.version,
      },
      preflight: { status: 'package-ready', full_plugin: 'user-observed-only' },
      receipt_templates: templates,
      degraded: { status: 'none' },
      next_action: {
        kind: 'cli',
        instruction: 'Install the pinned default route: '
          + 'dsh plugin --profile <name> add github:elvinzhao10/LazyDeepSeek#<commit-sha> '
          + '(the https://github.com/elvinzhao10/LazyDeepSeek repository as a git spec pinned to a commit sha; '
          + 'the package ships prebuilt lib/ and no build scripts). '
          + `For an offline checkout, install the local package root ${releaseRoot} directly. `
          + 'Run dsh --profile <name> --dump-config afterwards and confirm the lazydeepseek rows before taking the next action.',
      },
    };
  }
  return {
    ...base,
    route_priority: { rank: 2, recovery_only: true },
    expected_artifacts: { skills: path.join(releaseRoot, 'plugins/lazydeepseek', 'skills') },
    recovery: fallbackPolicy(),
    degraded: { status: 'manual-skills-mcp-fallback', excludes: fallbackPolicy().excludes },
    manual_mcp: { connectors: CONNECTORS.map((name) => connector(name, releaseRoot, projectRoot)) },
    next_action: { kind: 'cli', instruction: 'Copy the bundled skills directory to .agents/skills in the project, then hand-write the six dsh-mcp-client stdio rows from docs/reference/host-routes.md.' },
  };
}

module.exports = {
  defaultRouteForHost,
  parseObservation,
  renderHandoff,
  routeSelection,
  validateInstalledDshPackage,
  validateDshRoutes,
};
