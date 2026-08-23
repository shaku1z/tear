import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runWorkspaceRecoveryReport } from "../scripts/report-workspace-recovery.mjs";
import { runWorkspaceQuarantinePreparation } from "../scripts/prepare-workspace-quarantine.mjs";
import {
  runWorkspacePreservationQuarantine,
} from "../scripts/apply-workspace-quarantine.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policySource = path.join(repositoryRoot, "preservation", "workspace-recovery-policy.json");
const applyScript = path.join(repositoryRoot, "scripts", "apply-workspace-quarantine.mjs");
const now = new Date("2026-08-23T12:00:00.000Z");
const retainUntil = "2026-09-30T00:00:00.000Z";

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

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-workspace-preservation-"));
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
  addFile(repoRoot, "README.md", "canonical fixture\n");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Tear preservation quarantine test"]);
  git(repoRoot, ["config", "user.email", "tear-preservation@example.test"]);
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

function createEvidence(fixture) {
  const gsm = path.join(fixture.workspaceRoot, "gsm-one");
  const receipt = path.join(fixture.workspaceRoot, "Tear-receipt-clean");
  fs.mkdirSync(gsm);
  fs.mkdirSync(receipt);
  addFile(gsm, "README.md", "canonical fixture\n");
  addFile(gsm, "payload.txt", "whole-root payload\n");
  addFile(gsm, ".env", "SECRET=protected fixture\n");
  addFile(receipt, "receipt.txt", "receipt payload\n");
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
  const reportRaw = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(reportPath, reportRaw, "utf8");
  const destination = path.join(fixture.archiveGroup, "planned-quarantine");
  const manifest = runWorkspaceQuarantinePreparation({
    reportPath,
    reportSha256: createHash("sha256").update(reportRaw, "utf8").digest("hex"),
    policyPath: fixture.policyPath,
    repoRoot: fixture.repoRoot,
    owner: "g5-recovery-owner",
    retainUntil,
    destination,
    now,
  });
  const manifestPath = path.join(fixture.archiveGroup, "workspace-quarantine-manifest.json");
  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, manifestRaw, "utf8");
  return {
    report,
    manifest,
    reportPath,
    manifestPath,
    reportSha256: createHash("sha256").update(reportRaw, "utf8").digest("hex"),
    manifestSha256: createHash("sha256").update(manifestRaw, "utf8").digest("hex"),
    destination,
    journalPath: path.join(fixture.archiveGroup, "workspace-quarantine-journal"),
  };
}

function options(fixture, evidence, extra = {}) {
  return {
    reportPath: evidence.reportPath,
    reportSha256: evidence.reportSha256,
    manifestPath: evidence.manifestPath,
    manifestSha256: evidence.manifestSha256,
    policyPath: fixture.policyPath,
    repoRoot: fixture.repoRoot,
    owner: "g5-recovery-owner",
    retainUntil,
    journalPath: evidence.journalPath,
    apply: true,
    wholeRootPreservation: true,
    acknowledgeNoGoProtectedContent: true,
    now,
    ...extra,
  };
}

function rewriteManifest(evidence, mutate) {
  const manifest = JSON.parse(fs.readFileSync(evidence.manifestPath, "utf8"));
  mutate(manifest);
  const raw = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(evidence.manifestPath, raw, "utf8");
  evidence.manifestSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
}

test("applies whole-root preservation, moves protected content intact, and writes a receipt", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    const protectedPath = path.join(fixture.workspaceRoot, "gsm-one", ".env");
    const originalReadFileSync = fs.readFileSync;
    let protectedOpened = false;
    fs.readFileSync = function guardedRead(filePath, ...args) {
      if (path.resolve(String(filePath)) === path.resolve(protectedPath)) protectedOpened = true;
      return originalReadFileSync.call(this, filePath, ...args);
    };
    let receipt;
    try {
      receipt = runWorkspacePreservationQuarantine(options(fixture, evidence));
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
    assert.equal(protectedOpened, false);
    assert.equal(receipt.status, "complete");
    assert.equal(receipt.sourceCount, 2);
    assert.match(receipt.eventsSha256, /^[0-9a-f]{64}$/u);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, "gsm-one")), false);
    assert.equal(fs.readFileSync(path.join(evidence.destination, "gsm-one", ".env"), "utf8"), "SECRET=protected fixture\n");
    const receiptPath = path.join(evidence.journalPath, "completion-receipt.json");
    assert.equal(JSON.parse(fs.readFileSync(receiptPath, "utf8")).eventCount > 0, true);
    assert.equal(fs.readdirSync(evidence.journalPath).filter((name) => name.endsWith(".json")).length > 2, true);
  } finally {
    cleanup(fixture);
  }
});

