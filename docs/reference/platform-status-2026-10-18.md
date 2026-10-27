# Platform status — 2026-10-18

DeepSeek Harness host-harness capability rescan for the LazyDeepSeek
adapter, observed 2026-10-18. Scope: the LazyDeepSeek / DeepSeek Harness row
of the 2026-10-02 platform audit only; every other host row of
`platform-status-2026-10-02.md` remains governed by that dated snapshot and
its own adapter's rescans. Reviewed official sources are listed per finding.
Documentation and release metadata describe available host features, not
authenticated execution of this package. **HOST READINESS: PENDING** is
unchanged by this rescan; package checks, version probes, and historical
observations still do not establish current plugin loading, delegation,
hooks, or MCP connections.

## Sources reviewed (observation date 2026-10-18)

- GitHub releases for `deepseek-ai/deepseek-harness` (release list, tag
  dates, and prerelease flags confirmed through the GitHub API):
  <https://github.com/deepseek-ai/deepseek-harness/releases>
- DeepSeek API changelog: <https://api-docs.deepseek.com/updates/>
- DeepSeek Harness repository README:
  <https://github.com/deepseek-ai/deepseek-harness>
- DeepSeek Harness documentation site (deepseek-harness.github.io) rendered
  only a shell title; no plugin/hook/MCP pages were retrievable this scan.

## Findings

| Finding | Source and date | Classification | Action |
| --- | --- | --- | --- |
| `dsh-v0.2.1-rc.2` (2026-10-17), `dsh-v0.2.1-rc.1` (2026-10-17), `dsh-v0.2.1-alpha.1` through `alpha.5` (2026-10-03 through 2026-10-16) exist after the pinned `dsh-v0.2.0-rc.2` (2026-09-29). Every release, including the pin, is flagged prerelease; the project states a developer preview with compatibility-breaking changes. | [Releases](https://github.com/deepseek-ai/deepseek-harness/releases), 2026-10-18 | experimental (entire 0.2.1 series is prerelease) | Not adopted. Peer pin stays `@deepseek-ai/dsh 0.2.0-rc.2` exact; no route, hook, MCP, or telemetry seam changes. |
| DeepSeek Search and Fetch API opened as generally available, powered by DeepSeek's in-house search engine. | [API changelog](https://api-docs.deepseek.com/updates/) 2026-10-17 entry | stable (provider API) | Recorded only. The adapter has no search/fetch seam; adopting it would invent a new surface, which this rescan forbids. |
| `DeepSeek-V4.1-Flash-1017` upgrade served under the unchanged model name `deepseek-flash`, same pricing; the entry recommends DeepSeek Harness `0.2.1-rc.1+`. | [API changelog](https://api-docs.deepseek.com/updates/) 2026-10-17 entry | stable (same-name model upgrade) | No change. Model routing uses tier aliases and host profiles with no literal provider model IDs, so no seam drifts; the `0.2.1-rc.1+` harness recommendation is a prerelease and is not adopted. |
| 0.2.1 series notes a Claude Code Mods compatibility layer (explicitly experimental), session state-record APIs, a `working_directory` tool, custom plugin index sources, UI-configurable reasoning levels, and hot-reload after plugin enable/disable. | [Releases](https://github.com/deepseek-ai/deepseek-harness/releases) 0.2.1 alpha/rc notes, 2026-10-18 | experimental (prerelease-only) | Not adopted. None of these are stable surfaces; the plugin verb set, profile-scoped install, and generated runtime ownership remain as documented in `docs/reference/host-routes.md`. |
| No hook or event API changes are documented in any release note; MCP changes are dependency updates only. | [Releases](https://github.com/deepseek-ai/deepseek-harness/releases), 2026-10-18 | no change observed | The seven native bridged events and the two adapter-synthesized events (PermissionRequest audit, PostToolUseFailure; both degraded) remain explicitly separated. Synthesized events are never called native. |
| No telemetry or privacy setting change is documented in any release note or the API changelog. | Releases and [API changelog](https://api-docs.deepseek.com/updates/), 2026-10-18 | no change observed | Telemetry advisories stand: session-log upload on the official API route, feedback-only OpenTelemetry default, `DSH_TELEMETRY_MODE=DISABLED` opt-out guidance. |
| The `dsh.cn` documentation pages cited by the sanitized observation bundle's public-document boundary failed TLS (`certificate has expired`) on this scan date. | Direct fetch attempt, 2026-10-18 | unknown (unavailable) | Availability note only. No content claim is made from an unreachable source; the observation bundle's boundary and fail-closed parser are unchanged. |

## Decisions

1. **No adoption.** No item is both stable and mapped to an existing adapter
   seam, so the manifest (`package.json` peer pin, `cordis.patch.yml`) and
   the route contract stay byte-identical to the 2026-10-02 baseline.
2. **Pin rationale.** The whole upstream 0.2.1 line remains prerelease; the
   exact `0.2.0-rc.2` pin is retained until a stable release or an observed
   acceptance run justifies a maintainer bump and route-contract
   regeneration.
3. **Distribution unchanged.** This package stays GitHub-only via the
   git-spec default route; dsh itself shipping through npx or bundled desktop
   commands does not add an npm distribution channel for LazyDeepSeek, and no
   daemon is invented from prerelease notes.
4. **Host readiness unchanged.** Pending until a current-session observation
   is recorded through the sanitized observation bundle; nothing in this
   documentation rescan promotes any surface.
