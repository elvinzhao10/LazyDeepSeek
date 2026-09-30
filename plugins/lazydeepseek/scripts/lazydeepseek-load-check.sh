#!/usr/bin/env bash
# noqa: SIZE_OK - standalone package-readiness gate remains self-contained in installed plugins.
set -euo pipefail

reject_symlinked_path_components() {
    local remaining="${1#/}"
    local prefix=/
    local component
    local candidate

    while [ -n "$remaining" ]; do
        component="${remaining%%/*}"
        if [ "$component" = "$remaining" ]; then
            remaining=
        else
            remaining="${remaining#*/}"
        fi

        case "$component" in
            ''|.) continue ;;
            ..) echo "$ROOT_VARIABLE must not contain parent traversal" >&2; exit 1 ;;
        esac

        candidate="$prefix$component"
        if [ -L "$candidate" ] && ! is_macos_var_alias "$candidate"; then
            echo "$ROOT_VARIABLE path must not be symlinked" >&2
            exit 1
        fi
        prefix="$candidate/"
    done
}

is_macos_var_alias() {
    [ "$1" = /var ] && [ "$(CDPATH= cd -P -- /var && pwd)" = /private/var ]
}

if [ -n "${LAZYDEEPSEEK_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$LAZYDEEPSEEK_PLUGIN_ROOT"
    ROOT_VARIABLE=LAZYDEEPSEEK_PLUGIN_ROOT
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
    ROOT_VARIABLE=CLAUDE_PLUGIN_ROOT
else
    PLUGIN_ROOT="$(cd -P "$(dirname "$0")/.." && pwd -P)"
    ROOT_VARIABLE="plugin root"
fi

if [ -n "${LAZYDEEPSEEK_PLUGIN_ROOT:-}" ] || [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    case "$PLUGIN_ROOT" in
        /*)
            reject_symlinked_path_components "$PLUGIN_ROOT"
            ;;
        *)
            echo "$ROOT_VARIABLE must be an absolute path" >&2
            exit 1
            ;;
    esac
fi

python3 - "$PLUGIN_ROOT" <<'PY'
import json
import os
import subprocess
import sys

root = os.path.realpath(sys.argv[1])
failed = False

EXPECTED_SKILLS = 19
EXPECTED_COMMANDS = 20
EXPECTED_AGENTS = 13
EXPECTED_HOOK_EVENTS = (
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
)
EXPECTED_MCP_SERVERS = 6
EXPECTED_VERSION = "1.3.3"
LAZYDEEPSEEK_HOOK_EVENTS = set(EXPECTED_HOOK_EVENTS)

def result(state, label, detail):
    global failed
    print(f"{state} {label}: {detail}")
    if state == "FAIL":
        failed = True

def load_json(path, label):
    try:
        with open(path, encoding="utf-8") as handle:
            value = json.load(handle)
    except FileNotFoundError:
        result("FAIL", label, "missing")
        return None
    except (OSError, json.JSONDecodeError) as exc:
        result("FAIL", label, f"invalid JSON ({exc})")
        return None
    if not isinstance(value, dict):
        result("FAIL", label, "must be a JSON object")
        return None
    result("PASS", label, "valid JSON")
    return value

def count_files(label, directory, expected, predicate):
    if not os.path.isdir(directory):
        result("FAIL", label, f"directory missing (0/{expected})")
        return
    actual = sum(1 for base, _, names in os.walk(directory) for name in names if predicate(base, name))
    result("PASS" if actual == expected else "FAIL", label, f"{actual}/{expected}")

print("=== LazyDeepSeek Package Readiness Check ===")
print(f"Plugin root: {root}")
source_root = os.path.dirname(os.path.dirname(root))
source_revision = "unavailable in installed package"
if os.path.isdir(os.path.join(source_root, ".git")):
    try:
        revision = subprocess.run(
            ["git", "-C", source_root, "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=2, check=False,
        )
        dirty = subprocess.run(
            ["git", "-C", source_root, "status", "--porcelain", "--untracked-files=normal"],
            capture_output=True, text=True, timeout=2, check=False,
        )
        if revision.returncode == 0:
            source_revision = revision.stdout.strip() + ("+dirty" if dirty.returncode == 0 and dirty.stdout else "")
    except (OSError, subprocess.TimeoutExpired):
        pass
print(f"Source revision: {source_revision}")
mode = os.environ.get("LAZYDEEPSEEK_MCP_MODE") or "orchestrated"
profiles = {
    "direct": {"run-ledger", "verification", "status-dashboard"},
    "assisted": {"run-ledger", "verification", "status-dashboard", "context-graph", "code-intel"},
    "planned": {"run-ledger", "verification", "status-dashboard", "context-graph", "docs"},
    "orchestrated": {"run-ledger", "verification", "status-dashboard", "context-graph", "code-intel", "docs"},
    "long-horizon": {"run-ledger", "verification", "status-dashboard", "context-graph", "code-intel", "docs"},
}
if mode not in profiles:
    result("FAIL", "MCP profile", "invalid mode")
else:
    deferred = sorted(profiles["orchestrated"] - profiles[mode])
    print(f"MCP profile: {mode}; deferred: {', '.join(deferred) or 'none'} (profile exclusion; protocol endpoint remains available)")
restricted = os.environ.get("LAZYDEEPSEEK_RESTRICTED_RUN") == "1"
print(f"Role enforcement: {'restricted run requested; trusted hook identity required' if restricted else 'conditional; no restricted run selected'}")

if not os.path.isdir(root):
    result("FAIL", "plugin root", "directory missing")
    print("PACKAGE_READINESS=failed")
    sys.exit(1)

skills_dir = os.path.join(root, "skills")
skill_count = sum(
    1 for base, _, names in os.walk(skills_dir)
    if "SKILL.md" in names and os.path.basename(base).startswith("lazy-")
) if os.path.isdir(skills_dir) else 0
# dsh package boundary: the npm-style package manifest at the package root
# (plugins/lazydeepseek is nested inside the installed package) plus the
# bundle patch. There is no plugin.json manifest on DeepSeek Harness.
manifest_path = os.path.join(os.path.dirname(os.path.dirname(root)), "package.json")
patch_path = os.path.join(os.path.dirname(os.path.dirname(root)), "cordis.patch.yml")

if not os.path.exists(manifest_path) and skill_count:
    print(f"DEGRADED skills: {skill_count} discovered in manual skill-only fallback")
    print("UNCHECKED commands/hooks/MCP: not installed by the manual skill-only fallback")
    print("READINESS_SCOPE=manual-skills-mcp-fallback")
    print("Manual fallback exposes Skills and individually configured MCP only; agents, commands, and hooks remain unavailable.")
    print("PACKAGE_READINESS=degraded")
    print("Package readiness is degraded; host activation and runtime loading are unchecked.")
    sys.exit(0)

repo_root = os.path.dirname(os.path.dirname(root))
# dsh route contract: validates the package boundary for the GitHub-only
# distribution routes (git-spec default, tarball alternate, local-dir dev).
route_check = subprocess.run(
    ["node", os.path.join(root, "scripts", "lazydeepseek-route-check.js")],
    check=False,
    capture_output=True,
    text=True,
)
if route_check.returncode == 0:
    result("PASS", "dsh route contract", route_check.stdout.strip() or "dsh route defaults verified")
else:
    result("FAIL", "dsh route contract", route_check.stderr.strip())

import shutil as _shutil

_node_binary = _shutil.which("node")
machine_status = None
if _node_binary:
    machine_status = subprocess.run(
        [_node_binary, os.path.join(root, "scripts", "lazydeepseek-machine-status.js"), "--json"],
        check=False,
        capture_output=True,
        text=True,
    )
try:
    if machine_status is None:
        raise ValueError("node unavailable; machine status v2 not probed in this environment")
    status = json.loads(machine_status.stdout)
    host_rows = status.get("hosts")
    if (
        machine_status.returncode != 0
        or status.get("schema_version") != 2
        or status.get("version") != EXPECTED_VERSION
        or status.get("package_readiness") != {"status": "ready", "scope": "package"}
        or status.get("host_readiness") != {"status": "pending"}
        or not isinstance(host_rows, list)
        or [row.get("host") for row in host_rows] != ["dsh"]
        or any(row.get("host_readiness") != "pending" for row in host_rows)
    ):
        raise ValueError("status fields do not match the v2 package boundary")
except (AttributeError, TypeError, ValueError, json.JSONDecodeError) as exc:
    if machine_status is None:
        result("PASS", "machine status v2", f"skipped: {exc}")
    else:
        result("FAIL", "machine status v2", str(exc))
else:
    result("PASS", "machine status v2", "package-scoped DeepSeek Harness host; host readiness pending")

for legal_name in ("LICENSE", "NOTICE"):
    legal_path = os.path.join(root, legal_name)
    if os.path.isfile(legal_path):
        result("PASS", f"package {legal_name}", "present")
    else:
        result("FAIL", f"package {legal_name}", "missing from plugin root")

manifest = load_json(manifest_path, "package manifest (package.json)")
if manifest is not None:
    if manifest.get("name") != "lazydeepseek":
        result("FAIL", "package manifest name", "expected 'lazydeepseek'")
    else:
        result("PASS", "package manifest name", "lazydeepseek")
    version = manifest.get("version")
    if version != EXPECTED_VERSION:
        result("FAIL", "package manifest version", f"expected {EXPECTED_VERSION}, got {version!r}")
    else:
        result("PASS", "package manifest version", version)
    if manifest.get("dsh", {}).get("bundle", {}).get("patch") != "./cordis.patch.yml":
        result("FAIL", "package dsh key", "dsh.bundle.patch must be './cordis.patch.yml'")
    else:
        result("PASS", "package dsh key", "bundle patch declared (cordis.patch.yml)")
    peer = manifest.get("peerDependencies", {}).get("@deepseek-ai/dsh")
    if peer != "0.2.0-rc.2":
        result("FAIL", "dsh peer pin", f"expected exact '0.2.0-rc.2', got {peer!r}")
    else:
        result("PASS", "dsh peer pin", "0.2.0-rc.2 (exact)")
    build_scripts = [s for s in ("prepare", "preinstall", "postinstall", "install") if s in (manifest.get("scripts") or {})]
    if build_scripts:
        result("FAIL", "install-time scripts", f"present ({', '.join(build_scripts)}); git-spec installs must not depend on allowBuilds")
    else:
        result("PASS", "install-time scripts", "none (prebuilt lib/ committed)")

# Bundle patch rows: shim entry, bridge, six MCP servers, skills, ralph.
try:
    with open(patch_path, encoding="utf-8") as handle:
        patch_text = handle.read()
    rows = {
        "shim entry": "name: './lib/index.mjs'" in patch_text,
        "hooks bridge": "'@deepseek-ai/dsh-hooks-claude-code'" in patch_text,
        "bundled skills": "bundledSkillDir:" in patch_text,
        "native ralph adoption": "id: tool-ralph" in patch_text and "disabled: false" in patch_text,
    }
    patch_servers = [m.group(1) for m in __import__("re").finditer(r"serverName:\s*(\S+)", patch_text)]
    rows["MCP rows (6)"] = sorted(patch_servers) == sorted(
        ["run-ledger", "verification", "status-dashboard", "context-graph", "code-intel", "docs"]
    )
    for label, ok in rows.items():
        result("PASS" if ok else "FAIL", f"cordis patch: {label}", "present" if ok else "missing or malformed")
except OSError as exc:
    result("FAIL", "cordis patch", f"unreadable ({exc})")

if os.path.isdir(skills_dir):
    actual_skills = 0
    problems = []
    for child in sorted(os.scandir(skills_dir), key=lambda entry: entry.name):
        if not child.is_dir(follow_symlinks=False):
            continue
        if os.path.isfile(os.path.join(child.path, "SKILL.md")):
            if child.name.startswith("lazy-"):
                actual_skills += 1
            else:
                problems.append(f"{child.name}/SKILL.md is not a lazy- skill directory")
        else:
            problems.append(f"missing {child.name}/SKILL.md")
    if problems or actual_skills != EXPECTED_SKILLS:
        result("FAIL", "skills", f"{actual_skills}/{EXPECTED_SKILLS}; " + "; ".join(problems))
    else:
        result("PASS", "skills", f"{actual_skills}/{EXPECTED_SKILLS}")

count_files("commands", os.path.join(root, "commands"), EXPECTED_COMMANDS, lambda _base, name: name.endswith(".md"))
count_files("agents", os.path.join(root, "agents"), EXPECTED_AGENTS, lambda _base, name: name.endswith(".md"))

hooks = load_json(os.path.join(root, "hooks", "hooks.json"), "hooks configuration")
if hooks is not None:
    declared = hooks.get("hooks")
    events = sorted(declared) if isinstance(declared, dict) and declared else []
    if not events:
        result("FAIL", "hooks", "no hook events declared")
    elif sorted(LAZYDEEPSEEK_HOOK_EVENTS) != events:
        unsupported = [event for event in events if event not in LAZYDEEPSEEK_HOOK_EVENTS]
        missing = [event for event in EXPECTED_HOOK_EVENTS if event not in events]
        detail = f"{len(events)} events declared, expected exactly {len(EXPECTED_HOOK_EVENTS)} DeepSeek Harness events"
        if unsupported:
            detail += f"; unsupported: {', '.join(unsupported)}"
        if missing:
            detail += f"; missing: {', '.join(missing)}"
        result("FAIL", "hooks", detail)
    else:
        result("PASS", "hooks", f"{len(events)}/{len(EXPECTED_HOOK_EVENTS)} DeepSeek Harness hook events")

# Bridge template: the generated hooks.dsh.json carries exactly the five
# bridged events with lowercase dsh matcher subjects.
bridge_template = load_json(os.path.join(root, "hooks", "hooks.dsh.json"), "bridge hooks template")
if bridge_template is not None:
    bridged = bridge_template.get("hooks")
    bridged_events = sorted(bridged) if isinstance(bridged, dict) and bridged else []
    expected_bridged = sorted(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"])
    if bridged_events != expected_bridged:
        result("FAIL", "bridge template events", f"{bridged_events} != {expected_bridged}")
    elif bridge_template["hooks"]["PreToolUse"][0].get("matcher") != "write|edit|bash":
        result("FAIL", "bridge template matchers", "PreToolUse matcher must be lowercase 'write|edit|bash' (dsh tool names)")
    else:
        result("PASS", "bridge template", "5 bridged events; lowercase matcher subjects")

# Canonical typed MCP declarations: .mcp.json is the declaration source the
# validators consume; the six dsh-mcp-client rows in cordis.patch.yml are the
# host surface (row agreement is asserted by the route check above).
mcp = load_json(os.path.join(root, ".mcp.json"), "MCP configuration")
if mcp is not None:
    servers = mcp.get("mcpServers")
    count = len(servers) if isinstance(servers, dict) else -1
    result("PASS" if count == EXPECTED_MCP_SERVERS else "FAIL", "MCP servers", f"{count}/{EXPECTED_MCP_SERVERS}")
    # Project boundary for MCP plugin data: prefer the caller's project, but
    # never a directory inside the plugin root (copied packages validate from
    # arbitrary working directories).
    profile_project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    def _within(parent, child):
        parent = os.path.realpath(parent)
        child = os.path.realpath(child)
        return child == parent or child.startswith(parent + os.sep)

    if _within(root, profile_project):
        profile_project = repo_root
    profile_check = subprocess.run(
        [
            sys.executable,
            os.path.join(root, "scripts", "lazydeepseek-mcp-profile.py"),
            "--mode", "orchestrated",
            "--project-dir", profile_project,
            "--plugin-data", os.path.join(os.path.realpath(os.getenv("TMPDIR", "/tmp")), f"lazydeepseek-profile-validation-{os.getpid()}"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if profile_check.returncode == 0:
        result("PASS", "MCP typed profile contract", "six typed declarations; core direct; optional deferred")
    else:
        result("FAIL", "MCP typed profile contract", profile_check.stderr.strip() or "profile validation failed")

contract_path = os.path.join(root, "contracts", "automatic-tooling-contract.v1.json")
contract_digest_path = contract_path + ".sha256"
policy_adapter_path = os.path.join(root, "tooling", "lazydeepseek_policy.py")
readiness_adapter_path = os.path.join(root, "tooling", "lazydeepseek_capability_readiness.py")
try:
    import hashlib
    with open(contract_path, "rb") as handle:
        contract_bytes = handle.read()
    with open(contract_digest_path, encoding="utf-8") as handle:
        expected_digest = handle.read().split()[0]
    contract = json.loads(contract_bytes)
    if (
        hashlib.sha256(contract_bytes).hexdigest() != expected_digest
        or contract.get("schema") != "lazy-series.automatic-tooling.contract"
        or contract.get("schema_version") != 1
    ):
        raise ValueError("invalid contract digest or schema")
except (FileNotFoundError, IndexError, OSError, ValueError, json.JSONDecodeError) as exc:
    result("FAIL", "automatic tooling contract", str(exc))
else:
    result("PASS", "automatic tooling contract", "verified")

if os.path.isfile(policy_adapter_path):
    result("PASS", "provider policy adapter", "present")
else:
    result("FAIL", "provider policy adapter", "missing")

try:
    report = subprocess.run(
        [sys.executable, "-B", readiness_adapter_path, "readiness-report", "--json"],
        check=True,
        capture_output=True,
        text=True,
    )
    records = json.loads(report.stdout).get("records")
    if (
        not isinstance(records, list)
        or len(records) != 9
        or any(record.get("reason_code") == "CONTRACT_INTEGRITY_INVALID" for record in records)
        or any(record.get("readiness_scope") == "current-session" for record in records)
        or any(record.get("readiness_scope") != "package" for record in records)
        or any(record.get("host") != "dsh" for record in records)
    ):
        raise ValueError("canonical report did not return nine integrity-valid package-scope records")
except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
    result("FAIL", "canonical capability readiness", str(exc))
else:
    result("PASS", "canonical capability readiness", "read-only report available; host and MCP connection remain unchecked")

if failed:
    print("PACKAGE_READINESS=failed")
    print("Package readiness failed. Reinstall the full plugin or correct the named package file.")
    sys.exit(1)

print("PACKAGE_READINESS=full")
print("READINESS_SCOPE=package-ready")
print("Package files are ready. Host activation, runtime loading, and MCP status remain unchecked.")
print("next (dsh): use durable status --route dsh-plugin-git-sha for the route handoff and receipt requirements; "
      "otherwise consult docs/reference/host-routes.md")
PY
