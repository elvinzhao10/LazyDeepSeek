#!/usr/bin/env bash
set -euo pipefail
PLUGIN_ROOT="${LAZYDEEPSEEK_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd -P)}"
exec python3 -B "$PLUGIN_ROOT/mcp/lsp/server.py"
