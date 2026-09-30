#!/usr/bin/env bash

lazydeepseek_require_mcp_profile() {
    local server="$1"
    # Unset/empty LAZYDEEPSEEK_MCP_MODE defaults to the orchestrated profile so the
    # six declared servers stay active out of the box (matching upstream).
    local mode="${LAZYDEEPSEEK_MCP_MODE:-orchestrated}"
    case "$mode" in
        direct) selected='run-ledger verification status-dashboard' ;;
        assisted) selected='run-ledger verification status-dashboard context-graph code-intel' ;;
        planned) selected='run-ledger verification status-dashboard context-graph docs' ;;
        orchestrated|long-horizon) selected='run-ledger verification status-dashboard context-graph code-intel docs' ;;
        *) printf 'MCP_PROFILE_INVALID mode=%s\n' "$mode" >&2; return 2 ;;
    esac
    case " $selected " in
        *" $server "*) return 0 ;;
        *) printf 'MCP_PROFILE_DEFERRED server=%s mode=%s\n' "$server" "$mode" >&2; return 3 ;;
    esac
}

# Validate stdio executable/argv declarations and bundled launcher paths.
# Executable paths may contain spaces. HTTP transports require a URL.
# Validation is local and never launches a server or changes host settings.
# mcp-profile.py needs Python 3.10+; resolve the interpreter through the
# canonical resolver so a 3.9 system python3 never breaks MCP startup.
if [ -z "${LAZYDEEPSEEK_PYTHON_RESOLVED:-}" ]; then
    _lz_resolver="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/lazydeepseek-python-resolver.sh"
    [ -f "$_lz_resolver" ] && . "$_lz_resolver"
fi
lazydeepseek_validate_mcp_commands() {
    local plugin_root="${LAZYDEEPSEEK_PLUGIN_ROOT:-}"
    if [ -z "$plugin_root" ]; then
        plugin_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    fi
    local validate_python="${LAZYDEEPSEEK_PYTHON_RESOLVED:-${LAZYDEEPSEEK_PYTHON:-}}"
    if [ -z "$validate_python" ]; then
        printf 'LAZYDEEPSEEK_MCP_PROFILE_INVALID reason=python_3_10_required\n' >&2
        return 0
    fi
    "$validate_python" "${plugin_root}/scripts/lazydeepseek-mcp-profile.py" --validate-commands
}
