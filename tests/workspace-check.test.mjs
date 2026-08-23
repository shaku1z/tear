import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalizeRepositoryIdentifier,
  parseWorktreeList,
  runWorkspaceCheck,
} from "../scripts/check-workspace.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "config", "workspace-contract.json"), "utf8"));
const emptyEnvironment = { GITHUB_REPOSITORY: undefined, GITHUB_SHA: undefined, TEAR_ORACLE_ROOT: undefined, TEAR_WORKSPACE_ROOT: undefined };

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writeJsonc(root, relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function createFixture({
  remote = "git@github.com:shaku1z/tear.git",
  detached = false,
  missingDirectory,
  forbiddenDirectory,
  unsafeDeployment = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-workspace-"));
  for (const directory of contract.requiredTrackedDirectories) {
    if (directory === missingDirectory) continue;
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, ".keep"), "fixture\n", "utf8");
  }
  fs.copyFileSync(path.join(repositoryRoot, "config", "workspace-contract.json"), path.join(root, "config", "workspace-contract.json"));
  fs.copyFileSync(path.join(repositoryRoot, "wrangler.preview.jsonc"), path.join(root, "wrangler.preview.jsonc"));
  if (unsafeDeployment) {
    writeJsonc(root, "wrangler.jsonc", '{"assets":{"directory":"../outside"}}\n');
  } else {
    fs.copyFileSync(path.join(repositoryRoot, "wrangler.jsonc"), path.join(root, "wrangler.jsonc"));
  }
  if (forbiddenDirectory !== undefined) {
    fs.mkdirSync(path.join(root, forbiddenDirectory), { recursive: true });
    fs.writeFileSync(path.join(root, forbiddenDirectory, "generated.txt"), "forbidden\n", "utf8");
  }

  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear workspace test"]);
  git(root, ["config", "user.email", "tear-workspace@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  git(root, ["branch", "-M", "main"]);
  if (remote !== null) git(root, ["remote", "add", "origin", remote]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  if (detached) git(root, ["checkout", "-q", "--detach", "HEAD"]);
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("canonical repository passes the CI workspace contract", () => {
  const result = runWorkspaceCheck({ root: repositoryRoot, mode: "ci", env: emptyEnvironment });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.oracle.status, "skipped");
  assert.equal(result.artifactPolicy.status, "validated");
  assert.equal(result.trackedDirectories.includes("src"), true);
});

test("repository identity normalizes supported remote forms", () => {
  assert.equal(normalizeRepositoryIdentifier("git@github.com:shaku1z/tear.git"), "shaku1z/tear");
  assert.equal(normalizeRepositoryIdentifier("https://github.com/shaku1z/tear.git"), "shaku1z/tear");
  assert.equal(normalizeRepositoryIdentifier("ssh://git@github.com/shaku1z/tear.git"), "shaku1z/tear");
  assert.equal(normalizeRepositoryIdentifier("shaku1z/tear"), "shaku1z/tear");
});

test("worktree porcelain parser preserves locked comparison-only reasons", () => {
  const entries = parseWorktreeList([
    "worktree fixture/canonical",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree fixture/oracle",
    "HEAD 2222222222222222222222222222222222222222",
    "detached",
    "locked Legacy oracle: comparison-only; never merge or develop here",
  ].join("\n"));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].locked, false);
  assert.equal(entries[1].locked, true);
  assert.match(entries[1].lockReason, /comparison-only/u);
});

test("CI mode accepts detached HEAD and falls back to GITHUB_REPOSITORY", () => {
  const root = createFixture({ detached: true, remote: null });
  try {
    const result = runWorkspaceCheck({ root, mode: "ci", env: { ...emptyEnvironment, GITHUB_REPOSITORY: "shaku1z/tear" } });
    assert.equal(result.ok, true, result.errors.join("\n"));
  } finally {
    cleanup(root);
  }
});

test("CI mode honors an optional GITHUB_SHA equality check", () => {
  const root = createFixture();
  try {
    const head = git(root, ["rev-parse", "HEAD"]);
    const accepted = runWorkspaceCheck({ root, mode: "ci", env: { ...emptyEnvironment, GITHUB_SHA: head } });
    assert.equal(accepted.ok, true, accepted.errors.join("\n"));
    const rejected = runWorkspaceCheck({ root, mode: "ci", env: { ...emptyEnvironment, GITHUB_SHA: "0".repeat(40) } });
    assert.equal(rejected.ok, false);
    assert.match(rejected.errors.join("\n"), /does not equal GITHUB_SHA/u);
  } finally {
    cleanup(root);
  }
});

test("strict mode rejects detached HEAD and missing upstream", () => {
  const root = createFixture({ detached: true });
  try {
    const result = runWorkspaceCheck({ root, mode: "strict", env: emptyEnvironment });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /must be on main/u);
  } finally {
    cleanup(root);
  }
});

