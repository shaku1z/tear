// Files this checkout changes relative to main: committed since the merge base with origin/main,
// plus staged, unstaged and untracked files. Used by `--changed` in scripts/format.mjs and
// scripts/lint.mjs, which the fast check group runs.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

/** Existing changed files, repository-relative with forward slashes. */
export function changedFiles(root, base = "origin/main") {
  const [mergeBase] = git(root, ["merge-base", base, "HEAD"]);
  const files = new Set([
    ...git(root, ["diff", "--name-only", "--diff-filter=d", `${mergeBase}...HEAD`]),
    ...git(root, ["diff", "--name-only", "--diff-filter=d", "HEAD"]),
    ...git(root, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...files].filter((file) => existsSync(resolve(root, file))).sort();
}

/** Whether `file` lies inside one of `targets` (directories, files, or simple `*` globs at the root). */
export function withinTargets(file, targets) {
  return targets.some((target) => {
    if (target.includes("*")) {
      const pattern = new RegExp(`^${target.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*")}$`, "u");
      return pattern.test(file);
    }
    return file === target || file.startsWith(`${target}/`);
  });
}
