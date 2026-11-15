// Points the Tear game repository's Git hooks at scripts/governance/hooks/ in the canonical checkout,
// and pins the owner identity the guard checks. Adapted from install-owner-guards.mjs in the shared
// governance skill, which still installs the shared hooks for the music and wiki repositories.
//
//   node scripts/governance/setup-hooks.mjs            install (canonical main checkout only; idempotent)
//   node scripts/governance/setup-hooks.mjs --check    report whether the in-repo hooks are active (read-only)
//
// Linked worktrees share the main repository's config, so one install covers every worktree. The
// hooks path is absolute and points into the canonical checkout, which stays on main: a feature
// branch cannot weaken the guard that checks its own commits.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { EXPECTED_HOOK_ROOT, OWNER } from "./tear-git-guard.mjs";

export const CANONICAL = Object.freeze({
  id: "tear",
  root: "C:\\Users\\realm\\Desktop\\game\\Tear",
  origin: "https://github.com/shaku1z/tear.git",
});
// The shared hooks this repository used before; replacing them with the in-repo hooks is allowed.
export const PREVIOUS_HOOK_ROOT = "C:\\Users\\realm\\.codex\\skills\\tear-program-governance\\hooks";
export const HOOK_NAMES = Object.freeze([
  "pre-commit",
  "commit-msg",
  "pre-merge-commit",
  "prepare-commit-msg",
  "pre-push",
]);
const CONFIG_KEYS = Object.freeze([
  "user.name",
  "user.email",
  "author.name",
  "author.email",
  "committer.name",
  "committer.email",
  "user.useConfigOnly",
  "core.hooksPath",
  "tear.governance.repository",
  "tear.governance.expectedOrigin",
  "tear.governance.gitCommonDir",
  "tear.governance.ownerName",
  "tear.governance.ownerEmail",
]);

class SetupFailure extends Error {}

function fail(message) {
  throw new SetupFailure(message);
}

function runGit(repo, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) fail("git could not start: " + result.error.message);
  if (!allowFailure && result.status !== 0) {
    fail("git " + args.join(" ") + " failed: " + String(result.stderr || result.stdout || "").trim());
  }
  return result;
}

function gitText(repo, args) {
  return String(runGit(repo, args).stdout ?? "").trim();
}

function configValues(repo, key) {
  const result = runGit(repo, ["config", "--local", "--get-all", key], { allowFailure: true });
  if (result.status !== 0) return [];
  return String(result.stdout ?? "")
    .split(/\r?\n/u)
    .filter((value) => value.length > 0);
}

function configValue(repo, key) {
  return configValues(repo, key)[0] ?? "";
}

export function samePath(left, right) {
  const normalize = (value) => path.resolve(String(value)).replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function normalizedRemote(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/u, "")
    .toLowerCase();
}

function resolveGitPath(repo, value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(repo, value);
}

/** Every hook file is present and is a wrapper that runs the guard; nothing else is in the folder. */
export function assertHookFolder(folder) {
  if (!fs.existsSync(folder)) fail("hook folder is missing: " + folder);
  for (const name of HOOK_NAMES) {
    const hookPath = path.join(folder, name);
    if (!fs.existsSync(hookPath) || !fs.statSync(hookPath).isFile()) fail("hook is missing: " + hookPath);
    if (!fs.readFileSync(hookPath, "utf8").includes("tear-git-guard.mjs"))
      fail("hook is not a guard wrapper: " + hookPath);
  }
  const unexpected = fs
    .readdirSync(folder)
    .filter((name) => !HOOK_NAMES.includes(name) && name !== ".gitkeep" && !name.endsWith(".sample"));
  if (unexpected.length > 0) fail("hook folder contains unexpected files: " + unexpected.join(", "));
}

function activeHookEntries(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && !entry.name.endsWith(".sample") && entry.name !== "README" && !entry.name.startsWith("."),
    )
    .map((entry) => entry.name);
}

/** Refuse to replace hooks this script did not put there, other than the known shared hooks. */
export function assertReplaceableHooks(repo, configured, expectedHooksPath) {
  if (configured) {
    const active = resolveGitPath(repo, configured);
    if (samePath(active, expectedHooksPath)) return "in-repo";
    if (samePath(active, PREVIOUS_HOOK_ROOT)) {
      assertHookFolder(active);
      return "shared";
    }
    fail("an unknown core.hooksPath is active; preserved and refusing to replace: " + configured);
  }
  const existing = activeHookEntries(resolveGitPath(repo, gitText(repo, ["rev-parse", "--git-path", "hooks"])));
  if (existing.length > 0)
    fail("existing active hooks found in .git/hooks; preserved and refusing to replace: " + existing.join(", "));
  return "none";
}

