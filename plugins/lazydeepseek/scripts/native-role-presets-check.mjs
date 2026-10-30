import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sdkRoot = process.argv[2];
if (!sdkRoot) throw new Error('pass an isolated installed dsh package root');
const sdk = resolve(sdkRoot, 'node_modules/@deepseek-ai');
const sdkVersion = JSON.parse(readFileSync(join(sdk, 'dsh/package.json'), 'utf8')).version;
const load = path => import(pathToFileURL(join(sdk, path, 'lib/index.js')));
const { Context } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: LlmRuntime } = await load('dsh-llm');
const { default: SessionStore, SessionId } = await load('dsh-session');
const { default: SessionProjection } = await load('dsh-session-projection');
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const { default: AgentRegistry } = await load('dsh-agent');
const { default: AgentLoop } = await load('dsh-agent-loop');
const { default: Presets } = await load('dsh-agent-preset-registry');
const { scopeOf } = await load('dsh-scope');
const { applyChildComposition } = await load('dsh-subagent');
const yaml = await import(pathToFileURL(resolve(sdkRoot, 'node_modules/js-yaml/dist/js-yaml.mjs')));
const schema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: text => ({ expression: text }) })]);
const repo = new URL('../../../', import.meta.url);
const patch = yaml.load(readFileSync(new URL('cordis.patch.yml', repo), 'utf8'), { schema });
const contract = JSON.parse(readFileSync(new URL('../contracts/dsh-role-presets.v1.json', import.meta.url), 'utf8'));
const rows = patch[0].insert;
const dir = mkdtempSync(join(resolve(sdkRoot), 'lazydeepseek-roles-'));
const ctx = new Context();
try {
  for (const name of ['job-output', 'role-tools']) copyFileSync(new URL(`lib/${name}.mjs`, repo), join(dir, `${name}.mjs`));
  ctx.baseUrl = pathToFileURL(`${resolve(sdkRoot)}/`).href;
  await ctx.plugin(Loader); await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjection); await ctx.plugin(SystemPrompt, {}); await ctx.plugin(ToolRuntime);
  ctx.provide('jobs', { attachController() {}, events: { subscribe() {} } });
  for (const service of ['fs', 'workingDirectory', 'shell', 'shellEnv', 'web']) ctx.provide(service, {});
  const definition = name => ({ name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '' });
  for (const role of contract.roles) ctx.tools.register(definition(role.name));
  ctx.tools.register(definition('forbidden'));
  await ctx.plugin(AgentRegistry); await ctx.plugin(AgentLoop, { agents: [] });
  await ctx.plugin(Presets, { default: 'inherited' });
  for (const role of contract.roles) {
    const roleRow = rows.find(row => row.name === '@deepseek-ai/dsh-tool-subagent' && row.config.toolName === role.name);
    const preset = rows.find(row => row.name === '@deepseek-ai/dsh-agent-preset' && row.config.id === role.name);
    assert.equal(roleRow.config.agentPreset, role.name);
    assert.equal(roleRow.config.maxDepth, role.maxDepth);
    assert.equal(createHash('sha256').update(preset.config.plugins.find(plugin => plugin.id === 'persona').config.prefix).digest('hex'), role.personaSha256);
    const plugins = preset.config.plugins.map(plugin => ({ ...plugin, name: plugin.name.startsWith('./lib/') ? pathToFileURL(join(dir, plugin.name.split('/').at(-1))).href : plugin.name }));
    await ctx.agentPresets.register({ id: role.name, plugins });
  }
  for (const role of contract.roles) {
    const handle = await ctx.agents.create({ sessionId: SessionId(role.name), setup: async agentCtx => { await applyChildComposition(agentCtx, { ctx }, { agentPreset: role.name }); } });
    const names = ctx.tools.schemas(scopeOf(handle.agent.ctx)).map(tool => tool.name).sort();
    assert.deepEqual(names, [...role.allow].sort(), `${role.name} tool visibility`);
    await handle.dispose();
  }
  console.log(`PASS: ${contract.roles.length} ${sdkVersion} child Agent compositions preserve persona hashes and tool visibility`);
} finally {
  await ctx.fiber.dispose();
  rmSync(dir, { recursive: true, force: true });
}
