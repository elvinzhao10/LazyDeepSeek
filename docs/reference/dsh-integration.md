# DeepSeek Harness integration reference

This page is the concise map of how `plugins/lazydeepseek/` integrates with the
DeepSeek Harness host. It records what the plugin declares and what DeepSeek Harness does natively;
it does not claim that any host has loaded the package. See
[host routes](host-routes.md) for install/removal protocols and the
**HOST READINESS: PENDING** discipline.

## Install route

DeepSeek Harness installs plugins from a marketplace through
**Settings → Plugins**:

1. **Create → Add marketplace** → enter
   `https://github.com/elvinzhao10/LazyDeepSeek`, whose root contains
   the git spec). For an offline checkout, install the local package root.
2. **Personal** tab → `lazydeepseek` plugin card → **Install** (enabled by
   default).
3. Updates: bump the root `package.json` version and regenerate
   `contracts/dsh-route-contract.v1.json`, then remove and re-add the plugin →
   plugin details → **Update**.
   A previously installed same-version candidate will not show an Update;
   uninstall it through **Manage installed**, refresh the marketplace, and
   install again after the fixed commit reaches `main`.
4. Removal: **Manage installed** → `lazydeepseek` → **Uninstall** (or the disable
   toggle).
5. Development-only validation: `dsh plugins validate plugins/lazydeepseek`.

Prerequisites for local launchers: **Node.js LTS 20+** and **Git**.

## Native onboarding and update experience

`bash scripts/install.sh` (repository root) is the guided first step: it
verifies prerequisites, validates the marketplace layout, runs the package
load-check and doctor, and prints the install steps above with the GitHub URL
and local market root (URL clipboard-copied on macOS); `--project <absolute-project-root>`
adds the durable lifecycle onboard. Inside a session, `/lazy-onboard` walks
install plus fresh-session verification, `/lazy-update` compares the installed
version (`$DSH_HOME/profiles/<name>/node_modules/lazydeepseek/package.json`,
best-effort) with the repo manifest, points at `CHANGELOG.md`, and walks the
gear → Refresh → Update flow, and `/lazy-offboard` walks the four
independently-approved removal scopes. All three end with the readiness
discipline: **HOST READINESS: PENDING** until a fresh session observes one
real skill/command and all six MCP connections.

## Component wiring

| Plugin asset | Count | DeepSeek Harness native surface |
| --- | --- | --- |
| `skills/lazy-*/SKILL.md` | 19 | Skill tool, auto-triggered from frontmatter; listed under **Settings → Skills** (Plugin Skills group) |
| `commands/lazy-*.md` | 20 | Slash menu entries named `lazy-ulw-plan`, `lazy-start-work`, ... (no plugin namespacing). Lifecycle entry points: `lazy-onboard` (guided install), `lazy-update` (guided update), `lazy-offboard` (receipt-safe removal) |
| `agents/lazydeepseek-*.md` | 13 | Agent dispatcher (subagents) |
| `hooks/hooks.json` | 7 events | Auto-run when the plugin is enabled: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop` |
| `.mcp.json` | 6 servers | Auto-connected at session start, namespaced `plugin:lazydeepseek:<server>` |

DeepSeek Harness discovers the standard `hooks/hooks.json` automatically. The plugin
manifest leaves `hooks` unset so each event is registered once; declaring that
same file in the manifest causes a duplicate-hook diagnostic.

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
- **Model routing** → per-agent `model` / `thoughtLevel` frontmatter instead
  of a host model selector.
- **Planning / execution / review** → `lazy-ulw-plan` (plan),
  `lazy-start-work` (Agent-tool subagents), `lazy-review-work` (five review
  lanes via parallel Agent dispatch).

## Harness-primitive mapping

| Harness primitive | LazyDeepSeek asset | DeepSeek Harness native surface |
| --- | --- | --- |
| Project memory | `lazy-init-deep` + managed block | `AGENTS.md` |
| Planning | `lazy-ulw-plan` skill + command | Slash menu / Skill-tool invocation |
| Execution | `lazy-start-work` + subagents | Agent dispatcher |
| Review | `lazy-review-work` (5 lanes) | Parallel Agent dispatch |
| Model routing | Agent frontmatter | `model` / `thoughtLevel` |
| Automation | hooks (7 events) | Hook runner, auto-enabled |
| Local services | 6 MCP servers | Plugin MCP, auto-connect |
