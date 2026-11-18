// `pnpm leftovers`: a read-only report of what `pnpm who` and `pnpm merge:batch --prune` do not show.
// It never deletes, moves, fetches or writes anything. It lists:
// - local branches whose work is already on origin/main, including squash-merged ones;
// - tracked files that the ignore rules now ignore;
// - files and folders beside the repository that no worktree owns, with sizes. Only the folders that
//   hold linked worktrees are scanned, never the folder that holds the main checkout, even when a
//   linked worktree also sits there: that is the owner's workspace (other repositories, archives,
//   governing files), not a place worktrees pile up;
// - separately, and never sized, what beside it must not be removed: other git repositories or
//   worktrees (anything with a `.git`) and the known folders in KNOWN_FOLDERS;
// - per worktree, the size of its build output and cache folders.
// The known folders (the locked comparison copy, the archive) are listed by name only and never read.
// `--json` prints the report as JSON; `--no-gh` skips the merged pull request lookup.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseWorktreePorcelain } from "./who.mjs";

/** Build output and cache folders whose size is reported per worktree. All are git-ignored. */
export const CACHE_PATHS = Object.freeze([
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".wrangler",
  "wiki/.cache",
  "node_modules/.vite",
  "node_modules/.cache",
]);
/** Entries counted per leftover; a larger folder reports "at least" its partial size. */
export const ENTRY_BUDGET = 50_000;
/**
 * Folders beside the repository that are never leftovers, by lower-case name, with what they are.
 * They are listed by name only and never read. This is the one list; add a folder here, not a check.
 */
export const KNOWN_FOLDERS = Object.freeze({
  "tear-oracle": "locked comparison copy",
  "tear-archives": "archive",
});

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0 && !result.error, stdout: String(result.stdout ?? "").trim() };
}

/** Strips the Windows extended-length prefix (`\\?\C:\…`, `\\?\UNC\server\…`) and resolves the path. */
export function normalizePath(target) {
  let value = String(target);
  if (value.startsWith("\\\\?\\UNC\\")) value = `\\\\${value.slice(8)}`;
  else if (value.startsWith("\\\\?\\") || value.startsWith("//?/")) value = value.slice(4);
  return path.resolve(value);
}

