# Host capability matrix

LazyDeepSeek deliberately aligns policy and package safety across hosts while keeping host adapters distinct. The same package family may be present on two hosts without both exposing the same loading or registration behavior. This page describes the DeepSeek Harness host and where it diverges from sibling ports in the LazySeries family.

## Onboarding baseline

## Published v1.3.1 evidence boundary

The published v1.3.1 documentation targets the **DeepSeek Harness** host; no current
host activation is claimed. The DeepSeek Harness git-spec install
route (`dsh-plugin-git-sha`) is the default full-plugin route. The
`manual-skills-mcp-fallback` route is recovery-only and mutually exclusive
with a full-plugin route in the same project.

| v2 field | Allowed values and boundary |
| --- | --- |
| Native mode | `invoke-documented`, `observe-only`, `descriptor-only`, or `unavailable`. |
| Public label | `documented-tested`, `documented-untested`, `observed-build-specific`, or `unavailable`. |
| Evidence scope | `package`, `probe`, or `current-session`; `package` does not prove a live host. |

Use **Node.js LTS 24 (recommended) or 22 (supported alternative)** and
**Git**; the lifecycle also accepts Node.js LTS 20 for compatibility.
Bootstrap `onboard` only from
`https://github.com/elvinzhao10/LazyDeepSeek.git`; then run `update`, `status`,
and plan-first `offboard` with
`node "<install-root>/LazyDeepSeek/launcher.js"`. The durable tree is
`LazyDeepSeek/{active.json,launcher.js,releases/,receipts/,rollback/,staging/,locks/}`
and survives source deletion. Moving a same-version ref requires full-SHA
confirmation; stale runtime recovery is scoped offboard/re-onboard. None of
this proves a host: **HOST READINESS: PENDING** until observation.

Automatic selection chooses the smallest sufficient existing workflow from task
risk and complexity. It remains selection-only until host readiness is observed;
selection never proves native workflow loading or host dispatch.

Open or link the durable release selected by `status` in DeepSeek Harness, give the agent
`https://github.com/elvinzhao10/LazyDeepSeek`, and type `onboard`. The agent
runs safe package checks and reports package readiness separately from host
readiness. Before a host-managed change it asks for approval, gives one exact
action, and waits. It then inspects the host or uses a user-pasted
status/screenshot; reload or new session is a later action. Verify one real
skill/command and all six MCP connections in a fresh session. Without
observation, **HOST READINESS: PENDING**.

Route status is explicit: `dsh-plugin-git-sha` is the **default full-plugin
route** through the `dsh plugin` verb set. The
`manual-skills-mcp-fallback` is recovery only.

## What each route needs

| Route | Safe package artifact | Required host proof |
| --- | --- | --- |
| **dsh plugin route (`dsh-plugin-git-sha`)** | Root `package.json` (`dsh` key + exact peer pin), `cordis.patch.yml` rows, prebuilt `lib/`; payload declares 19 skills, 20 commands, 13 agents, 5 bridged hook events (+2 synthesized), and 6 MCP rows. Install via `dsh plugin --profile <name> add github:elvinzhao10/LazyDeepSeek#<sha>` (git-spec pinned; GitHub-only distribution, the npm registry is not used for this package); inspect with `dsh --profile <name> --dump-config`. | A fresh session showing one real skill/command and all six MCP connections. |
| **Manual fallback (`manual-skills-mcp-fallback`)** | Import/copy `plugins/lazydeepseek/skills/` only, then configure each of six local MCP connectors manually. | Use only after receipt-scoped removal of the full-plugin route. Observe one imported skill and each connector; commands, agents, and hooks remain excluded. |

Before requesting that host mutation, run this read-only preflight from the
release root:

```bash
bash plugins/lazydeepseek/scripts/lazydeepseek-dsh-preparation-check.sh \
  --project-dir "<absolute-project-root>"
```

It prints `HOST_PREPARATION=not-applied`, `HOST_MUTATION=none`, and
`HOST_READINESS=pending`; `--apply` refuses. It is not an installer and never
proves host readiness.

## Native-surface mapping on DeepSeek Harness

DeepSeek Harness has no rules-injection mechanism, no daemon/serve/prewarm CLI, and no
IDE plan directories. Project memory is `AGENTS.md` (workspace scope, plus
`~/.dsh/AGENTS.md` for user scope), and model routing is per-agent
`model`/`thoughtLevel` frontmatter. LazyDeepSeek maps its harness primitives onto
the native surfaces DeepSeek Harness actually provides:

