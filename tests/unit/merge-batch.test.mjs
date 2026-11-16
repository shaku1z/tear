// pnpm merge:batch: choosing members, recording them in Validate, and the after-merge tree check.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  batchBranch,
  chooseMembers,
  failedChecks,
  formatMembers,
  parseMembers,
  treeVerdict,
} from "../../scripts/merge-batch.mjs";

const script = path.resolve(import.meta.dirname, "../../scripts/merge-batch.mjs");
const made = [];
afterEach(() => {
  for (const directory of made.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const open = [
  {
    number: 7,
    isDraft: false,
    headRefOid: "7".repeat(40),
    headRefName: "codex/a",
    baseRefName: "main",
    isCrossRepository: false,
  },
  {
    number: 3,
    isDraft: false,
    headRefOid: "3".repeat(40),
    headRefName: "codex/b",
    baseRefName: "main",
    isCrossRepository: false,
  },
  {
    number: 5,
    isDraft: true,
    headRefOid: "5".repeat(40),
    headRefName: "codex/c",
    baseRefName: "main",
    isCrossRepository: false,
  },
  {
    number: 9,
    isDraft: false,
    headRefOid: "9".repeat(40),
    headRefName: "x",
    baseRefName: "main",
    isCrossRepository: true,
  },
  {
    number: 4,
    isDraft: false,
    headRefOid: "4".repeat(40),
    headRefName: "codex/d",
    baseRefName: "release",
    isCrossRepository: false,
  },
];

describe("pnpm merge:batch", () => {
  it("takes every ready pull request into main, in number order, and silently skips drafts", () => {
    const { chosen, refused } = chooseMembers(open);
    expect(chosen.map((member) => member.pr)).toEqual([3, 7]);
    expect(refused).toEqual([
      { pr: 4, reason: "targets release, not main" },
      { pr: 9, reason: "from a fork" },
    ]);
  });

  it("keeps the stated order, names every number it refuses, and honours --without", () => {
    const { chosen, refused } = chooseMembers(open, { numbers: [7, 5, 3, 42], without: [3] });
    expect(chosen.map((member) => member.pr)).toEqual([7]);
    expect(refused).toEqual([
      { pr: 5, reason: "a draft" },
      { pr: 3, reason: "left out with --without" },
      { pr: 42, reason: "not an open pull request" },
    ]);
  });

  it("round-trips the member list and refuses a malformed or repeated one", () => {
    const members = [
      { pr: 3, head: "3".repeat(40) },
      { pr: 7, head: "7".repeat(40) },
    ];
    expect(parseMembers(formatMembers(members))).toEqual(members);
    expect(() => parseMembers("3:abc")).toThrow(/not a batch member/u);
    expect(() => parseMembers(`3:${"3".repeat(40)},3:${"3".repeat(40)}`)).toThrow(/twice/u);
    expect(() => parseMembers("")).toThrow(/at least one/u);
  });

  it("names batch branches codex/batch-<utc stamp>, which the pre-push guard accepts", () => {
    expect(batchBranch(new Date("2026-11-16T09:08:07.123Z"))).toBe("codex/batch-20261116t090807z");
  });

  it("accepts main only when every member merged and main's tree is the checked tree", () => {
    const members = [{ pr: 3 }, { pr: 7 }];
    expect(treeVerdict({ mainTree: "t1", checkedTree: "t1", merged: [3, 7], members }).ok).toBe(true);
    expect(treeVerdict({ mainTree: "t1", checkedTree: "t1", merged: [3], members }).message).toContain("#7");
    const differs = treeVerdict({ mainTree: "t1", checkedTree: "t2", merged: [3, 7], members });
    expect(differs.ok).toBe(false);
    expect(differs.message).toContain("MAIN DIFFERS FROM THE CHECKED BATCH");
  });

  it("lists the checks a failed batch run reports", () => {
    const log =
      "PASS static.format 2 s\nFAIL unit.vitest after 81 s (exit 1): pnpm test\nFAIL browser.pale-variants after 13 s (exit 1)";
    expect(failedChecks(log)).toEqual(["unit.vitest", "browser.pale-variants"]);
  });

  describe("Validate's --record step", { timeout: 30_000 }, () => {
    function repo() {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tear-batch-record-"));
      made.push(directory);
      const git = (...args) =>
        spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...args], {
          cwd: directory,
          encoding: "utf8",
        }).stdout.trim();
      git("init", "--quiet", "--initial-branch", "main");
      git("commit", "--quiet", "--allow-empty", "-m", "base");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("commit", "--quiet", "--allow-empty", "-m", "member");
      return { directory, member: git("rev-parse", "HEAD"), main: git("rev-parse", "origin/main") };
    }
    const record = (directory, members) =>
      spawnSync("node", [script, "--record", members], { cwd: directory, encoding: "utf8" });

    it("fails the run when a listed head is not in the checked commit, and records a complete batch", () => {
      const { directory, member, main } = repo();
      const partial = record(directory, `3:${member},7:${"7".repeat(40)}`);
      expect(partial.status).toBe(1);
      expect(partial.stdout).toContain("::warning title=batch::#7");
      expect(partial.stdout).not.toContain("::notice title=batch::");
      const result = record(directory, `3:${member}`);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`::notice title=batch::main=${main} members=3:${member}`);
    });

    it("fails when no member's head is in the checked commit, or the input is malformed", () => {
      const { directory } = repo();
      expect(record(directory, `7:${"7".repeat(40)}`).status).toBe(1);
      expect(record(directory, "7:nope").status).toBe(1);
    });
  });
});
