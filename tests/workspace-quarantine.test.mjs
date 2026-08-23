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
  runWorkspaceRecoveryReport,
} from "../scripts/report-workspace-recovery.mjs";
import {
  runWorkspaceQuarantinePreparation,
  WorkspaceQuarantineManifestError,
} from "../scripts/prepare-workspace-quarantine.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policySource = path.join(repositoryRoot, "preservation", "workspace-recovery-policy.json");
const preparerPath = path.join(repositoryRoot, "scripts", "prepare-workspace-quarantine.mjs");
const now = new Date("2026-08-23T12:00:00.000Z");
const retainUntil = "2026-09-30T00:00:00.000Z";

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-workspace-quarantine-"));
  const workspaceRoot = path.join(base, "workspace");
  const repoRoot = path.join(workspaceRoot, "Tear");
  const archiveRoot = path.join(workspaceRoot, "Tear-archives");
  const archiveGroup = path.join(archiveRoot, "2026-08-23-g5-workspace-recovery");
  const tempRoot = path.join(base, "temp");
  const policyPath = path.join(repoRoot, "preservation", "workspace-recovery-policy.json");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(archiveGroup, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.copyFileSync(policySource, policyPath);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "canonical fixture\n", "utf8");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Tear quarantine test"]);
  git(repoRoot, ["config", "user.email", "tear-quarantine@example.test"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-q", "-m", "fixture"]);
  git(repoRoot, ["branch", "-M", "main"]);
  git(repoRoot, ["remote", "add", "origin", "git@github.com:shaku1z/tear.git"]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repoRoot, ["config", "branch.main.remote", "origin"]);
  git(repoRoot, ["config", "branch.main.merge", "refs/heads/main"]);
  return { base, workspaceRoot, repoRoot, archiveRoot, archiveGroup, tempRoot, policyPath };
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

function createSources(fixture, { protectedFile = false } = {}) {
  const gsm = path.join(fixture.workspaceRoot, "gsm-one");
  const receipt = path.join(fixture.workspaceRoot, "Tear-receipt-clean");
  fs.mkdirSync(gsm);
  fs.mkdirSync(receipt);
  addFile(gsm, "README.md", "canonical fixture\n");
  addFile(gsm, "shared.txt", "same bytes\n");
  addFile(gsm, "unique.txt", "gsm-only review\n");
  addFile(receipt, "README.md", "canonical fixture\n");
  addFile(receipt, "shared-copy.txt", "same bytes\n");
  addFile(receipt, "receipt.txt", "receipt review\n");
  if (protectedFile) addFile(gsm, ".env", "SECRET=fixture-only\n");
  return { gsm, receipt };
}

function createReport(fixture, { protectedFile = false } = {}) {
  createSources(fixture, { protectedFile });
  const report = runWorkspaceRecoveryReport({
    repoRoot: fixture.repoRoot,
    workspaceRoot: fixture.workspaceRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    owner: "g5-recovery-owner",
    retainUntil,
    policyPath: fixture.policyPath,
    now,
  });
  const reportPath = path.join(fixture.archiveGroup, "workspace-recovery-report.json");
  const raw = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(reportPath, raw, "utf8");
  return {
    report,
    reportPath,
    reportSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
  };
}

function options(fixture, evidence, extra = {}) {
  return {
    reportPath: evidence.reportPath,
    reportSha256: evidence.reportSha256,
    policyPath: fixture.policyPath,
    repoRoot: fixture.repoRoot,
    owner: "g5-recovery-owner",
    retainUntil,
    destination: path.join(fixture.archiveGroup, "planned-quarantine"),
    now,
    ...extra,
  };
}

function updatePolicyAndOrigin(fixture, update) {
  const policy = JSON.parse(fs.readFileSync(fixture.policyPath, "utf8"));
  update(policy);
  fs.writeFileSync(fixture.policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  git(fixture.repoRoot, ["add", "preservation/workspace-recovery-policy.json"]);
  git(fixture.repoRoot, ["commit", "-q", "-m", "tighten fixture policy"]);
  git(fixture.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return {
    policySha256: createHash("sha256").update(fs.readFileSync(fixture.policyPath)).digest("hex"),
    head: git(fixture.repoRoot, ["rev-parse", "HEAD"]),
  };
}

test("prepares a same-volume read-only plan without creating the destination", () => {
  const fixture = createFixture();
  try {
    const evidence = createReport(fixture);
    const outputPath = path.join(fixture.archiveGroup, "workspace-quarantine-manifest.json");
    const before = fs.readdirSync(fixture.archiveGroup).sort();
    const manifest = runWorkspaceQuarantinePreparation(options(fixture, evidence, { outputPath }));
    assert.equal(manifest.applyAuthorized, false);
    assert.equal(manifest.destination.exists, false);
    assert.equal(manifest.destination.created, false);
    assert.equal(manifest.destination.sameVolume, true);
    assert.equal(manifest.summary.status, "review");
    assert.equal(manifest.evidence.externalRecoveryReport.path, evidence.reportPath);
    assert.equal(manifest.evidence.externalRecoveryReport.sha256, evidence.reportSha256);
    assert.match(manifest.evidence.externalRecoveryReport.protectedGitStoreHashCoverage, /no preservation claim/u);
    assert.ok(manifest.summary.crossSourceHashClusters >= 1);
    assert.ok(manifest.entries.every((entry) => entry.plannedPath.startsWith(`${manifest.destination.path}${path.sep}`)));
    assert.ok(manifest.entries.every((entry) => entry.restoreRelativePath.startsWith(`${entry.sourceName}/`)));
    const reportEntry = evidence.report.sources[0].entries.find((entry) => entry.relativePath === "shared.txt");
    const manifestEntry = manifest.entries.find((entry) => entry.relativePath === "shared.txt");
    assert.equal(manifestEntry.mtimeUtc, reportEntry.timestamps.mtimeUtc);
    assert.equal(manifestEntry.reportDecision, reportEntry.decision);
    assert.deepEqual(manifestEntry.reportReasonCodes, reportEntry.reasonCodes);
    assert.equal(fs.existsSync(manifest.destination.path), false);
    assert.deepEqual(fs.readdirSync(fixture.archiveGroup).filter((name) => name !== path.basename(outputPath)).sort(), before);
    assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).applyAuthorized, false);
  } finally {
    cleanup(fixture);
  }
});

test("protected evidence is metadata-only and makes the plan no-go", () => {
  const fixture = createFixture();
  try {
    const evidence = createReport(fixture, { protectedFile: true });
    const manifest = runWorkspaceQuarantinePreparation(options(fixture, evidence));
    const protectedEntry = manifest.entries.find((entry) => entry.relativePath === ".env");
    assert.equal(manifest.applyAuthorized, false);
    assert.equal(manifest.summary.status, "no-go");
    assert.equal(protectedEntry.status, "protected");
    assert.equal(protectedEntry.sha256, null);
  } finally {
    cleanup(fixture);
  }
});

test("changed or missing evidence, policy/head mismatch, and existing destinations fail closed", () => {
  const changed = createFixture();
  try {
    const evidence = createReport(changed);
    addFile(changed.workspaceRoot, "gsm-one/shared.txt", "changed after report\n");
    assert.throws(() => runWorkspaceQuarantinePreparation(options(changed, evidence)), WorkspaceQuarantineManifestError);
  } finally {
    cleanup(changed);
  }

  const missing = createFixture();
  try {
    const evidence = createReport(missing);
    fs.rmSync(path.join(missing.workspaceRoot, "gsm-one"), { recursive: true, force: true });
    assert.throws(() => runWorkspaceQuarantinePreparation(options(missing, evidence)), /missing or unreadable/u);
  } finally {
    cleanup(missing);
  }

  const destination = createFixture();
  try {
    const evidence = createReport(destination);
    fs.mkdirSync(path.join(destination.archiveGroup, "planned-quarantine"));
    assert.throws(() => runWorkspaceQuarantinePreparation(options(destination, evidence)), /already exists/u);
  } finally {
    cleanup(destination);
  }

  const staleHead = createFixture();
  try {
    const evidence = createReport(staleHead);
    addFile(staleHead.repoRoot, "head-advanced.txt", "head advanced after report\n");
    git(staleHead.repoRoot, ["add", "head-advanced.txt"]);
    git(staleHead.repoRoot, ["commit", "-q", "-m", "advance fixture head"]);
    git(staleHead.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    assert.throws(() => runWorkspaceQuarantinePreparation(options(staleHead, evidence)), /report head does not match/u);
  } finally {
    cleanup(staleHead);
  }

  const wrongPolicy = createFixture();
  try {
    const evidence = createReport(wrongPolicy);
    const altered = { ...evidence.report, policySha256: "0".repeat(64) };
    const alteredRaw = `${JSON.stringify(altered, null, 2)}\n`;
    fs.writeFileSync(evidence.reportPath, alteredRaw, "utf8");
    assert.throws(() => runWorkspaceQuarantinePreparation(options(wrongPolicy, {
      ...evidence,
      reportSha256: createHash("sha256").update(alteredRaw, "utf8").digest("hex"),
    })), /policy SHA-256/u);
  } finally {
    cleanup(wrongPolicy);
  }
});

test("output is new-only and forbidden apply flags are rejected", () => {
  const fixture = createFixture();
  try {
    const evidence = createReport(fixture);
    const outputPath = path.join(fixture.archiveGroup, "manifest.json");
    assert.throws(() => runWorkspaceQuarantinePreparation(options(fixture, evidence, { reportSha256: "0".repeat(64) })), /report SHA-256/u);
    runWorkspaceQuarantinePreparation(options(fixture, evidence, { outputPath }));
    assert.throws(() => runWorkspaceQuarantinePreparation(options(fixture, evidence, { outputPath })), /already exists/u);
    const otherGroup = path.join(fixture.archiveRoot, "2026-08-24-g5-other-recovery");
    fs.mkdirSync(otherGroup);
    assert.throws(() => runWorkspaceQuarantinePreparation(options(fixture, evidence, {
      outputPath: path.join(otherGroup, "manifest.json"),
    })), /same dated g5 recovery group/u);
    const result = spawnSync(process.execPath, [preparerPath, "--apply"], { encoding: "utf8", stdio: "pipe" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /read-only/u);
  } finally {
    cleanup(fixture);
  }
});

test("aggregate policy limits apply across all source roots", () => {
  const fixture = createFixture();
  try {
    const evidence = createReport(fixture);
    const updated = updatePolicyAndOrigin(fixture, (policy) => {
      policy.limits.maxEntries = 5;
    });
    const altered = {
      ...evidence.report,
      policySha256: updated.policySha256,
      repositoryState: {
        ...evidence.report.repositoryState,
        head: updated.head,
        originMain: updated.head,
      },
    };
    const alteredRaw = `${JSON.stringify(altered, null, 2)}\n`;
    fs.writeFileSync(evidence.reportPath, alteredRaw, "utf8");
    assert.throws(() => runWorkspaceQuarantinePreparation(options(fixture, {
      reportPath: evidence.reportPath,
      reportSha256: createHash("sha256").update(alteredRaw, "utf8").digest("hex"),
    })), /all sources exceed maxEntries/u);
  } finally {
    cleanup(fixture);
  }
});
