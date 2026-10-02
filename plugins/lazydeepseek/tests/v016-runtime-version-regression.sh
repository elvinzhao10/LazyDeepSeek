#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export LAZYDEEPSEEK_MCP_MODE="${LAZYDEEPSEEK_MCP_MODE:-orchestrated}"
EXPECTED_VERSION="1.3.5"
REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

for server in run-ledger verification status-dashboard context-graph code-intel docs lsp; do
  server="$PLUGIN_ROOT/mcp/$server/server.sh"
  response="$(printf '%s\n' "$REQUEST" | CWD="$PLUGIN_ROOT/.." CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$server")"
  version="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["serverInfo"]["version"])' <<<"$response")"
  [ "$version" = "$EXPECTED_VERSION" ] || {
    printf 'FAIL %s reported %s\n' "${server#$PLUGIN_ROOT/}" "$version" >&2
    exit 1
  }
done

grep -q "lazydeepseek-docs/$EXPECTED_VERSION" "$PLUGIN_ROOT/mcp/docs/server.py"
grep -q "LazyDeepSeek v$EXPECTED_VERSION" "$PLUGIN_ROOT/mcp/status-dashboard/dashboard.html"
grep -q "LazyDeepSeek v$EXPECTED_VERSION" "$PLUGIN_ROOT/scripts/hooks/session-start.sh"
grep -q "v$EXPECTED_VERSION" "$PLUGIN_ROOT/scripts/lazydeepseek-verify.sh"
grep -Fq "[$EXPECTED_VERSION]" "$PLUGIN_ROOT/CHANGELOG.md"
if grep -Eq '\]\((\./)*\.\./docs/' "$PLUGIN_ROOT/README.md"; then
  printf 'FAIL package README must not link to removed repository-root docs/\n' >&2
  exit 1
fi
python3 - "$PLUGIN_ROOT" "$EXPECTED_VERSION" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
expected = sys.argv[2]
for relative in (
    "../../package.json",
    "contracts/dsh-route-contract.v1.json",
    "tooling/package.json",
    "tooling/lsp/typescript/package.json",
    "tooling/lsp/python/package.json",
):
    value = json.loads((root / relative).read_text(encoding="utf-8"))
    assert value["version"] == expected, f"{relative} reported {value['version']!r}"

for relative in (
    "tooling/package-lock.json",
    "tooling/lsp/typescript/package-lock.json",
    "tooling/lsp/python/package-lock.json",
):
    value = json.loads((root / relative).read_text(encoding="utf-8"))
    assert value["version"] == expected, f"{relative} reported {value['version']!r}"
    assert value["packages"][""]["version"] == expected, f"{relative} root package reported {value['packages']['']['version']!r}"

contract = json.loads((root / "contracts/automatic-tooling-contract.v1.json").read_text(encoding="utf-8"))
assert contract["provenance"]["release"] == "0.18.0", "shared protocol snapshot must remain byte-stable at 0.18.0"

# The release verifier never inspects ambient host profiles. Model a profile
# installation in a temporary DSH_HOME and validate the candidate manifest.
import tempfile
with tempfile.TemporaryDirectory(prefix="lazydeepseek-version-profile-") as host_home:
    installed = pathlib.Path(host_home) / "profiles" / "candidate" / "node_modules" / "lazydeepseek" / "package.json"
    installed.parent.mkdir(parents=True)
    installed.write_bytes((root / "../../package.json").read_bytes())
    value = json.loads(installed.read_text(encoding="utf-8"))
    assert value["version"] == expected, f"isolated profile reported {value['version']!r}"

PY
printf 'v1.3.5 runtime version regression: PASS\n'