function assertCanonicalRepository(repo, root) {
  const top = path.resolve(gitText(repo, ["rev-parse", "--show-toplevel"]));
  if (!samePath(top, root)) fail("run this from the canonical checkout " + root + ", not " + top);
  const branch = gitText(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch !== "main")
    fail("install only from the canonical main checkout; found branch " + (branch || "(detached)"));
  const origin = configValue(repo, "remote.origin.url");
  if (normalizedRemote(origin) !== normalizedRemote(CANONICAL.origin)) {
    fail("exact origin mismatch: expected " + CANONICAL.origin + ", found " + (origin || "(missing)"));
  }
  const pushUrls = configValues(repo, "remote.origin.pushurl");
  if (pushUrls.some((value) => normalizedRemote(value) !== normalizedRemote(CANONICAL.origin))) {
    fail("remote.origin.pushurl is not the exact canonical origin; refusing to change or hide it");
  }
}

function snapshotConfig(repo) {
  return new Map(CONFIG_KEYS.map((key) => [key, configValues(repo, key)]));
}

function restoreConfig(repo, snapshot) {
  for (const key of CONFIG_KEYS) {
    runGit(repo, ["config", "--local", "--unset-all", key], { allowFailure: true });
    for (const value of snapshot.get(key) ?? [])
      runGit(repo, ["config", "--local", "--add", key, value], { allowFailure: true });
  }
}

/** Install. `root` is overridable only so tests can use a scratch repository. */
export function setupHooks(repoArgument, { root = CANONICAL.root, hooksRoot = EXPECTED_HOOK_ROOT } = {}) {
  const repo = path.resolve(repoArgument);
  const expectedHooksPath = path.resolve(hooksRoot);
  assertHookFolder(expectedHooksPath);
  assertCanonicalRepository(repo, root);
  if (!samePath(expectedHooksPath, path.join(root, "scripts", "governance", "hooks")) && root === CANONICAL.root) {
    fail("run the copy of this script inside the canonical checkout, so the hooks path points into it");
  }
  const previous = assertReplaceableHooks(repo, configValue(repo, "core.hooksPath"), expectedHooksPath);
  const commonDir = resolveGitPath(repo, gitText(repo, ["rev-parse", "--git-common-dir"]));
  const snapshot = snapshotConfig(repo);
  const settings = new Map([
    ["user.name", OWNER.name],
    ["user.email", OWNER.email],
    ["author.name", OWNER.name],
    ["author.email", OWNER.email],
    ["committer.name", OWNER.name],
    ["committer.email", OWNER.email],
    ["user.useConfigOnly", "true"],
    ["core.hooksPath", expectedHooksPath.replaceAll("\\", "/")],
    ["tear.governance.repository", CANONICAL.id],
    ["tear.governance.expectedOrigin", CANONICAL.origin],
    ["tear.governance.gitCommonDir", commonDir.replaceAll("\\", "/")],
    ["tear.governance.ownerName", OWNER.name],
    ["tear.governance.ownerEmail", OWNER.email],
  ]);
  try {
    for (const [key, value] of settings) {
      const result = runGit(repo, ["config", "--local", "--replace-all", key, value], { allowFailure: true });
      if (result.status !== 0) fail("could not set " + key + ": " + String(result.stderr || "").trim());
    }
  } catch (error) {
    restoreConfig(repo, snapshot);
    throw error;
  }
  return { repo, previous, hooksPath: expectedHooksPath };
}

/** Read-only status for this clone or worktree. */
export function hookStatus(
  cwd = process.cwd(),
  { hooksRoot = path.join(CANONICAL.root, "scripts", "governance", "hooks") } = {},
) {
  const configured = configValue(cwd, "core.hooksPath");
  if (!configured) return { state: "none", configured, message: "no core.hooksPath: commits here are not guarded" };
  const active = resolveGitPath(cwd, configured);
  if (samePath(active, hooksRoot)) return { state: "in-repo", configured, message: "in-repo hooks active" };
  if (samePath(active, PREVIOUS_HOOK_ROOT))
    return {
      state: "shared",
      configured,
      message: "shared skill hooks active; run pnpm setup:hooks from the canonical checkout to switch",
    };
  return { state: "other", configured, message: "an unknown hooks path is active: " + configured };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const unknown = argv.filter((value) => value !== "--check");
    if (unknown.length > 0) fail("unknown option " + unknown.join(" ") + "; usage: setup-hooks.mjs [--check]");
    if (argv.includes("--check")) {
      const status = hookStatus();
      const log = status.state === "in-repo" ? console.log : console.warn;
      log("[tear-governance] " + status.message);
      return 0;
    }
    const result = setupHooks(process.cwd());
    console.log("[tear-governance] hooks path set to " + result.hooksPath + " (previously " + result.previous + ")");
    return 0;
  } catch (error) {
    console.error("[tear-governance] setup refused: " + (error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
