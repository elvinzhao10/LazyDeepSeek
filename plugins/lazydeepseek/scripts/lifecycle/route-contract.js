'use strict';

// LazyDeepSeek dsh route contract lib: validates the package boundary for the
// DeepSeek Harness distribution routes (ratified Q1, GitHub-only; the npm
// registry is NOT used for this package):
//   dsh-plugin-git-sha    default     git spec pinned to a commit sha
//   dsh-plugin-tarball    alternate   GitHub release tarball asset
//   dsh-plugin-local-dir  development `dsh plugin --profile <p> add ./dir`
//   manual-skills-mcp-fallback        recovery-only (excludes commands/agents/hooks)
// Replaces the earlier family marketplace-routes machinery: there is no
// marketplace file and no plugin manifest on dsh — the package boundary is
// the root package.json (dsh key, exact peer pin, no install-time build
// scripts) plus the committed prebuilt lib/ entry and cordis.patch.yml rows.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LifecycleError } = require('./errors');
const { safeFile } = require('./files');

const CONTRACT_PATH = path.resolve(__dirname, '..', '..', 'contracts', 'dsh-route-contract.v1.json');
const PLUGIN_DIR = 'plugins/lazydeepseek';
const PACKAGE_MANIFEST_ARTIFACT = 'package.json';
const BUNDLE_PATCH_ARTIFACT = 'cordis.patch.yml';
const DSH_PEER_PIN = '0.2.0-rc.2';
const ROUTES = Object.freeze(['dsh-plugin-git-sha', 'dsh-plugin-tarball', 'dsh-plugin-local-dir', 'manual-skills-mcp-fallback']);

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonFile(file, code) {
  const bytes = safeFile(file, code).bytes;
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    throw new LifecycleError(code, `invalid JSON: ${file}`, error);
  }
}

function contract() {
  const contractFile = jsonFile(CONTRACT_PATH, 'ROUTE_CONTRACT_INVALID');
  const expectedDigest = safeFile(`${CONTRACT_PATH}.sha256`, 'ROUTE_CONTRACT_INVALID')
    .bytes.toString('utf8').trim().split(/\s+/)[0];
  if (digest(contractFile.bytes) !== expectedDigest) {
    throw new LifecycleError('ROUTE_CONTRACT_INVALID', 'dsh route contract digest mismatch');
  }
  const parsed = contractFile.value;
  if (parsed?.schema_version !== 1 || typeof parsed.version !== 'string'
    || !parsed.identity || !parsed.artifacts || !parsed.payload || !parsed.default_routes || !parsed.fallback) {
    throw new LifecycleError('ROUTE_CONTRACT_INVALID', 'dsh route contract is malformed');
  }
  return parsed;
}

function validatePackageManifest(value, expectedVersion) {
  const errorCode = value?.version === expectedVersion ? 'ROUTE_IDENTITY_INVALID' : 'ROUTE_VERSION_MISMATCH';
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LifecycleError(errorCode, 'package manifest must be a JSON object');
  }
  if (value.name !== 'lazydeepseek') {
    throw new LifecycleError(errorCode, 'package name must be lazydeepseek');
  }
  if (value.version !== expectedVersion) {
    throw new LifecycleError(errorCode, `package version must be ${expectedVersion}`);
  }
  if (value.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new LifecycleError(errorCode, "package dsh.bundle.patch must be './cordis.patch.yml'");
  }
  if (value.peerDependencies?.['@deepseek-ai/dsh'] !== DSH_PEER_PIN) {
    throw new LifecycleError(errorCode, `peerDependencies['@deepseek-ai/dsh'] must be exactly '${DSH_PEER_PIN}'`);
  }
  const buildScripts = ['prepare', 'preinstall', 'postinstall', 'install'].filter((s) => value.scripts && value.scripts[s]);
  if (buildScripts.length > 0) {
    throw new LifecycleError(errorCode, `install-time build scripts present (${buildScripts.join(', ')}); git-spec installs must not depend on pnpm allowBuilds`);
  }
}

function inventory(pluginRoot, policy) {
  const records = [];
  const walk = (relative) => {
    const directory = path.join(pluginRoot, relative);
    let names;
    try {
      names = fs.readdirSync(directory).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    } catch (error) {
      throw new LifecycleError('ROUTE_PAYLOAD_INVALID', `canonical payload root unavailable: ${relative}`, error);
    }
    for (const name of names) {
      const child = path.posix.join(relative, name);
      const absolute = path.join(pluginRoot, child);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(child);
      else if (stat.isFile() && stat.nlink === 1 && name !== '.gitkeep') {
        records.push({ path: child, sha256: digest(safeFile(absolute, 'ROUTE_PAYLOAD_INVALID').bytes) });
      } else if (name !== '.gitkeep') {
        throw new LifecycleError('ROUTE_PAYLOAD_INVALID', `canonical payload must contain only regular files: ${child}`);
      }
    }
  };
  for (const root of policy.roots) walk(root);
  for (const relative of policy.files) {
    records.push({ path: relative, sha256: digest(safeFile(path.join(pluginRoot, relative), 'ROUTE_PAYLOAD_INVALID').bytes) });
  }
  records.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  return records;
}

