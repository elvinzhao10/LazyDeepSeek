# Host routes

## v1.3.3 candidate route and host readiness

This guide describes the v1.3.3 release candidate for the DeepSeek Harness
(dsh) host. Native-host readiness remains pending per component until
observed live. The git-spec install route (`dsh-plugin-git-sha`) is the
default full-plugin route (GitHub-only distribution: the npm registry is not
used for this package). The `manual-skills-mcp-fallback` route is
recovery-only and mutually exclusive with a full-plugin route for one project.

v2 reports native mode as `invoke-documented`, `observe-only`,
`descriptor-only`, or `unavailable`; public label as `documented-tested`,
`documented-untested`, `observed-build-specific`, or `unavailable`; and
evidence scope as `package`, `probe`, or `current-session`. A `package` result
does not prove a live host, and a `probe` never substitutes for a
current-session receipt.

Automatic workflow selection chooses the smallest sufficient existing workflow
from task risk and complexity. Before a current host observation it is
selection-only, not evidence that a host loaded or dispatched that workflow.

Use **Node.js LTS 24 (recommended) or 22 (supported alternative)** and
**Git**; the lifecycle also accepts Node.js LTS 20 for compatibility, and
Python 3.10+ is required by the hook and MCP scripts. Bootstrap `onboard`
only from `https://github.com/elvinzhao10/LazyDeepSeek.git`; then run
`update`, `status`, and plan-first `offboard` through
`node "<install-root>/LazyDeepSeek/launcher.js"`. The exact durable tree is
`LazyDeepSeek/{active.json,launcher.js,releases/,receipts/,rollback/,staging/,locks/}`.
The source checkout may be deleted. A moved same-version ref needs
`--confirm-revision <full-sha>`; stale runtime recovery is scoped
offboard/re-onboard, never a receipt edit. None of these package facts changes
**HOST READINESS: PENDING** without observation.

Open or link the durable release selected by `status` in DeepSeek Harness,
give the agent `https://github.com/elvinzhao10/LazyDeepSeek`, and type
`onboard`. The agent runs package checks and safe local setup, then reports
**package readiness** separately from **host readiness**.

Before a plugin, Skills, connector, account, or credential change, the agent
asks for explicit approval. It then gives exactly one host action and waits.
After the response it inspects the app. A reload or new session is a later
one-action handoff. Verify one real skill/command and every expected MCP
connection in a fresh session; without that observation, host readiness is
**pending**. If host inspection is unavailable, a user-pasted verbatim status
or screenshot is observed evidence; otherwise **HOST READINESS: PENDING**.

| Host route | Safe package artifact | Required host observation |
| --- | --- | --- |
| **dsh git-spec install route (`dsh-plugin-git-sha`)** | The repository IS the package: root `package.json` (`dsh` key + exact `0.2.0-rc.2` peer pin), `cordis.patch.yml` rows, committed prebuilt `lib/` (no build scripts, so the pnpm allowBuilds gate never applies); local package validation via the load-check and route-check scripts. | Run the pinned git-spec install below; after installation, observe one real skill (plus one user-invocable command entry on an interactive surface) and all six MCP connections in a fresh session. |
| **Manual fallback (`manual-skills-mcp-fallback`)** | Copy `plugins/lazydeepseek/skills/` into the project's `.agents/skills/` (rank 200), then configure six local MCP rows manually. | Use only after receipt-scoped removal of the full-plugin route. Observe one imported skill and each connector; commands, agent presets, and hooks remain excluded. |

## DeepSeek Harness git-spec install route (default)

DeepSeek Harness has no marketplace. Plugins are installed per profile with
the `dsh plugin` verb set from a git spec (repository URL pinned to a full
commit sha — the default route), a release tarball asset (the pinned
alternate), or a local directory (development). The npm registry is not used
for this package. One approved action at a time:

1. **Preflight (read-only):** confirm `dsh --version` reports the pinned
   `0.2.0-rc.2` and inspect the composed surface with
   `dsh --profile <name> --dump-config`; the LazyDeepSeek rows must appear.
2. **Install:** after a separate approval, run the profile install with the
   git spec `<repository URL>#<full-commit-sha>` (or the release tarball
   path, or `./lazydeepseek` for a local development checkout). The package
   ships prebuilt `lib/` and declares no build scripts, so no build approval
   is requested. Enabling a plugin grants code-execution trust.
