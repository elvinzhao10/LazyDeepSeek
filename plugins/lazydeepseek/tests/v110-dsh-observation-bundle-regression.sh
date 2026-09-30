#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node --check "$PLUGIN_ROOT/scripts/lazydeepseek-dsh-observation.js"
node --check "$PLUGIN_ROOT/scripts/lifecycle/dsh-observation.js"
node --check "$PLUGIN_ROOT/scripts/lifecycle/dsh-observation-contract.js"
node --test \
  "$PLUGIN_ROOT/tests/dsh-observation-bundle.test.js" \
  "$PLUGIN_ROOT/tests/dsh-connector-reference.test.js"
