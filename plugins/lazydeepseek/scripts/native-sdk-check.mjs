#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const sdkRoot = process.argv[2];
if (!sdkRoot) throw new Error('pass the absolute installed dsh package root; this check does not inspect user configuration');
const sdk = resolve(sdkRoot, 'node_modules');
const expectedVersion = process.argv[3] ?? JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).peerDependencies['@deepseek-ai/dsh'];
for (const pkg of ['dsh-tool-subagent', 'dsh-hooks-claude-code']) assert.equal(JSON.parse(readFileSync(resolve(sdk, '@deepseek-ai', pkg, 'package.json'), 'utf8')).version, expectedVersion);
const yaml = await import(pathToFileURL(resolve(sdk, 'js-yaml/dist/js-yaml.mjs')));
const { Config } = await import(pathToFileURL(resolve(sdk, '@deepseek-ai/dsh-tool-subagent/lib/index.js')));
const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (text) => ({ __jsExpr: text }) });
const schema = yaml.DEFAULT_SCHEMA.extend([jsType]);
const patch = yaml.load(readFileSync(new URL('../../../cordis.patch.yml', import.meta.url), 'utf8'), { schema });
const rows = patch[0].insert.filter((row) => row.name === '@deepseek-ai/dsh-tool-subagent');
assert.equal(rows.length, 13);
const roleNames = rows.map((row) => row.config.toolName);
const available = new Set(['read', 'bash', 'edit', 'write', 'job_output', 'todo_write', 'web_fetch', 'web_search', ...roleNames]);
for (const row of rows) {
  Config(row.config);
  assert.equal(row.config.agentPreset, row.config.toolName);
  const preset = patch[0].insert.find(entry => entry.name === '@deepseek-ai/dsh-agent-preset' && entry.config.id === row.config.toolName);
  assert.ok(preset, `missing preset ${row.config.toolName}`);
  const source = readFileSync(new URL(`../agents/${row.config.toolName}.md`, import.meta.url), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.equal(preset.config.plugins.find(entry => entry.id === 'persona').config.prefix, source.trimEnd() + '\n');
  const tools = preset.config.plugins.find(entry => entry.id === 'role-tools').config.allow;
  for (const tool of tools) assert.ok(available.has(tool), `unknown tool ${tool}`);
  if (!row.config.toolName.endsWith('orchestrator')) assert.equal(tools.includes('subagent'), false);
}
const bridge = readFileSync(resolve(sdk, '@deepseek-ai/dsh-hooks-claude-code/lib/index.js'), 'utf8');
for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']) assert.ok(bridge.includes(`"${event}"`));
const nativeTools = [['dsh-tool-fs', 'read'], ['dsh-tool-fs', 'edit'], ['dsh-tool-fs', 'write'], ['dsh-tool-bash', 'bash'], ['dsh-tool-jobs', 'job_output'], ['dsh-tool-todo', 'todo_write'], ['dsh-tool-web', 'web_fetch'], ['dsh-tool-web', 'web_search']];
for (const [pkg, tool] of nativeTools) assert.ok(readFileSync(resolve(sdk, '@deepseek-ai', pkg, 'lib/index.js'), 'utf8').includes(`name: "${tool}"`));
const { Context } = await import(pathToFileURL(resolve(sdk, '@deepseek-ai/cordis/lib/index.js')));
const { apply } = await import(new URL('../../../lib/index.mjs', import.meta.url));
const { tmpdir } = await import('node:os');
const fixture = mkdtempSync(join(tmpdir(), 'lazydeepseek-sdk-service-'));
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = fixture;
try {
  const ctx = new Context();
  let registered = 0;
  let disposed = 0;
  ctx.provide('profileContext', { dir: join(fixture, 'profile-a') });
  ctx.provide('commands', { register() { registered += 1; return () => { disposed += 1; }; } });
  const fiber = ctx.plugin(apply);
  await fiber.inertia;
  assert.ok(ctx.lazydeepseekRuntime);
  assert.ok(ctx.lazydeepseekRuntime.path('hooks.dsh.json').startsWith(fixture));
  assert.equal(registered, 20);
  await fiber.dispose();
  assert.equal(disposed, 20);
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  rmSync(fixture, { recursive: true, force: true });
}
for (const check of ['native-role-facade-check.mjs', 'native-role-presets-check.mjs']) {
  process.stdout.write(execFileSync(process.execPath, [fileURLToPath(new URL(check, import.meta.url)), sdkRoot], { encoding: 'utf8' }));
}
console.log(JSON.stringify({ sdk_version: expectedVersion, native_roles: rows.length, bridge_events: 7, result: 'pass', scope: 'installed-sdk-package-config' }));