test("strict mode rejects dirty worktrees", () => {
  const root = createFixture();
  try {
    fs.writeFileSync(path.join(root, "untracked.txt"), "dirty\n", "utf8");
    const result = runWorkspaceCheck({ root, mode: "strict", env: emptyEnvironment });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /strict workspace is dirty/u);
  } finally {
    cleanup(root);
  }
});

test("CI mode rejects missing required and forbidden tracked directories", () => {
  const missing = createFixture({ missingDirectory: "workers" });
  const forbidden = createFixture({ forbiddenDirectory: "dist" });
  try {
    const missingResult = runWorkspaceCheck({ root: missing, mode: "ci", env: emptyEnvironment });
    assert.equal(missingResult.ok, false);
    assert.match(missingResult.errors.join("\n"), /required tracked directory is missing: workers/u);
    const forbiddenResult = runWorkspaceCheck({ root: forbidden, mode: "ci", env: emptyEnvironment });
    assert.equal(forbiddenResult.ok, false);
    assert.match(forbiddenResult.errors.join("\n"), /forbidden generated\/output directory is tracked: dist/u);
  } finally {
    cleanup(missing);
    cleanup(forbidden);
  }
});

test("strict mode validates registered worktrees and rejects a missing registered path", () => {
  const root = createFixture();
  const linked = path.join(path.dirname(root), `${path.basename(root)}-linked`);
  try {
    git(root, ["worktree", "add", "-q", "--detach", linked, "HEAD"]);
    const valid = runWorkspaceCheck({ root, mode: "strict", env: emptyEnvironment });
    assert.equal(valid.ok, true, valid.errors.join("\n"));
    const unlockedOracle = runWorkspaceCheck({ root, mode: "strict", oracleRoot: linked, env: emptyEnvironment });
    assert.equal(unlockedOracle.ok, false);
    assert.match(unlockedOracle.errors.join("\n"), /oracle worktree must be locked/u);
    fs.rmSync(linked, { recursive: true, force: true });
    const invalid = runWorkspaceCheck({ root, mode: "strict", env: emptyEnvironment });
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors.join("\n"), /registered worktree path is missing/u);
  } finally {
    fs.rmSync(linked, { recursive: true, force: true });
    cleanup(root);
  }
});

test("explicit workspace-root scan reports invalid .git pointers without pruning", () => {
  const root = createFixture();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-parent-"));
  try {
    const orphan = path.join(workspaceRoot, "orphan-copy");
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, ".git"), "gitdir: missing-admin\n", "utf8");
    const result = runWorkspaceCheck({ root, mode: "strict", workspaceRoot, env: emptyEnvironment });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /invalid \.git pointer target/u);
    assert.equal(fs.existsSync(path.join(orphan, ".git")), true);
  } finally {
    cleanup(workspaceRoot);
    cleanup(root);
  }
});

test("strict mode skips an absent optional oracle but rejects a supplied wrong oracle", () => {
  const root = createFixture();
  const wrongOracle = createFixture();
  try {
    const skipped = runWorkspaceCheck({ root, mode: "strict", env: emptyEnvironment });
    assert.equal(skipped.oracle.status, "skipped");
    const rejected = runWorkspaceCheck({ root, mode: "strict", oracleRoot: wrongOracle, env: emptyEnvironment });
    assert.equal(rejected.ok, false);
    assert.match(rejected.errors.join("\n"), /oracle HEAD must be locked|oracle must remain detached/u);
  } finally {
    cleanup(wrongOracle);
    cleanup(root);
  }
});

test("strict mode accepts the locked oracle when the local comparison checkout exists", { skip: !fs.existsSync(path.resolve(repositoryRoot, "..", "Tear-oracle")) }, () => {
  const result = runWorkspaceCheck({
    root: repositoryRoot,
    mode: "strict",
    oracleRoot: path.resolve(repositoryRoot, "..", "Tear-oracle"),
    env: emptyEnvironment,
  });
  assert.equal(result.oracle.status, "validated", result.errors.join("\n"));
  assert.equal(result.errors.some((error) => error.startsWith("oracle ")), false, result.errors.join("\n"));
});

test("CI mode rejects an unsafe production deployment root", () => {
  const root = createFixture({ unsafeDeployment: true });
  try {
    const result = runWorkspaceCheck({ root, mode: "ci", env: emptyEnvironment });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /wrangler\.jsonc must use the safe assets directory/u);
  } finally {
    cleanup(root);
  }
});
