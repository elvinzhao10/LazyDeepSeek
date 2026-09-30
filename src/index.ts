// LazyDeepSeek v1.3.3 — DeepSeek Harness (dsh) plugin shim (TypeScript source).
//
// BUILD RULE: the shipped plugin entry is the prebuilt, committed
// ../lib/index.js (package.json "main"). The package intentionally declares
// NO build scripts so git-spec installs never depend on pnpm allowBuilds.
// Keep this file logic-identical with lib/index.js; regenerate the build by
// porting changes into both files in one edit.
//
// See lib/index.js for the full responsibility docs.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

interface HookEntry { type?: string; command: string; timeout?: number }
interface MatcherGroup { matcher?: string; hooks: HookEntry[] }
interface HooksManifest { hooks?: Record<string, MatcherGroup[]> }
interface CommandFrontmatter { description?: string; "argument-hint"?: string }
interface CommandResult { kind: "success" | "error"; text: string }
interface InjectionSource { kind: string; command: string }
interface CommandsService {
  register(def: {
    name: string;
    description: string;
    input?: { hint: string };
    handler: (invocation: { agent?: { inject?: (message: unknown) => void }; rawInput?: string }) => CommandResult;
  }): void;
}
interface PluginContext {
  get(service: string): unknown;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
}

const name = "lazydeepseek";
const inject = ["commands"];

const BRIDGED_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
const MCP_SERVERS = ["run-ledger", "verification", "status-dashboard", "context-graph", "code-intel", "docs"];

export function resolvePkgRoot(): string {
  const self = realpathSync(fileURLToPath(import.meta.url)); // <pkg>/src/index.ts
  return dirname(dirname(self));
}

export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME;
  return fromEnv && fromEnv.trim() !== "" ? fromEnv : join(homedir(), ".dsh");
}

function lowerMatcher(matcher: string): string {
  return matcher.split("|").map((part) => part.trim().toLowerCase()).join("|");
}

function absolutizeCommand(command: string, payloadDir: string, pkgRoot: string): string {
  let out = command;
  out = out.split("${CLAUDE_PLUGIN_ROOT}").join(payloadDir);
  out = out.split('"').join("'");
  return `LAZYDEEPSEEK_PLUGIN_ROOT='${pkgRoot}' LAZYDEEPSEEK_PROJECT_DIR="\${CLAUDE_PROJECT_DIR}" ${out}`;
}

export function buildHooksConfig(pkgRoot: string): { _lazydeepseek: string; hooks: Record<string, MatcherGroup[]> } {
  const payloadDir = join(pkgRoot, "plugins", "lazydeepseek");
  const source: HooksManifest = JSON.parse(readFileSync(join(payloadDir, "hooks", "hooks.json"), "utf8"));
  const hooks: Record<string, MatcherGroup[]> = {};
  for (const event of BRIDGED_EVENTS) {
    const groups = source.hooks?.[event];
    if (!Array.isArray(groups)) continue;
    hooks[event] = groups.map((group) => ({
      ...(typeof group.matcher === "string" ? { matcher: lowerMatcher(group.matcher) } : {}),
      hooks: group.hooks.map((hook) => ({
        type: "command" as const,
        ...(typeof hook.timeout === "number" ? { timeout: hook.timeout } : {}),
        command: absolutizeCommand(hook.command, payloadDir, pkgRoot)
      }))
    }));
  }
  return {
    _lazydeepseek: `LazyDeepSeek v1.3.3 generated hook surface for the dsh-hooks-claude-code bridge. Five events are bridged (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop); PermissionRequest and PostToolUseFailure do not exist on the bridge and are synthesized inside the PreToolUse/PostToolUse handlers (degraded; see contracts/dsh-hook-consumers.v1.json). Commands carry absolute paths baked at generation; \${CLAUDE_PROJECT_DIR} is substituted by the bridge per-run. Hooks print EITHER strict JSON ({"additionalContext": "..."}) OR nothing on stdout; deny = exit 2 with stderr reason; diagnostics to stderr; no network I/O.`,
    hooks
  };
}


const USER_INVOCABLE_COMMANDS = [
  'lazy-handoff', 'lazy-new-run', 'lazy-offboard', 'lazy-onboard', 'lazy-ralph-loop',
  'lazy-resume', 'lazy-status', 'lazy-stop-continuation', 'lazy-update', 'lazy-verify',
];

function generateBundledSkills(payloadSkills, ownDir, version) {
  const bundled = join(ownDir, 'skills');
  try { rmSync(bundled, { recursive: true, force: true }); } catch { /* absent */ }
  mkdirSync(bundled, { recursive: true });
  for (const entry of readdirSync(payloadSkills).sort()) {
    const source = join(payloadSkills, entry);
    if (!existsSync(join(source, 'SKILL.md'))) continue;
    try { symlinkSync(source, join(bundled, entry), 'dir'); } catch { /* best-effort */ }
  }
  // Command-only slash entries: user-invocable, excluded from model auto-use
  // (the same-named skill files stay the model-invoked surface; these ten have
  // no skill twin, so the generated entry IS the dsh user route).
  for (const command of USER_INVOCABLE_COMMANDS) {
    const text = readFileSync(join(payloadSkills, '..', 'commands', `${command}.md`), 'utf8');
    const frontmatter = parseFrontmatter(text);
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
    const dir = join(bundled, command);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'),
      `---\nname: ${command}\ndescription: ${(frontmatter.description ?? `LazyDeepSeek ${command} command`).replace(/"/g, '&quot;')}\nwhenToUse: User invoked the /${command} command explicitly.\nuser-invocable: true\ndisable-model-invocation: true\nmetadata:\n  author: LazyDeepSeek\n  generated_by: lazydeepseek v${version}\n---\n${body}`);
  }
  return bundled;
}

