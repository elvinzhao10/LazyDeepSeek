// LazyDeepSeek v1.3.3 — DeepSeek Harness (dsh) plugin shim.
//
// Build rule: this file IS the shipped plugin entry (package.json "main").
// The package ships prebuilt with no build scripts (git-spec installs must
// not depend on pnpm allowBuilds); src/index.ts is the TypeScript source of
// record and must stay logic-identical with this file.
//
// Responsibilities:
//   1. Resolve the plugin's own installed root (import.meta.url -> realpath,
//      surviving pnpm symlinked installs). dsh plugins get no PLUGIN_ROOT env.
//   2. Generate, at module load (fail-soft), the runtime artifacts under
//      $DSH_HOME/lazydeepseek/ consumed by the bundle patch rows:
//        hooks.dsh.json        bridge config, absolute command paths
//        launch/mcp-<name>.sh  six MCP stdio launchers
//        skills -> <pkg>/plugins/lazydeepseek/skills  (symlink, rank 600)
//      Regeneration is version-stamped; a hooks regeneration applies after a
//      session restart (the bridge parses its config once per process).
//   3. At apply(): register the twenty lazy-* slash commands from
//      plugins/lazydeepseek/commands/*.md (interactive adapter surface).

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const name = "lazydeepseek";
const inject = ["commands"];

/** Events the dsh-hooks-claude-code bridge carries (M0 probe P-01). */
const BRIDGED_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
const MCP_SERVERS = ["run-ledger", "verification", "status-dashboard", "context-graph", "code-intel", "docs"];

/** Resolve the installed package root, surviving symlinked installs. */
export function resolvePkgRoot() {
  const self = realpathSync(fileURLToPath(import.meta.url)); // <pkg>/lib/index.js
  return dirname(dirname(self));
}

/** Same precedence as @deepseek-ai/dsh-home-paths: $DSH_HOME, then ~/.dsh. */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME;
  return fromEnv && fromEnv.trim() !== "" ? fromEnv : join(homedir(), ".dsh");
}

/** Lowercase each alternative of a simple alternation matcher (dsh tool names are lowercase). */
function lowerMatcher(matcher) {
  return matcher.split("|").map((part) => part.trim().toLowerCase()).join("|");
}

/**
 * Rewrite one hook command: bake the absolute script path and prefix the
 * product env conventions. `${CLAUDE_PROJECT_DIR}` stays as a token for the
 * bridge to substitute per-run (M0 probe P-03 verified the substitution);
 * scripts treat LAZYDEEPSEEK_PROJECT_DIR as advisory (payload cwd is primary).
 */
function absolutizeCommand(command, payloadDir, pkgRoot) {
  let out = command;
  out = out.split("${CLAUDE_PLUGIN_ROOT}").join(payloadDir);
  out = out.split('"').join("'");
  return `LAZYDEEPSEEK_PLUGIN_ROOT='${pkgRoot}' LAZYDEEPSEEK_PROJECT_DIR="\${CLAUDE_PROJECT_DIR}" ${out}`;
}

/** Build the bridge hooks config from the canonical 7-event source manifest. */
export function buildHooksConfig(pkgRoot) {
  const payloadDir = join(pkgRoot, "plugins", "lazydeepseek");
  const source = JSON.parse(readFileSync(join(payloadDir, "hooks", "hooks.json"), "utf8"));
  const hooks = {};
  for (const event of BRIDGED_EVENTS) {
    const groups = source.hooks?.[event];
    if (!Array.isArray(groups)) continue;
    hooks[event] = groups.map((group) => ({
      ...(typeof group.matcher === "string" ? { matcher: lowerMatcher(group.matcher) } : {}),
      hooks: group.hooks.map((hook) => ({
        type: "command",
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

function artifactsPresent(ownDir) {
  if (!existsSync(join(ownDir, "hooks.dsh.json"))) return false;
  if (!existsSync(join(ownDir, "skills"))) return false;
  return MCP_SERVERS.every((server) => existsSync(join(ownDir, "launch", `mcp-${server}.sh`)));
}

/** Idempotent generation of the $DSH_HOME/lazydeepseek runtime tree. */
export function generateRuntimeArtifacts(pkgRoot, home) {
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
  const skillsLink = join(ownDir, "skills");
  const skillsTarget = join(payloadDir, "skills");
  try { rmSync(skillsLink, { recursive: true, force: true }); } catch { /* absent */ }
  symlinkSync(skillsTarget, skillsLink, "dir");
  writeFileSync(stampPath, version);
  process.env.DSH_BUNDLED_SKILL_DIR ??= skillsLink;
  return { ownDir, regenerated: true, version };
}

/** Minimal frontmatter parser for the command markdown sources. */
function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/**
 * Register the twenty lazy-* commands. Each command .md is a thin skill
 * wrapper; the handler splices its body (with $ARGUMENTS substituted) into
 * the receiving agent's inbox so the model executes it through the skill.
 */
function registerCommands(ctx, pkgRoot) {
  const commands = ctx.get("commands");
  if (!commands || typeof commands.register !== "function") {
    ctx.logger?.warn?.("lazydeepseek: commands service unavailable; slash registrations skipped");
    return 0;
  }
  const dir = join(pkgRoot, "plugins", "lazydeepseek", "commands");
  let registered = 0;
  for (const file of readdirSorted(dir)) {
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
          agent.inject({ role: "user", content: [{ type: "text", text: prompt }], source: { kind: "lazydeepseek-command", command: cmd } });
          return { kind: "success", text: `/${cmd} submitted to the agent` };
        }
        return { kind: "success", text: prompt };
      }
    });
    registered += 1;
  }
  return registered;
}

function readdirSorted(dir) {
  return readdirSync(dir).sort();
}

function apply(ctx, config = {}) {
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

// Module-load generation: fail-soft, runs before any service wiring so the
// bridge row (which parses $DSH_HOME/lazydeepseek/hooks.dsh.json once) has the
// best chance of seeing a fresh file on this boot.
try {
  generateRuntimeArtifacts(resolvePkgRoot(), resolveDshHome());
} catch {
  // Applied again (with logging) inside apply(); a silent failure here must
  // never break plugin loading.
}

export { apply, inject, name };