3. **Observe:** as a later action, start a fresh session for the project and
   verify one real LazyDeepSeek skill plus all six MCP connections
   (`mcp__run-ledger__*`, `mcp__verification__*`,
   `mcp__status-dashboard__*`, `mcp__context-graph__*`,
   `mcp__code-intel__*`, `mcp__docs__*`).

**Updates:** bump `version` in the root `package.json`, regenerate the route
contract inventory, and reinstall the new pinned sha (or tarball) into the
same profile. The generated runtime artifacts (`hooks.dsh.json`, MCP
launchers, bundled skills under `$DSH_HOME/lazydeepseek/`) are rewritten on
version change at the next plugin start; the hooks bridge parses its config
once per session, so a hooks regeneration applies after a session restart.

**Validation (development only):** the local-dir form
(`dsh plugin --profile <name> add ./lazydeepseek`) plus
`lazydeepseek-load-check.sh` is a package check, not host proof.

### What the plugin declares on DeepSeek Harness

- 19 skills through the generated bundled skill dir (rank 600), plus 10
  generated user-invocable command entries (`lazy-status`, `lazy-onboard`,
  and so on) from the command sources. Slash-command registrations
  (20 `ctx.commands.register` rows in the shim) serve interactive adapters
  only; headless surfaces have no user command surface.
- 13 agent presets as a catalog (`plugins/lazydeepseek/presets/`); the
  persona/toolFilter row shape is proven but full row mounting is the
  native-ize phase.
- 7 hook events (5 bridged — `SessionStart`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `Stop` — plus 2 synthesized inside the
  PreToolUse/PostToolUse handlers: PermissionRequest audit and
  PostToolUseFailure; both marked degraded).
- 6 MCP stdio servers declared as `dsh-mcp-client` rows in
  `cordis.patch.yml`, surfaced as `mcp__<server>__<tool>`, gated by
  `LAZYDEEPSEEK_MCP_MODE` (unset defaults to `orchestrated` via the profile
  gate).
- The native `ralph` loop tool enabled through an overlay row
  (`disabled: false`, `maxRounds: 64`); `workflow` is registered by dsh-base.

Project memory is `AGENTS.md` (workspace scope); there is no
rules-injection mechanism, no daemon/serve/prewarm CLI, and no
`PLUGIN_ROOT` env (paths are generated absolute under `$DSH_HOME/lazydeepseek/`).

### Telemetry and privacy

DeepSeek Harness uploads session logs by default when the official API route
is used, and OpenTelemetry defaults to feedback-only. The documented
`lazydeepseek` profile ships both opt-outs applied: the session-log upload
setting is set to disabled in the profile patch, and
`DSH_TELEMETRY_MODE=DISABLED` is exported by the lifecycle and acceptance
tooling. The plugin doctor warns whenever session-log upload is detected as
enabled. LazyDeepSeek itself performs no network I/O: hooks, MCP servers,
and scripts do pure local file I/O under the workspace `.lazydeepseek/`
state directory and the `$DSH_HOME/lazydeepseek/` runtime dir.

## Read-only preflight

Never inspect or mutate private DeepSeek Harness configuration or
registries. This package preflight remains read-only:

```bash
bash plugins/lazydeepseek/scripts/lazydeepseek-dsh-preparation-check.sh \
  --project-dir "<absolute-project-root>"
```

It prints `HOST_PREPARATION=not-applied`, `HOST_MUTATION=none`, and
`HOST_READINESS=pending`; `--apply` refuses. It is not an installer or host
proof. Durable `status --route dsh-plugin-git-sha` emits observation,
removal, and recovery receipt templates. Package-only checks remain pending.
A receipt is ready only when its active source/version, current
build/session, loaded skill, hook, and all six MCP statuses validate
together.

## Manual connector specification

This is the non-mutating, paste-ready source for the
`manual-skills-mcp-fallback` route. Replace every placeholder with permanent
absolute paths before asking to change host settings. Do not edit the
shipped `cordis.patch.yml`. Copy the skills first:

```bash
mkdir -p <project-root>/.agents/skills
cp -R <release-root>/plugins/lazydeepseek/skills/. \
  <project-root>/.agents/skills/
```

Then add one profile patch row per server (six total; the shape below, one
per server, with `serverName` set accordingly):