function artifactsPresent(ownDir: string): boolean {
  if (!existsSync(join(ownDir, "hooks.dsh.json"))) return false;
  if (!existsSync(join(ownDir, "skills"))) return false;
  return MCP_SERVERS.every((server) => existsSync(join(ownDir, "launch", `mcp-${server}.sh`)));
}

export function generateRuntimeArtifacts(pkgRoot: string, home: string): { ownDir: string; regenerated: boolean; version: string } {
  const payloadDir = join(pkgRoot, "plugins", "lazydeepseek");
  const ownDir = join(home, "lazydeepseek");
  mkdirSync(ownDir, { recursive: true });
  mkdirSync(join(ownDir, "launch"), { recursive: true });
  mkdirSync(join(ownDir, "dependencies"), { recursive: true });
  mkdirSync(join(ownDir, "cache"), { recursive: true });

  const version = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version;
  const stampPath = join(ownDir, "generated-version");
  let stamp = "";
  try { stamp = readFileSync(stampPath, "utf8"); } catch { stamp = ""; }
  const fresh = stamp === version && artifactsPresent(ownDir);
  if (fresh) {
    process.env.DSH_BUNDLED_SKILL_DIR ??= join(ownDir, "skills");
    return { ownDir, regenerated: false, version };
  }

  writeFileSync(join(ownDir, "hooks.dsh.json"), JSON.stringify(buildHooksConfig(pkgRoot), null, 2) + "\n");
  for (const server of MCP_SERVERS) {
    const script = join(payloadDir, "mcp", server, "server.sh");
    writeFileSync(
      join(ownDir, "launch", `mcp-${server}.sh`),
      `#!/usr/bin/env bash\n# Generated by lazydeepseek v${version}: launcher for the ${server} MCP stdio server.\nexec bash '${script}' "$@"\n`,
      { mode: 0o755 }
    );
  }
  const skillsLink = generateBundledSkills(join(payloadDir, "skills"), ownDir, version);
  writeFileSync(stampPath, version);
  process.env.DSH_BUNDLED_SKILL_DIR ??= skillsLink;
  return { ownDir, regenerated: true, version };
}

function parseFrontmatter(text: string): CommandFrontmatter {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out as CommandFrontmatter;
}

function registerCommands(ctx: PluginContext, pkgRoot: string): number {
  const commands = ctx.get("commands") as CommandsService | undefined;
  if (!commands || typeof commands.register !== "function") {
    ctx.logger?.warn?.("lazydeepseek: commands service unavailable; slash registrations skipped");
    return 0;
  }
  const dir = join(pkgRoot, "plugins", "lazydeepseek", "commands");
  let registered = 0;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".md")) continue;
    const text = readFileSync(join(dir, file), "utf8");
    const frontmatter = parseFrontmatter(text);
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
    const cmd = file.replace(/\.md$/, "");
    commands.register({
      name: cmd,
      description: frontmatter.description ?? `LazyDeepSeek ${cmd} command`,
      ...(frontmatter["argument-hint"] ? { input: { hint: frontmatter["argument-hint"] } } : {}),
      handler: ({ agent, rawInput = "" }) => {
        const prompt = body.split("$ARGUMENTS").join(String(rawInput).trim());
        if (agent && typeof agent.inject === "function") {
          agent.inject({ role: "user", content: [{ type: "text", text: prompt }], source: { kind: "lazydeepseek-command", command: cmd } as InjectionSource });
          return { kind: "success", text: `/${cmd} submitted to the agent` };
        }
        return { kind: "success", text: prompt };
      }
    });
    registered += 1;
  }
  return registered;
}

export function apply(ctx: PluginContext, _config: Record<string, never> = {}): void {
  const pkgRoot = resolvePkgRoot();
  const home = resolveDshHome();
  try {
    const result = generateRuntimeArtifacts(pkgRoot, home);
    ctx.logger?.info?.(`lazydeepseek: runtime artifacts ${result.regenerated ? "regenerated" : "verified"} under ${result.ownDir} (v${result.version})`);
  } catch (error) {
    ctx.logger?.warn?.(`lazydeepseek: runtime artifact generation failed: ${String(error)}`);
  }
  try {
    const count = registerCommands(ctx, pkgRoot);
    ctx.logger?.info?.(`lazydeepseek: registered ${count} slash commands`);
  } catch (error) {
    ctx.logger?.warn?.(`lazydeepseek: slash command registration failed: ${String(error)}`);
  }
}

// Module-load generation (fail-soft): see lib/index.js.
try {
  generateRuntimeArtifacts(resolvePkgRoot(), resolveDshHome());
} catch {
  // Retried (with logging) inside apply().
}

export { inject, name };
