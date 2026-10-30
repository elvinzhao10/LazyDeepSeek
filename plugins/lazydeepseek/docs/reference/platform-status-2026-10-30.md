# LazyDeepSeek platform audit — 2026-10-30

Current published documentation baseline remains v1.4.0; local 1.4.1 changes are unreleased.

## Official documentation checked

The official [rc.5 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.5) was published October 30; [rc.4](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.4) fixes diagnostic output leaking into ACP stdout. A separate 0.2.2 alpha line is not the same compatibility target. This working tree updates exact dependencies and checks from rc.3 to **0.2.1-rc.5**, retaining prerelease status. This is not publication or a host upgrade.

Source comparison from rc.3 `1f81c047fc48fa190a683e469daa699857e9afe8` to rc.5 `b830ec950faba0a46dda564be3e2d854afed94f1` found no source changes to the preset, subagent, core-agent or SDK integration families. The [account logging change](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/llm/llm-deepseek-account/src/index.ts#L57-L59) sends diagnostics to stderr; [MCP resource discovery](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/mcp/mcp-client/src/connection.ts#L373-L381) avoids the noisy unsupported-resource path. Thirteen roles still use Agent Presets and scoped tool facades. Real isolated SDK/boot checks are required for the new exact pin; they do not establish model-backed delegation or live host activation. `--dump-config` may initialize absent profiles, so it is not used as a harmless read-only probe.

## Upstream dependency finding — release hold

The isolated rc.5 SDK installation passed composition checks but its resolved production graph reported four affected packages: `@modelcontextprotocol/client` 2.2.0 (moderate), nested `fflate` 0.8.2 (moderate), `undici` 8.11.2 (high), and nested `zod` 4.4.3 (high). See the [MCP redirect advisory](https://github.com/advisories/GHSA-6prh-2h8m-c8cw), [fflate ZIP advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98), [undici TLS advisory](https://github.com/advisories/GHSA-2m5v-pch6-74hx), and [Zod collection advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Top-level patched copies do not remove nested vulnerable versions. This is evidence from the temporary upstream SDK graph, not a scan of a user's installed host or an observed exploit. Treat rc.5 as a compatibility-tested development target, not an unconditional secure-release recommendation. Resolve the upstream dependency pins and repeat the SDK/advisory checks before release; a plugin-local override cannot reliably patch a host-owned dependency graph. No host dependency was changed.

Verification requires **Python 3.11 or newer**: the bounded runner uses standard-library StrEnum and assert_never. The previous 3.10 admission check was incorrect; preflight now rejects it before attempting runner imports.

## Package capability and proof boundary

This audit covers lifecycle/onboarding/update/offboard/recovery; project init/sync/ownership; Skills, commands, agents and hooks; MCP and optional tooling; adaptive workflow/model selection; plans, loops and delegation; evidence, completion and security gates; dashboard/project records and editing; versioned verification, regression provenance, review admission, checkpoint history and compaction. Package checks and isolated native fixtures are distinct from current-session host acceptance.

The local development changes retain direct handling for simple tasks. Existing named workflows and approval/verification requirements remain authoritative. No blanket speed, token or cost saving is claimed from workflow selection. The five Python-backed adapters omit review-content scanning only on internal producer paths with no existing review; public reads and all reviewed subjects retain fresh capture. No HEAD-only cache is introduced.

**HOST READINESS: PENDING** wherever no fresh host/build/session receipt is observed. No host installation, trust/account change, provider call, credential change or publication was performed by this audit. The coordination report records exact test outcomes and unresolved contradictions. The previous dated audit remains historical context.
