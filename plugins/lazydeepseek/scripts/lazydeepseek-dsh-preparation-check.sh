#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: bash plugins/lazydeepseek/scripts/lazydeepseek-dsh-preparation-check.sh --project-dir <absolute-project-root>

Read-only check for the package inputs used by the observed DeepSeek Harness build's
cache-preparation route. This command never changes DeepSeek Harness host state.
EOF
}

refuse_apply() {
    printf '%s\n' \
        "ERROR: --apply is unsupported: the observed DeepSeek Harness build's installed_plugins.json uses a private, unverified schema; no host state was changed." >&2
    exit 2
}

for argument in "$@"; do
    if [ "$argument" = '--apply' ]; then
        refuse_apply
    fi
done

PROJECT_DIR=
while [ "$#" -gt 0 ]; do
    case "$1" in
        --project-dir)
            if [ "$#" -lt 2 ] || [ -z "$2" ]; then
                printf 'ERROR: --project-dir requires an absolute project root\n' >&2
                exit 2
            fi
            PROJECT_DIR="$2"
            shift 2
            ;;
        --apply)
            refuse_apply
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'ERROR: unknown argument; run with --help for supported options\n' >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [ -z "$PROJECT_DIR" ]; then
    printf 'ERROR: --project-dir is required\n' >&2
    usage >&2
    exit 2
