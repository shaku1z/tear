import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH,
  readWorkspaceRecoveryPolicy,
  runWorkspaceRecoveryReport,
  validateWorkspaceRecoveryPolicy,
  writeWorkspaceRecoveryReport,
} from "../scripts/report-workspace-recovery.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reporterPath = path.join(repositoryRoot, "scripts", "report-workspace-recovery.mjs");
const now = new Date("2026-08-23T12:00:00.000Z");
const retainUntil = "2026-09-30T00:00:00.000Z";

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function createFixture({ origin = "git@github.com:shaku1z/tear.git" } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-workspace-recovery-"));
  const workspaceRoot = path.join(base, "workspace");
  const root = path.join(workspaceRoot, "Tear");
  const tempRoot = path.join(base, "temp");
  const archiveRoot = path.join(workspaceRoot, "Tear-archives");
  const archiveGroup = path.join(archiveRoot, "2026-08-23-g5-workspace-recovery");
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(root);
  fs.mkdirSync(tempRoot);
  fs.mkdirSync(archiveGroup, { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "canonical duplicate\n", "utf8");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear workspace recovery test"]);
  git(root, ["config", "user.email", "tear-workspace-recovery@example.test"]);
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  git(root, ["branch", "-M", "main"]);
  git(root, ["remote", "add", "origin", origin]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  return { base, root, workspaceRoot, tempRoot, archiveRoot, archiveGroup };
}

function cleanup(fixture) {
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function addFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function createSourceFixture(fixture) {
  const gsm = path.join(fixture.workspaceRoot, "gsm-one");
  fs.mkdirSync(gsm);
  addFile(gsm, "README.md", "canonical duplicate\n");
  addFile(gsm, "same-content-different-path.txt", "canonical duplicate\n");
  addFile(gsm, "preserved.txt", "preserved duplicate\n");
  addFile(gsm, "mismatch.txt", "manifest mismatch\n");
  addFile(gsm, "unique.txt", "unique review material\n");
  addFile(gsm, ".env", "SECRET=not-read\n");
  addFile(gsm, "foundry.local.json", "{\"gameRoot\":\"do-not-read\"}\n");
  addFile(gsm, "certificate.crt", "certificate\n");
  addFile(gsm, "node_modules/package.json", "protected\n");
  addFile(gsm, "Tear-archives/archive.bin", "protected\n");
  addFile(gsm, ".git", "gitdir: missing-admin/worktree\n");
  addFile(path.join(fixture.workspaceRoot, "Tear-receipt-clean"), "receipt.txt", "receipt\n");
  addFile(path.join(fixture.tempRoot, "Tear-main-publication"), "README.md", "canonical duplicate\n");
  fs.mkdirSync(path.join(fixture.workspaceRoot, "not-a-candidate"));
  return gsm;
}

function reportOptions(fixture, extra = {}) {
  return {
    repoRoot: fixture.root,
    workspaceRoot: fixture.workspaceRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    owner: "g5-recovery-owner",
    retainUntil,
    now,
    ...extra,
  };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("the portable policy is valid and contains no machine-specific root", () => {
  const loaded = readWorkspaceRecoveryPolicy(DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH);
  assert.deepEqual(loaded.errors, []);
  assert.equal(validateWorkspaceRecoveryPolicy(loaded.policy).length, 0);
  assert.doesNotMatch(JSON.stringify(loaded.policy), /Users|C:\\|Desktop/iu);
  assert.equal(loaded.policy.quarantine.implemented, false);
  assert.equal(loaded.policy.report.outputOverwrite, false);
});

test("discovers only exact source names and records bounded comparison tiers", () => {
  const fixture = createFixture();
  try {
    createSourceFixture(fixture);
    const preservedPath = path.join(fixture.archiveGroup, "preserved-manifest.json");
    fs.writeFileSync(preservedPath, JSON.stringify({ entries: [
      { relativePath: "preserved.txt", sha256: sha256("preserved duplicate\n") },
      { relativePath: "mismatch.txt", sha256: sha256("different content\n") },
    ] }), "utf8");
    const report = runWorkspaceRecoveryReport(reportOptions(fixture, { preservedManifestPaths: [preservedPath] }));
    assert.equal(report.repositoryState.branch, "main");
    assert.equal(report.repositoryState.head, report.repositoryState.originMain);
    assert.equal(report.sources.some((source) => source.name === "not-a-candidate"), false);
    assert.deepEqual(report.sources.map((source) => source.name).sort(), ["Tear-main-publication", "Tear-receipt-clean", "gsm-one"].sort());

    const source = report.sources.find((candidate) => candidate.name === "gsm-one");
    assert.equal(source.rootDecision, "scanned");
    assert.equal(source.gitPointer.status, "invalid");
    const entry = (relativePath) => source.entries.find((candidate) => candidate.relativePath === relativePath);
    assert.equal(entry("README.md").comparison.tier, "canonical-same-relative-path");
    assert.equal(entry("same-content-different-path.txt").comparison.tier, "reachable-git-blob");
    assert.equal(entry("preserved.txt").comparison.tier, "preserved-manifest-sha256");
    assert.equal(report.preservedManifests[0].entries, 2);
    assert.equal(entry("mismatch.txt").decision, "review");
    assert.equal(entry("mismatch.txt").comparison.tier, "review-unknown-or-unique");
    assert.equal(entry("unique.txt").decision, "review");
    assert.equal(entry("unique.txt").sha256.length, 64);
    assert.equal(entry(".env").sha256, null);
    assert.ok(entry(".env").reasonCodes.includes("protected-name-pattern"));
    assert.equal(entry("foundry.local.json").sha256, null);
    assert.equal(entry("certificate.crt").sha256, null);
    assert.equal(entry(".git").sha256, null);
    assert.equal(entry(".git").gitPointer.targetExists, false);
    assert.equal(source.entries.some((candidate) => candidate.relativePath === "node_modules/package.json"), false);
    assert.equal(source.entries.some((candidate) => candidate.relativePath === "Tear-archives/archive.bin"), false);
    assert.equal(report.summary.quarantineEligibleEntries, 0);
    assert.equal(report.summary.status, "no-go");
    assert.equal(report.quarantine.eligibility, "never-emitted-by-this-reporter");
  } finally {
    cleanup(fixture);
  }
});

test("protected archive names are metadata-only and the default report makes no writes", () => {
  const fixture = createFixture();
  try {
    createSourceFixture(fixture);
    fs.mkdirSync(path.join(fixture.workspaceRoot, "tear-git-recovery-test"));
    fs.writeFileSync(path.join(fixture.workspaceRoot, "tear-git-recovery-test", "secret.bin"), "do not scan\n", "utf8");
    const beforeArchive = fs.readdirSync(fixture.archiveRoot, { withFileTypes: true }).map((entry) => entry.name);
    const report = runWorkspaceRecoveryReport(reportOptions(fixture));
    assert.ok(report.protectedRoots.some((entry) => entry.name === "Tear-archives" && entry.status === "protected-metadata-only"));
    assert.ok(report.protectedRoots.some((entry) => entry.name === "tear-git-recovery-test" && entry.status === "protected-metadata-only"));
    assert.deepEqual(fs.readdirSync(fixture.archiveRoot, { withFileTypes: true }).map((entry) => entry.name), beforeArchive);
    assert.equal(fs.existsSync(path.join(fixture.archiveGroup, "workspace-recovery-report.json")), false);
    assert.equal(report.restoreGuidance.status, "report-only");
  } finally {
    cleanup(fixture);
  }
});

test("wrong identity, dirty, non-main, and divergent roots fail closed", () => {
  const wrongOrigin = createFixture({ origin: "git@github.com:other/repository.git" });
  const dirty = createFixture();
  const nonMain = createFixture();
  const divergent = createFixture();
  try {
    assert.throws(() => runWorkspaceRecoveryReport(reportOptions(wrongOrigin)), /origin must identify shaku1z\/tear/u);
    addFile(dirty.root, "untracked.txt", "dirty\n");
    assert.throws(() => runWorkspaceRecoveryReport(reportOptions(dirty)), /must be clean/u);
    git(nonMain.root, ["checkout", "-q", "-b", "feature"]);
    assert.throws(() => runWorkspaceRecoveryReport(reportOptions(nonMain)), /must be on main/u);
    addFile(divergent.root, "divergent.txt", "ahead\n");
    git(divergent.root, ["add", "divergent.txt"]);
    git(divergent.root, ["commit", "-q", "-m", "divergence"]);
    assert.throws(() => runWorkspaceRecoveryReport(reportOptions(divergent)), /main must exactly equal origin\/main/u);
  } finally {
    cleanup(wrongOrigin);
    cleanup(dirty);
    cleanup(nonMain);
    cleanup(divergent);
  }
});

test("symlink or junction source candidates are refused without descent", () => {
  const fixture = createFixture();
  try {
    const target = path.join(fixture.workspaceRoot, "real-source");
    fs.mkdirSync(target);
    addFile(target, "visible.txt", "visible\n");
    const link = path.join(fixture.workspaceRoot, "gsm-linked");
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
      const report = runWorkspaceRecoveryReport(reportOptions(fixture));
      const source = report.sources.find((candidate) => candidate.name === "gsm-linked");
      assert.equal(source.rootDecision, "refused");
      assert.ok(source.rootReasonCodes.includes("symlink-or-reparse"));
      assert.equal(source.entries.length, 0);
    }
  } finally {
    cleanup(fixture);
  }
});

test("reachable history recognizes a blob from a deleted main file", () => {
  const fixture = createFixture();
  try {
    addFile(fixture.root, "historical-only.txt", "historical blob\n");
    git(fixture.root, ["add", "historical-only.txt"]);
    git(fixture.root, ["commit", "-q", "-m", "historical-file"]);
    git(fixture.root, ["rm", "-q", "historical-only.txt"]);
    git(fixture.root, ["commit", "-q", "-m", "remove-historical-file"]);
    git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    addFile(path.join(fixture.workspaceRoot, "gsm-historical"), "restored.txt", "historical blob\n");
    const report = runWorkspaceRecoveryReport(reportOptions(fixture));
    const source = report.sources.find((candidate) => candidate.name === "gsm-historical");
    const entry = source.entries.find((candidate) => candidate.relativePath === "restored.txt");
    assert.equal(entry.comparison.tier, "reachable-git-blob");
    assert.equal(entry.comparison.reference, "HEAD-history");
  } finally {
    cleanup(fixture);
  }
});

test("policy limits fail closed before an unbounded report can proceed", () => {
  const fixture = createFixture();
  try {
    createSourceFixture(fixture);
    const loaded = readWorkspaceRecoveryPolicy();
    const limited = JSON.parse(JSON.stringify(loaded.policy));
    limited.limits.maxEntries = 1;
    assert.throws(() => runWorkspaceRecoveryReport(reportOptions(fixture, { policy: limited })), /maxEntries/u);
  } finally {
    cleanup(fixture);
  }
});

test("output is new-only, archive-contained, and never overwrites", () => {
  const fixture = createFixture();
  try {
    assert.equal(path.dirname(fixture.root), fixture.workspaceRoot);
    assert.equal(path.dirname(fixture.archiveRoot), fixture.workspaceRoot);
    createSourceFixture(fixture);
    const report = runWorkspaceRecoveryReport(reportOptions(fixture));
    const output = path.join(fixture.archiveGroup, "workspace-recovery-report.json");
    const written = writeWorkspaceRecoveryReport(output, report, {
      archiveRoot: fixture.archiveRoot,
      repoRoot: fixture.root,
      candidateRoots: { gsm: path.join(fixture.workspaceRoot, "gsm-one"), receipt: path.join(fixture.workspaceRoot, "Tear-receipt-clean"), publication: path.join(fixture.tempRoot, "Tear-main-publication") },
    });
    assert.equal(written, output);
    assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).format, "tear-workspace-recovery-report");
    assert.throws(() => writeWorkspaceRecoveryReport(output, report, {
      archiveRoot: fixture.archiveRoot,
      repoRoot: fixture.root,
      candidateRoots: { gsm: path.join(fixture.workspaceRoot, "gsm-one"), receipt: path.join(fixture.workspaceRoot, "Tear-receipt-clean"), publication: path.join(fixture.tempRoot, "Tear-main-publication") },
    }), /refusing overwrite/u);
    assert.throws(() => writeWorkspaceRecoveryReport(path.join(fixture.workspaceRoot, "report.json"), report, {
      archiveRoot: fixture.archiveRoot,
      repoRoot: fixture.root,
      candidateRoots: { gsm: path.join(fixture.workspaceRoot, "gsm-one"), receipt: path.join(fixture.workspaceRoot, "Tear-receipt-clean"), publication: path.join(fixture.tempRoot, "Tear-main-publication") },
    }), /inside archive-root|outside workspaceRoot/u);
    assert.throws(() => writeWorkspaceRecoveryReport(path.join(fixture.archiveRoot, "report.json"), report, {
      archiveRoot: fixture.archiveRoot,
      repoRoot: fixture.root,
      candidateRoots: { gsm: path.join(fixture.workspaceRoot, "gsm-one"), receipt: path.join(fixture.workspaceRoot, "Tear-receipt-clean"), publication: path.join(fixture.tempRoot, "Tear-main-publication") },
    }), /dated g5 recovery group/u);
  } finally {
    cleanup(fixture);
  }
});

test("CLI requires every external root and summary-only remains write-free", () => {
  const fixture = createFixture();
  try {
    createSourceFixture(fixture);
    const missing = spawnSync(process.execPath, [reporterPath, "--repo-root", fixture.root], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--workspace-root is required/u);
    const result = spawnSync(process.execPath, [
      reporterPath,
      "--repo-root", fixture.root,
      "--workspace-root", fixture.workspaceRoot,
      "--temp-root", fixture.tempRoot,
      "--archive-root", fixture.archiveRoot,
      "--owner", "g5-cli-test",
      "--retain-until", retainUntil,
      "--summary-only",
    ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.format, "tear-workspace-recovery-report");
    assert.equal(summary.status, "no-go");
    assert.doesNotMatch(result.stdout, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.equal(fs.existsSync(path.join(fixture.archiveGroup, "workspace-recovery-report.json")), false);
    const duplicateFlag = spawnSync(process.execPath, [
      reporterPath,
      "--repo-root", fixture.root,
      "--workspace-root", fixture.workspaceRoot,
      "--temp-root", fixture.tempRoot,
      "--archive-root", fixture.archiveRoot,
      "--owner", "first",
      "--owner", "second",
      "--retain-until", retainUntil,
    ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.notEqual(duplicateFlag.status, 0);
    assert.match(duplicateFlag.stderr, /duplicate argument: --owner/u);
  } finally {
    cleanup(fixture);
  }
});
