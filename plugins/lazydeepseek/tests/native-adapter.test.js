const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '../../..');
let buildHooksConfig, generateRuntimeArtifacts, registerCommands, removeRuntimeArtifacts;
test.before(async () => {
  ({ buildHooksConfig, generateRuntimeArtifacts, registerCommands, removeRuntimeArtifacts } = await import('../../../lib/index.mjs'));
});
function fixture(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'lazydeepseek-native-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('bridge forwards seven events and leaves synthesized events outside native rows', () => {
  const hooks = buildHooksConfig(root).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']);
  assert.match(hooks.SubagentStop[0].hooks[0].command, /native-subagent-event.js/);
});
test('same-version roots, content changes and profiles receive distinct owned runtime directories', (t) => {
  const home = fixture(t);
  const a = generateRuntimeArtifacts(root, home, 'profile-a');
  assert.equal(generateRuntimeArtifacts(root, home, 'profile-a').regenerated, false);
  const b = generateRuntimeArtifacts(root, home, 'profile-b');
  assert.notEqual(a.ownDir, b.ownDir);
  const copy = join(home, 'package');
  fs.mkdirSync(copy);
  for (const entry of ['package.json', 'cordis.patch.yml', 'lib', 'plugins']) fs.cpSync(join(root, entry), join(copy, entry), { recursive: true });
  const moved = generateRuntimeArtifacts(copy, home, 'profile-a');
  assert.notEqual(a.ownDir, moved.ownDir);
  assert.match(fs.readFileSync(join(moved.ownDir, 'launch/mcp-docs.sh'), 'utf8'), new RegExp(copy));
  fs.appendFileSync(join(copy, 'plugins/lazydeepseek/commands/lazy-status.md'), '\nchanged');
  const changed = generateRuntimeArtifacts(copy, home, 'profile-a');
  assert.notEqual(moved.ownDir, changed.ownDir);
  assert.ok(fs.existsSync(join(a.ownDir, 'hooks.dsh.json')));
});
test('generation and removal preserve modified, unknown and linked artifacts', (t) => {
  const home = fixture(t);
  const a = generateRuntimeArtifacts(root, home, 'profile-a');
  fs.writeFileSync(join(a.ownDir, 'foreign.txt'), 'foreign');
  assert.throws(() => generateRuntimeArtifacts(root, home, 'profile-a'), /ownership or content mismatch/);
  assert.throws(() => removeRuntimeArtifacts(a.ownDir, a.identity, true), /ownership or content mismatch/);
  assert.equal(fs.readFileSync(join(a.ownDir, 'foreign.txt'), 'utf8'), 'foreign');
  const b = generateRuntimeArtifacts(root, home, 'profile-b');
  assert.throws(() => removeRuntimeArtifacts(b.ownDir, b.identity), /selected host bundle/);
  fs.unlinkSync(join(b.ownDir, 'hooks.dsh.json'));
  fs.symlinkSync(join(a.ownDir, 'foreign.txt'), join(b.ownDir, 'hooks.dsh.json'));
  assert.throws(() => removeRuntimeArtifacts(b.ownDir, b.identity, true), /linked runtime/);
});
test('exact runtime removal retains other profile and legacy shared files', (t) => {
  const home = fixture(t);
  const a = generateRuntimeArtifacts(root, home, 'profile-a');
  const b = generateRuntimeArtifacts(root, home, 'profile-b');
  fs.writeFileSync(join(home, 'lazydeepseek', 'foreign.txt'), 'retained');
  removeRuntimeArtifacts(a.ownDir, a.identity, true);
  assert.equal(fs.existsSync(a.ownDir), false);
  assert.ok(fs.existsSync(join(b.ownDir, 'receipt.json')));
  assert.equal(fs.readFileSync(join(home, 'lazydeepseek', 'foreign.txt'), 'utf8'), 'retained');
});
test('all service commands forward exact arguments into identified native user messages', () => {
  const definitions = [];
  const messages = [];
  assert.equal(registerCommands({ get: () => ({ register: (def) => definitions.push(def) }) }, root), 20);
  for (const definition of definitions) {
    const result = definition.handler({ agent: { followup: (msg) => messages.push(msg) }, rawInput: '  quoted "argument"  ' });
    assert.equal(result.kind, 'success');
    assert.match(messages.at(-1).id, /^[a-f0-9-]{36}$/);
    assert.deepEqual(messages.at(-1).source, { kind: 'user' });
    assert.equal(definition.handler({}).kind, 'error');
  }
  const status = definitions.find((def) => def.name === 'lazy-status');
  status.handler({ agent: { followup: (msg) => messages.push(msg) }, rawInput: '  exact text  ' });
  assert.ok(messages.at(-1).content[0].text.includes('  exact text  '));
});
test('source and prebuilt implementation stay equal', () => {
  assert.equal(fs.readFileSync(join(root, 'src/index.ts'), 'utf8').split('\n').slice(1).join('\n'), fs.readFileSync(join(root, 'lib/index.mjs'), 'utf8'));
});

test('native child events are advisory and refuse linked output paths', (t) => {
  const project = fixture(t);
  const state = join(project, '.lazydeepseek');
  fs.mkdirSync(state);
  const script = join(root, 'plugins/lazydeepseek/scripts/native-subagent-event.js');
  const payload = { hook_event_name: 'SubagentStop', cwd: project, session_id: 'session-1', agent_id: 'agent-1', agent_type: 'subagent', prompt: 'private text' };
  const run = () => spawnSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const output = join(state, 'native-subagent-events.jsonl');
  const event = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(event.completion_authority, false);
  assert.equal(event.prompt, undefined);
  fs.unlinkSync(output);
  const foreign = join(project, 'foreign.txt');
  fs.writeFileSync(foreign, 'caller bytes');
  fs.symlinkSync(foreign, output);
  assert.match(run().stderr, /linked event output refused/);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'caller bytes');
});

test('bundle mounts all canonical full personas and native tool names', () => {
  const patch = fs.readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  const roles = [...patch.matchAll(/    - id: tool-subagent-(lazydeepseek-[a-z-]+)\n/g)].map((match) => match[1]);
  assert.equal(roles.length, 13);
  assert.equal(new Set(roles).size, 13);
  for (const role of roles) {
    const persona = fs.readFileSync(join(root, 'plugins/lazydeepseek/agents', `${role}.md`), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    const projected = persona.split('\n').slice(0, -1).map((line) => line ? `          ${line}\n` : "\n").join('');
    assert.ok(patch.includes(projected), `${role} full persona missing`);
    assert.ok(patch.includes(`toolName: ${role}`));
  }
  assert.equal((patch.match(/inject: \[lazydeepseekRuntime\]/g) || []).length, 8);
});