fi
case "$PROJECT_DIR" in
    /*) ;;
    *)
        printf 'ERROR: project root must be an absolute path\n' >&2
        exit 2
        ;;
esac
if [ ! -d "$PROJECT_DIR" ]; then
    printf 'ERROR: project root directory is missing\n' >&2
    exit 1
fi
if ! PROJECT_ROOT="$(CDPATH= cd -- "$PROJECT_DIR" 2>/dev/null && pwd -P)"; then
    printf 'ERROR: project root directory is inaccessible\n' >&2
    exit 1
fi

if ! SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)" \
    || ! PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." 2>/dev/null && pwd -P)" \
    || ! RELEASE_ROOT="$(CDPATH= cd -- "$PLUGIN_ROOT/.." 2>/dev/null && pwd -P)"; then
    printf 'ERROR: LazyDeepSeek package location is inaccessible\n' >&2
    exit 1
fi

PACKAGE_ROOT="$(CDPATH= cd -- "$RELEASE_ROOT/.." 2>/dev/null && pwd -P)"
if [ ! -f "$PACKAGE_ROOT/package.json" ] \
    || [ ! -f "$PACKAGE_ROOT/cordis.patch.yml" ] \
    || [ ! -f "$PACKAGE_ROOT/lib/index.mjs" ] \
    || [ ! -f "$PLUGIN_ROOT/.mcp.json" ]; then
    printf '%s\n' \
        'ERROR: LazyDeepSeek plugin root is unavailable; keep this script under the v1.3.3 plugins/lazydeepseek/scripts directory.' >&2
    exit 1
fi

if [ -z "${HOME:-}" ]; then
    printf 'ERROR: HOME must identify the DeepSeek Harness user profile for this read-only plan\n' >&2
    exit 2
fi
case "$HOME" in
    /*) ;;
    *)
        printf 'ERROR: HOME must be an absolute path\n' >&2
        exit 2
        ;;
esac

python3 -B - "$PLUGIN_ROOT" "$RELEASE_ROOT" "$PROJECT_ROOT" "$HOME" "$PACKAGE_ROOT" <<'PY'
import json
import os
from pathlib import Path
import stat
import sys

plugin_root = Path(sys.argv[1]).resolve()
release_root = Path(sys.argv[2]).resolve()
project_root = Path(sys.argv[3]).resolve()
home_root = Path(os.path.abspath(sys.argv[4]))
package_root = Path(sys.argv[5]).resolve()
version = "1.3.3"
server_names = (
    "run-ledger",
    "verification",
    "status-dashboard",
    "context-graph",
    "code-intel",
    "docs",
)


def load_object(path: Path, label: str):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        raise ValueError(f"{label} is unavailable") from None
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{label} is invalid JSON at line {exc.lineno}, column {exc.colno}"
        ) from None
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


try:
    work_manifest = load_object(
        package_root / "package.json",
        "dsh package manifest",
    )
    if work_manifest.get("name") != "lazydeepseek" or work_manifest.get("version") != version:
        raise ValueError("dsh package manifest must identify lazydeepseek version 1.3.3")
    if work_manifest.get("dsh", {}).get("bundle", {}).get("patch") != "./cordis.patch.yml":
        raise ValueError("package dsh.bundle.patch must be ./cordis.patch.yml")
    if work_manifest.get("peerDependencies", {}).get("@deepseek-ai/dsh") != "0.2.0-rc.2":
        raise ValueError("package must pin @deepseek-ai/dsh exactly at 0.2.0-rc.2")

    route_contract = load_object(
        plugin_root / "contracts" / "dsh-route-contract.v1.json",
        "dsh route contract",
    )
    if route_contract.get("version") != version:
        raise ValueError("route contract must carry version 1.3.3")
    if route_contract.get("identity", {}).get("package") != "lazydeepseek":
        raise ValueError("route contract must identify the lazydeepseek package")

    source_mcp = load_object(plugin_root / ".mcp.json", "MCP configuration")
    if set(source_mcp) != {"mcpServers"}:
        raise ValueError("MCP configuration must contain only the mcpServers object")
    servers = source_mcp.get("mcpServers")
    if not isinstance(servers, dict) or tuple(servers) != server_names:
        raise ValueError("MCP configuration must declare the six LazyDeepSeek servers in canonical order")

    rendered = {}
    for name in server_names:
        source = servers[name]
        if not isinstance(source, dict):
            raise ValueError(f"MCP server {name} must be a JSON object")
        if set(source) != {"type", "command", "args", "env"}:
            raise ValueError(
                f"MCP server {name} fields are unsupported; "
                "expected exactly type, command, args, and env"
            )
        expected_arg = f"${{LAZYDEEPSEEK_PLUGIN_ROOT}}/mcp/{name}/server.sh"
        if source.get("type") != "stdio" or source.get("command") != "bash" or source.get("args") != [expected_arg]:
            raise ValueError(f"MCP server {name} must use its package launcher")
        source_env = source.get("env")
        expected_env = {
            "CWD": "${LAZYDEEPSEEK_PROJECT_DIR}",
            "LAZYDEEPSEEK_PROJECT_DIR": "${LAZYDEEPSEEK_PROJECT_DIR}",
            "LAZYDEEPSEEK_MCP_MODE": "${LAZYDEEPSEEK_MCP_MODE}",
            "LAZYDEEPSEEK_DEPENDENCY_ROOT": "${LAZYDEEPSEEK_DATA_ROOT}/dependencies",
            "LAZYDEEPSEEK_CACHE_ROOT": "${LAZYDEEPSEEK_DATA_ROOT}/cache",
        }
        if source_env != expected_env:
            raise ValueError(f"MCP server {name} has invalid env process context")
        launcher = plugin_root / "mcp" / name / "server.sh"
        try:
            launcher_mode = launcher.lstat().st_mode
        except OSError:
            raise ValueError(
                f"MCP server {name} launcher must be a regular, non-symlink executable"
            ) from None
        if (
            stat.S_ISLNK(launcher_mode)
            or not stat.S_ISREG(launcher_mode)
            or not os.access(launcher, os.X_OK)
        ):
            raise ValueError(
                f"MCP server {name} launcher must be a regular, non-symlink executable"
            )
        try:
            resolved_launcher = launcher.resolve(strict=True)
        except OSError:
            raise ValueError(
                f"MCP server {name} launcher must be a regular, non-symlink executable"
            ) from None
        if resolved_launcher != launcher:
            raise ValueError(
                f"MCP server {name} launcher path must not contain symlinks"
            )
        rendered[name] = {
            "command": "bash",
            "args": [str(launcher)],
            "cwd": str(project_root),
            "env": {
                "CWD": str(project_root),
                "LAZYDEEPSEEK_PROJECT_DIR": str(project_root),
            },
        }

    print(
        "MCP_RENDER_JSON="
        + json.dumps({"mcpServers": rendered}, ensure_ascii=False, separators=(",", ":"))
    )
    print(
        "PATHS_JSON="
        + json.dumps(
            {
                "pluginRoot": str(plugin_root),
                "releaseRoot": str(release_root),
                "projectRoot": str(project_root),
                "cacheTarget": str(
                    home_root / ".dsh" / "plugins" / "cache" / "lazydeepseek" / "lazydeepseek" / version
                ),
                "registryTarget": str(
                    home_root / ".dsh" / "plugins" / "installed_plugins.json"
                ),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
except ValueError as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    raise SystemExit(1)
PY

printf 'OBSERVED_WORKBUDDY_BUILD=5.2.6\n'
printf 'MCP_RENDER=ready (6 absolute launchers; cwd, CWD, and LAZYDEEPSEEK_PROJECT_DIR set)\n'
printf 'PACKAGE_PREPARATION=ready\n'
printf 'HOST_PREPARATION=not-applied\n'
printf 'HOST_MUTATION=none\n'
printf 'HOST_READINESS=pending\n'
