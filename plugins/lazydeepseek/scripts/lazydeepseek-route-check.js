#!/usr/bin/env node
'use strict';

// LazyDeepSeek dsh route check: validates the installed package boundary for
// the DeepSeek Harness distribution routes (ratified Q1, GitHub-only):
//   dsh-plugin-git-sha   (default; git spec pinned to a commit sha)
//   dsh-plugin-tarball   (alternate; GitHub release tarball asset)
//   dsh-plugin-local-dir (development; `dsh plugin --profile <p> add ./dir`)
//   manual-skills-mcp-fallback (recovery-only)
// The npm registry is NOT used for this package. Checks: root package.json
// identity/version/dsh key, prebuilt lib/ entry, cordis.patch.yml row
// inventory (shim, bridge, six MCP servers), no build scripts required by an
// install (no prepare/preinstall/postinstall), and payload presence.

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_VERSION = '1.3.5';
const MCP_SERVERS = ['run-ledger', 'verification', 'status-dashboard', 'context-graph', 'code-intel', 'docs'];

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ error: code, message })}\n`);
  process.exitCode = 1;
}

function main() {
  // Package root = two levels above this script (plugins/lazydeepseek/scripts).
  const pluginRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(pluginRoot, '..', '..');
  const packagePath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return fail('ROUTE_PACKAGE_MISSING', `package.json missing at ${packagePath}`);
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (pkg.name !== 'lazydeepseek') return fail('ROUTE_PACKAGE_NAME', `expected package name 'lazydeepseek', got ${pkg.name}`);
  if (pkg.version !== EXPECTED_VERSION) return fail('ROUTE_PACKAGE_VERSION', `expected version ${EXPECTED_VERSION}, got ${pkg.version}`);
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') return fail('ROUTE_DSH_KEY', "package.json dsh.bundle.patch must be './cordis.patch.yml'");
  if (pkg.peerDependencies?.['@deepseek-ai/dsh'] !== '0.2.0-rc.2') return fail('ROUTE_PEER_PIN', "peerDependencies['@deepseek-ai/dsh'] must be exactly '0.2.0-rc.2'");
  const buildScripts = ['prepare', 'preinstall', 'postinstall', 'install'].filter((s) => pkg.scripts && pkg.scripts[s]);
  if (buildScripts.length > 0) return fail('ROUTE_BUILD_SCRIPTS', `install-time build scripts present (${buildScripts.join(', ')}); git-spec installs must not depend on pnpm allowBuilds`);
  if (!fs.existsSync(path.join(repoRoot, 'lib', 'index.mjs'))) return fail('ROUTE_PREBUILT_LIB', 'prebuilt lib/index.mjs missing (committed build is the install payload)');

  const patchPath = path.join(repoRoot, 'cordis.patch.yml');
  if (!fs.existsSync(patchPath)) return fail('ROUTE_PATCH_MISSING', `cordis.patch.yml missing at ${patchPath}`);
  const patch = fs.readFileSync(patchPath, 'utf8');
  for (const needle of ["name: './lib/index.mjs'", "'@deepseek-ai/dsh-hooks-claude-code'", 'configPath: !!js', 'id: tool-ralph']) {
    if (!patch.includes(needle)) return fail('ROUTE_PATCH_ROWS', `cordis.patch.yml missing expected content: ${needle}`);
  }
  const servers = [...patch.matchAll(/serverName:\s*(\S+)/g)].map((m) => m[1]);
  const missing = MCP_SERVERS.filter((s) => !servers.includes(s));
  if (servers.length !== MCP_SERVERS.length || missing.length > 0) {
    return fail('ROUTE_PATCH_MCP', `expected exactly six dsh-mcp-client rows (${MCP_SERVERS.join(', ')}); found: ${servers.join(', ') || 'none'}`);
  }
  for (const dir of ['skills', 'commands', 'agents', 'hooks', 'mcp', 'scripts', 'contracts', 'tooling']) {
    if (!fs.existsSync(path.join(pluginRoot, dir))) return fail('ROUTE_PAYLOAD', `payload directory missing: plugins/lazydeepseek/${dir}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'pass',
    version: pkg.version,
    plugin: pkg.name,
    routes: ['dsh-plugin-git-sha', 'dsh-plugin-tarball', 'dsh-plugin-local-dir', 'manual-skills-mcp-fallback'],
    mcp_rows: servers.length,
  })}\n`);
}

try {
  main();
} catch (error) {
  fail('ROUTE_CHECK_ERROR', error.message);
}
