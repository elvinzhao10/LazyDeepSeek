import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sdkRoot = process.argv[2];
if (!sdkRoot) throw new Error('pass an isolated installed dsh package root');
const sdk = resolve(sdkRoot, 'node_modules/@deepseek-ai');
const sdkVersion = JSON.parse(readFileSync(join(sdk, 'dsh/package.json'), 'utf8')).version;
const load = path => import(pathToFileURL(join(sdk, path, 'lib/index.js')));
const { Context } = await load('cordis');
const { createScope } = await load('dsh-scope');
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: SessionProjection } = await load('dsh-session-projection');
const { default: Presets } = await load('dsh-agent-preset-registry');
const dir = mkdtempSync(join(resolve(sdkRoot), 'lazydeepseek-facade-'));
try {
  for (const name of ['job-output', 'role-tools', 'preset-registry']) copyFileSync(new URL(`../../../lib/${name}.mjs`, import.meta.url), join(dir, `${name}.mjs`));
  const jobsFacade = await import(pathToFileURL(join(dir, 'job-output.mjs')));
  const roleMask = await import(pathToFileURL(join(dir, 'role-tools.mjs')));
  const registryBootstrap = await import(pathToFileURL(join(dir, 'preset-registry.mjs')));
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime);
  ctx.provide('jobs', { attachController() {}, events: { subscribe() {} } });
  const definition = name => ({ name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '' });
  ctx.tools.register(definition('read'));
  ctx.tools.register(definition('forbidden'));
  const key = { id: 'child' };
  let scope;
  await ctx.plugin(Object.assign(inner => { scope = createScope(inner, key); }, { inject: ['tools', 'systemPrompt', 'jobs'] }));
  roleMask.apply(scope.ctx, { allow: ['read', 'late_allowed'] });
  jobsFacade.apply(scope.ctx, {});
  ctx.tools.register(definition('late_forbidden'));
  ctx.tools.register(definition('late_allowed'));
  assert.deepEqual(ctx.tools.schemas(key).map(tool => tool.name).sort(), ['job_output', 'late_allowed', 'read']);
  assert.deepEqual(ctx.tools.schemas().map(tool => tool.name).sort(), ['forbidden', 'late_allowed', 'late_forbidden', 'read']);
  await scope.dispose();
  assert.deepEqual(ctx.tools.schemas(key).map(tool => tool.name).sort(), ['forbidden', 'late_allowed', 'late_forbidden', 'read']);
  const collisionKey = { id: 'collision' };
  let collisionScope;
  await ctx.plugin(Object.assign(inner => { collisionScope = createScope(inner, collisionKey); }, { inject: ['tools', 'systemPrompt', 'jobs'] }));
  collisionScope.ctx.tools.register(definition('job_output'));
  const collisionFiber = collisionScope.ctx.plugin(Object.assign(jobsFacade.apply, { inject: jobsFacade.inject }));
  await assert.rejects(collisionFiber.await(), /already registered/);
  assert.deepEqual(ctx.tools.schemas(collisionKey).map(tool => tool.name).sort(), ['forbidden', 'job_output', 'late_allowed', 'late_forbidden', 'read']);
  assert.deepEqual(ctx.tools.schemas().map(tool => tool.name).sort(), ['forbidden', 'late_allowed', 'late_forbidden', 'read']);
  await collisionScope.dispose();
  // Simulate a future upstream jobs plugin registering an unexpected tool after job_output.
  const facadeSource = readFileSync(join(dir, 'job-output.mjs'), 'utf8');
  writeFileSync(join(dir, 'unexpected-jobs.mjs'), `export function apply(ctx) {
    ctx.tools.register({ name: 'job_output', description: 'output', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => '' });
    ctx.tools.register({ name: 'unexpected' });
  }`);
  writeFileSync(join(dir, 'unexpected-facade.mjs'), facadeSource.replace("'@deepseek-ai/dsh-tool-jobs'", "'./unexpected-jobs.mjs'"));
  const unexpectedFacade = await import(pathToFileURL(join(dir, 'unexpected-facade.mjs')));
  const unexpectedKey = { id: 'unexpected' };
  let unexpectedScope;
  await ctx.plugin(Object.assign(inner => { unexpectedScope = createScope(inner, unexpectedKey); }, { inject: ['tools', 'systemPrompt', 'jobs'] }));
  const unexpectedFiber = unexpectedScope.ctx.plugin(Object.assign(unexpectedFacade.apply, { inject: unexpectedFacade.inject }));
  await assert.rejects(unexpectedFiber.await(), /unexpected upstream jobs tool: unexpected/);
  assert.deepEqual(ctx.tools.schemas(unexpectedKey).map(tool => tool.name).sort(), ['forbidden', 'late_allowed', 'late_forbidden', 'read']);
  assert.deepEqual(ctx.tools.schemas().map(tool => tool.name).sort(), ['forbidden', 'late_allowed', 'late_forbidden', 'read']);
  await unexpectedScope.dispose();
  await ctx.fiber.dispose();
  const ptc = new Context();
  await ptc.plugin(SystemPrompt, {});
  ptc.provide('ptcRuntime', { language: 'typescript' });
  await ptc.plugin(ToolRuntime, { mode: 'ptc' });
  ptc.tools.register(definition('read'));
  ptc.tools.register(definition('forbidden'));
  const ptcKey = { id: 'ptc-child' };
  let ptcScope;
  await ptc.plugin(Object.assign(inner => { ptcScope = createScope(inner, ptcKey); }, { inject: ['tools'] }));
  roleMask.apply(ptcScope.ctx, { allow: ['read'] });
  assert.deepEqual(ptc.tools.schemas(ptcKey).map(tool => tool.name).sort(), ['read', 'run_code']);
  await ptcScope.dispose();
  await ptc.fiber.dispose();
  for (const existing of [true, false]) {
    const host = new Context();
    host.baseUrl = pathToFileURL(`${resolve(sdkRoot)}/`).href;
    await host.plugin(Loader);
    await host.plugin(SessionProjection);
    if (existing) await host.plugin(Presets, { default: 'standard' });
    await host.plugin(Object.assign(registryBootstrap.apply, { inject: registryBootstrap.inject }));
    assert.ok(host.get('agentPresets'));
    if (existing) {
      assert.equal(host.get('agentPresets').defaultId, 'standard');
    } else {
      assert.equal(host.get('agentPresets').defaultId, 'lazydeepseek-inherited');
      assert.equal((await host.get('agentPresets').resolve()).id, 'lazydeepseek-inherited');
      const inheritedScope = createScope(host, { id: 'inherited' });
      assert.equal((await host.get('agentPresets').mount(inheritedScope.ctx)).id, 'lazydeepseek-inherited');
      await inheritedScope.dispose();
    }
    await host.fiber.dispose();
  }
  console.log(`PASS: ${sdkVersion} scoped jobs facade, dynamic mask, native/PTC, registry default preservation and disposal`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
