// TypeScript source of the prebuilt ESM adapter; keep implementation identical.
// LazyDeepSeek v1.3.4 — DeepSeek Harness (dsh) plugin shim.
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
//      $DSH_HOME/lazydeepseek/runtimes/<identity>/ consumed by the bundle patch rows:
//        hooks.dsh.json        bridge config, absolute command paths
//        launch/mcp-<name>.sh  six MCP stdio launchers
//        skills/ copied complete skill bundles (rank 600)
//      Regeneration is profile/package-content-addressed; a hooks regeneration applies after a
//      session restart (the bridge parses its config once per process).
//   3. At apply(): register the twenty lazy-* slash commands from
//      plugins/lazydeepseek/commands/*.md (interactive adapter surface).

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";

const name = "lazydeepseek";
const inject = ["commands"];

/** Events the dsh-hooks-claude-code bridge carries (M0 probe P-01). */
const BRIDGED_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SubagentStart", "SubagentStop"];
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
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  const out = command.replace(/"\$\{CLAUDE_PLUGIN_ROOT\}([^"\n]*)"/g, (_, suffix) => quote(payloadDir + suffix));
  return `LAZYDEEPSEEK_PLUGIN_ROOT=${quote(pkgRoot)} LAZYDEEPSEEK_PROJECT_DIR="$CLAUDE_PROJECT_DIR" ${out}`;
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
    _lazydeepseek: `LazyDeepSeek v1.3.5 generated hook surface for the dsh-hooks-claude-code bridge. Seven events are bridged (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop); PermissionRequest and PostToolUseFailure do not exist on the bridge and are synthesized inside the PreToolUse/PostToolUse handlers (degraded; see contracts/dsh-hook-consumers.v1.json). Commands carry absolute paths baked at generation; Project binding uses the bridge-provided CLAUDE_PROJECT_DIR environment without inserting the raw project path into shell text. Hooks print EITHER strict JSON in the bridge shape ({"hookSpecificOutput": {"hookEventName": "<Event>", "additionalContext": "..."}}; the 0.2.0-rc.2 codec reads additionalContext ONLY from hookSpecificOutput) OR nothing on stdout; deny = exit 2 with stderr reason; diagnostics to stderr; no network I/O.`,
    hooks
  };
}