test("requires exact acknowledgements and refuses changed evidence", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    for (const field of ["apply", "wholeRootPreservation", "acknowledgeNoGoProtectedContent"]) {
      const missing = options(fixture, evidence);
      missing[field] = false;
      assert.throws(() => runWorkspacePreservationQuarantine(missing), /exact .*acknowledgements/u);
    }
    addFile(fixture.workspaceRoot, "gsm-one/payload.txt", "changed after manifest\n");
    assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence)), /stable evidence|hash changed|metadata changed/u);
    assert.equal(fs.existsSync(evidence.destination), false);
  } finally {
    cleanup(fixture);
  }
});

test("resumes an injected partial rename only after validating moved destination evidence", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence, { interruptAfterMoves: 1 })), /injected interruption/u);
    assert.equal(fs.existsSync(path.join(evidence.destination, "gsm-one")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, "gsm-one")), false);
    assert.equal(fs.existsSync(path.join(evidence.journalPath, "completion-receipt.json")), false);
    const receipt = runWorkspacePreservationQuarantine(options(fixture, evidence, { resume: true }));
    assert.equal(receipt.status, "complete");
    assert.equal(fs.existsSync(path.join(evidence.destination, "Tear-receipt-clean")), true);
  } finally {
    cleanup(fixture);
  }
});

test("retries a journaled rename without fabricating a duplicate move-start", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    const originalRenameSync = fs.renameSync;
    let failOnce = true;
    fs.renameSync = function failFirstRename(...args) {
      if (failOnce) {
        failOnce = false;
        throw new Error("injected rename failure");
      }
      return originalRenameSync.apply(this, args);
    };
    try {
      assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence)), /whole-root rename failed/u);
    } finally {
      fs.renameSync = originalRenameSync;
    }
    const receipt = runWorkspacePreservationQuarantine(options(fixture, evidence, { resume: true }));
    assert.equal(receipt.status, "complete");
    const eventNames = fs.readdirSync(evidence.journalPath).filter((name) => name.includes("move-start"));
    assert.equal(eventNames.length, 2);
  } finally {
    cleanup(fixture);
  }
});

test("refuses collisions and both-present or both-missing source pairs", () => {
  const collision = createFixture();
  try {
    const evidence = createEvidence(collision);
    fs.mkdirSync(evidence.destination, { recursive: true });
    addFile(evidence.destination, "unexpected.txt", "collision\n");
    assert.throws(() => runWorkspacePreservationQuarantine(options(collision, evidence)), /destination must be absent/u);
  } finally {
    cleanup(collision);
  }

  const bothPresent = createFixture();
  try {
    const evidence = createEvidence(bothPresent);
    assert.throws(() => runWorkspacePreservationQuarantine(options(bothPresent, evidence, { interruptAfterMoves: 1 })), /injected interruption/u);
    const original = path.join(bothPresent.workspaceRoot, "gsm-one");
    fs.mkdirSync(original, { recursive: true });
    addFile(original, "payload.txt", "recreated\n");
    assert.throws(() => runWorkspacePreservationQuarantine(options(bothPresent, evidence, { resume: true })), /both-present/u);
  } finally {
    cleanup(bothPresent);
  }

  const bothMissing = createFixture();
  try {
    const evidence = createEvidence(bothMissing);
    assert.throws(() => runWorkspacePreservationQuarantine(options(bothMissing, evidence, { interruptAfterMoves: 1 })), /injected interruption/u);
    fs.rmSync(path.join(evidence.destination, "gsm-one"), { recursive: true, force: true });
    assert.throws(() => runWorkspacePreservationQuarantine(options(bothMissing, evidence, { resume: true })), /both-missing/u);
  } finally {
    cleanup(bothMissing);
  }
});

test("rejects case-insensitive duplicate source and destination mappings before mutation", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    rewriteManifest(evidence, (manifest) => {
      manifest.roots.sourceRoots[1].name = manifest.roots.sourceRoots[0].name.toUpperCase();
    });
    assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence)), /case-insensitive duplicate destination child mappings/u);
    assert.equal(fs.existsSync(evidence.destination), false);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, "gsm-one")), true);
  } finally {
    cleanup(fixture);
  }
});

