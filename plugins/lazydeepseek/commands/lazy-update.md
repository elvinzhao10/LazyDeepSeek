---
description: "Guide a LazyDeepSeek plugin update: compare installed and repo versions, walk the DeepSeek Harness marketplace update flow, and re-verify host readiness in a fresh session."
argument-hint: "[--project <absolute-project-root>]"
---

Work through this guided update in order. An agent with approved computer-use
access may perform the documented host UI steps and observe the result. Never
edit DeepSeek Harness's private config, plugin cache, or enable toggle through files.

$ARGUMENTS

# /lazy-update

## Usage

```
/lazy-update [--project <absolute-project-root>]
```

Triggers: `update LazyDeepSeek`, `upgrade the plugin`, `refresh the install`.

## Guided procedure

1. **Read the installed version (best-effort).** If
   `$DSH_HOME/profiles/<name>/node_modules/lazydeepseek/package.json`
   is present, read the installed `version` (the marketplace id is the
   package `name`, `lazydeepseek`). A missing or unreadable install
   manifest means "installed version not detectable" — say so honestly instead
   of guessing. Never write to the cache directory.
2. **Read the repo manifest version** from
   the repo root `package.json` and compare the two:
   - Installed < repo → an update is available; continue.
   - Equal → the install is current; still offer the re-verification checklist.
   - Installed > repo → the repo checkout is older than the install; say so
     before recommending anything.
3. **Show the changelog delta.** Point the user at `CHANGELOG.md` for what
   changes between versions, and at `RELEASE_NOTES.md`
   for the release's verification scope.
4. **Check prerequisites.** Node.js LTS 20+ (24 recommended, 22 supported) and
   Git on `PATH` for the local launchers.
5. **Walk the documented host update flow.** For the DeepSeek Harness marketplace route,
   use the UI (the durable launcher route is separate):
   1. In the repository: bump the `version` in
      the root `package.json` and the regenerated
      `contracts/dsh-route-contract.v1.json` inventory (release
      builds do this; a plain source checkout update is just `git pull`).
   2. In DeepSeek Harness: open **Settings → Plugins**, open the marketplace
      **gear → Refresh**, then open the plugin details and click **Update**
      when offered.
   3. Source edits are not hot reload, and a catalog refresh is not a plugin
      update — only the **Update** action replaces the installed package.
      If the version is unchanged, report that DeepSeek Harness may not offer an update;
      do not claim that a refresh installed the new revision. For an earlier
      same-version v1.3.2 candidate, use **Manage installed → Uninstall**,
      refresh the marketplace after the fixed commit reaches `main`, then
      install the plugin again and verify in a fresh session.
6. **Re-verify the package.** From the repository root run
   `bash plugins/lazydeepseek/scripts/lazydeepseek-load-check.sh` (expect
   `PACKAGE_READINESS=full`) and `bash plugins/lazydeepseek/scripts/lazydeepseek-plugin-doctor.sh`
   (host=package). With `--project <absolute-project-root>`, the durable
   launcher route updates separately:
   `node "<install-root>/LazyDeepSeek/launcher.js" update` (a moved same-version
   ref requires `--confirm-revision <full-sha>`).
7. **Re-verify host readiness in a fresh session.** After the update, ask the
   user to start a NEW DeepSeek Harness session and confirm the checklist:
   - One real skill loads via the Skill tool.
   - One command appears as a slash menu entry (for example `/lazy-status`).
   - All six MCP connections are visible: `run-ledger`, `verification`,
     `status-dashboard`, `context-graph`, `code-intel`, `docs`.
   - Hooks are active with the plugin enabled.
   - The `mcp_mode` plugin user setting is visible (empty defers the profile
     gate, which defaults to `orchestrated`).
8. **Report readiness honestly.** `PACKAGE READINESS: full` only from the
   checks in step 6; `HOST READINESS: PENDING` until the fresh-session
   observation in step 7 exists. Package checks never prove host activation.

## Success criteria

- Both versions were read and compared (or the missing one was named honestly).
- The user received the exact UI update flow and the changelog pointer.
- No host-owned path was edited by the agent.
- The final report ends with `HOST READINESS: PENDING` until the fresh-session
  re-verification is observed.

Do not claim completion without verification.

## Package entry points

- `plugins/lazydeepseek/scripts/lazydeepseek-load-check.sh` — package-readiness gate
  (`PACKAGE_READINESS=full`).
- `plugins/lazydeepseek/scripts/lazydeepseek-plugin-doctor.sh` — package doctor
  (host=package).
- `plugins/lazydeepseek/scripts/lazydeepseek-lifecycle.js` — durable lifecycle CLI
  (`update` requires an installed bundle; `--source` official origin only).
- `<install-root>/LazyDeepSeek/launcher.js` — stable durable launcher for
  `update`, `status`, and plan-first `offboard`.
- `CHANGELOG.md` — version delta for the update being applied.
