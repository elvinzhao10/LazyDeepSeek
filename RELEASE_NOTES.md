# LazyDeepSeek v1.3.4 — safer runs, clearer host boundaries

A small maintenance release for the LazySeries family. It repairs runtime and
host-adapter boundaries while retaining the workflow foundation inherited from
family versions v1.3.0–v1.3.3. Those inherited features are not new in this patch
and do not imply prior public releases of the Kimi or DeepSeek ports.

## Eval-driven fixes

- Thirteen native role presets carry full personas; twenty commands forward arguments and unregister on unload.
- Seven events bridge natively. Two synthesized observations remain explicitly degraded capabilities.
- Profile and package-content identities bind runtime receipts, preserving foreign or shared files during generation and removal.
- Finalization requires all intended tasks done; persisted status is assessed
  separately from completion evidence.

## Cumulative workflow experience

Describe work in natural language or use explicit workflow entry points.
Keep editable Markdown plans, durable decisions, evidence-bound completion
and verification sized to the change. Planning-only requests remain separate
from execution authority. The README presents these inherited features together
with the 1.3.4 fixes; historical notes below retain the version-by-version record.

## Measured efficiency

No new latency, token-saving, cost or recall improvement is measured for this
patch. Ledger append/compaction, learned routing and shared-core migration are deferred.

## Host capability matrix

Native configuration is checked against installed DSH 0.2.0-rc.2. Fresh-session acceptance, effective child settings and complete host removal remain pending. Only seven events bridge natively; additional synthesized observations do not create native host capabilities.

Package and distribution checks do not prove a current native host session.
**HOST READINESS: PENDING** until loading, command/skill behavior and the expected
MCP connections are observed. The README links the selected host's setup guide.

## Migration and upgrade

Use the receipt-aware upgrade route with an explicit project binding. Preserve project evidence and unknown host configuration. No credentials or production host settings are changed by package verification.

Read [AGENTS.md](AGENTS.md) and [the install guide](docs/03-install-and-host-verification.md).
Choose one route, check the installed package version, and restart the host.
Source checkouts and release archives have different build requirements; follow
the documented route. Do not reset populated runs merely to upgrade.

## Known risks

Native acceptance is separate from package readiness. Token/cost budgets are
metadata; pending approvals are persisted observations without a live approval
queue. Shell loop policy beyond the configured global cap needs orchestrator enforcement.

## Rollback

Keep the prior local 1.3.3 checkout and ownership receipts; a prior public release is not established. Remove only receipt-owned, unmodified assets and use a fresh host session to verify removal.

## Documentation and family presentation

Aligned sibling README structure, current setup navigation and a shared six-repo
family table. Personal environment files and caches are ignored while example
configuration and pinned fixture logs remain publishable. Earlier release notes
remain below as historical evidence.

## Post-publication repository maintenance

The current main-branch dependency lock uses patched `fast-uri` 3.1.8.
This addresses [host canonicalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).
Existing published v1.3.4 archives retain their original tagged dependency
contents. Use the current source lock for this fix; a refreshed archive needs
a subsequent versioned release.

## Prior local-port notes (historical)

The notes below preserve earlier local candidates and build-specific observations.
They are not public release or current v1.3.4 host evidence; native counts,
runtime ownership, and install/removal guidance above supersede them.

# LazyDeepSeek v1.3.3 — the DeepSeek Harness port release

**Status:** v1.3.3 release candidate. Package, lifecycle, language, and
publication checks passed locally (full verify suite `all_pass=true`).
Distribution is GitHub-only: the git-spec install pinned to a commit sha is
the default route and the release tarball the alternate; the npm registry is
not used for this package. Fresh DeepSeek Harness activation was observed
live on the pinned `0.2.0-rc.2` during acceptance (skills, hooks, all six MCP
servers, native ralph); per-component readiness is recorded in the docs.

## Eval-driven fixes

- Hook stdout now uses the bridge shape observed live on dsh 0.2.0-rc.2:
  `additionalContext` is read only from `hookSpecificOutput`, so every
  injecting hook (SessionStart, UserPromptSubmit, Stop) emits that envelope.
- The PostToolUse failure discriminator matches the host's actual failure
  text shapes (`[exit code: N]` markers anywhere in the result; `Error:`
  prefixes), keeping the synthesized PostToolUseFailure records accurate.
- MCP `tools/call` results now carry MCP content blocks. Raw top-level arrays
  broke the dsh client with an immediate `Request timed out` (found live on
  the verification server) and raw objects rendered no model-visible content;
  run-ledger, status-dashboard, and verification were fixed and the MCP gate
  now exercises `discover_checks` so this class cannot ship silently again.