const USER_INVOCABLE_COMMANDS = [
  'lazy-handoff', 'lazy-new-run', 'lazy-offboard', 'lazy-onboard', 'lazy-ralph-loop',
  'lazy-resume', 'lazy-status', 'lazy-stop-continuation', 'lazy-update', 'lazy-verify',
];

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function sourceDigest(root) {
  const hash = createHash('sha256');
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', '__pycache__', '.pytest_cache'].includes(entry.name)) walk(file);
      else if (entry.isDirectory() || entry.name.endsWith('.pyc')) continue;
      else if (entry.isFile()) hash.update(file.slice(root.length)).update(readFileSync(file));
      else throw new Error(`unsupported package source entry: ${file}`);
    }
  }
  walk(join(root, 'plugins', 'lazydeepseek'));
  for (const file of ['package.json', 'cordis.patch.yml', 'lib/index.mjs']) hash.update(readFileSync(join(root, file)));
  return hash.digest('hex');
}
function inventory(root) {
  const entries = [];
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = join(dir, item.name);
      const relative = file.slice(root.length + 1);
      if (relative === 'receipt.json') continue;
      if (item.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(file); }
      else if (item.isFile() && lstatSync(file).nlink === 1) entries.push({ path: relative, kind: 'file', sha256: sha(readFileSync(file)) });
      else throw new Error(`linked runtime artifact refused: ${file}`);
    }
  }
  walk(root); return entries;
}
export function verifyRuntimeArtifacts(ownDir, identity) {
  if (!/^[a-f0-9]{64}$/.test(identity) || basename(ownDir) !== identity || basename(dirname(ownDir)) !== 'runtimes' || basename(dirname(dirname(ownDir))) !== name) throw new Error('runtime namespace identity refused');
  for (const dir of [ownDir, dirname(ownDir), dirname(dirname(ownDir))]) {
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error('linked runtime root refused');
  }
  const receiptStat = lstatSync(join(ownDir, 'receipt.json'));
  if (!receiptStat.isFile() || receiptStat.isSymbolicLink() || receiptStat.nlink !== 1) throw new Error('linked runtime receipt refused');
  const receipt = JSON.parse(readFileSync(join(ownDir, 'receipt.json'), 'utf8'));
  if (receipt.owner !== name || receipt.identity !== identity || JSON.stringify(receipt.files) !== JSON.stringify(inventory(ownDir))) throw new Error('runtime ownership or content mismatch; preserving artifacts');
  return receipt;
}
export function removeRuntimeArtifacts(ownDir, identity, hostRemoved = false) {
  if (!hostRemoved) throw new Error('remove the selected host bundle and verify its rows are absent first');
  const receipt = verifyRuntimeArtifacts(ownDir, identity);
  for (const item of [...receipt.files].reverse()) {
    const file = join(ownDir, item.path);
    if (item.kind === 'directory') rmdirSync(file);
    else rmSync(file);
  }
  rmSync(join(ownDir, 'receipt.json'));
  rmdirSync(ownDir);
}
export function generateRuntimeArtifacts(pkgRoot, home, profile = 'fixture') {
  pkgRoot = realpathSync(pkgRoot);
  const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
  const identity = sha(JSON.stringify({ pkgRoot, content: sourceDigest(pkgRoot), profile }));
  const base = join(home, 'lazydeepseek');
  for (const dir of [home, base, join(base, 'runtimes')]) {
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('linked runtime parent refused');
    mkdirSync(dir, { recursive: true });
  }
  const ownDir = join(base, 'runtimes', identity);
  if (existsSync(ownDir)) {
    verifyRuntimeArtifacts(ownDir, identity);
    return { ownDir, identity, regenerated: false, version };
  }
  mkdirSync(ownDir);
  mkdirSync(join(ownDir, 'launch'));
  mkdirSync(join(ownDir, 'skills'));
  const payload = join(pkgRoot, 'plugins', 'lazydeepseek');
  writeFileSync(join(ownDir, 'hooks.dsh.json'), JSON.stringify(buildHooksConfig(pkgRoot), null, 2) + '\n');
  for (const server of MCP_SERVERS) {
    const script = join(payload, 'mcp', server, 'server.sh').replaceAll("'", "'\\''");
    writeFileSync(join(ownDir, 'launch', `mcp-${server}.sh`), `#!/usr/bin/env bash\nexec bash '${script}' "$@"\n`, { mode: 0o755 });
  }
  const skills = join(payload, 'skills');
  for (const entry of readdirSync(skills).sort()) {
    if (!existsSync(join(skills, entry, 'SKILL.md'))) continue;
    cpSync(join(skills, entry), join(ownDir, 'skills', entry), { recursive: true });
  }
  for (const command of USER_INVOCABLE_COMMANDS) {
    const text = readFileSync(join(payload, 'commands', `${command}.md`), 'utf8');
    const description = parseFrontmatter(text).description ?? command;
    mkdirSync(join(ownDir, 'skills', command));
    writeFileSync(join(ownDir, 'skills', command, 'SKILL.md'), `---\nname: ${command}\ndescription: ${JSON.stringify(description)}\nuser-invocable: true\ndisable-model-invocation: true\n---\n${text.replace(/^---\n[\s\S]*?\n---\n/, '')}`);
  }
  writeFileSync(join(ownDir, 'receipt.json'), JSON.stringify({ owner: name, identity, package_root: pkgRoot, profile, version, files: inventory(ownDir) }, null, 2) + '\n', { mode: 0o600 });
  return { ownDir, identity, regenerated: true, version };
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
 * the receiving agent's follow-up inbox and wakes its driver.
 */
export function registerCommands(ctx, pkgRoot) {
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
    const definition = {
      name: cmd,
      description: frontmatter.description ?? `LazyDeepSeek ${cmd} command`,
      ...(frontmatter["argument-hint"] ? { input: { hint: frontmatter["argument-hint"] } } : {}),
      handler: ({ agent, rawInput = "" }) => {
        const prompt = body.split("$ARGUMENTS").join(String(rawInput));
        if (agent && typeof agent.followup === "function") {
          agent.followup({ id: randomUUID(), role: "user", content: [{ type: "text", text: prompt }], source: { kind: "user" } });
          return { kind: "success", text: `/${cmd} submitted to the agent` };
        }
        return { kind: "error", text: `/${cmd} requires a receiving agent` };
      }
    };
    if (typeof ctx.effect === "function") ctx.effect(() => commands.register(definition));
    else commands.register(definition);
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
    const profile = ctx.get("profileContext")?.dir;
    if (!profile) throw new Error("profile context unavailable");
    const result = generateRuntimeArtifacts(pkgRoot, home, profile);
    ctx.provide("lazydeepseekRuntime", { path: (...parts) => join(result.ownDir, ...parts), identity: result.identity });
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

export { apply, inject, name };
