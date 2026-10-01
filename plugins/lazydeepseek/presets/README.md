# LazyDeepSeek native role projections

Thirteen `dsh-tool-subagent` rows are mounted by `cordis.patch.yml` with full
canonical personas and native filters. Installed 0.2.0-rc.2 schema validation
passes; fresh-session dispatch and effective model settings remain pending.
The role body authority is `agents/lazydeepseek-*.md`. Catalog examples are
documentation; the bundle patch is the actual mount surface.

| preset | phase | artifact |
|---|---|---|
| `lazydeepseek-context-indexer` | native row (package) | see `presets/lazydeepseek-context-indexer.md` |
| `lazydeepseek-context-miner` | native row (package) | see `presets/lazydeepseek-context-miner.md` |
| `lazydeepseek-explorer` | native row (package) | see `presets/lazydeepseek-explorer.md` |
| `lazydeepseek-gate-reviewer` | native row (package) | see `presets/lazydeepseek-gate-reviewer.md` |
| `lazydeepseek-implementer` | native row (package) | see `presets/lazydeepseek-implementer.md` |
| `lazydeepseek-librarian` | native row (package) | see `presets/lazydeepseek-librarian.md` |
| `lazydeepseek-migration-planner` | native row (package) | see `presets/lazydeepseek-migration-planner.md` |
| `lazydeepseek-orchestrator` | native row (package) | see `presets/lazydeepseek-orchestrator.md` |
| `lazydeepseek-planner` | native row (package) | see `presets/lazydeepseek-planner.md` |
| `lazydeepseek-qa-executor` | native row (package) | see `presets/lazydeepseek-qa-executor.md` |
| `lazydeepseek-reviewer` | native row (package) | see `presets/lazydeepseek-reviewer.md` |
| `lazydeepseek-security-auditor` | native row (package) | see `presets/lazydeepseek-security-auditor.md` |
| `lazydeepseek-verifier` | native row (package) | see `presets/lazydeepseek-verifier.md` |

Regenerate: `python3 .study/acceptance/generate-presets.py` (deterministic;
sources are the canonical agent bodies).
