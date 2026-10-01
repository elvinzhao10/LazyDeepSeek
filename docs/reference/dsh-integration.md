# DeepSeek Harness integration reference

This page is the concise map of how `plugins/lazydeepseek/` integrates with the
DeepSeek Harness host. It records what the plugin declares and what DeepSeek Harness does natively;
it does not claim that any host has loaded the package. See
[host routes](host-routes.md) for install/removal protocols and the
**HOST READINESS: PENDING** discipline.

## Install route

DeepSeek Harness installs plugins into profiles through the `dsh plugin`
verb set (there is no marketplace):

1. Git-spec install (default): `dsh plugin --profile <name> add
   <repository-url>#<full-commit-sha>`. The GitHub release tarball is the
   pinned alternate; a local checkout installs with `./lazydeepseek` as the
   spec. The npm registry is not used for this package. Installed plugins
   are enabled by default, and no build scripts run (prebuilt `lib/` is
   committed).
2. Updates: reinstall the verified release SHA/archive into the same profile.
   Maintainers update versions and regenerate the route contract before publication.
   A same-version candidate needs an explicit reinstall of the selected SHA.
3. Removal: `dsh plugin --profile <name> remove lazydeepseek`, then observe
   rows/processes absent. Generated runtime removal is separately receipt-scoped.
4. Development-only validation: run the package load-check and installed SDK
   config checker; neither installs the plugin.

Prerequisites: **Node.js LTS 24 or 22** (20 accepted for compatibility),
**Git**, and **Python 3.10+** for hooks/MCP scripts.

## Native onboarding and update experience

`bash scripts/install.sh` (repository root) is the guided first step: it
verifies prerequisites, validates the root package and bundle layout, runs the package
load-check and doctor, and prints the install steps above with the GitHub URL
and profile install command (URL clipboard-copied on macOS); `--project <absolute-project-root>`
adds the durable lifecycle onboard. Inside an observed interactive session, lifecycle command guidance covers
install and fresh-session verification, pinned-SHA updates, and separately
selected removal scopes. Use durable status/receipts or a user-supplied selected
manifest for version evidence; never scan private profiles. All three end with the readiness
discipline: **HOST READINESS: PENDING** until a fresh session observes one
real skill/command and all six MCP connections.

## Component wiring

| Plugin asset | Count | DeepSeek Harness native surface |
| --- | --- | --- |
| `skills/lazy-*/SKILL.md` | 19 + 10 command-only projections | Generated bundle mounted through the native skill provider; current model invocation and interactive visibility require observation |
| `commands/lazy-*.md` | 20 | Registered service commands forward exact arguments and unregister on unload; interactive slash acceptance remains pending. Lifecycle guidance: `lazy-onboard`, `lazy-update`, `lazy-offboard`. |
| `agents/lazydeepseek-*.md` | 13 | Full canonical personas in native `dsh-tool-subagent` rows with tool allowlists |
| Generated `hooks.dsh.json` | 7 bridged / 9 declared | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop bridge natively. PermissionRequest and PostToolUseFailure are degraded synthesis. |
| `cordis.patch.yml` MCP rows | 6 servers | `dsh-mcp-client` stdio rows; tools appear as `mcp__<server>__<tool>` when connected |

The root bundle mounts `dsh-hooks-claude-code` with its generated hook config.
`hooks/hooks.json` is canonical package policy, not an independently discovered
native host registration. PreCompact, TaskCreated, TaskCompleted, and Notification
are unsupported. Child start/stop events are advisory and cannot complete work.

## Variables and configuration

- `${CLAUDE_PLUGIN_ROOT}` — plugin install root; usable in plugin hook
  commands and plugin MCP declarations (`.mcp.json`).
- `${LAZYDEEPSEEK_DATA_ROOT}` — plugin-owned data root (`$DSH_HOME/lazydeepseek/`).
- `${CLAUDE_PROJECT_DIR}` — the consumer project directory (used as `cwd` and
  `CWD`/`CLAUDE_PROJECT_DIR` env by every MCP launcher).
- `${LAZYDEEPSEEK_MCP_MODE}` — mode env variable surfaced as
  `LAZYDEEPSEEK_MCP_MODE`; the MCP profile gate (`direct`, `assisted`, `planned`,
  `orchestrated`, `long-horizon`; empty defers the gate).
- Configuration-file MCP servers do not expand template variables; plugin
  declarations do.

## Project memory and routing

DeepSeek Harness has no rules-injection mechanism, no daemon/serve/prewarm CLI, and no
IDE plan directories. LazyDeepSeek therefore maps:

- **Project memory** → `AGENTS.md` (workspace scope; `~/.dsh/AGENTS.md` for
  user scope). `lazy-init-deep` maintains a managed block.
- **Model routing** → policy metadata and read-only recommendations. Native
  role rows inherit host defaults; frontmatter is not an effective override.
- **Planning / execution / review** → `lazy-ulw-plan` (plan),
  `lazy-start-work` (Agent-tool subagents), `lazy-review-work` (five review
  lanes via native role-tool dispatch).

## Harness-primitive mapping

| Harness primitive | LazyDeepSeek asset | DeepSeek Harness native surface |
| --- | --- | --- |
| Project memory | `lazy-init-deep` + managed block | `AGENTS.md` |
| Planning | `lazy-ulw-plan` skill + command | Slash menu / Skill-tool invocation |
| Execution | `lazy-start-work` + subagents | Native `dsh-tool-subagent` role tools |
| Review | `lazy-review-work` (5 policy lanes) | Native role-tool dispatch where observed in the selected host |
| Model routing | Agent frontmatter recommendations | Host defaults inherited; effective child overrides unverified |
| Automation | hooks (7 events) | Hook runner, auto-enabled |
| Local services | 6 MCP servers | Plugin MCP, auto-connect |
