import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, plugin, host, digest, testPython, pythonEnvironment } from './fixture.mjs';

const projectCli = join(host, '../project/cli.mjs');
const projectHost = join(host, 'project.mjs');
const vendorSidecar = join(plugin, 'shared/project.vendor.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function walk(root, base = '') {
  const files = [];
  for (const entry of (await readdir(join(root, base || '.'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') continue;
      for (const nested of await walk(root, name)) files.push(nested);
    } else if (entry.isFile()) files.push(name);
  }
  return files;
}

test('vendored project tree is byte-identical to its pinned sidecar', async () => {
  const manifest = JSON.parse(await readFile(vendorSidecar, 'utf8'));
  assert.equal(manifest.source.path, 'lazybuddy-plugin/shared/project');
  assert.equal(manifest.boundary.hostAdapter, 'not-included');
  const present = await walk(join(plugin, 'shared/project'));
  assert.deepEqual([...present].sort(), manifest.files.map(item => item.path).sort());
  const records = [];
  for (const item of manifest.files) {
    const bytes = await readFile(join(plugin, 'shared/project', item.path));
    assert.equal(bytes.length, item.bytes, `${item.path} byte drift`);
    assert.equal(sha256(bytes), item.sha256, `${item.path} content drift`);
    records.push(`${item.path}\0${item.bytes}\0${item.sha256}\n`);
  }
  assert.equal(sha256(Buffer.from(records.join(''))), manifest.source.treeSha256, 'tree digest drift');
});

test('project reads and tools stay inert before initialization', async () => {
  const f = await fixture();
  try {
    const raw = await f.call('project.mjs', 'read', []);
    assert.equal(raw.code, 65); assert.equal(raw.stderr.trim(), 'PROJECT_NOT_INITIALIZED');
    const tool = await f.call('project.mjs', 'project.context', []);
    assert.equal(tool.code, 0, tool.stderr);
    const envelope = JSON.parse(tool.stdout);
    assert.equal(envelope.result.status, 'not_initialized');
    assert.equal(envelope.result.hint, 'PROJECT_NOT_INITIALIZED');
    assert.equal(envelope.result.init_offer.kind, 'question');
    assert.equal(envelope.delivery.consumed_by_native, false);
    const stat = await lstat(join(f.root, '.lazydeepseek/project')).then(() => true, () => false);
    assert.equal(stat, false, 'no project store may exist before explicit init');
    const registry = await lstat(join(f.root, '.lazyseries')).then(() => true, () => false);
    assert.equal(registry, false, 'no neutral registry may exist before explicit init');
  } finally { await f.cleanup(); }
});

test('DeepSeek project round trip binds a create-run.sh run through DeepSeek-owned identity', async () => {
  const f = await fixture();
  try {
    const initiated = await f.call('project.mjs', 'init', []);
    assert.equal(initiated.code, 0, initiated.stderr);
    const created = JSON.parse(initiated.stdout);
    assert.equal(created.project_id, 'project:deepseek'); assert.equal(created.runtime, 'LazyDeepSeek');
    const planText = '# DeepSeek project plan\n\n- [ ] [C1] Original DeepSeek criterion\n\nUnrelated prose stays.\n';
    await writeFile(join(f.root, 'project-plan.md'), planText);
    const command = (command_id, expected_revision, operation, payload) => f.call('project.mjs', 'command', [], JSON.stringify(
      { schema_version: 1, command_id, project_id: 'project:deepseek', expected_revision, operation, payload }));
    const registered = await command('cmd:source', 0, 'register_source', { id: 'source:plan', role: 'plan', path: 'project-plan.md' });
    assert.equal(registered.code, 0, registered.stderr);
    assert.equal(JSON.parse(registered.stdout).receipt.status, 'saved');
    const planned = await command('cmd:plan', 1, 'register_plan', { id: 'plan:deepseek', source: { source_id: 'source:plan',
      sha256: sha256(Buffer.from(planText)), anchor_id: 'document' }, declared_lifecycle: 'active', baseline_refs: [] });
    assert.equal(planned.code, 0, planned.stderr);
    const linked = await command('cmd:link', 2, 'link_native_run',
      { plan_id: 'plan:deepseek', native_project_id: 'project:deepseek', run_id: 'probe' });
    assert.equal(linked.code, 0, linked.stderr);
    assert.deepEqual(JSON.parse(linked.stdout).receipt.changed_ids, ['plan:deepseek']);
    const read = JSON.parse((await f.call('project.mjs', 'read', [])).stdout);
    const plan = read.plans.find(entry => entry.id === 'plan:deepseek');
    assert.deepEqual(plan.native_runs.map(entry => entry.run_id), ['probe']);
    assert.equal(read.runtime, 'LazyDeepSeek');
    // A run the create-run.sh store never created cannot be linked; a foreign
    // native project identity is refused without touching accepted state.
    const missing = await command('cmd:link-missing', 3, 'link_native_run',
      { plan_id: 'plan:deepseek', native_project_id: 'project:deepseek', run_id: 'absent' });
    assert.equal(missing.code, 65); assert.equal(missing.stderr.trim(), 'NATIVE_RUN_UNAVAILABLE');
    const foreign = await command('cmd:link-foreign', 3, 'link_native_run',
      { plan_id: 'plan:deepseek', native_project_id: 'project:other', run_id: 'probe' });
    assert.equal(foreign.code, 65); assert.equal(foreign.stderr.trim(), 'NATIVE_RUN_IDENTITY_MISMATCH');
    const stale = await command('cmd:link-stale', 1, 'link_native_run',
      { plan_id: 'plan:deepseek', native_project_id: 'project:deepseek', run_id: 'probe' });
    assert.equal(JSON.parse(stale.stdout).receipt.status, 'conflict');
    const replay = await command('cmd:link', 2, 'link_native_run',
      { plan_id: 'plan:deepseek', native_project_id: 'project:deepseek', run_id: 'probe' });
    assert.equal(JSON.parse(replay.stdout).receipt.revision, JSON.parse(linked.stdout).receipt.revision);
    assert.equal((await readFile(join(f.root, 'project-plan.md'), 'utf8')), planText);
  } finally { await f.cleanup(); }
});

test('source edit through the vendored route lands on the registered original document', async () => {
  const f = await fixture();
  try {
    await f.call('project.mjs', 'init', []);
    const fence = '```json\n{"unrelated": ["example"]}\n```\n';
    const planText = '# DeepSeek project plan\n\n- [ ] [C1] Original DeepSeek criterion\n\nUnrelated prose stays.\n';
    await writeFile(join(f.root, 'project-plan.md'), planText + fence);
    const command = (command_id, expected_revision, operation, payload) => f.call('project.mjs', 'command', [], JSON.stringify(
      { schema_version: 1, command_id, project_id: 'project:deepseek', expected_revision, operation, payload }));
    await command('cmd:source', 0, 'register_source', { id: 'source:plan', role: 'plan', path: 'project-plan.md' });
    const mapped = await f.call('project.mjs', 'source.map', [], JSON.stringify({ command_id: 'q:map', expected_revision: 1,
      payload: { source_id: 'source:plan' } }));
    const map = JSON.parse(mapped.stdout).result;
    assert.equal(map.status, 'ok'); assert.equal(map.observation, 'current');
    const anchor = map.anchors.find(entry => entry.title === 'DeepSeek project plan');
    assert.ok(anchor, 'heading anchor assigned');
    const edit = { command_id: 'cmd:check-c1', expected_revision: 1,
      payload: { authority: 'test:deepseek', source_id: 'source:plan', expected_sha256: map.sha256,
        expected_source_revision: 1, edits: [{ kind: 'set_task_state', anchor_id: anchor.anchor_id, item: 0, state: 'checked' }] } };
    const applied = await f.call('project.mjs', 'source.edit', [], JSON.stringify(edit));
    assert.equal(applied.code, 0, applied.stderr);
    const after = await readFile(join(f.root, 'project-plan.md'), 'utf8');
    assert.equal(after, '# DeepSeek project plan\n\n- [x] [C1] Original DeepSeek criterion\n\nUnrelated prose stays.\n' + fence,
      'only the addressed checklist item changes');
    const receipt = JSON.parse(applied.stdout).receipt;
    assert.equal(receipt.status, 'saved'); assert.equal(receipt.revision, 2);
    const replay = await f.call('project.mjs', 'source.edit', [], JSON.stringify(edit));
    assert.equal(JSON.parse(replay.stdout).receipt.revision, 2, 'idempotent replay returns the same receipt');
    assert.equal(await readFile(join(f.root, 'project-plan.md'), 'utf8'), after, 'replay does not rewrite the document');
    const stale = await f.call('project.mjs', 'source.edit', [], JSON.stringify({ ...edit, command_id: 'cmd:check-stale',
      expected_revision: 9, payload: { ...edit.payload, expected_sha256: digest('stale') } }));
    const outcome = JSON.parse(stale.stdout);
    assert.equal(outcome.receipt.status, 'conflict');
    const journal = await readdir(join(f.root, '.lazydeepseek/project/edit-journal')).catch(() => []);
    assert.deepEqual(journal, [], 'a completed edit leaves no pending journal entry');
  } finally { await f.cleanup(); }
});

test('observations label adapter-synthesized events synthesized and native evidence observed', async () => {
  const f = await fixture();
  try {
    const context = async (attempt, worker, index) => {
      const result = await f.call('producers.mjs', 'context', ['--parent-task-id', 'P', '--task-id', 'A', '--criterion-id', 'C1',
        '--attempt-id', attempt, '--worker-id', worker, '--plan-commands-file', join(f.run, 'commands.json'),
        '--command-index', String(index), '--python', testPython]);
      assert.equal(result.code, 0, result.stderr);
      const path = join(f.run, `${attempt.replace(':', '-')}.json`);
      await writeFile(path, result.stdout);
      return path;
    };
    const executor = await context('executor:deepseek', 'worker:deepseek-executor', 0);
    const executed = await f.call('producers.mjs', 'execute', ['--context-file', executor,
      '--artifact-path', '.lazydeepseek/runs/probe/actual.txt', '--python', testPython]);
    assert.equal(executed.code, 0, executed.stderr || executed.stdout);
    const verifier = await context('verifier:deepseek', 'worker:deepseek-verifier', 1);
    const verified = await f.call('producers.mjs', 'verify', ['--context-file', verifier,
      '--artifact-path', '.lazydeepseek/runs/probe/actual.txt', '--executor-id', 'worker:deepseek-executor',
      '--executor-attempt-id', 'executor:deepseek', '--python', testPython]);
    assert.equal(verified.code, 0, verified.stderr || verified.stdout);
    // The dsh bridge synthesizes PermissionRequest audit records itself; drive
    // the real pre-tool-use hook so the synthesized event comes from the
    // documented native surface, not from a hand-written fixture.
    const hook = spawnSync('bash', [join(plugin, 'scripts/hooks/pre-tool-use.sh')], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess:deepseek-project', cwd: f.root,
        tool_name: 'Grep', tool_input: { pattern: 'probe' } }),
      env: { ...process.env, LAZYDEEPSEEK_PROJECT_DIR: f.root, ...pythonEnvironment } });
    assert.equal(hook.status, 0, hook.stderr.toString());

    await f.call('project.mjs', 'init', []);
    const planText = '# DeepSeek project plan\n\n- [x] [C1] Original DeepSeek criterion\n';
    await writeFile(join(f.root, 'project-plan.md'), planText);
    const command = (command_id, expected_revision, operation, payload) => f.call('project.mjs', 'command', [], JSON.stringify(
      { schema_version: 1, command_id, project_id: 'project:deepseek', expected_revision, operation, payload }));
    await command('cmd:source', 0, 'register_source', { id: 'source:plan', role: 'plan', path: 'project-plan.md' });
    await command('cmd:plan', 1, 'register_plan', { id: 'plan:deepseek', source: { source_id: 'source:plan',
      sha256: sha256(Buffer.from(planText)), anchor_id: 'document' }, declared_lifecycle: 'active', baseline_refs: [] });
    await command('cmd:link', 2, 'link_native_run', { plan_id: 'plan:deepseek', native_project_id: 'project:deepseek', run_id: 'probe' });

    const observed = await f.call('project.mjs', 'observe', []);
    assert.equal(observed.code, 0, observed.stderr);
    const outcome = JSON.parse(observed.stdout);
    assert.equal(outcome.recorded.length, 4, 'two attempts, one publication, one synthesized record');
    assert.ok(outcome.recorded.includes('observation:attempt:probe:executor:deepseek'));
    assert.ok(outcome.recorded.includes('observation:attempt:probe:verifier:deepseek'));
    assert.ok(outcome.recorded.includes('observation:verifier:probe:A:C1'));
    assert.equal(outcome.recorded.filter(id => id.startsWith('observation:synthesized:probe:')).length, 1);
    assert.equal(outcome.snapshot.observation_revision, 4);
    const executorRecord = outcome.snapshot.observations.find(record => record.id === 'observation:attempt:probe:executor:deepseek');
    assert.equal(executorRecord.classification, 'observed');
    assert.equal(executorRecord.provenance.kind, 'native_event');
    const activity = JSON.parse(executorRecord.text);
    assert.equal(activity.agent.id, 'worker:deepseek-executor');
    assert.equal(activity.activity.state, 'finished');
    assert.equal(activity.delivery.consumption.status, 'observed');
    assert.equal(activity.conversational_telemetry.status, 'unavailable');
    const publication = outcome.snapshot.observations.find(record => record.id === 'observation:verifier:probe:A:C1');
    const verdict = JSON.parse(publication.text);
    assert.equal(verdict.verdict, 'approved');
    assert.equal(verdict.verifier.identity, 'worker:deepseek-verifier');
    assert.notEqual(verdict.verifier.identity, verdict.executor.identity, 'verifier publication is a distinct identity');
    // The synthesized boundary: the adapter-synthesized audit record is labeled
    // synthesized and never native, while real producer evidence is native.
    const synthesized = outcome.snapshot.observations.find(record => record.id.startsWith('observation:synthesized:probe:'));
    assert.ok(synthesized, 'the dsh-synthesized PermissionRequest record is observed');
    assert.equal(synthesized.provenance.kind, 'collector', 'a synthesized event never carries native_event provenance');
    assert.equal(synthesized.classification, 'observed');
    const payload = JSON.parse(synthesized.text);
    assert.equal(payload.synthesized, true);
    assert.equal(payload.synthesized_by, 'dsh-pre-tool-use');
    assert.equal(payload.native_event, false);
    assert.match(payload.request_id, /^dsh-synthetic-/);
    const read = JSON.parse((await f.call('project.mjs', 'read', [])).stdout);
    const plan = read.plans.find(entry => entry.id === 'plan:deepseek');
    assert.equal(plan.native_observations.length, 1);
    assert.equal(plan.native_observations[0].run_id, 'probe');
    assert.equal(plan.native_observations[0].runtime, 'LazyDeepSeek');
    assert.ok(['running', 'finished'].includes(plan.native_observations[0].execution), 'observed execution stays honest');
    const rerun = await f.call('project.mjs', 'observe', []);
    assert.equal(rerun.code, 0, rerun.stderr);
    const repeated = JSON.parse(rerun.stdout);
    assert.deepEqual(repeated.recorded, [], 'unchanged evidence coalesces to no new observation');
    assert.equal(repeated.snapshot.observation_revision, 4, 'coalesced observations leave the revision untouched');
  } finally { await f.cleanup(); }
});