| Harness primitive | LazyDeepSeek asset | DeepSeek Harness native surface |
| --- | --- | --- |
| Project memory | `lazy-init-deep` + managed AGENTS.md block | `AGENTS.md` (workspace and user scope) |
| Planning | `lazy-ulw-plan` skill + command | Slash menu entry / Skill-tool invocation |
| Execution | `lazy-start-work` with Agent-tool subagents | Agent dispatcher |
| Review | `lazy-review-work` five lanes | Parallel Agent dispatch (5 lanes) |
| Model routing | Agent frontmatter | `model` / `thoughtLevel` per agent |
| Automation | `hooks/hooks.json` | 7 hook events: 5 bridged (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`) + 2 synthesized inside the PreToolUse/PostToolUse handlers (PermissionRequest audit, PostToolUseFailure — both degraded); the bridge reads `additionalContext` only from `hookSpecificOutput`, and an advisory Stop reminder does not continue the turn (only exit-2 deny steers) |
| Local services | `cordis.patch.yml` MCP rows | 6 MCP servers as `dsh-mcp-client` stdio rows, surfaced as `mcp__<server>__<tool>`, gated by `LAZYDEEPSEEK_MCP_MODE` (unset = `orchestrated`); tools must return MCP content blocks |

Commands run inside a DeepSeek Harness session as natural language or through the slash
menu; LazyDeepSeek mounts skills, and command files surface as slash menu entries
named `lazy-ulw-plan` and so on. Skill auto-triggering is decided by the model
from each skill's `name`/`description` frontmatter via the Skill tool.

## Structural differences

The host adapter differs, but the safety model does not:

- **Host integration:** DeepSeek Harness decides plugin discovery, connector registration, session lifetime, and event delivery.
- **State/path:** package run state and receipt-owned tooling roots are local; marketplace directories, plugin data, credentials, and connector state remain host/user-owned.
- **Inventory:** six local MCP servers are packaged, gated by the `LAZYDEEPSEEK_MCP_MODE` profile (`direct`, `assisted`, `planned`, `orchestrated`, `long-horizon`; empty defers the gate). Optional remote exports and browser work remain separate explicit decisions.

## Package-built versus host-native behavior

| Behavior | LazyDeepSeek contribution | Raw host contribution | Learner takeaway |
| --- | --- | --- | --- |
| Workflow guidance | Ships skills, commands, and agent role text. | Decides whether/how those assets are discovered and exposed. | A Markdown command definition is not a running command. |
| Hook policy | Ships event mapping and scripts that validate supported input. | Delivers an event and decides the host lifecycle semantics. | A passing hook test does not prove a host delivered the event. |
| Local MCP | Ships six launchers and server programs. | Starts the process, negotiates connection, and shows tool availability. | A declaration is not a connection. |
| Run/evidence state | Implements package-local scripts and boundaries. | Supplies session context and user-visible integration. | Local records describe package work, not host state. |
| Optional providers | Implements policy, receipts, and export fragments. | Stores credentials and applies connector/network policy. | Selection/receipt status is not provider authorization or connection. |

The complete dependency classification is in [Dependency and host boundary reference](reference/dependency-and-host-boundaries.md).

## Readiness and fallback claims

The package contract uses four explicit evidence scopes: `package-ready`,
`observed-build-route`, `manual-skills-mcp-fallback`, and `live-host-proof`.
Load-check, doctor, and capability reports emit only `package-ready`; they do
not claim that a host loaded a plugin or connected an MCP process. A route seen
in one build is an `observed-build-route`, not universal host support.

The manual fallback is Skills plus six manually configured local MCP
connectors. It explicitly excludes agents, commands, and hooks. It must not be
run alongside a full plugin route for the same project: coexistence is
unsupported and may duplicate Skills or MCP processes. Stop the session,
remove only the old LazyDeepSeek entries in the host UI, choose one route, restart,
and verify that route before making a live-host-proof claim.

## Host evidence scope

Automated package CI runs on Ubuntu and macOS as defined in the workflows.
Manual host loading, route discovery, hooks, and MCP connection remain
per-session observations; the supplied host reports are historical macOS
evidence only.

## Migration and removal

To change routes, stop the active session, remove only LazyDeepSeek's
receipt-scoped plugin/Skills entry and connectors that the user added through
`dsh plugin --profile <name> remove lazydeepseek`, choose one route, and verify it in a fresh session. Preserve
other plugins, connectors, credentials, project settings, and host-managed
paths. Package removal remains separate from observed host removal. Sibling
ports (LazyBuddy, LazyTrae, LazyQoder) manage their own hosts with their own
routes; shared semantics are byte-identical where contracts say so, but routes
and host proof are per host.
