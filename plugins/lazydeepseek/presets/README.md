# LazyDeepSeek presets catalog (phase A)

13 agent presets derived from `agents/lazydeepseek-*.md`. Phase A ships this
catalog (documentation + generation source); the native-ize phase mounts the
rows (one `dsh-tool-subagent` instance per preset: persona + toolFilter).
The live capability proof for the mechanism (persona prefix + restricted
child tool roster) is recorded in `.study/acceptance/GATE-M5-commands-agents-loop.md`.

| preset | phase | artifact |
|---|---|---|
| `lazydeepseek-context-indexer` | catalog entry | see `presets/lazydeepseek-context-indexer.md` |
| `lazydeepseek-context-miner` | catalog entry | see `presets/lazydeepseek-context-miner.md` |
| `lazydeepseek-explorer` | catalog entry | see `presets/lazydeepseek-explorer.md` |
| `lazydeepseek-gate-reviewer` | catalog entry | see `presets/lazydeepseek-gate-reviewer.md` |
| `lazydeepseek-implementer` | catalog entry | see `presets/lazydeepseek-implementer.md` |
| `lazydeepseek-librarian` | catalog entry | see `presets/lazydeepseek-librarian.md` |
| `lazydeepseek-migration-planner` | catalog entry | see `presets/lazydeepseek-migration-planner.md` |
| `lazydeepseek-orchestrator` | catalog entry | see `presets/lazydeepseek-orchestrator.md` |
| `lazydeepseek-planner` | catalog entry | see `presets/lazydeepseek-planner.md` |
| `lazydeepseek-qa-executor` | catalog entry | see `presets/lazydeepseek-qa-executor.md` |
| `lazydeepseek-reviewer` | catalog entry | see `presets/lazydeepseek-reviewer.md` |
| `lazydeepseek-security-auditor` | catalog entry | see `presets/lazydeepseek-security-auditor.md` |
| `lazydeepseek-verifier` | catalog entry | see `presets/lazydeepseek-verifier.md` |

Regenerate: `python3 .study/acceptance/generate-presets.py` (deterministic;
sources are the canonical agent bodies).
