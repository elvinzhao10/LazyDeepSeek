#!/usr/bin/env bash
# session-start.sh — DeepSeek Harness SessionStart hook: bootstrap .lazydeepseek state, run the
# package load-check, and summarize boulder / active-loop / active-run state.
#
# DeepSeek Harness output contract: print EITHER strict JSON in the bridge shape ({"hookSpecificOutput": {"hookEventName": "<Event>", "additionalContext": "..."}}; the 0.2.0-rc.2 codec reads additionalContext ONLY from hookSpecificOutput)
# OR nothing on stdout; diagnostics go to stderr. This hook is advisory and
# ALWAYS exits 0 — a degraded package must never break session startup.
set -uo pipefail

# --- Read event JSON from stdin defensively (cap input at 1 MiB) ---
INPUT=$(head -c 1048576 || true)
CWD=$(printf '%s' "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd','.'))" 2>/dev/null || true)
[ -n "$CWD" ] || CWD="$PWD"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

NOTES_FILE=$(mktemp "${TMPDIR:-/tmp}/lazydeepseek-session-start.XXXXXX")
trap 'rm -f "$NOTES_FILE"' EXIT
note() { printf '%s\n' "$1" >>"$NOTES_FILE"; }

note "(LazyDeepSeek v1.3.3): Session starting — checking project state..."

# --- Bootstrap the .lazydeepseek/ directory tree so skills/agents that read
# plans/, context/, drafts/, or runs/ don't crash on a fresh workspace.
# create-run.sh creates runs/<run_id>/ on demand; this ensures the parents exist.
if mkdir -p "$CWD/.lazydeepseek"/{plans,context,drafts,runs} 2>/dev/null; then
    note "(LazyDeepSeek): .lazydeepseek state directories present (plans, context, drafts, runs)."
else
    note "(LazyDeepSeek): WARNING could not create $CWD/.lazydeepseek state directories."
fi

# --- Package readiness (load-check) ---
if [ ! -d "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/lazydeepseek-load-check.sh" ]; then
    note "(LazyDeepSeek): WARNING plugin root unavailable — package readiness unknown (SESSIONSTART_READINESS=failed reason=plugin-root-unavailable)."
else
    if load_check=$(bash "$PLUGIN_ROOT/scripts/lazydeepseek-load-check.sh" 2>&1); then
        if grep -q '^PACKAGE_READINESS=full$' <<<"$load_check"; then
            note "(LazyDeepSeek): Package readiness: full."
            note "SESSIONSTART_READINESS=full"
        elif grep -q '^PACKAGE_READINESS=degraded$' <<<"$load_check"; then
            note "(LazyDeepSeek): Package readiness: degraded — some verification gates may be unavailable."
            note "SESSIONSTART_READINESS=degraded"
        else
            note "(LazyDeepSeek): Package readiness: unknown (missing readiness result)."
            note "SESSIONSTART_READINESS=degraded reason=missing-package-readiness-result"
        fi
    else
        note "(LazyDeepSeek): Package readiness check failed — continuing in degraded mode."
        note "SESSIONSTART_READINESS=degraded reason=package-readiness-failed"
    fi
fi

# --- Check for project memory ---
if [ -f "$CWD/dsh.md" ]; then
    note "(LazyDeepSeek): Project memory found (dsh.md)."
else
    note "(LazyDeepSeek): Project memory (dsh.md) missing. Run /lazy-init-deep or ask to initialize project memory."
fi

# --- Check for project rules ---
if [ -d "$CWD/.dsh/rules" ] && [ "$(ls -A "$CWD/.dsh/rules"/*.md 2>/dev/null)" ]; then
    note "(LazyDeepSeek): Project rules loaded."
fi

# --- Boulder summary (durable work tracking under .lazydeepseek/state/) ---
BOULDER_FILE="$CWD/.lazydeepseek/state/boulder.json"
if [ -f "$BOULDER_FILE" ]; then
    BOULDER=$(python3 - "$BOULDER_FILE" <<'PY' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(0)
work_id = d.get('active_work_id')
works = d.get('works', {})
if isinstance(work_id, str) and work_id and isinstance(works, dict):
    work = works.get(work_id)
    detail = ''
    if isinstance(work, dict):
        detail = f" (status: {work.get('status', 'unknown')})"
    print(f"(LazyDeepSeek): Boulder active work: {work_id}{detail}")
PY
)
    [ -n "$BOULDER" ] && note "$BOULDER"
fi

# --- Active-loop summary ---
ACTIVE_LOOP_FILE="$CWD/.lazydeepseek/state/active-loop.json"
if [ -f "$ACTIVE_LOOP_FILE" ]; then
    ACTIVE_LOOP=$(python3 - "$ACTIVE_LOOP_FILE" <<'PY' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(0)
if not isinstance(d, dict):
    raise SystemExit(0)
plan = d.get('plan_name') or d.get('plan') or d.get('goal') or 'unknown'
print(f"(LazyDeepSeek): Active loop present: {plan}. Continue with /lazy-ulw-loop or /lazy-start-work.")
PY
)
    [ -n "$ACTIVE_LOOP" ] && note "$ACTIVE_LOOP"
fi

# --- Active run summary ---
RUNS_DIR="$CWD/.lazydeepseek/runs"
if [ -d "$RUNS_DIR" ]; then
    for run_dir in "$RUNS_DIR"/*/; do
        state_file="${run_dir}state.json"
        if [ -f "$state_file" ]; then
            STATUS=$(python3 - "$state_file" <<'PY' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)
print(d.get('status', ''))
PY
)
            if [ "$STATUS" = "active" ] || [ "$STATUS" = "paused" ] || [ "$STATUS" = "executing" ] || [ "$STATUS" = "verifying" ] || [ "$STATUS" = "reviewing" ]; then
                PLAN=$(python3 - "$state_file" <<'PY' 2>/dev/null || echo "unknown"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)
print(d.get('plan_name', ''))
PY
)
                PROGRESS=$(python3 - "$state_file" <<'PY' 2>/dev/null || echo "?/?"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)
p = d.get('progress', {})
print(f"{p.get('completed_checkboxes', p.get('completed', 0))}/{p.get('total_checkboxes', p.get('total', 0))}")
PY
)
                note "(LazyDeepSeek): Active run found: $PLAN (status: $STATUS, progress: $PROGRESS)"
                note "(LazyDeepSeek): Run /lazy-start-work or ask to continue the planned work."
            fi
            break
        fi
    done
fi

# --- Emit strict JSON only: bridge-shape hookSpecificOutput additionalContext ---
NOTES="$(cat "$NOTES_FILE")" python3 - <<'PY'
import json, os
notes = os.environ.get('NOTES', '')
if notes.strip():
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": notes}}))
PY

exit 0