function validateArtifact(file, expectedDigest, expectedVersion) {
  const parsed = jsonFile(file, 'ROUTE_MANIFEST_INVALID');
  if (digest(parsed.bytes) !== expectedDigest) {
    const version = parsed.value?.version;
    const code = version === expectedVersion ? 'ROUTE_IDENTITY_INVALID' : 'ROUTE_VERSION_MISMATCH';
    throw new LifecycleError(code, `artifact bytes changed: ${file}`);
  }
  return parsed.value;
}

// Non-JSON artifacts (the YAML bundle patch) validate by digest only.
function validateBytes(file, expectedDigest) {
  const bytes = safeFile(file, 'ROUTE_PATCH_INVALID').bytes;
  if (digest(bytes) !== expectedDigest) {
    throw new LifecycleError('ROUTE_PATCH_INVALID', `artifact bytes changed: ${file}`);
  }
}

function resultForPayload(policy, payload) {
  if (payload.length !== policy.payload.file_count || digest(Buffer.from(JSON.stringify(payload))) !== policy.payload.inventory_sha256) {
    throw new LifecycleError('ROUTE_PAYLOAD_INVALID', 'canonical payload inventory changed; regenerate with scripts/lazydeepseek-regenerate-route-contract.js');
  }
  return {
    version: policy.version,
    package_name: policy.identity.package,
    product: policy.identity.product,
    repository: policy.identity.repository,
    distribution: policy.identity.distribution,
    plugin: policy.identity.plugin,
    install_id: policy.identity.install_id,
    package_manifest: PACKAGE_MANIFEST_ARTIFACT,
    package_manifest_sha256: policy.artifacts[PACKAGE_MANIFEST_ARTIFACT],
    routes: ROUTES,
    payload_inventory: payload.map((item) => item.path),
  };
}

// The release root IS the package root in this layout (git repo = npm package;
// plugins/lazydeepseek is the payload nested inside the package).
function validateDshRoutes(packageRoot) {
  const policy = contract();
  const artifacts = {};
  for (const [relative, expectedDigest] of Object.entries(policy.artifacts)) {
    if (relative.endsWith('.json')) {
      artifacts[relative] = validateArtifact(path.join(packageRoot, relative), expectedDigest, policy.version);
    } else {
      validateBytes(path.join(packageRoot, relative), expectedDigest);
    }
  }
  validatePackageManifest(artifacts[PACKAGE_MANIFEST_ARTIFACT], policy.version);
  const patchBytes = safeFile(path.join(packageRoot, BUNDLE_PATCH_ARTIFACT), 'ROUTE_PATCH_INVALID').bytes.toString('utf8');
  for (const needle of ["name: './lib/index.mjs'", "'@deepseek-ai/dsh-hooks-claude-code'", 'id: tool-ralph']) {
    if (!patchBytes.includes(needle)) {
      throw new LifecycleError('ROUTE_PATCH_INVALID', `cordis.patch.yml missing expected row content: ${needle}`);
    }
  }
  const serverRows = [...patchBytes.matchAll(/serverName:\s*(\S+)/g)].map((m) => m[1]);
  if (serverRows.length !== 6 || new Set(serverRows).size !== 6) {
    throw new LifecycleError('ROUTE_PATCH_INVALID', `expected exactly six dsh-mcp-client rows, found: ${serverRows.join(', ') || 'none'}`);
  }
  if (!fs.existsSync(path.join(packageRoot, 'lib', 'index.mjs'))) {
    throw new LifecycleError('ROUTE_PREBUILT_LIB_INVALID', 'prebuilt lib/index.mjs missing (committed build is the install payload)');
  }
  const payload = inventory(path.join(packageRoot, PLUGIN_DIR), policy.payload);
  return resultForPayload(policy, payload);
}

// Installed-package boundary: identical validation — the installed package
// root carries package.json, cordis.patch.yml, lib/ and plugins/lazydeepseek.
function validateInstalledDshPackage(packageRoot) {
  return validateDshRoutes(packageRoot);
}

function defaultRouteForHost(host) {
  const route = contract().default_routes[host];
  if (!route) throw new LifecycleError('INVALID_HOST', `unsupported dsh host: ${host}`);
  return route;
}

function fallbackPolicy() {
  return contract().fallback;
}

module.exports = {
  PLUGIN_DIR,
  PACKAGE_MANIFEST_ARTIFACT,
  BUNDLE_PATCH_ARTIFACT,
  DSH_PEER_PIN,
  ROUTES,
  defaultRouteForHost,
  fallbackPolicy,
  inventory,
  validateInstalledDshPackage,
  validateDshRoutes,
};