function samePath(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(parent, child) {
  const relative = path.relative(normalizePath(parent), normalizePath(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** What a path inside a known folder is (`archive`, …), or undefined. */
export function knownFolderKind(target) {
  const segment = normalizePath(target)
    .split(/[\\/]+/u)
    .find((part) => Object.hasOwn(KNOWN_FOLDERS, part.toLowerCase()));
  return segment === undefined ? undefined : KNOWN_FOLDERS[segment.toLowerCase()];
}

export function isProtectedPath(target) {
  return knownFolderKind(target) !== undefined;
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

/** Size in bytes, never following a link (a link counts as zero); stops after `maxEntries` entries. */
export function measure(target, maxEntries = Number.POSITIVE_INFINITY) {
  const stat = lstatOrNull(target);
  if (stat === null || stat.isSymbolicLink()) return { bytes: 0, complete: true };
  if (!stat.isDirectory()) return { bytes: stat.size, complete: true };
  let total = 0;
  let seen = 0;
  const pending = [target];
  while (pending.length > 0) {
    if (seen >= maxEntries) return { bytes: total, complete: false };
    const folder = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    seen += entries.length;
    for (const entry of entries) {
      const child = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile()) total += lstatOrNull(child)?.size ?? 0;
    }
  }
  return { bytes: total, complete: true };
}

/**
 * Local branches whose work is on `base`: the tip is an ancestor of it, every commit has a patch-equivalent
 * on it (`git cherry`), or `mergedHeads` (merged pull request heads from gh) holds the exact tip.
 */
export function mergedBranches(root, base, mergedHeads = new Set()) {
  const listed = run("git", ["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"], root);
  if (!listed.ok) return [];
  const merged = [];
  for (const line of listed.stdout.split(/\r?\n/u).filter(Boolean)) {
    const [branch, tip] = line.split(" ");
    if (branch === "main" || branch === base) continue;
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", tip, base], { cwd: root, windowsHide: true });
    if (ancestor.status === 0) merged.push({ branch, how: "ancestor of the base" });
    else if (mergedHeads.has(tip)) merged.push({ branch, how: "pull request merged at this tip" });
    else {
      const cherry = run("git", ["cherry", base, tip], root);
      const lines = cherry.stdout.split(/\r?\n/u).filter(Boolean);
      if (cherry.ok && lines.length > 0 && lines.every((entry) => entry.startsWith("-")))
        merged.push({ branch, how: "every commit is on the base" });
    }
  }
  return merged;
}

function mergedPullRequestHeads(root) {
  const result = run("gh", ["pr", "list", "--state", "merged", "--limit", "300", "--json", "headRefOid"], root);
  if (!result.ok) return null;
  try {
    return new Set(JSON.parse(result.stdout).map((pr) => pr.headRefOid));
  } catch {
    return null;
  }
}

/** Tracked files that the current ignore rules would ignore. */
export function ignoredTrackedFiles(root) {
  const result = run("git", ["ls-files", "-ci", "--exclude-standard"], root);
  return result.ok ? result.stdout.split(/\r?\n/u).filter(Boolean) : [];
}

/**
 * Entries in `folders` that are not a registered worktree and contain none. `kind` is `leftover`,
 * `other repository` (it has a `.git`: another repository, or a worktree of one) or a KNOWN_FOLDERS
 * kind. Only leftovers are sized; the others are listed by name and never read.
 */
export function leftovers(worktreePaths, folders) {
  const rows = [];
  for (const folder of [...new Set(folders.map((entry) => normalizePath(entry)))]) {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(folder, entry.name);
      if (worktreePaths.some((worktree) => samePath(worktree, absolute) || isInside(absolute, worktree))) continue;
      const known = knownFolderKind(absolute);
      const repository = entry.isDirectory() && lstatOrNull(path.join(absolute, ".git")) !== null;
      const kind = known ?? (repository ? "other repository" : "leftover");
      const size = kind === "leftover" ? measure(absolute, ENTRY_BUDGET) : { bytes: null, complete: false };
      rows.push({ path: absolute, kind, ...size });
    }
  }
  return rows;
}

function cacheSizes(worktreePath) {
  if (isProtectedPath(worktreePath)) return [];
  return CACHE_PATHS.map((relative) => ({ relative, absolute: path.join(worktreePath, ...relative.split("/")) }))
    .filter((entry) => lstatOrNull(entry.absolute) !== null)
    .map((entry) => ({ relative: entry.relative, bytes: measure(entry.absolute).bytes }));
}

export function report(root, { base = "origin/main", gh = true, besideFolders } = {}) {
  const porcelain = run("git", ["worktree", "list", "--porcelain"], root);
  if (!porcelain.ok) throw new Error("git worktree list failed");
  const worktrees = parseWorktreePorcelain(porcelain.stdout).map((worktree) => normalizePath(worktree.path));
  const heads = gh ? mergedPullRequestHeads(root) : null;
  // The first entry is the main checkout; the folder holding it is never scanned (see the header).
  const workspace = path.dirname(worktrees[0]);
  const folders =
    besideFolders ??
    [...new Set(worktrees.slice(1).map((worktree) => path.dirname(worktree)))].filter(
      (folder) => !samePath(folder, workspace),
    );
  return {
    base,
    scannedFolders: [...new Set(folders.map((folder) => normalizePath(folder)))],
    mergedBranches: mergedBranches(root, base, heads ?? new Set()),
    pullRequestLookup: !gh ? "skipped" : heads === null ? "unavailable" : "done",
    ignoredTrackedFiles: ignoredTrackedFiles(root),
    leftovers: leftovers(worktrees, folders),
    caches: worktrees.map((worktree) => ({
      worktree,
      protected: isProtectedPath(worktree),
      folders: fs.existsSync(worktree) ? cacheSizes(worktree) : [],
    })),
  };
}

export function formatBytes(bytes) {
  if (bytes === null) return "not measured";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function render(result) {
  const lines = [`Local branches whose work is on ${result.base} (remove with \`git branch -d\` after checking):`];
  for (const entry of result.mergedBranches) lines.push(`  ${entry.branch}  (${entry.how})`);
  if (result.pullRequestLookup === "unavailable") lines.push("  gh unavailable: squash-merged branches may be missing");
  lines.push("", "Tracked files the ignore rules now ignore:");
  for (const file of result.ignoredTrackedFiles) lines.push(`  ${file}`);
  lines.push(
    "",
    `Beside the repository, owned by no worktree (check before removing), in ${result.scannedFolders.join(", ")}:`,
  );
  for (const entry of result.leftovers.filter((row) => row.kind === "leftover"))
    lines.push(`  ${entry.path}  ${entry.complete ? "" : "at least "}${formatBytes(entry.bytes)}`);
  lines.push("", "Beside the repository and never to be removed by this report (not read):");
  for (const entry of result.leftovers.filter((row) => row.kind !== "leftover"))
    lines.push(`  ${entry.path}  ${entry.kind}`);
  lines.push("", "Build output and caches per worktree:");
  for (const row of result.caches) {
    if (row.protected) lines.push(`  ${row.worktree}  protected, not read`);
    else if (row.folders.length > 0)
      lines.push(
        `  ${row.worktree}  ${row.folders.map((entry) => `${entry.relative} ${formatBytes(entry.bytes)}`).join(", ")}`,
      );
  }
  lines.push("", "Nothing was changed. Worktree state (dirty, stale, junctions) is in `pnpm who`.");
  return lines.join("\n");
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => !["--json", "--no-gh"].includes(argument));
  if (unknown.length > 0) {
    console.error(`Usage: node scripts/leftovers.mjs [--json] [--no-gh]\nunknown: ${unknown.join(" ")}`);
    process.exitCode = 1;
    return;
  }
  const result = report(root, { gh: !args.includes("--no-gh") });
  console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : render(result));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
