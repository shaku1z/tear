import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { validateReleaseRepository } from "../scripts/release-preflight.mjs";

const temporaryRoots = [];
after(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
});

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tear-release-preflight-"));
  temporaryRoots.push(root);
  const remote = join(root, "origin.git");
  const seed = join(root, "seed");
  const checkout = join(root, "checkout");
  await mkdir(seed);
  git(root, "init", "--bare", remote);
  git(seed, "init", "-b", "main");
  git(seed, "config", "user.name", "Tear Release Test");
  git(seed, "config", "user.email", "release-test@invalid.example");
  await writeFile(join(seed, "tracked.txt"), "baseline\n", "utf8");
  git(seed, "add", "tracked.txt");
  git(seed, "commit", "-m", "baseline");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  git(root, "--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main");
  git(root, "clone", remote, checkout);
  git(checkout, "config", "user.name", "Tear Release Test");
  git(checkout, "config", "user.email", "release-test@invalid.example");
  const sha = git(checkout, "rev-parse", "HEAD");
  const evidencePath = join(root, "release-evidence.json");
  await writeFile(evidencePath, `${JSON.stringify({
    format: "tear-release-evidence",
    schemaVersion: 1,
    repository: "shaku1z/tear",
    sha,
    validationWorkflow: "Validate",
    validationConclusion: "success",
    validationRunId: "123",
  })}\n`, "utf8");
  return { root, remote, seed, checkout, sha, evidencePath };
}

async function validate(value) {
  return validateReleaseRepository({
    root: value.checkout,
    evidencePath: value.evidencePath,
    expectedSha: value.sha,
    fetch: false,
  });
}

test("accepts only clean main exactly equal to validated origin/main", async () => {
  const value = await fixture();
  const result = await validate(value);
  assert.equal(result.sha, value.sha);
});

test("rejects a wrong branch before any deployment command", async () => {
  const value = await fixture();
  git(value.checkout, "switch", "-c", "codex/not-main");
  await assert.rejects(validate(value), /must be on main/u);
});

test("rejects a dirty checkout before any deployment command", async () => {
  const value = await fixture();
  await writeFile(join(value.checkout, "dirty.txt"), "dirty\n", "utf8");
  await assert.rejects(validate(value), /checkout is dirty/u);
});

test("rejects main ahead of origin/main", async () => {
  const value = await fixture();
  await writeFile(join(value.checkout, "tracked.txt"), "ahead\n", "utf8");
  git(value.checkout, "add", "tracked.txt");
  git(value.checkout, "commit", "-m", "ahead");
  await assert.rejects(validate(value), /ahead=1, behind=0/u);
});

test("rejects main behind origin/main", async () => {
  const value = await fixture();
  await writeFile(join(value.seed, "tracked.txt"), "behind\n", "utf8");
  git(value.seed, "add", "tracked.txt");
  git(value.seed, "commit", "-m", "remote advance");
  git(value.seed, "push", "origin", "main");
  git(value.checkout, "fetch", "origin", "main");
  await assert.rejects(validate(value), /ahead=0, behind=1/u);
});
