#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = resolve(process.argv[2] ?? join(root, 'tools/dsh-runtime'));
const evidence = resolve(process.argv[3] ?? join(root, '.omo/evidence/native-plugin'));
const requireSdk = createRequire(join(sdk, 'package.json'));
const cliPackage = requireSdk.resolve('@deepseek-ai/dsh/package.json');
const cli = join(dirname(cliPackage), 'lib/bin.js');
const expectedVersion = '0.2.1-rc.5';
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const roles = ['context-indexer', 'context-miner', 'explorer', 'gate-reviewer', 'implementer', 'librarian', 'migration-planner', 'orchestrator', 'planner', 'qa-executor', 'reviewer', 'security-auditor', 'verifier'];
const servers = ['run-ledger', 'verification', 'status-dashboard', 'context-graph', 'code-intel', 'docs'];
mkdirSync(evidence, { recursive: true });
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'lazydeepseek-native-')));
const env = {
  PATH: [join(sdk, 'node_modules/.bin'), dirname(process.execPath), process.env.PATH].join(':'),
  HOME: join(temporary, 'home'), DSH_HOME: join(temporary, 'dsh'),
  XDG_CONFIG_HOME: join(temporary, 'config'), XDG_CACHE_HOME: join(temporary, 'cache'),
  XDG_DATA_HOME: join(temporary, 'data'), XDG_STATE_HOME: join(temporary, 'state'),
  npm_config_cache: join(temporary, 'npm-cache'), npm_config_userconfig: join(temporary, 'npmrc'),
  npm_config_globalconfig: join(temporary, 'global-npmrc'), CI: 'true', NO_COLOR: '1',
  DSH_TELEMETRY_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1',
};
const report = { scope: 'isolated-native-install-and-boot', nodeVersion: process.version, hostReadiness: 'pending', mounted: false, modelRequests: false, mcpScope: 'active bridge rows; project profile may defer server tools', temporary, commands: [] };
function run(label, executable, args, cwd = temporary, expectedStatus = 0) {
  const prefix = join(evidence, `dsh-native-${label}`);
  const stdin = join(temporary, `${label}-stdin`);
  writeFileSync(stdin, '');
  const runnerArgs = [join(root, 'plugins/lazydeepseek/scripts/lazydeepseek-bounded-run.py'), '--label', label, '--timeout', '120', '--max-output-bytes', '16777216', '--result-file', `${prefix}-cleanup.json`, '--cwd', cwd, '--cwd-file', `${prefix}-cwd.txt`, '--stdin-file', stdin, '--stdout-file', `${prefix}-stdout.txt`, '--stderr-file', `${prefix}-stderr.txt`, '--', executable, ...args];
  const result = spawnSync('python3', runnerArgs, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const stdout = existsSync(`${prefix}-stdout.txt`) ? readFileSync(`${prefix}-stdout.txt`, 'utf8') : '';
  const stderr = existsSync(`${prefix}-stderr.txt`) ? readFileSync(`${prefix}-stderr.txt`, 'utf8') : '';
  const artifact = join(evidence, `dsh-native-${label}.log`);
  writeFileSync(artifact, JSON.stringify({ executable, args, cwd, runner: 'python3', runnerArgs, pid: result.pid, status: result.status, signal: result.signal, error: result.error?.message }) + '\nSTDOUT\n' + stdout + '\nSTDERR\n' + stderr + '\nRUNNER\n' + (result.stderr ?? ''));
  report.commands.push({ label, artifact, status: result.status });
  assert.equal(result.status, expectedStatus, `${label} failed; see ${artifact}\n${stderr.slice(-4000)}\n${result.stderr ?? result.error?.message ?? ''}`);
  const cleanup = JSON.parse(readFileSync(`${prefix}-cleanup.json`, 'utf8')).cleanup;
  assert.equal(cleanup.status, 'verified-absent', `${label} process cleanup`);
  return stdout;
}
const dsh = (label, args, expectedStatus) => run(label, process.execPath, [cli, ...args], temporary, expectedStatus);
try {
  mkdirSync(env.HOME, { recursive: true });
  assert.equal(JSON.parse(readFileSync(cliPackage, 'utf8')).version, expectedVersion);
  assert.equal(dsh('version', ['--version']).trim(), expectedVersion);
  report.pnpmVersion = run('pnpm-version', 'pnpm', ['--version']).trim();
  assert.equal(report.pnpmVersion, '11.13.1');
  const packed = JSON.parse(run('pack', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
  assert.equal(packed.length, 1);
  const tarball = join(temporary, packed[0].filename);
  assert.ok(existsSync(tarball));
  report.package = { name: packed[0].name, version: packed[0].version, integrity: packed[0].integrity };
  dsh('initialize', ['plugin', '--profile', 'native-regression', 'list', '--json']);
  const baseline = dsh('before', ['--profile', 'native-regression', '--dump-config']);
  assert.ok(!baseline.includes('id: lazydeepseek'));
  dsh('install', ['plugin', '--profile', 'native-regression', 'add', tarball, '--ignore-scripts', '--reporter=append-only', '--store-dir', join(temporary, 'pnpm-store')]);
  const listing = JSON.parse(dsh('list', ['plugin', '--profile', 'native-regression', 'list', '--json', '--depth=Infinity']));
  const installedNames = new Set();
  function visit(tree) { for (const [name, value] of Object.entries(tree.dependencies ?? {})) { installedNames.add(name); visit(value); } }
  visit(listing[0]);
  assert.deepEqual([...installedNames].filter(name => name.startsWith('@deepseek-ai/dsh')).sort(), ['@deepseek-ai/dsh-hook-protocol', '@deepseek-ai/dsh-hooks-claude-code'], 'only the optional hook bridge and protocol belong to the profile; host SDK peers remain shared');
  report.profileDependencies = [...installedNames].sort();
  report.audit = JSON.parse(dsh('audit', ['plugin', '--profile', 'native-regression', 'audit', '--json'])).metadata;
  assert.ok(Object.values(report.audit.vulnerabilities).every(count => count === 0));
  const installed = listing[0]?.dependencies?.[manifest.name];
  assert.equal(installed?.version, manifest.version, 'installed tarball version');
  const installedRoot = realpathSync(join(listing[0].path, 'node_modules', manifest.name));
  assert.ok(installedRoot.startsWith(temporary + '/'), 'installed payload stays inside owned temp root');
  assert.ok(existsSync(join(installedRoot, 'lib/index.mjs')));
  report.installed = { ...installed, path: installedRoot };
  const composed = dsh('composed', ['--profile', 'native-regression', '--dump-config']);
  assert.match(composed, /# == lazydeepseek/);
  const yaml = requireSdk('js-yaml');
  const schema = yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value }));
  const rows = yaml.load(composed, { schema });
  const row = id => { const matches = rows.filter(entry => entry.id === id); assert.equal(matches.length, 1, id); return matches[0]; };
  assert.ok(row('lazydeepseek').name.endsWith('/lib/index.mjs'));
  assert.ok(row('lazydeepseek-preset-registry').name.endsWith('/lib/preset-registry.mjs'));
  assert.equal(rows.filter(entry => entry.id?.startsWith('preset-lazydeepseek-')).length, roles.length);
  assert.equal(rows.filter(entry => entry.id?.startsWith('tool-subagent-lazydeepseek-')).length, roles.length);
  for (const role of roles) {
    const id = `lazydeepseek-${role}`;
    assert.equal(row(`preset-${id}`).config.id, id);
    assert.equal(row(`preset-${id}`).name, '@deepseek-ai/dsh-agent-preset');
    const tool = row(`tool-subagent-${id}`);
    assert.equal(tool.name, '@deepseek-ai/dsh-tool-subagent');
    assert.equal(tool.config.agentPreset, id);
    assert.equal(tool.config.toolName, id);
    assert.equal(tool.config.provider, 'spawn');
  }
  assert.equal(rows.filter(entry => entry.id?.startsWith('lazydeepseek-mcp-')).length, servers.length);
  for (const server of servers) {
    const entry = row(`lazydeepseek-mcp-${server}`);
    assert.equal(entry.name, '@deepseek-ai/dsh-mcp-client');
    assert.equal(entry.config.serverName, server);
    assert.ok(entry.inject.includes('lazydeepseekRuntime'));
  }
  assert.equal(row('lazydeepseek-hooks').name, '@deepseek-ai/dsh-hooks-claude-code');
  assert.equal(row('lazydeepseek-hooks').config.configPath, "lazydeepseekRuntime.path('hooks.dsh.json')");
  assert.equal(row('skill-filesystem').config.bundledSkillDir, "lazydeepseekRuntime.path('skills')");
  report.composed = { shim: 1, presetRegistry: 1, presets: roles.length, roleTools: roles.length, mcp: servers.length, skills: true, hooks: true };
  const configSchema = JSON.parse(dsh('schema', ['--profile', 'native-regression', '--dump-config-schema'], 1));
  const diagnostics = configSchema['x-cordis'].diagnostics;
  assert.equal(configSchema['x-cordis'].complete, false);
  assert.equal(diagnostics.length, roles.length);
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.message, 'unrecognized Loader tree carrier; use cordis:group or cordis:include for native child collection');
    assert.ok(rows[Number(diagnostic.path.slice(1))].id.startsWith('preset-lazydeepseek-'));
  }
  report.schemaLimitation = { complete: configSchema['x-cordis'].complete, diagnostics };
  const probe = join(temporary, 'inspect.mjs');
  const mountedArtifact = join(evidence, 'dsh-native-mounted.json');
  rmSync(mountedArtifact, { force: true });
  writeFileSync(probe, `import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
export const inject = ['appReady', 'appExit', 'loader', 'commands', 'agentPresets', 'lazydeepseekRuntime'];
export function apply(ctx) {
  ctx.appReady.onReady(() => { void inspect(ctx).then(() => ctx.appExit(0), error => { console.error(error); ctx.appExit(1); }); });
}
async function inspect(ctx) {
  const commands = ctx.commands.list(ctx).filter(row => row.name.startsWith('lazy-'));
  const presets = (await ctx.agentPresets.list()).filter(row => row.id.startsWith('lazydeepseek-') && row.id !== 'lazydeepseek-inherited');
  const entries = [...ctx.loader.entries()].map(entry => ({ id: entry.options.id, name: entry.options.name, state: entry.fiber?.state, disabled: entry.disabled }));
  const hooks = JSON.parse(readFileSync(ctx.lazydeepseekRuntime.path('hooks.dsh.json'), 'utf8'));
  const compositions = ctx.agentPresets.inspectCompositions();
  writeFileSync(${JSON.stringify(mountedArtifact)}, JSON.stringify({ commands, presets, compositions, entries, hookEvents: Object.keys(hooks.hooks) }, null, 2));
  assert.equal(commands.length, 20);
  assert.equal(presets.length, 13);
  assert.ok(presets.every(row => !row.broken), JSON.stringify(presets));
  for (const id of ['lazydeepseek', 'lazydeepseek-hooks', 'skill-filesystem', 'lazydeepseek-ralph', 'lazydeepseek-ralph-workflow', 'tool-ralph', ...${JSON.stringify(roles)}.flatMap(role => ['preset-lazydeepseek-' + role, 'tool-subagent-lazydeepseek-' + role]), ...${JSON.stringify(servers)}.map(name => 'lazydeepseek-mcp-' + name)]) {
    assert.equal(entries.find(row => row.id === id)?.state, 2, id);
  }
  assert.equal(Object.keys(hooks.hooks).length, 7);
  console.log('NATIVE_MOUNT_PASS');
}
`);
  const overlay = join(temporary, 'inspect.yml');
  writeFileSync(overlay, JSON.stringify([{ insert: [{ id: 'native-regression-inspector', name: probe }] }]));
  writeFileSync(join(evidence, 'dsh-native-inspect.mjs'), readFileSync(probe));
  writeFileSync(join(evidence, 'dsh-native-overlay.json'), readFileSync(overlay));
  const boot = dsh('boot', ['--profile', 'native-regression', '--patch', overlay]);
  assert.match(boot, /NATIVE_MOUNT_PASS/);
  report.mounted = true;
  report.mountedArtifact = mountedArtifact;
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
  report.temporaryRemoved = !existsSync(temporary);
  writeFileSync(join(evidence, 'dsh-native-report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
