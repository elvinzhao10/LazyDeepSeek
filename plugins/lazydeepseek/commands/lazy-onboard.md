---
description: "Guide LazyDeepSeek onboarding: verify the package, install through DeepSeek Harness's plugin marketplace UI, and keep host readiness explicitly PENDING until a fresh session proves it."
argument-hint: "[--project <absolute-project-root>]"
---

Work through this guided onboarding in order. Stop at the first step that
cannot be completed and report honestly what is missing. Never simulate a host
result and never edit host-owned configuration.

$ARGUMENTS

# /lazy-onboard

## Usage

```
/lazy-onboard [--project <absolute-project-root>]
```

Triggers: `onboard`, `install LazyDeepSeek`, `set up the plugin`, `verify the install`.

## Guided procedure

1. **Detect the current install state (read-only).** If
   `~/.dsh/cli/config.json` is readable, read its `plugins` key read-only to
   see whether a `lazydeepseek` plugin entry already exists and is enabled.
   Treat an unreadable or missing file as "not detectable" and say so. This is
   a look, never a write: NEVER create, edit, or repair host configuration —
   all install, enable, and update actions happen through the DeepSeek Harness UI.
2. **Verify the package from the repo checkout.** Run, from the repository
   root:
   - `bash plugins/lazydeepseek/scripts/lazydeepseek-load-check.sh` — must end with
     `PACKAGE_READINESS=full`.
   - `bash plugins/lazydeepseek/scripts/lazydeepseek-plugin-doctor.sh` — the package
     doctor (host=package) must pass.
   - `bash scripts/install.sh` — the native onboarding script re-runs the
     prerequisite, marketplace-layout, load-check, and doctor checks, then
     prints the current UI steps with the GitHub URL and local market root
     (on macOS it copies the URL to the clipboard).
   If any check fails, fix the named package file first; do not continue.
3. **Install through DeepSeek Harness's own UI (primary route).** Give only one host
   action at a time after the applicable approval:
   1. Open a workspace, then **DeepSeek Harness → Settings → Plugins → Create → Add
      marketplace**. Enter `https://github.com/elvinzhao10/LazyDeepSeek`, whose
      repository root is the npm-style package (root `package.json`). For an offline checkout,
      choose local `<repo>/plugins`, not the nested plugin directory. Wait
      for the `lazydeepseek` card to appear in **Personal**.
   2. After a separate approval, open the `lazydeepseek` card and click
      **Install**. Installed plugins are enabled by default. Wait for the
      result before asking for a fresh session.
   Development machines with a `dsh` binary on `PATH` may additionally run
   `dsh plugins validate plugins/lazydeepseek`; that is an optional,
   development-only package check, not an install and not host proof.
4. **Optional durable route (only when the user passed
   `--project <absolute-project-root>`).** Run the durable lifecycle onboard:

   ```bash
   node plugins/lazydeepseek/scripts/lazydeepseek-lifecycle.js onboard \
     --source https://github.com/elvinzhao10/LazyDeepSeek.git \
     --project <absolute-project-root> \
     [--install-root <absolute-path>]
   ```

   The default install root is the lifecycle's own resolution
   (`~/Library/Application Support/LazySeries` on macOS). This step fetches
   from the official origin. On failure, print the lifecycle's error verbatim,
   keep package readiness as the only readiness claim, and do not retry by
   editing receipts or state.
5. **Verify host readiness in a fresh session.** Host activation can only be
   observed in a NEW DeepSeek Harness session. Ask the user to start one and confirm
   each item of the fresh-session checklist:
   - One real skill loads via the Skill tool (for example `lazy-ulw-plan`).
   - One command appears as a slash menu entry (for example `/lazy-status`).
   - All six MCP connections are visible: `run-ledger`, `verification`,
     `status-dashboard`, `context-graph`, `code-intel`, `docs`.
   - Hooks are active (the plugin's hook events fire when the plugin is
     enabled).
   - The `mcp_mode` plugin user setting is visible (empty defers the profile
     gate, which defaults to `orchestrated`).
6. **Report readiness honestly.** Print exactly:
   - `PACKAGE READINESS: full` — only if step 2 passed.
   - `HOST READINESS: PENDING` — until a fresh session has observed one real
     skill or command plus all six MCP connections. Package checks, doctor
     output, and install receipts never prove host activation.

## Success criteria

- Package checks ran and the load-check reported `PACKAGE_READINESS=full`.
- The user received the exact UI steps with the public GitHub marketplace URL
  (or the absolute local market root for an offline checkout).
- The durable onboard (if requested) either completed with its receipt or its
  honest error was reported verbatim.
- The fresh-session checklist was handed to the user, and the final report
  ends with `HOST READINESS: PENDING` until that observation exists.

Do not claim completion without verification.

## Package entry points

- `scripts/install.sh` — repo-root native onboarding script (prerequisites,
  marketplace layout, load-check, doctor, UI handoff, optional lifecycle
  onboard with `--project`).
- `plugins/lazydeepseek/scripts/lazydeepseek-load-check.sh` — package-readiness gate
  (`PACKAGE_READINESS=full`).
- `plugins/lazydeepseek/scripts/lazydeepseek-plugin-doctor.sh` — package doctor
  (host=package).
- `plugins/lazydeepseek/scripts/lazydeepseek-lifecycle.js` — durable lifecycle CLI
  (`onboard|update|status|offboard|recover-bootstrap-lock`).
- `plugins/lazydeepseek/scripts/lazydeepseek-dsh-preparation-check.sh` — read-only
  host preflight; `--apply` refuses and nothing is mutated.