- Versioned plugin cache roots use native DeepSeek Harness variables, with
  bounded path and manifest checks. Restricted-role hooks reject conflicting
  identities, malformed or oversized mutating input, and unrestricted shell
  dispatch. Execution context rejects unsupported shell wrappers before
  dispatch. Deferred optional MCP servers retain a protocol endpoint and
  invalid profile values fail explicitly.

## Measured efficiency

No token, latency, or cost improvement has been measured for this patch. The
native `ralph` loop tool is adopted as the primary fresh-agent engine
(pinned profile overlay, `maxRounds: 64`), with the ported scripts engine
kept as the documented fallback route.

## Host capability matrix

Live-observed on the pinned host during acceptance: 19 bundled skills plus 10
user-invocable command entries (model invocation of the twins is blocked by
design; slash registrations serve interactive adapters), five bridged hook
events with the two synthesized gates (PermissionRequest audit,
PostToolUseFailure) landing in workspace state, all six MCP servers
initializing and completing round-trips under the orchestrated default, the
native ralph cycle completing with structured reports and run-ledger events,
and persona-restricted subagents (toolFilter allowlists enforced in the child
roster). Degraded: the advisory Stop reminder is not surfaced by the host
(only exit-2 deny continues a turn), and the interactive slash surface
requires an interactive adapter. Full facts: docs/10-host-capability-matrix.md.

## Migration and upgrade

Initial LazyDeepSeek release on the DeepSeek Harness host (family version
1.3.3). Install the pinned git spec into a profile; prebuilt `lib/` is
committed and no build scripts run, so no build approval is required. The
documented profile ships telemetry opt-outs applied (session-log upload
disabled, `DSH_TELEMETRY_MODE=DISABLED`); the doctor warns if upload is
detected enabled.

## Known risks

The host is a developer preview (`0.2.0-rc.2`, exact peer pin); breaking
changes are promised across RCs. The hooks bridge parses its config once per
session, so a hooks regeneration applies after a session restart. Advisory
Stop output is dropped by the host (see the capability matrix). Package
checks do not establish host sandboxing or live connection health.

## Rollback

Remove the plugin from its profile and reinstall the prior pinned spec; the
durable lifecycle rollback path preserves run evidence and caller state.

## Prior release notes

# LazyDeepSeek v1.3.2 — durable verification handoff

**Status:** v1.3.2 release. Source, publication, and six GitHub Actions CI jobs passed for the merged candidate. Fresh DeepSeek Harness activation remains pending; package verification alone does not establish host readiness.

## Eval-driven fixes

- The verifier contract writes a run-scoped, revision-bound report as checks finish; the orchestrator contract blocks a verdict when that report is missing, incomplete, or stale. Generic completion APIs do not yet enforce this report format.
- The orchestrator contract requires focused checks between stages, one full matrix at closure, a compact run digest, and completion events instead of active polling. It forbids duplicate dispatch while owned paths or evidence are changing.
- Where the host supplies agent identity, the PreToolUse hook denies an orchestrator Write/Edit outside its own state directory. Host payloads without identity still require the agent contract to enforce this boundary.

## Measured efficiency

The B3 postmortem identifies repeated whole-suite verification and polling as major token sinks. v1.3.2 has no measured token, latency, or cost reduction yet.

## Native plugin and release verification

DeepSeek Harness auto-discovers the standard `hooks/hooks.json` file. The v1.3.2 package removes the redundant manifest hook declaration that caused `Duplicate plugin hooks file ignored` in an earlier manually installed candidate. The root GitHub marketplace catalog, bundled plugin catalog, and plugin manifest are bound by the release route contract; the package includes six MCP launchers and seven hook events. The tag-triggered workflow verifies the package, lifecycle, language suite, and release archive before publication.

An earlier v1.3.2 candidate may not display an Update button because its version is unchanged. In Settings → Plugins, uninstall that candidate, refresh the marketplace, reinstall from the published repository, and start a fresh DeepSeek Harness session. Verify that the duplicate warning is absent and that the expected Skills, commands, agents, hooks, and MCP connections actually load.

## Host capability matrix

| Host | Package route | Current session |
| --- | --- | --- |
| DeepSeek Harness | Existing documented routes | Pending live observation |

## Migration and upgrade

Upgrade from v1.3.1 using the documented lifecycle after inventorying managed and modified assets. Preserve caller files and existing run evidence. The report gate applies to new verification attempts; old conversational verdicts do not become durable evidence.

## Known risks

The role-aware hook depends on host-provided agent identity and does not classify arbitrary Bash writes. Quota termination can still leave an in-progress report; it must remain blocked until independently resumed or rerun.

## Rollback

