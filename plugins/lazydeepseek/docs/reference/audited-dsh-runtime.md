# Native LazyDeepSeek and the audited dsh runtime

LazyDeepSeek is a native **dsh bundle**, not a replacement host: the repository root declares `dsh.bundle.patch`, ships prebuilt `lib/`, and installs through `dsh plugin --profile NAME add SPEC`. No install-time build or model call is required. Payload under `plugins/lazydeepseek/` is not the package installation root.

## Dependency repair

The upstream rc.5 graph audited on 2026-10-30 contained vulnerable MCP client, fflate, undici and Zod copies. Updating an old global `dsh` to unmodified rc.5 does not repair that graph. The separate, private `tools/dsh-runtime/` application pins rc.5, pnpm and an audited lockfile with root overrides:

| Package | Locked override |
| --- | --- |
| @modelcontextprotocol/client | 2.3.0 |
| fflate | 0.8.3 |
| undici | 8.12.2 |
| zod | 4.6.7 |

Use Node 24 (recommended), or Node 22.19+ as required by the patched runtime. From a reviewed repository checkout or complete release archive:

```bash
npm ci --prefix tools/dsh-runtime --ignore-scripts --no-audit --no-fund
npm audit --prefix tools/dsh-runtime --omit=dev --audit-level=high
node plugins/lazydeepseek/scripts/native-sdk-check.mjs tools/dsh-runtime
node scripts/verify-native-plugin.mjs tools/dsh-runtime
```

These checks do not replace or update a global installation. The native proof owns a temporary Harness home/profile, packs the actual plugin, invokes the real dsh plugin manager and inspects the installed composition. It does not use credentials or request model output. Its cleanup preserves existing user profiles. The runtime tool is excluded from the plugin's npm payload; it remains in the complete repository archive. A plugin-local `overrides` field cannot repair a host-owned dependency graph.

## Native dependency and loading boundaries

Shared native framework, role, tool and MCP packages are exact rc.5 **peers**, so the plugin uses the host's instances. The optional Claude-code hook bridge and its stateless hook protocol are runtime dependencies because the base host does not supply them. They do not install a second SDK tree. The plugin declares exact `engines.dsh` compatibility and retains prebuilt files for native tarball/git installations.

rc.5 moved native Ralph out of the base composition. LazyDeepSeek mounts the documented workflow/tool group with a private workflow-engine scope and a 64-round ceiling. It no longer patches a nonexistent `tool-ralph` base row. Thirteen native Agent Presets retain their full personas and scoped tools; twenty command registrations, six MCP rows and the generated Skills/hook surface remain native bundle contributions.

The upstream rc.5 `--dump-config-schema` inspector cannot describe the legitimate custom `EntryGroup` carrier used by its own AgentPreset plugin. That limitation is recorded rather than changing preset semantics to satisfy the schema exporter. Actual install/composition and runtime loading checks are the stronger acceptance boundaries.

## Install into a user profile later

After selecting and approving the exact Harness home and profile, put `tools/dsh-runtime/node_modules/.bin` on the command's PATH and use its `dsh plugin --profile NAME add github:elvinzhao10/LazyDeepSeek#FULL_SHA` (or an approved absolute native tarball). Use the reviewed managed runtime entrypoint, not an older global binary. Inspect the selected profile and start a fresh project session before asserting live-host readiness. No existing profile, global executable, credential or provider is changed by repository validation.

The managed host graph and the installed plugin graph must both pass their audits. This repairs the supported managed-runtime route; it is not a claim that the upstream unmodified rc.5 package or an arbitrary user's installation has been patched. Keep the high-severity release guard enabled, and re-audit at installation/release time. Model-backed live acceptance remains separate and deferred until requested.

Primary references: [native bundle packaging](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/user/develop/basic/publish.md), [native Agent Presets](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/preset/agent-preset/README.md), [npm root overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).
