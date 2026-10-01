#!/usr/bin/env node
'use strict';
// Child lifecycle observations carry no completion authority.
const fs = require('node:fs');
const path = require('node:path');
try {
  const input = fs.readFileSync(0);
  if (input.length > 65536) throw new Error('payload exceeds 65536 bytes');
  const payload = JSON.parse(input);
  if (!['SubagentStart', 'SubagentStop'].includes(payload.hook_event_name)) throw new Error('unsupported child event');
  for (const key of ['cwd', 'session_id', 'agent_id', 'agent_type']) {
    if (typeof payload[key] !== 'string' || !payload[key]) throw new Error(`missing ${key}`);
  }
  const cwd = fs.realpathSync(payload.cwd);
  const stateRoot = path.join(cwd, '.lazydeepseek');
  if (!fs.existsSync(stateRoot)) return;
  if (!fs.lstatSync(stateRoot).isDirectory() || fs.lstatSync(stateRoot).isSymbolicLink()) throw new Error('linked state root refused');
  const target = path.join(stateRoot, 'native-subagent-events.jsonl');
  if (fs.existsSync(target) && (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink())) throw new Error('linked event output refused');
  const safeId = (value) => value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 160);
  fs.appendFileSync(target, JSON.stringify({ event: payload.hook_event_name, session_id: safeId(payload.session_id), agent_id: safeId(payload.agent_id), agent_type: safeId(payload.agent_type), completion_authority: false, occurred_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
} catch (error) {
  process.stderr.write(`lazydeepseek child observation skipped: ${error.message}\n`);
}
