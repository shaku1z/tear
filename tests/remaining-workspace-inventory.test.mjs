import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_REMAINING_WORKSPACE_POLICY_PATH,
  runRemainingWorkspaceInventory,
} from "../scripts/report-remaining-workspace-inventory.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reporterPath = path.join(repositoryRoot, "scripts", "report-remaining-workspace-inventory.mjs");

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function addFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function createGitRoot(root, remote, files = { "README.md": "fixture\n" }) {
  fs.mkdirSync(root, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) addFile(root, relativePath, contents);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear inventory test"]);
  git(root, ["config", "user.email", "tear-inventory@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  git(root, ["branch", "-M", "main"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
}

function createGameRoot(root, remote, oracleRoot) {
  fs.mkdirSync(root, { recursive: true });
  addFile(root, "README.md", "canonical game fixture\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear inventory test"]);
  git(root, ["config", "user.email", "tear-inventory@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "fixture base"]);
  const lockedHead = git(root, ["rev-parse", "HEAD"]);
  const policy = JSON.parse(fs.readFileSync(DEFAULT_REMAINING_WORKSPACE_POLICY_PATH, "utf8"));
  policy.canonical.oracle.lockedCommit = lockedHead.slice(0, 7);
  addFile(root, "preservation/remaining-workspace-inventory-policy.json", `${JSON.stringify(policy, null, 2)}\n`);
  git(root, ["add", "preservation/remaining-workspace-inventory-policy.json"]);
  git(root, ["commit", "-q", "-m", "fixture policy"]);
  git(root, ["branch", "-M", "main"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  git(root, ["worktree", "add", "-q", "--detach", oracleRoot, lockedHead]);
  git(root, ["worktree", "lock", "--reason", "comparison-only fixture", oracleRoot]);
}

function createFixture({ gameOrigin = "git@github.com:shaku1z/tear.git" } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-remaining-inventory-"));
  const workspaceRoot = path.join(base, "workspace");
  const repoRoot = path.join(workspaceRoot, "Tear");
  const musicRoot = path.join(workspaceRoot, "tear-score");
  const wikiRoot = path.join(workspaceRoot, "tear-wiki");
  const oracleRoot = path.join(workspaceRoot, "Tear-oracle");
  const archiveRoot = path.join(workspaceRoot, "Tear-archives");
  const archiveGroup = path.join(archiveRoot, "2026-08-23-g5-remaining-inventory");
  const tempRoot = path.join(base, "temp");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(archiveGroup, { recursive: true });
  createGameRoot(repoRoot, gameOrigin, oracleRoot);
  createGitRoot(musicRoot, "git@github.com:shaku1z/tear-music.git", { "README.md": "canonical music fixture\n" });
  createGitRoot(wikiRoot, "git@github.com:shaku1z/tear-wiki.git", { "README.md": "canonical wiki fixture\n" });
  return { base, workspaceRoot, repoRoot, musicRoot, wikiRoot, oracleRoot, archiveRoot, archiveGroup, tempRoot };
}

function cleanup(fixture) {
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function inventoryOptions(fixture, extra = {}) {
  return {
    repoRoot: fixture.repoRoot,
    workspaceRoot: fixture.workspaceRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    now: "2026-08-23T12:00:00.000Z",
    ...extra,
  };
}

test("the metadata-only inventory classifies canonical, retained, candidate, and unknown roots", () => {
  const fixture = createFixture();
  try {
    const productionPolicy = JSON.parse(fs.readFileSync(DEFAULT_REMAINING_WORKSPACE_POLICY_PATH, "utf8"));
    assert.equal(productionPolicy.canonical.oracle.lockedCommit, "ee5e931");
    fs.mkdirSync(path.join(fixture.workspaceRoot, "Tear-archives"), { recursive: true });
    fs.mkdirSync(path.join(fixture.workspaceRoot, "Tear-tombstone"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "Tear-mystery"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "gsm-snapshot"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "Tear-cutting-room-01"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "tear-score-copy"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "Tear-g2-evidence"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "tear-adaptive-soundtrack-handoff-01"));
    fs.mkdirSync(path.join(fixture.workspaceRoot, "tear-ogg-determinism-probe"));
    fs.mkdirSync(path.join(fixture.tempRoot, "Tear-main-publication"));
    fs.mkdirSync(path.join(fixture.tempRoot, "tear-unknown-store"));

    const report = runRemainingWorkspaceInventory(inventoryOptions(fixture));
    const finding = (name) => report.findings.find((entry) => entry.name === name);
    assert.equal(report.mutation.writes, false);
    assert.equal(report.mutation.hashPayloads, false);
    assert.equal(report.summary.payloadHashes, "none");
    assert.equal(report.canonicalGame.git.kind, "worktree");
    assert.equal(report.canonicalGame.git.branch, "main");
    assert.equal(report.canonicalGame.git.upstream, "origin/main");
    assert.equal(report.canonicalGame.git.status, "clean");
    assert.equal(finding("tear-score").classification, "canonical-music");
    assert.equal(finding("tear-score").git.kind, "worktree");
    assert.equal(finding("tear-score").validation.status, "validated");
    assert.equal(finding("tear-wiki").classification, "canonical-wiki");
    assert.equal(finding("tear-wiki").validation.status, "validated");
    assert.equal(finding("Tear-oracle").classification, "locked-comparison-only-oracle");
    assert.equal(finding("Tear-oracle").git.kind, "worktree");
    assert.equal(finding("Tear-oracle").validation.status, "validated");
    assert.equal(finding("Tear-oracle").validation.registration.locked, true);
    assert.equal(report.registeredWorktrees.count, 2);
    assert.equal(finding("Tear-archives").classification, "archive-recovery-keep");
    assert.equal(finding("2026-08-23-g5-remaining-inventory").classification, "archive-recovery-keep");
    assert.equal(finding("Tear-tombstone").classification, "evidence-retention-hold");
    assert.equal(finding("Tear-cutting-room-01").classification, "evidence-retention-hold");
    assert.equal(finding("tear-score-copy").classification, "evidence-retention-hold");
    assert.equal(finding("Tear-g2-evidence").classification, "evidence-retention-hold");
    assert.equal(finding("tear-adaptive-soundtrack-handoff-01").classification, "evidence-retention-hold");
    assert.equal(finding("tear-ogg-determinism-probe").classification, "evidence-retention-hold");
    assert.equal(finding("gsm-snapshot").classification, "later-quarantine-candidate");
    assert.equal(finding("Tear-main-publication").classification, "later-quarantine-candidate");
    assert.equal(finding("Tear-mystery").classification, "unknown-tear-related");
    assert.equal(finding("tear-unknown-store").classification, "unknown-tear-related");
    assert.equal(report.summary.unknownTearRelatedCount, 2);
    assert.equal(report.summary.status, "review");
    for (const entry of report.findings) assert.equal(Object.hasOwn(entry, "sha256"), false);
  } finally {
    cleanup(fixture);
  }
});

test("canonical main identity, cleanliness, and exact origin are required", () => {
  const wrongOrigin = createFixture({ gameOrigin: "git@github.com:other/repository.git" });
  const dirty = createFixture();
  const wrongBranch = createFixture();
  try {
    assert.throws(() => runRemainingWorkspaceInventory(inventoryOptions(wrongOrigin)), /origin must identify shaku1z\/tear/u);
    addFile(dirty.repoRoot, "untracked.txt", "dirty\n");
    assert.throws(() => runRemainingWorkspaceInventory(inventoryOptions(dirty)), /repo-root must be clean/u);
    git(wrongBranch.repoRoot, ["checkout", "-q", "-b", "feature"]);
    assert.throws(() => runRemainingWorkspaceInventory(inventoryOptions(wrongBranch)), /clean main tracking origin\/main/u);
  } finally {
    cleanup(wrongOrigin);
    cleanup(dirty);
    cleanup(wrongBranch);
  }
});

test("companion repositories and the oracle fail closed when identity, cleanliness, or lock evidence changes", () => {
  const dirtyMusic = createFixture();
  const wrongWikiOrigin = createFixture();
  const unlockedOracle = createFixture();
  const wrongOracle = createFixture();
  try {
    addFile(dirtyMusic.musicRoot, "untracked.txt", "dirty companion\n");
    const dirtyReport = runRemainingWorkspaceInventory(inventoryOptions(dirtyMusic));
    const dirtyFinding = dirtyReport.findings.find((entry) => entry.name === "tear-score");
    assert.equal(dirtyFinding.classification, "invalid-canonical-root");
    assert.equal(dirtyFinding.status, "review");
    assert.equal(dirtyFinding.decision, "review");
    assert.match(dirtyFinding.blockers.join("\n"), /not clean/u);

    git(wrongWikiOrigin.wikiRoot, ["remote", "set-url", "origin", "git@github.com:other/tear-wiki.git"]);
    const wrongWikiReport = runRemainingWorkspaceInventory(inventoryOptions(wrongWikiOrigin));
    const wrongWikiFinding = wrongWikiReport.findings.find((entry) => entry.name === "tear-wiki");
    assert.equal(wrongWikiFinding.classification, "invalid-canonical-root");
    assert.equal(wrongWikiFinding.status, "review");
    assert.match(wrongWikiFinding.blockers.join("\n"), /origin does not identify shaku1z\/tear-wiki/u);

    git(unlockedOracle.repoRoot, ["worktree", "unlock", unlockedOracle.oracleRoot]);
    const unlockedReport = runRemainingWorkspaceInventory(inventoryOptions(unlockedOracle));
    const unlockedFinding = unlockedReport.findings.find((entry) => entry.name === "Tear-oracle");
    assert.equal(unlockedFinding.classification, "invalid-oracle");
    assert.equal(unlockedFinding.status, "review");
    assert.match(unlockedFinding.blockers.join("\n"), /not locked with a comparison-only reason/u);

    git(wrongOracle.repoRoot, ["worktree", "unlock", wrongOracle.oracleRoot]);
    git(wrongOracle.oracleRoot, ["reset", "-q", "--hard", git(wrongOracle.repoRoot, ["rev-parse", "HEAD"]) ]);
    git(wrongOracle.repoRoot, ["worktree", "lock", "--reason", "comparison-only wrong-head fixture", wrongOracle.oracleRoot]);
    const wrongOracleReport = runRemainingWorkspaceInventory(inventoryOptions(wrongOracle));
    const wrongOracleFinding = wrongOracleReport.findings.find((entry) => entry.name === "Tear-oracle");
    assert.equal(wrongOracleFinding.classification, "invalid-oracle");
    assert.equal(wrongOracleFinding.status, "review");
    assert.match(wrongOracleFinding.blockers.join("\n"), /not the locked comparison commit/u);
  } finally {
    cleanup(dirtyMusic);
    cleanup(wrongWikiOrigin);
    cleanup(unlockedOracle);
    cleanup(wrongOracle);
  }
});

test("symlink or reparse candidates are refused without descent", () => {
  const fixture = createFixture();
  try {
    const target = path.join(fixture.base, "outside-target");
    fs.mkdirSync(target);
    addFile(target, "secret.txt", "must not be inspected\n");
    const link = path.join(fixture.workspaceRoot, "Tear-linked");
    let supported = true;
    try {
      fs.symlinkSync(target, link, "junction");
    } catch {
      try {
        fs.symlinkSync(target, link, "dir");
      } catch {
        supported = false;
      }
    }
    if (supported) {
      const report = runRemainingWorkspaceInventory(inventoryOptions(fixture));
      const finding = report.findings.find((entry) => entry.name === "Tear-linked");
      assert.equal(finding.status, "refused");
      assert.equal(finding.refusal, "symlink-or-reparse");
      assert.equal(finding.git, null);
    }
  } finally {
    cleanup(fixture);
  }
});

test("default output is write-free and optional output is new-only inside an existing recovery group", () => {
  const fixture = createFixture();
  try {
    const before = fs.readdirSync(fixture.archiveRoot).sort();
    runRemainingWorkspaceInventory(inventoryOptions(fixture));
    assert.deepEqual(fs.readdirSync(fixture.archiveRoot).sort(), before);
    const output = path.join(fixture.archiveGroup, "remaining-workspace-inventory.json");
    const report = runRemainingWorkspaceInventory(inventoryOptions(fixture, { outputPath: output }));
    assert.equal(fs.existsSync(output), true);
    assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).format, "tear-remaining-workspace-inventory");
    assert.equal(report.inputs.archiveRoot, fixture.archiveRoot);
    assert.throws(() => runRemainingWorkspaceInventory(inventoryOptions(fixture, { outputPath: output })), /refusing overwrite/u);
    assert.throws(() => runRemainingWorkspaceInventory(inventoryOptions(fixture, { outputPath: path.join(fixture.archiveRoot, "outside-group.json") })), /existing dated archive recovery group/u);
  } finally {
    cleanup(fixture);
  }
});

test("CLI requires all four explicit roots and rejects duplicate flags", () => {
  const fixture = createFixture();
  try {
    const missing = spawnSync(process.execPath, [reporterPath, "--repo-root", fixture.repoRoot], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /workspaceRoot is required/u);
    const duplicate = spawnSync(process.execPath, [
      reporterPath,
      "--repo-root", fixture.repoRoot,
      "--repo-root", fixture.repoRoot,
      "--workspace-root", fixture.workspaceRoot,
      "--temp-root", fixture.tempRoot,
      "--archive-root", fixture.archiveRoot,
    ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /duplicate argument: --repo-root/u);
  } finally {
    cleanup(fixture);
  }
});
