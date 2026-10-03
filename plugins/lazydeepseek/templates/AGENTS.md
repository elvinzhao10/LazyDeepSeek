# AGENTS.md — LazyDeepSeek local onboarding

This is the reusable `v1.0.3` consumer template, not a claim that a host loaded
the plugin. Explicit user instructions and nearer project instructions take
precedence.

## When the user types `onboard`

Require **Node.js LTS 24 (recommended) or 22 (supported alternative)** and
**Git**. The lifecycle also accepts Node.js LTS 20 for compatibility.
Optional TypeScript LSP requires Node.js **22.22.2+**. Bootstrap `onboard` only from
`https://github.com/elvinzhao10/LazyDeepSeek.git`, then use
`node "<install-root>/LazyDeepSeek/launcher.js"` for `update`, `status`,
`recover-bootstrap-lock`, and plan-first `offboard`. The exact durable tree is
`LazyDeepSeek/{active.json,launcher.js,releases/,receipts/,rollback/,staging/,locks/}`.
The source checkout may be deleted after promotion. Never install in a
temporary or cache directory.

If lifecycle state collides with an existing path, preserve the caller
workspace. Only an explicitly verified lifecycle-owned sibling bootstrap lock
or product `staging/`/`locks/` artifact is recoverable; never remove or replace
caller workspace files.

1. Detect or ask for the **dsh CLI** and confirm the pinned peer
   `@deepseek-ai/dsh 0.2.0-rc.2` (`dsh --version`).
2. Resolve the absolute release/package root; never guess it from PATH.
3. Run safe package checks only: from the release root, use
   `bash plugins/lazydeepseek/scripts/lazydeepseek-load-check.sh` and
   `bash plugins/lazydeepseek/scripts/lazydeepseek-plugin-doctor.sh`. Preserve project
   settings and do not change credentials, providers, or host settings.
4. Report **package readiness** separately. Files and declarations do not prove
   plugin discovery, commands, agents, hooks, SessionStart, or MCP connection.
5. Ask for explicit approval before plugin install, Skills import, connector
   setup, account, credential, or provider changes.
6. After approval, give exactly one host action and wait. Install, reload/new
   session, and verification are separate actions.
7. Inspect the composed host state after each action (`dsh --profile <name>
   --dump-config`); if unavailable, accept a user-pasted verbatim status as
   observed evidence.
8. Verify one real Skill/command appropriate to the selected route and all six
   MCP connections. Otherwise **HOST READINESS: PENDING**.

Route status is explicit: `dsh-plugin-git-sha` (git spec pinned to a commit
sha, GitHub-only distribution; the npm registry is not used for this package)
is the **default route**; `dsh-plugin-tarball` (pinned GitHub release asset)
is the alternate; `dsh-plugin-local-dir` is development only. The
`manual-skills-mcp-fallback` is recovery only. None is current host proof
until observed live on the pinned dsh version.

## dsh plugin install (default git-spec route)

Run durable `status --route dsh-plugin-git-sha` and use the pinned commit:

```text
dsh plugin --profile <name> add github:elvinzhao10/LazyDeepSeek#<commit-sha>
```

Enter the add command in the terminal, wait for the pnpm-based install to
finish, then start a fresh session as the next action. For an offline
checkout use the local package root instead of the git spec (development
route). The package ships a prebuilt `lib/` and declares no install-time
build scripts, so the pnpm allowBuilds gate does not apply.

dsh config layering: bundles compose with the profile patch, home patch, and
`--patch` overlays (later wins; a patch replaces the targeted row's whole
config). `.dsh/settings.json`-style shareable project scope stays non-secret;
local machine scope must remain unstaged; secrets must never be committed.

## dsh package boundary

The release root IS the package root: `package.json` (name `lazydeepseek`,
`dsh` bundle key pointing at `cordis.patch.yml`, exact peer pin) plus the
committed prebuilt `lib/index.mjs` and the payload under
`plugins/lazydeepseek/`. The bundle patch rows (shim entry, hooks bridge, six
`dsh-mcp-client` servers, bundled skills dir, native ralph adoption) become a
patch layer when the package is added to a profile. Never inspect or mutate
private dsh state beyond `$DSH_HOME/profiles/<name>`; use only the plugin
verbs offered by the pinned build.

Before asking for that approval, run this read-only preflight from the release
root:

```bash
bash plugins/lazydeepseek/scripts/lazydeepseek-dsh-preparation-check.sh \
  --project-dir "<absolute-project-root>"
```

It prints `HOST_PREPARATION=not-applied`, `HOST_MUTATION=none`, and
`HOST_READINESS=pending`; `--apply` refuses. Durable `status --host dsh`
emits the exact receipt template. A current receipt must bind the active
source/version and current build/session and show one loaded Skill, command,
agent, hook, and all six connected MCP servers. The Skills/manual-MCP fallback
is recovery-only and excludes commands, agents, and hooks.

If durable `status` reports `STALE_RUNTIME`, use a fresh verified checkout for
scoped `offboard` and re-onboard. Do not edit receipts. A moved same-version
ref requires `--confirm-revision <full-sha>`. Package success never upgrades
**HOST READINESS: PENDING** without observation.

## Manual fallback (recovery-only)

The recovery fallback imports `plugins/lazydeepseek/skills/` into the
project's `.agents/skills` directory and configures six local MCP connectors
manually: `run-ledger`, `verification`, `status-dashboard`, `context-graph`,
`code-intel`, and `docs`. This route excludes commands, agents, and hooks. A
package file, declaration, or load-check never proves those capabilities or
MCP loaded.

Prepare manual connector values without mutating the host: copy the six entries
from `plugins/lazydeepseek/.mcp.json`, replace `${LAZYDEEPSEEK_PLUGIN_ROOT}` with the
absolute `<release-root>/plugins/lazydeepseek`, and replace
`${LAZYDEEPSEEK_PROJECT_DIR}` with the absolute `<project-root>`. Each entry must
use `command: bash` and the absolute `args` path
`<release-root>/plugins/lazydeepseek/mcp/<server>/server.sh`. Set `cwd` to
`<project-root>` and environment `CWD=<project-root>` plus
`LAZYDEEPSEEK_PROJECT_DIR=<project-root>`. The six servers are `run-ledger`,
`verification`, `status-dashboard`, `context-graph`, `code-intel`, and `docs`.
Do not edit the shipped declaration. After approval add one connector, wait;
handle trust separately, wait; inspect it, then continue to the next server.

Do not run a full plugin route and the `manual-skills-mcp-fallback` together;
coexistence is unsupported. To switch, stop the session, remove only old
LazyDeepSeek entries through the plugin verbs, choose one route, start a fresh
session, and verify it. Each host mutation is separately approved.

Read the root `dsh.md` when present; a nearer child `dsh.md` refines
that guidance.
Optional remote, browser, and architecture capabilities retain their own
approval lifecycle and are never enabled by onboarding.