async function mcpProject() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'lazydeepseek-project-mcp-')));
  const gitEnv = { GIT_CONFIG_NOSYSTEM: '1', HOME: root, ...pythonEnvironment };
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env: { ...process.env, ...gitEnv } });
    if (result.status) throw new Error(result.stderr.toString());
  };
  git('init', '-q'); git('config', 'user.name', 'DeepSeek Project MCP QA'); git('config', 'user.email', 'deepseek@example.invalid');
  await writeFile(join(root, '.gitignore'), '.lazydeepseek/\n');
  git('add', '.gitignore'); git('-c', 'user.name=p', '-c', 'user.email=p@i', 'commit', '-qm', 'fixture');
  const created = spawnSync('bash', [join(plugin, 'scripts/state/create-run.sh'), 'probe', 'DeepSeek project MCP probe'],
    { env: { ...process.env, CWD: root, ...pythonEnvironment } });
  if (created.status) throw new Error(created.stderr.toString());
  return root;
}

test('status-dashboard MCP project tool round trip runs under /bin/bash 3.2 including a no-port case', async () => {
  const root = await mcpProject();
  const server = join(plugin, 'mcp/status-dashboard/server.sh');
  const environment = { ...process.env, CWD: root, LAZYDEEPSEEK_PLUGIN_ROOT: plugin,
    LAZYDEEPSEEK_MCP_MODE: 'orchestrated', ...pythonEnvironment };
  const bashVersion = spawnSync('/bin/bash', ['-c', 'echo "$BASH_VERSION"'], { encoding: 'utf8' });
  assert.match(bashVersion.stdout, /^3\.2\./, 'the MCP session is driven by the macOS bash 3.2 interpreter');
  const rpc = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
  const session = (lines) => new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [server], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.stdin.end(lines.join('\n') + '\n');
    child.on('close', () => resolve({ stdout, stderr }));
  });
  try {
    const first = await session([rpc(1, 'initialize', {}), rpc(2, 'tools/list'),
      rpc(3, 'tools/call', { name: 'project', arguments: { action: 'project.context', project_id: 'project:deepseek' } }),
      rpc(4, 'tools/call', { name: 'project', arguments: { action: 'source.map', project_id: 'project:deepseek',
        request: { command_id: 'mcp:map-1', expected_revision: 0, payload: { source_id: 'source:plan' } } } })]);
    const replies = first.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(replies[1].result.tools.some(tool => tool.name === 'project'), true, 'project tool is declared');
    assert.equal(replies[1].result.tools.some(tool => tool.name === 'copy_task_context'), true, 'existing tools stay declared');
    const preInit = JSON.parse(replies[2].result.content[0].text);
    assert.equal(preInit.result.status, 'not_initialized');
    assert.equal(preInit.result.hint, 'PROJECT_NOT_INITIALIZED');
    assert.equal(preInit.result.init_offer.kind, 'question');
    const rejected = JSON.parse(replies[3].result.content[0].text);
    assert.equal(rejected.result.status, 'not_initialized', 'every project action answers the typed hint');
    assert.equal(await lstat(join(root, '.lazydeepseek/project')).then(() => true, () => false), false,
      'the MCP tool never creates the project store');

    const initiated = spawnSync(process.execPath, [projectCli, 'init', '--project-root', root,
      '--project-id', 'project:deepseek', '--actor', 'test:deepseek'], { env: { ...process.env, ...pythonEnvironment } });
    assert.equal(initiated.status, 0, initiated.stderr.toString());

    const second = await session([rpc(7, 'tools/call', { name: 'project', arguments: { action: 'project.context',
      project_id: 'project:deepseek' } }),
      rpc(8, 'tools/call', { name: 'dashboard_service', arguments: { action: 'status', project_id: 'project:deepseek', run_id: 'probe' } })]);
    const after = second.stdout.trim().split('\n').map(line => JSON.parse(line));
    const context = JSON.parse(after[0].result.content[0].text);
    assert.equal(context.result.status, 'ok');
    assert.equal(context.result.project_id, 'project:deepseek');
    assert.equal(context.result.summary.project.runtime, 'LazyDeepSeek');
    assert.equal(context.delivery.native_delivery, 'unobserved', 'native delivery stays honestly unobserved');
    assert.equal(context.result.summary.boundaries.dsh_host_control.includes('unavailable'), true,
      'unavailable dsh host control is stated honestly');
    // No port argument: the empty PORT_ARGS array expansion must stay safe on
    // bash 3.2 (set -u) and the read-only status action answers without one.
    const noPort = JSON.parse(after[1].result.content[0].text);
    assert.equal(noPort.status, 'stopped');
    assert.equal(noPort.entry, 'browser');
    assert.equal(noPort.capabilities.dsh_host_control, 'unavailable');

    const gated = spawnSync('/bin/bash', [server], {
      env: { ...environment, LAZYDEEPSEEK_MCP_MODE: 'not-a-mode' }, input: rpc(9, 'tools/call',
        { name: 'project', arguments: { action: 'project.context', project_id: 'project:deepseek' } }) + '\n'
    });
    assert.equal(gated.status, 2, 'the profile gate rejects an invalid mode before any tool');
    assert.match(gated.stderr.toString(), /MCP_PROFILE_INVALID/);
    assert.equal(gated.stdout.toString(), '', 'no project tool output escapes the gate');
  } finally { await rm(root, { recursive: true, force: true }); }
});
