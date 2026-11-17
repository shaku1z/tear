// `pnpm leftovers` (scripts/leftovers.mjs) is read-only. Every case builds a throwaway repository in the system
// temp folder and checks that the report changes nothing; none touches this checkout or calls gh.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatBytes, isProtectedPath, measure, normalizePath, report } from "../../scripts/leftovers.mjs";

const scratch = [];

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function write(file, text = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeRepository() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tear-leftovers-test-")));
  scratch.push(home);
  const repo = path.join(home, "Tear");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  write(path.join(repo, ".gitignore"), "dist/\ncoverage/\n");
  write(path.join(repo, "src", "game.ts"), "export {};\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  return { home, repo };
}

function addWorktree(repo, home, name, branch) {
  const target = path.join(home, "worktrees", name);
  git(repo, "worktree", "add", "-q", "-b", branch, target, "main");
  return target;
}

function snapshot(folder) {
  return fs
    .readdirSync(folder, { recursive: true })
    .map(String)
    .filter((entry) => !entry.split(/[\\/]/u).includes(".git"))
    .sort();
}

const run = (repo, home) =>
  report(repo, { base: "main", gh: false, besideFolders: [home, path.join(home, "worktrees")] });

afterEach(() => {
  for (const folder of scratch.splice(0)) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
});

describe("pnpm leftovers", () => {
  it("lists merged and patch-equivalent branches but not unmerged ones, and deletes nothing", () => {
    const { home, repo } = makeRepository();
    addWorktree(repo, home, "Tear-merged", "codex/merged");
    const open = addWorktree(repo, home, "Tear-open", "codex/open");
    write(path.join(open, "src", "new.ts"), "export const x = 1;\n");
    git(open, "add", ".");
    git(open, "commit", "-q", "-m", "unmerged work");
    const picked = addWorktree(repo, home, "Tear-picked", "codex/picked");
    write(path.join(picked, "src", "picked.ts"), "export const y = 2;\n");
    git(picked, "add", ".");
    git(picked, "commit", "-q", "-m", "picked work");
    git(repo, "cherry-pick", "codex/picked");
    const before = snapshot(home);
    const result = run(repo, home);
    expect(result.mergedBranches.map((entry) => entry.branch).sort()).toEqual(["codex/merged", "codex/picked"]);
    expect(snapshot(home)).toEqual(before);
    expect(git(repo, "branch", "--list", "codex/*")).toMatch(/codex\/merged[\s\S]*codex\/open[\s\S]*codex\/picked/u);
  }, 60_000);

  it("reports leftovers with sizes, ignored tracked files and cache sizes, and never reads the protected copy", () => {
    const { home, repo } = makeRepository();
    write(path.join(home, "worktrees", "old-gate.log"), "log");
    write(path.join(home, "Tear-oracle", "secret.txt"), "not read");
    write(path.join(repo, "dist", "index.js"), "a".repeat(2048));
    write(path.join(repo, "coverage", "tracked.txt"));
    git(repo, "add", "-f", "coverage/tracked.txt");
    git(repo, "commit", "-q", "-m", "track an ignored file");
    const result = run(repo, home);
    const byName = new Map(result.leftovers.map((entry) => [path.basename(entry.path), entry]));
    expect(byName.get("old-gate.log")).toMatchObject({ bytes: 3, complete: true });
    expect(byName.get("Tear-oracle")).toMatchObject({ protected: true, bytes: null });
    expect(byName.has("Tear")).toBe(false);
    expect(result.ignoredTrackedFiles).toEqual(["coverage/tracked.txt"]);
    const main = result.caches.find((row) => normalizePath(row.worktree) === normalizePath(repo));
    expect(main.folders.find((entry) => entry.relative === "dist").bytes).toBe(2048);
  }, 60_000);

  it("never follows a link when sizing and stops at the entry budget", () => {
    const { home, repo } = makeRepository();
    write(path.join(home, "outside", "big.bin"), "b".repeat(4096));
    fs.symlinkSync(path.join(home, "outside"), path.join(repo, "dist"), "junction");
    expect(measure(path.join(repo, "dist"))).toEqual({ bytes: 0, complete: true });
    for (let index = 0; index < 5; index += 1) write(path.join(home, "many", "sub", `f${String(index)}`), "12");
    expect(measure(path.join(home, "many"), 1)).toEqual({ bytes: 0, complete: false });
    expect(measure(path.join(home, "many"))).toEqual({ bytes: 10, complete: true });
  }, 60_000);

  it("reads Windows extended-length paths and recognises the protected copy", () => {
    expect(normalizePath("\\\\?\\C:\\game\\Tear")).toBe(path.resolve("C:\\game\\Tear"));
    expect(normalizePath("\\\\?\\UNC\\server\\share\\Tear")).toBe(path.resolve("\\\\server\\share\\Tear"));
    expect(isProtectedPath("\\\\?\\C:\\game\\Tear-oracle\\dist")).toBe(true);
    expect(isProtectedPath("C:\\game\\Tear")).toBe(false);
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