Use the lifecycle rollback to the prior verified release. Keep v1.3.2 run evidence for diagnosis and do not mark in-progress reports complete.

## Prior release notes (v1.3.1)

# LazyDeepSeek v1.3.1 — surgical fix round (2026-09-24)

**Status:** Published stable release. LazyDeepSeek v1.3.1 is the DeepSeek Harness port of the
LazyQoder v1.3.1 surgical fix round: a repair of confirmed local defects, not a
feature wave. Repository and release-package checks define the release gate;
DeepSeek Harness activation in a fresh host session still needs live testing.

## Eval-driven fixes

- **Safer execution:** Workflow intent ignores quoted or historical command
  mentions while retaining explicit requests to start work. Isolation reports
  namespace allocation accurately — it does not claim to have created a Git
  worktree — and release/recovery removes the task root only when empty.
  Cleanup preserves populated allocations, linked files, and caller-owned
  changes.
- **Better evidence:** Outcome comparisons hash the supplied task, budget, and
  permission snapshots and reject mismatched cohorts. Reports distinguish
  absent, partial, and validated evidence, count explicit host-billed costs
  from failed runs, and reject fixture telemetry as execution data. Baseline
  runners emit `measurement_scope: fixture-validation`; the outcome comparison
  accepts only explicit `execution` scope. Hashes verify supplied bytes, not
  the truth of their contents.
- **Predictable delegation:** Subagents keep the current session model by
  default. A plan may propose `efficient` or `performance` for named tasks,
  but switching requires an explicit plan decision and `--allow-switch`. The
  selector is advisory and does not change host settings or imply that a model
  is available on the account. DeepSeek Harness routing stays on per-agent
  `model`/`thoughtLevel` frontmatter; see
  [the model-routing guide](docs/reference/model-routing.md).
- **Package and tooling fixes:** Dependency search handles extension-bearing
  imports with fewer search processes (blast-radius lookup uses one search
  process instead of four, and repository overview uses one import scan
  instead of candidate discovery plus repeated per-file scans), and
  verification avoids repeating the full suite for Python preflight.
  Package-boundary checks receive a minimum 180-second deadline. No
  end-to-end speed or cost gain has been measured.
- **Current guidance:** README, contributor, lifecycle, and verification
  documentation reflect v1.3.1, mirroring the upstream LazyQoder v1.3.1
  documentation refresh. The v1.3.0 release notes are archived at [docs/v1.3.0-release-notes.md](docs/v1.3.0-release-notes.md), and a new
  [model-routing guide](docs/reference/model-routing.md) documents the
  catalog, custom-model, cost, and host-observation boundaries.

## Measured efficiency

No measured productivity or native-cost improvement is claimed. Local
repository, installed-package, release-root, machine-status, and
verifier-policy checks passed; their JSON results name each outcome, and the
retained fixture telemetry is scope-marked, not a live efficiency result.

## Host capability matrix

| Host | Release route | Live status |
| --- | --- | --- |
| DeepSeek Harness | Plugin marketplace route (`dsh-plugin-git-sha`): full plugin — skills/commands/agents/hooks/MCP via **Settings → Plugin Management**. Manual fallback (`manual-skills-mcp-fallback`): skills-only import plus six manual connectors. | Pending fresh-session test |

Package checks are package evidence only. Every host remains **pending host
proof** until it is observed in a fresh session; this release does not claim
that any host loaded, enabled, or connected anything.

## Migration and upgrade

From v1.3.0: the update is additive. The v1.3.0 release was the DeepSeek Harness
rename-port of the previous LazyQoder v1.3.0 baseline (lazyqoder → lazydeepseek,
Qoder host surfaces → DeepSeek Harness host
surfaces); v1.3.1 changes no route IDs, manifests, or state shapes. `.lazydeepseek/`
project state, receipts, and durable `LazyDeepSeek/` installs carry over.

Before upgrading, record the installed version and lifecycle ownership, then
validate the exact v1.3.1 archive. Keep host readiness pending until the
selected route is observed in a fresh DeepSeek Harness session.

## Known risks

Repository and CI checks do not establish that a release archive loads in a
host. Installation, activation, hooks, MCP, specialist dispatch, cancellation,
and completed-task behavior remain unobserved in fresh DeepSeek Harness sessions. Shared
semantics stay byte-identical with LazyBuddy, LazyTrae, and LazyQoder, but
routes and host proof are per host. Evidence hashes bind supplied bytes but do
not establish their independent truth.

## Rollback

Stop the host session and use the lifecycle offboard/rollback route for the
previous release. Remove only unmodified receipt-owned assets; preserve
modified, unknown, linked, caller-owned, and host-managed files. Start a fresh
session to verify the restored installation.