test("rejects fabricated journal event identity and tampered completion receipt", () => {
  const interrupted = createFixture();
  try {
    const evidence = createEvidence(interrupted);
    assert.throws(() => runWorkspacePreservationQuarantine(options(interrupted, evidence, { interruptAfterMoves: 1 })), /injected interruption/u);
    const moveStartName = fs.readdirSync(evidence.journalPath).find((name) => name.includes("move-start"));
    assert.notEqual(moveStartName, undefined);
    const moveStartPath = path.join(evidence.journalPath, moveStartName);
    const moveStart = JSON.parse(fs.readFileSync(moveStartPath, "utf8"));
    moveStart.destinationPath = path.join(evidence.destination, "fabricated-source");
    fs.writeFileSync(moveStartPath, `${JSON.stringify(moveStart, null, 2)}\n`, "utf8");
    assert.throws(() => runWorkspacePreservationQuarantine(options(interrupted, evidence, { resume: true })), /journal .*identity|journal .*invalid/u);
  } finally {
    cleanup(interrupted);
  }

  const completed = createFixture();
  try {
    const evidence = createEvidence(completed);
    runWorkspacePreservationQuarantine(options(completed, evidence));
    const receiptPath = path.join(evidence.journalPath, "completion-receipt.json");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    receipt.eventsSha256 = "0".repeat(64);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    assert.throws(() => runWorkspacePreservationQuarantine(options(completed, evidence, { resume: true })), /completion receipt event hash or count/u);
  } finally {
    cleanup(completed);
  }
});

test("requires exactly one authenticated apply-complete event before accepting a receipt", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    runWorkspacePreservationQuarantine(options(fixture, evidence));
    const applyCompleteName = fs.readdirSync(evidence.journalPath).find((name) => {
      if (!name.endsWith(".json")) return false;
      return JSON.parse(fs.readFileSync(path.join(evidence.journalPath, name), "utf8")).type === "apply-complete";
    });
    assert.notEqual(applyCompleteName, undefined);
    fs.rmSync(path.join(evidence.journalPath, applyCompleteName));
    const eventNames = fs.readdirSync(evidence.journalPath)
      .filter((name) => /^\d{6}-[a-z0-9-]+\.json$/u.test(name))
      .sort();
    const eventsHash = createHash("sha256");
    for (const name of eventNames) eventsHash.update(fs.readFileSync(path.join(evidence.journalPath, name)));
    const receiptPath = path.join(evidence.journalPath, "completion-receipt.json");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    receipt.eventCount = eventNames.length;
    receipt.eventsSha256 = eventsHash.digest("hex");
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence, { resume: true })), /exactly one apply-complete/u);
  } finally {
    cleanup(fixture);
  }
});

test("final destination verification blocks certification after a post-last-move mutation and resumes safely", () => {
  const fixture = createFixture();
  try {
    const evidence = createEvidence(fixture);
    const concurrentMutation = path.join(evidence.destination, "gsm-one", "post-last-move-mutation.txt");
    assert.throws(() => runWorkspacePreservationQuarantine(options(fixture, evidence, {
      beforeFinalCompletionVerification: () => {
        fs.writeFileSync(concurrentMutation, "concurrent mutation\n", "utf8");
      },
    })), /whole-root evidence was added/u);
    assert.equal(fs.existsSync(path.join(evidence.journalPath, "completion-receipt.json")), false);
    const eventTypes = fs.readdirSync(evidence.journalPath)
      .filter((name) => /^\d{6}-[a-z0-9-]+\.json$/u.test(name))
      .map((name) => JSON.parse(fs.readFileSync(path.join(evidence.journalPath, name), "utf8")).type);
    assert.equal(eventTypes.includes("apply-complete"), false);
    assert.equal(eventTypes.includes("move-complete"), true);
    fs.rmSync(concurrentMutation);
    const receipt = runWorkspacePreservationQuarantine(options(fixture, evidence, { resume: true }));
    assert.equal(receipt.status, "complete");
    assert.equal(fs.existsSync(path.join(evidence.journalPath, "completion-receipt.json")), true);
  } finally {
    cleanup(fixture);
  }
});

test("CLI does not expose restore or selective-entry mutation paths", () => {
  for (const forbidden of ["--restore", "--selective", "--copy", "--delete"]) {
    const result = spawnSync(process.execPath, [applyScript, forbidden], { encoding: "utf8", stdio: "pipe" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refused|apply-only/u);
  }
});
