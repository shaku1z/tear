// pnpm setup:hooks points a clone at the in-repo hooks. It must be idempotent, refuse anything but the
// canonical main checkout, and never replace hooks it does not recognise. Runs in scratch repositories.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PREVIOUS_HOOK_ROOT, hookStatus, setupHooks } from "../../scripts/governance/setup-hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOOKS = path.join(ROOT, "scripts/governance/hooks");
const ORIGIN = "https://github.com/shaku1z/tear.git";
const made = [];

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true });
  expect(result.status, `git ${args.join(" ")}: ${result.stderr}`).toBe(0);
  return String(result.stdout).trim();
}

function scratch({ origin = ORIGIN, branch = "main" } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "tear-setup-hooks-"));
  made.push(repo);
  git(repo, ["init", "--initial-branch", branch]);
  git(repo, ["remote", "add", "origin", origin]);
  return repo;
}

const config = (repo, key) =>
  spawnSync("git", ["config", "--local", "--get", key], { cwd: repo, encoding: "utf8" }).stdout.trim();

afterEach(() => {
  for (const repo of made.splice(0)) fs.rmSync(repo, { recursive: true, force: true });
});

describe("pnpm setup:hooks", { timeout: 60_000 }, () => {
  it("installs the in-repo hooks and owner identity, and running it again changes nothing", () => {
    const repo = scratch();
    expect(setupHooks(repo, { root: repo, hooksRoot: HOOKS }).previous).toBe("none");
    expect(path.resolve(config(repo, "core.hooksPath"))).toBe(path.resolve(HOOKS));
    expect(config(repo, "user.email")).toBe("shatheartboy@gmail.com");
    expect(config(repo, "user.useConfigOnly")).toBe("true");
    expect(config(repo, "tear.governance.repository")).toBe("tear");
    const before = fs.readFileSync(path.join(repo, ".git/config"), "utf8");
    expect(setupHooks(repo, { root: repo, hooksRoot: HOOKS }).previous).toBe("in-repo");
    expect(fs.readFileSync(path.join(repo, ".git/config"), "utf8")).toBe(before);
    expect(hookStatus(repo, { hooksRoot: HOOKS }).state).toBe("in-repo");
  });

  it("refuses a checkout other than the canonical one, a branch other than main, and a different origin", () => {
    const repo = scratch();
    expect(() => setupHooks(repo, { root: path.join(repo, "other"), hooksRoot: HOOKS })).toThrow(/canonical checkout/u);
    const feature = scratch({ branch: "codex/x" });
    expect(() => setupHooks(feature, { root: feature, hooksRoot: HOOKS })).toThrow(/canonical main/u);
    const fork = scratch({ origin: "https://github.com/someone/tear.git" });
    expect(() => setupHooks(fork, { root: fork, hooksRoot: HOOKS })).toThrow(/origin mismatch/u);
    expect(config(fork, "core.hooksPath")).toBe("");
  });

  it("refuses to replace an unknown hooks path or hooks already in .git/hooks", () => {
    const repo = scratch();
    git(repo, ["config", "--local", "core.hooksPath", "custom-hooks"]);
    expect(() => setupHooks(repo, { root: repo, hooksRoot: HOOKS })).toThrow(/unknown core.hooksPath/u);
    expect(config(repo, "core.hooksPath")).toBe("custom-hooks");
    const other = scratch();
    fs.writeFileSync(path.join(other, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 0\n");
    expect(() => setupHooks(other, { root: other, hooksRoot: HOOKS })).toThrow(/existing active hooks/u);
  });

  it.runIf(fs.existsSync(PREVIOUS_HOOK_ROOT))("replaces the shared skill hooks this repository used before", () => {
    const repo = scratch();
    git(repo, ["config", "--local", "core.hooksPath", PREVIOUS_HOOK_ROOT.replaceAll("\\", "/")]);
    expect(hookStatus(repo, { hooksRoot: HOOKS }).state).toBe("shared");
    expect(setupHooks(repo, { root: repo, hooksRoot: HOOKS }).previous).toBe("shared");
    expect(hookStatus(repo, { hooksRoot: HOOKS }).state).toBe("in-repo");
  });

  /** A scratch repository with one linked worktree whose config.worktree sets core.hooksPath. */
  function withWorktreeOverride(hooksPath) {
    const repo = scratch();
    git(repo, ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--allow-empty", "-m", "base"]);
    const linked = `${repo}-linked`;
    made.push(linked);
    git(repo, ["worktree", "add", "-q", "-b", "codex/linked", linked]);
    git(repo, ["config", "--local", "extensions.worktreeConfig", "true"]);
    git(linked, ["config", "--worktree", "core.hooksPath", hooksPath.replaceAll("\\", "/")]);
    return { repo, linked };
  }

  it.runIf(fs.existsSync(PREVIOUS_HOOK_ROOT))(
    "clears a linked worktree's stale override to the shared hooks, and check:hooks names it until then",
    () => {
      const { repo, linked } = withWorktreeOverride(PREVIOUS_HOOK_ROOT);
      const before = hookStatus(linked, { hooksRoot: HOOKS });
      expect(before.state).toBe("worktree-override");
      expect(before.worktrees.map((entry) => path.resolve(entry))).toEqual([path.resolve(linked)]);
      // Seen from the main checkout too, so the canonical check reports every worktree.
      expect(hookStatus(repo, { hooksRoot: HOOKS }).state).toBe("worktree-override");
      const result = setupHooks(repo, { root: repo, hooksRoot: HOOKS });
      expect(result.clearedWorktrees.map((entry) => path.resolve(entry))).toEqual([path.resolve(linked)]);
      expect(hookStatus(linked, { hooksRoot: HOOKS }).state).toBe("in-repo");
      expect(path.resolve(git(linked, ["config", "--get", "core.hooksPath"]))).toBe(path.resolve(HOOKS));
    },
  );

  it("refuses, and changes nothing, when a worktree overrides the hooks path with one it does not know", () => {
    const { repo, linked } = withWorktreeOverride(path.join(os.tmpdir(), "somebody-elses-hooks"));
    expect(() => setupHooks(repo, { root: repo, hooksRoot: HOOKS })).toThrow(/unknown per-worktree core.hooksPath/u);
    expect(git(linked, ["config", "--worktree", "--get", "core.hooksPath"])).toMatch(/somebody-elses-hooks$/u);
    expect(config(repo, "core.hooksPath")).toBe("");
  });

  it("reports a clone with no hooks", () => {
    expect(hookStatus(scratch(), { hooksRoot: HOOKS }).state).toBe("none");
  });

  it("keeps the hook wrappers free of CRLF, which Git for Windows' sh would not run", () => {
    for (const name of fs.readdirSync(HOOKS))
      expect(fs.readFileSync(path.join(HOOKS, name), "utf8")).not.toMatch(/\r/u);
  });
});
