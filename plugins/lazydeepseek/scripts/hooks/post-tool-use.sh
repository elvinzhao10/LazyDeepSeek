#!/usr/bin/env bash
# post-tool-use.sh — DeepSeek Harness PostToolUse hook: append tool-use summary to the
# active run's events.jsonl, grep changed files for AI-slop comment markers,
# and delegate to dynamic-rules.sh when present.
#
# DeepSeek Harness output contract: print NOTHING on stdout; diagnostics go to stderr.
# Advisory only — ALWAYS exits 0.
set -uo pipefail

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

# --- Read event JSON from stdin defensively (cap input at 1 MiB) ---
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/bounded-input.bash"
hook_read_input || exit 0
INPUT_FILE="$HOOK_INPUT_FILE"

SLOP_HIT=$(python3 - "$INPUT_FILE" <<'PY'
import datetime
import glob
import json
import os
import re
import sys

with open(sys.argv[1], encoding='utf-8', errors='replace') as handle:
    payload = json.loads(handle.read())

if not isinstance(payload, dict):
    raise SystemExit(0)

tool_name = payload.get('tool_name')
if not isinstance(tool_name, str):
    raise SystemExit(0)

cwd = payload.get('cwd', os.getcwd())
if not isinstance(cwd, str) or not cwd:
    raise SystemExit(0)

runs_dir = os.path.join(cwd, '.lazydeepseek', 'runs')
if not os.path.isdir(runs_dir):
    raise SystemExit(0)

active_run = None
for run_dir in sorted(glob.glob(os.path.join(runs_dir, '*/'))):
    state_file = os.path.join(run_dir, 'state.json')
    try:
        with open(state_file, encoding='utf-8') as state_handle:
            state = json.load(state_handle)
    except FileNotFoundError:
        continue
    except (json.JSONDecodeError, IsADirectoryError, OSError):
        print(json.dumps({'error': 'active_state_unreadable'}), file=sys.stderr)
        continue
    if isinstance(state, dict) and state.get('status') in ('active', 'paused', 'created', 'planning', 'executing', 'blocked', 'verifying', 'reviewing'):
        active_run = run_dir
        break

if active_run is None:
    raise SystemExit(0)

event = {'tool': tool_name, 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'}
tool_input = payload.get('tool_input')
if not isinstance(tool_input, dict):
    tool_input = {}

changed_file = None
# dsh tool names are lowercase (M0 probe discovery #1); accept both casings.
if tool_name in ('Write', 'Edit', 'write', 'edit'):
    file_path = tool_input.get('file_path')
    if isinstance(file_path, str) and file_path:
        event['files'] = [file_path]
        normalized_path = file_path.replace(chr(92), '/')
        if '.lazydeepseek/' not in normalized_path and '/.dsh/' not in normalized_path and not normalized_path.endswith('dsh.md') and not normalized_path.endswith('AGENTS.md'):
            event['boundary_warning'] = 'write outside .lazydeepseek/ - verify caller is implementer not orchestrator (G-016)'
        # --- AI-slop comment grep on the changed file ---
        if os.path.isfile(file_path):
            slop_markers = re.compile(
                r'(?:AI[- ]generated|generated (?:by|with)[^.\n]{0,40}AI|Co-Authored-By:[^\n]*(?:AI|assistant)|'
                r'AI (?:assistant|agent)[^\n]{0,40}(?:wrote|generated|created)|TODO\s*\(AI\))',
                re.I,
            )
            try:
                with open(file_path, encoding='utf-8', errors='replace') as file_handle:
                    for line_number, line in enumerate(file_handle, 1):
                        if slop_markers.search(line):
                            event['ai_slop_comment'] = f'line {line_number}'
                            print('slop')
                            break
            except OSError:
                pass

def _failure_signature(payload):
    # dsh synthesis (degraded): the bridge delivers failed calls to PostToolUse,
    # so PostToolUseFailure is discriminated from tool_response error signatures.
    response = payload.get('tool_response')
    if isinstance(response, dict):
        if response.get('is_error') is True or isinstance(response.get('error'), (str, dict)):
            return json.dumps(response.get('error') if response.get('error') is not None else response)[:200]
    if isinstance(response, str):
        stripped = response.strip()
        # dsh renders failed bash as text ending in an "[exit code: N]" marker
        # (observed live: '(no output)\n[exit code: 3]'); denied/errored calls
        # surface as 'Error: ...' text. Match the marker anywhere in the text.
        marker = re.search(r'\[exit code: (\d+)\]', stripped)
        if marker and int(marker.group(1)) != 0:
            return stripped[:200]
        if stripped.startswith('Error:'):
            return stripped[:200]
    if payload.get('is_error') is True:
        return json.dumps(payload.get('error', 'tool error'))[:200]
    return None

failure_detail = _failure_signature(payload)
records = [event]
if failure_detail is not None:
    lower = failure_detail.lower()
    if 'permission denied' in lower or 'eacces' in lower or 'not permitted' in lower:
        suggestion = 'ask-user: request elevated permissions or alternate path'
    elif 'timeout' in lower or 'timed out' in lower or 'etimedout' in lower:
        suggestion = 'retry: operation may succeed with increased timeout or network recovery'
    elif 'not found' in lower or 'enoent' in lower or 'no such file' in lower or '404' in lower:
        suggestion = 'fallback: resource not found — verify path/URL exists or use alternative'
    elif 'out of memory' in lower or 'oom' in lower or 'killed' in lower:
        suggestion = 'blocker: resource exhausted — reduce scope or increase limits'
    else:
        suggestion = 'review: generic failure — check error details and retry or escalate'
    records.append({
        'event': 'post_tool_use_failure',
        'synthesized': 'dsh-post-tool-use',
        'tool': tool_name,
        'status': 'failure',
        'error': failure_detail,
        'suggestion': suggestion,
        'degraded': True,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    })
try:
    with open(os.path.join(active_run, 'events.jsonl'), 'a', encoding='utf-8') as event_handle:
        for record in records:
            event_handle.write(json.dumps(record, default=str) + '\n')
except OSError:
    print(json.dumps({'error': 'events_append_failed'}), file=sys.stderr)
PY
) || SLOP_HIT=""

# --- Delegate to dynamic-rules.sh when present (best-effort, silent) ---
if [ -f "$SCRIPT_DIR/dynamic-rules.sh" ]; then
    bash "$SCRIPT_DIR/dynamic-rules.sh" <"$INPUT_FILE" >/dev/null 2>&1 || true
fi

exit 0
