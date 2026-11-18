// pnpm merge:batch: choosing members, recording them in Validate, and the after-merge tree check.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BATCH_BRANCH,
  batchBranch,
  chooseMembers,
  failedChecks,
  failedSteps,
  formatMembers,
  isNetworkFailure,
  mergeMessage,
  mergePlan,
  parseMembers,
  pruneVerdict,
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
    expect(BATCH_BRANCH.test(batchBranch())).toBe(true);
    expect(BATCH_BRANCH.test("codex/batch-merge")).toBe(false);
  });

  it("lists a batch branch as prunable only once nothing can still merge on it", () => {
    expect(pruneVerdict({ ageMinutes: 600 }).prunable).toBe(true);
    // Just pushed: merge:batch starts its run a moment after the push.
    expect(pruneVerdict({ ageMinutes: 5 }).prunable).toBe(false);
    // Never while any check on the branch is going, whatever the latest run says.
    const running = { running: true, status: "completed", conclusion: "failure", ageMinutes: 600 };
    expect(pruneVerdict(running)).toEqual({ prunable: false, reason: "a check is running on it" });
    expect(pruneVerdict({ status: "in_progress" }).prunable).toBe(false);
    expect(pruneVerdict({ status: "completed", conclusion: "failure" }).prunable).toBe(true);
    expect(pruneVerdict({ status: "completed", conclusion: "success", states: {} }).prunable).toBe(true);
    const open = pruneVerdict({ status: "completed", conclusion: "success", states: { 3: "MERGED", 7: "OPEN" } });
    expect(open).toEqual({ prunable: false, reason: "#7 may still merge on it" });
    const done = { status: "completed", conclusion: "success", states: { 3: "MERGED", 7: "CLOSED" } };
    expect(pruneVerdict(done).prunable).toBe(true);
  });

  it("accepts main only when every member merged and main's tree is the checked tree", () => {
    const members = [{ pr: 3 }, { pr: 7 }];
    expect(treeVerdict({ mainTree: "t1", checkedTree: "t1", merged: [3, 7], members }).ok).toBe(true);
    expect(treeVerdict({ mainTree: "t1", checkedTree: "t1", merged: [3], members }).message).toContain("#7");
    const differs = treeVerdict({ mainTree: "t1", checkedTree: "t2", merged: [3, 7], members });
    expect(differs.ok).toBe(false);
    expect(differs.message).toContain("MAIN DIFFERS FROM THE CHECKED BATCH");
  });

  it("merges members in batch order, skips ones already merged at their head, and stops at anything else", () => {
    const members = [3, 7, 9].map((pr) => ({ pr, head: String(pr).repeat(40) }));
    const view = (pr, state, head = String(pr).repeat(40)) => ({ state, headRefOid: head });
    const steps = (views) => mergePlan(members, views).map((entry) => entry.step);
    expect(steps({ 3: view(3, "MERGED"), 7: view(7, "OPEN"), 9: view(9, "OPEN") })).toEqual(["done", "merge", "merge"]);
    // A moved head stops the sequence there: the members after it were checked together with it.
    const moved = mergePlan(members, { 3: view(3, "OPEN", "f".repeat(40)), 7: view(7, "OPEN"), 9: view(9, "OPEN") });
    expect(moved).toEqual([{ ...members[0], step: "stop", reason: "#3 is moved since the batch" }]);
    expect(steps({ 3: view(3, "OPEN"), 7: view(7, "CLOSED") })).toEqual(["merge", "stop"]);
    expect(steps({ 3: view(3, "MERGED", "e".repeat(40)) })).toEqual(["stop"]);
  });

  it("tries again only after a network failure, never after a refusal", () => {
    expect(isNetworkFailure("Post https://api.github.com/graphql: net/http: TLS handshake timeout")).toBe(true);
    expect(isNetworkFailure("read ECONNRESET")).toBe(true);
    expect(isNetworkFailure("HTTP 502: Bad Gateway")).toBe(true);
    expect(isNetworkFailure("refusing to merge: merge-ready: NOT READY #7: main is red")).toBe(false);
    expect(isNetworkFailure("refusing to merge: head moved")).toBe(false);
  });

  it("writes each squash merge as the title with its number and the summary paragraph", () => {
    const crlf = String.fromCharCode(13, 10);
    const body = ["## Why", "", "A bare number fails", "a correct game.", "", "## What"].join(crlf);
    const pr = { number: 7, title: "Name every wait", body };
    const summary = ["A bare number fails", "a correct game."].join(String.fromCharCode(10));
    expect(mergeMessage(pr)).toEqual({ subject: "Name every wait (#7)", body: summary });
    expect(mergeMessage({ number: 8, title: "Fix", body: "" }).body).toBe("Fix");
  });

  it("lists the checks a failed batch run reports", () => {
    const log =
      "PASS static.format 2 s\nFAIL unit.vitest after 81 s (exit 1): pnpm test\nFAIL browser.pale-variants after 13 s (exit 1)";
    expect(failedChecks(log)).toEqual(["unit.vitest", "browser.pale-variants"]);
  });

  it("names the failed steps of every job of a run, not only the required one", () => {
    const jobs = [
      { name: "unit", steps: [{ name: "Unit tests", conclusion: "success" }] },
      { name: "browser (3/4)", steps: [{ name: "Browser checks", conclusion: "failure" }] },
      { name: "check", steps: [{ name: "Every needed job passed", conclusion: "failure" }] },
      { name: "docs" },
    ];
    expect(failedSteps(jobs)).toEqual(["browser (3/4): Browser checks", "check: Every needed job passed"]);
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
