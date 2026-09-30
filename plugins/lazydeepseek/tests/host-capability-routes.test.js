'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CAPABILITY_STATUSES,
  SURFACES,
  buildDshMatrix,
  discoverDshBinary,
  observeDshEnablement,
  probeDsh,
} = require('../scripts/lifecycle/host-capabilities');

const NOW = '2026-08-27T16:00:00.000Z';

function fakeBinary(root, name = 'dsh', version = '2.105.0') {
  const file = path.join(root, name);
  const body = `#!/usr/bin/env node\nif (process.argv[2] === '--version') process.stdout.write('DeepSeek Harness ${version}\\n');\nelse process.exitCode = 2;\n`;
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
}

function selfMutatingBinary(root) {
  const file = path.join(root, 'dsh');
  const body = `#!/usr/bin/env node\nconst fs=require('node:fs');if(process.argv[2]==='--version'){fs.appendFileSync(__filename,'\\n');process.stdout.write('DeepSeek Harness 2.105.0\\n');}else process.exitCode=2;\n`;
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
}

function statusMap(matrix) {
  return Object.fromEntries(matrix.capabilities.map(({ capability, status, reason_code }) => [capability, { status, reason_code }]));
}

test('DeepSeek Harness probes expose only fingerprinted package surfaces and fail closed', (t) => {
  // Given: a fake dsh binary whose --version output is stable.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydeepseek-dsh-probe-'));
  const dsh = fakeBinary(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // When: the binary is probed through a bounded --version call.
  const matrix = probeDsh({ binary: dsh, now: NOW });

  // Then: every package surface is probe-observed and fingerprinted.
  assert.equal(matrix.product, 'DeepSeek Harness');
  assert.equal(matrix.outcome, 'observed');
  assert.equal(matrix.version, '2.105.0');
  assert.deepEqual(matrix.capabilities.map(({ capability }) => capability), [...SURFACES]);
  assert.ok(matrix.capabilities.every(({ status }) => status === 'probe-observed'));
  assert.ok(matrix.capabilities.every(({ fingerprint }) => /^[0-9a-f]{64}$/.test(fingerprint)));

  // And: an absent binary fails closed without inventing capability claims.
  const absent = probeDsh({ binary: null, now: NOW });
  assert.equal(absent.outcome, 'absent');
  assert.equal(absent.reason_code, 'BINARY_ABSENT');
  assert.ok(absent.capabilities.every(({ status }) => status === 'missing'));

  // And: a self-mutating executable is rejected as stale.
  const mutating = selfMutatingBinary(root);
  const stale = probeDsh({ binary: mutating, now: NOW });
  assert.equal(stale.outcome, 'blocked');
  assert.equal(stale.reason_code, 'STALE_EXECUTABLE');

  // And: discovery only accepts an executable named dsh.
  assert.equal(discoverDshBinary(`not-a-path${path.delimiter}${root}`), dsh);
});

test('capability matrix maps marketplace and fallback routes onto package surfaces', () => {
  // Given: the checked-in manifest and the two DeepSeek Harness route selections.
  const manifestPath = path.join(__dirname, '..', '..', '..', 'package.json');

  // When: the matrix is built for the marketplace route.
  const marketplace = buildDshMatrix({ manifestPath, routes: ['dsh-plugin-git-sha'], now: NOW, version: '1.3.0' });

  // Then: all five surfaces are package-ready with manifest-fingerprint evidence.
  assert.equal(marketplace.product, 'DeepSeek Harness');
  assert.equal(marketplace.outcome, 'degraded');
  assert.deepEqual(statusMap(marketplace), Object.fromEntries(SURFACES.map((name) => [name, { status: 'package-ready', reason_code: null }])));
  assert.ok(marketplace.capabilities.every(({ evidence }) => evidence.scope === 'package'));

  // And: the fallback route excludes commands, agents, and hooks fail-closed.
  const fallback = buildDshMatrix({ manifestPath, routes: ['manual-skills-mcp-fallback'], now: NOW, version: '1.3.0' });
  const fallbackMap = statusMap(fallback);
  assert.equal(fallbackMap.skills.status, 'package-ready');
  assert.equal(fallbackMap.mcp.status, 'package-ready');
  assert.equal(fallbackMap.commands.reason_code, 'FALLBACK_SURFACE_EXCLUDED');
  assert.equal(fallbackMap.agents.reason_code, 'FALLBACK_SURFACE_EXCLUDED');
  assert.equal(fallbackMap.hooks.reason_code, 'FALLBACK_SURFACE_EXCLUDED');

  // And: selecting both routes is a conflict that blocks every surface.
  const collision = buildDshMatrix({ manifestPath, routes: ['dsh-plugin-git-sha', 'manual-skills-mcp-fallback'], now: NOW, version: '1.3.0' });
  assert.equal(collision.outcome, 'blocked');
  assert.equal(collision.reason_code, 'ROUTE_COLLISION');
  assert.ok(collision.capabilities.every(({ status }) => status === 'missing'));
});

test('enablement observation promotes package evidence to probe scope and fails closed', (t) => {
  // Given: a fake user config with the plugin enabled and a registered marketplace.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydeepseek-dsh-enablement-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'config.json');
  const marketplacesPath = path.join(root, 'known_marketplaces.json');
  fs.writeFileSync(configPath, `${JSON.stringify({ plugins: { enabled: true, lazydeepseek: { enabled: true } } })}\n`);
  fs.writeFileSync(marketplacesPath, `${JSON.stringify({ marketplaces: [{ id: 'lazydeepseek', name: 'lazydeepseek', pluginCount: 1 }] })}\n`);

  // When: enablement is observed and fed into the matrix.
  const enablement = observeDshEnablement({
    pluginId: 'lazydeepseek',
    marketplaceName: 'lazydeepseek',
    configPath,
    knownMarketplacesPath: marketplacesPath,
    now: NOW,
  });
  assert.equal(enablement.status, 'enabled');
  assert.equal(enablement.master_enabled, true);
  assert.equal(enablement.marketplace_registered, true);
  const manifestPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const matrix = buildDshMatrix({ manifestPath, routes: ['dsh-plugin-git-sha'], enablement, now: NOW, version: '1.3.0' });

  // Then: every surface advances to probe-observed.
  assert.equal(matrix.outcome, 'observed');
  assert.ok(matrix.capabilities.every(({ status }) => status === 'probe-observed'));

  // And: a disabled plugin degrades every surface with PLUGIN_DISABLED.
  fs.writeFileSync(configPath, `${JSON.stringify({ plugins: { enabled: true, lazydeepseek: { enabled: false } } })}\n`);
  const disabled = observeDshEnablement({ pluginId: 'lazydeepseek', marketplaceName: 'lazydeepseek', configPath, knownMarketplacesPath: marketplacesPath, now: NOW });
  const degraded = buildDshMatrix({ manifestPath, routes: ['dsh-plugin-git-sha'], enablement: disabled, now: NOW, version: '1.3.0' });
  assert.ok(degraded.capabilities.every(({ status, reason_code }) => status === 'missing' && reason_code === 'PLUGIN_DISABLED'));

  // And: an absent config is an observation-only absent status.
  const absent = observeDshEnablement({ pluginId: 'lazydeepseek', marketplaceName: 'lazydeepseek', configPath: path.join(root, 'missing.json'), knownMarketplacesPath: path.join(root, 'missing2.json'), now: NOW });
  assert.equal(absent.status, 'absent');
  assert.equal(absent.best_effort, true);
});

test('current-session receipts bind surfaces and stale or hostile receipts fail closed', () => {
  // Given: a current-session receipt observing skills and mcp on the marketplace route.
  const manifestPath = path.join(__dirname, '..', '..', '..', 'package.json');
  const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  const receipt = {
    status: 'observed', workspace_clean: true, product: 'DeepSeek Harness', version: '1.3.0', build: 'build:current',
    session_id: 'session:current', manifest_fingerprint: fingerprint, route: 'dsh-plugin-git-sha',
    observed_at: NOW, surfaces: ['skills', 'mcp'],
  };

  // When: the matrix is built with the receipt.
  const matrix = buildDshMatrix({
    manifestPath, routes: ['dsh-plugin-git-sha'], now: NOW,
    version: '1.3.0', build: 'build:current', sessionId: 'session:current', receipt,
  });

  // Then: only observed surfaces are current-session-ready.
  const map = statusMap(matrix);
  assert.equal(matrix.outcome, 'observed');
  assert.equal(map.skills.status, 'current-session-ready');
  assert.equal(map.mcp.status, 'current-session-ready');
  assert.equal(map.commands.status, 'missing');
  assert.equal(map.commands.reason_code, 'SURFACE_NOT_OBSERVED');

  // And: a stale receipt blocks the entire matrix.
  const staleMatrix = buildDshMatrix({
    manifestPath, routes: ['dsh-plugin-git-sha'], now: '2026-08-27T18:00:00.000Z',
    version: '1.3.0', build: 'build:current', sessionId: 'session:current', receipt,
  });
  assert.equal(staleMatrix.outcome, 'blocked');
  assert.equal(staleMatrix.reason_code, 'OBSERVATION_STALE');

  // And: a forged workspace claim fails closed.
  const forged = buildDshMatrix({
    manifestPath, routes: ['dsh-plugin-git-sha'], now: NOW,
    version: '1.3.0', build: 'build:current', sessionId: 'session:current',
    receipt: { ...receipt, workspace_clean: false },
  });
  assert.equal(forged.outcome, 'blocked');
  assert.equal(forged.reason_code, 'WORKSPACE_DIRTY');
});

test('capability statuses and surfaces stay within the declared vocabulary', () => {
  // Given: the family capability vocabulary.
  // Then: statuses and surfaces match the DeepSeek Harness contract exactly.
  assert.deepEqual([...CAPABILITY_STATUSES], ['package-ready', 'missing', 'probe-observed', 'current-session-ready']);
  assert.deepEqual([...SURFACES], ['skills', 'commands', 'agents', 'hooks', 'mcp']);
});