```yaml
- insert:
    - id: manual-lazydeepseek-run-ledger
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: run-ledger
        transport: stdio
        command: bash
        args: ["<release-root>/plugins/lazydeepseek/mcp/run-ledger/server.sh"]
        env:
          CWD: "<project-root>"
          LAZYDEEPSEEK_PROJECT_DIR: "<project-root>"
          LAZYDEEPSEEK_MCP_MODE: "orchestrated"
        toolCallTimeoutMs: 120000
        failOnStartupError: false
```

Every row uses `bash`, its absolute release-local `server.sh`, and explicit
consumer-project context in `CWD`/`LAZYDEEPSEEK_PROJECT_DIR`. Never fall back
to the package directory or caller shell directory. After approval, add
exactly one row, restart the session, and inspect that connector before
proceeding to the next one.

## Skills/manual-MCP fallback boundary

The supported fallback route is a Skills copy into `.agents/skills/` (rank
200) plus six individual manual MCP rows. A package file or
`lazydeepseek-load-check.sh` result must never be described as loading
commands, agent presets, or hooks. The fallback explicitly excludes commands,
agent presets, and hooks. Use the full-plugin route when the current loaded
host proves it; otherwise retain **HOST READINESS: PENDING** for unsupported
capabilities.

### Route coexistence and migration

The full plugin route and the Skills/manual-MCP fallback are mutually
exclusive and unsupported together for a project. Do not copy the fallback
skills or add manual MCP rows while a full LazyDeepSeek plugin session is
active; the routes can double-load skills or MCP processes, and package
checks cannot declare that both routes are live.

To switch routes safely:

1. Stop the current host session.
2. Remove only LazyDeepSeek's plugin entry from its profile
   (`dsh plugin --profile <name> remove lazydeepseek`) and delete the
   manually copied `.agents/skills/lazy-*` entries and manual MCP rows if
   present. Do not scan or edit host-private files.
3. Choose exactly one route: git-spec/tarball/local-dir plugin install, or
   skills copy plus manual MCP rows.
4. Start a fresh session and verify the selected route's required skill and
   all six expected MCP connections.

The package result remains `readiness_scope=package-ready`; the fallback is
the `manual-skills-mcp-fallback` scope, while an observed build route or live
host proof must be recorded separately.

## Troubleshooting the handoff

- **Rows missing from `--dump-config`:** confirm the install used the
  repository root as the git spec (not the nested
  `plugins/lazydeepseek/` payload directory) and that the profile name in
  the command matches the installed profile.
- **Hooks not firing after a config edit:** the bridge parses its config file
  once per session and the generated artifacts rewrite on version change;
  restart the session after any hooks regeneration.
- **Update not offered:** the installed version is compared against the
  pinned spec; reinstall the new sha/tarball into the same profile rather
  than relying on a catalog refresh. Source edits are not hot reload.
- **Duplicate skills or MCP processes:** stop the session and follow the
  migration checklist above. Never keep plugin and manual routes active
  together.
- **MCP tool call errors:** tools must return MCP content blocks; a tool
  that reports `Request timed out` immediately indicates a nonconforming
  server build (fixed in this release) or an unreachable launcher path.
- **MCP starts in the wrong project:** each row must use the absolute
  release-owned launcher and explicit consumer project context. Stop rather
  than falling back to the package directory or caller shell directory.

## Minimal live-test prompt

After the approved setup and required fresh session, send:

> Use one loaded LazyDeepSeek skill appropriate to this route for a harmless
> read-only project check. Then test `run-ledger`, `verification`,
> `status-dashboard`, `context-graph`, `code-intel`, and `docs`. Report the
> host/build and each capability as observed or unavailable with the exact
> error; keep package readiness separate from host readiness. Do not infer
> from files or connector counts.

## Package boundary and removal

`lazydeepseek-load-check.sh`, `scripts/lazydeepseek-plugin-doctor.sh`, and
local metadata validation establish package readiness only. They do not prove
plugin discovery, session startup, hook execution, a running session, or MCP
connection. Removal is `dsh plugin --profile <name> remove lazydeepseek`,
then delete the project's `.lazydeepseek/` state directory (after archiving
any run evidence you need) and, if fully uninstalling, the durable lifecycle
tree under `LazySeries` in Application Support plus the generated
`$DSH_HOME/lazydeepseek/` runtime dir. Never scan or guess host paths; report
package removal separately from the user-observed host result.
