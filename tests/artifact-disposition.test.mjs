import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareArtifactDispositionEntries,
  readArtifactDisposition,
  validateArtifactDisposition,
  validateArtifactDispositionShape,
  validateUnusedQuarantinePath,
  verifyArchivedSourceReport,
} from "../scripts/validate-artifact-disposition.mjs";
import { runArtifactReport } from "../scripts/report-artifacts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceTime = new Date("2026-08-23T23:56:19.082Z");
const oldArtifactTime = new Date(evidenceTime.getTime() - 31 * 24 * 60 * 60 * 1000);

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe", windowsHide: true });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function createCleanCloneFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-clean-clone-"));
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "clean clone fixture\n", "utf8");
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.name", "Tear artifact disposition test"]);
  runGit(root, ["config", "user.email", "tear-artifact-disposition@example.test"]);
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-q", "-m", "fixture"]);
  runGit(root, ["branch", "-M", "main"]);
  runGit(root, ["remote", "add", "origin", "git@github.com:shaku1z/tear.git"]);
  return root;
}

function createFileVerificationFixture() {
  const root = createCleanCloneFixture();
  const groupSpecifications = [
    { id: "c24-mixed-age-build-assets", count: 90, bytes: 31_657_362, path: (index) => `artifacts/tearbench/c24/fixture-${String(index).padStart(3, "0")}.bin` },
    { id: "c3-path-bound-scenarios", count: 8, bytes: 10_774, path: (index) => `artifacts/tearbench/c3-fixture-${String(index).padStart(3, "0")}.json` },
    { id: "historical-provenance", count: 6, bytes: 15_178, path: (index) => [
      "artifacts/tearbench/c20-ci-selection.json",
      "artifacts/tearbench/c20-selection.json",
      "artifacts/tearbench/c21-completion-plan-ci.json",
      "artifacts/tearbench/c21-completion-plan-selection.json",
      "artifacts/tearbench/c6-wave99.json",
      "artifacts/tearbench/non-lossy-annex-plan-selection.json",
    ][index] },
  ];
  for (const specification of groupSpecifications) {
    for (let index = 0; index < specification.count; index += 1) {
      const filePath = path.join(root, specification.path(index));
      const bytes = index === 0 ? specification.bytes - specification.count + 1 : 1;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.alloc(bytes));
      fs.utimesSync(filePath, oldArtifactTime, oldArtifactTime);
    }
  }
  const report = runArtifactReport({
    root,
    policyPath: path.join(repositoryRoot, "preservation", "artifact-retention-policy.json"),
    sourceId: "ignored-artifacts",
    minAgeDays: 30,
    now: evidenceTime,
  });
  const entries = report.entries.filter((entry) => entry.decision === "eligible");
  assert.equal(entries.length, 104);
  assert.equal(report.summary.eligibleBytes, 31_683_314);
  const disposition = JSON.parse(JSON.stringify(readArtifactDisposition().disposition));
  const head = runGit(root, ["rev-parse", "HEAD"]);
  disposition.canonical.head = head;
  disposition.canonical.originMain = head;
  disposition.entries = entries.map((entry) => ({
    path: entry.repoRelativePath,
    bytes: entry.bytes,
    sha256: entry.sha256,
    mtimeUtc: entry.timestamps.mtimeUtc,
    group: entry.repoRelativePath.startsWith("artifacts/tearbench/c24/")
      ? "c24-mixed-age-build-assets"
      : entry.repoRelativePath.startsWith("artifacts/tearbench/c3-")
        ? "c3-path-bound-scenarios"
        : "historical-provenance",
    sourceReport: "artifact-retention-report-5281470",
  }));
  const dispositionPath = path.join(root, "disposition.json");
  fs.writeFileSync(dispositionPath, `${JSON.stringify(disposition)}\n`, "utf8");
  return { root, dispositionPath, report, entries };
}

test("explicit file verification binds the exact current files", () => {
  const loaded = readArtifactDisposition();
  assert.deepEqual(validateArtifactDispositionShape(loaded.disposition), []);
  const result = validateArtifactDisposition({ root: repositoryRoot, verifyFiles: true, now: evidenceTime });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, "valid");
  assert.equal(result.current.summary.eligibleEntries, 104);
  assert.equal(result.current.summary.eligibleBytes, 31_683_314);
});

test("default validation passes for a clean clone with empty artifacts, while verify-files fails closed", () => {
  const root = createCleanCloneFixture();
  try {
    const dispositionPath = path.join(repositoryRoot, "preservation", "artifact-retention-disposition.json");
    const portable = validateArtifactDisposition({ root, dispositionPath, now: evidenceTime });
    assert.equal(portable.ok, true, JSON.stringify(portable, null, 2));
    assert.equal(portable.current, undefined);

    const fileVerification = validateArtifactDisposition({ root, dispositionPath, verifyFiles: true, now: evidenceTime });
    assert.equal(fileVerification.ok, false);
    assert.match(fileVerification.errors.join("\n"), /disposed artifact\(s\) are missing|age-eligible artifact\(s\) are unreviewed/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an age-eligible file added later is reported as unreviewed", () => {
  const loaded = readArtifactDisposition();
  const currentEntries = loaded.disposition.entries.map((entry) => ({
    repoRelativePath: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
    timestamps: { mtimeUtc: entry.mtimeUtc },
  }));
  currentEntries.push({
    repoRelativePath: "artifacts/future-review/new-evidence.json",
    bytes: 12,
    sha256: "a".repeat(64),
    timestamps: { mtimeUtc: "2026-07-01T00:00:00.000Z" },
  });
  const comparison = compareArtifactDispositionEntries(loaded.disposition.entries, currentEntries);
  assert.deepEqual(comparison.unreviewed, ["artifacts/future-review/new-evidence.json"]);
  assert.deepEqual(comparison.missing, []);
  assert.deepEqual(comparison.changed, []);
});

test("a changed retained file fails its hash binding", () => {
  const loaded = readArtifactDisposition();
  const first = loaded.disposition.entries[0];
  const currentEntries = loaded.disposition.entries.map((entry) => ({
    repoRelativePath: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
    timestamps: { mtimeUtc: entry.mtimeUtc },
  }));
  currentEntries[0] = {
    ...currentEntries[0],
    bytes: first.bytes + 1,
    sha256: "b".repeat(64),
  };
  const comparison = compareArtifactDispositionEntries(loaded.disposition.entries, currentEntries);
  assert.equal(comparison.unreviewed.length, 0);
  assert.equal(comparison.missing.length, 0);
  assert.deepEqual(comparison.changed.map((entry) => entry.path), [first.path]);
});

test("malformed, missing, and non-string entry paths fail as validation errors", () => {
  const loaded = readArtifactDisposition();
  for (const malformedPath of [undefined, null, 42, {}]) {
    const disposition = JSON.parse(JSON.stringify(loaded.disposition));
    if (malformedPath === undefined) delete disposition.entries[0].path;
    else disposition.entries[0].path = malformedPath;
    let errors;
    assert.doesNotThrow(() => { errors = validateArtifactDispositionShape(disposition); });
    assert.ok(errors.some((error) => error.includes("entries[0].path")), `missing path error for ${String(malformedPath)}`);
  }
});

test("all group IDs, counts, bytes, prefixes, and reasons are exact", () => {
  const loaded = readArtifactDisposition();
  for (const field of ["id", "count", "bytes", "pathPrefix", "reason"]) {
    const disposition = JSON.parse(JSON.stringify(loaded.disposition));
    if (field === "id") disposition.groups[0].id = "unexpected-group";
    else if (field === "count") disposition.groups[0][field] += 1;
    else if (field === "bytes") disposition.groups[0][field] += 1;
    else disposition.groups[0][field] = "changed";
    const errors = validateArtifactDispositionShape(disposition);
    assert.ok(errors.length > 0, `group ${field} mutation must fail`);
  }
});

test("the quarantine path must be truly absent, including empty directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-quarantine-"));
  try {
    fs.mkdirSync(path.join(root, ".artifact-quarantine"));
    assert.match(validateUnusedQuarantinePath(root).join("\n"), /must be absent/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("quarantine symlinks and junctions are rejected when the host permits them", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-link-"));
  try {
    const target = path.join(root, "target");
    const quarantinePath = path.join(root, ".artifact-quarantine");
    fs.mkdirSync(target);
    try {
      fs.symlinkSync(target, quarantinePath, "junction");
    } catch {
      try {
        fs.symlinkSync(target, quarantinePath, "dir");
      } catch {
        t.skip("symlink/junction fixtures unavailable on this host");
        return;
      }
    }
    assert.match(validateUnusedQuarantinePath(root).join("\n"), /symlink\/reparse/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verify-files succeeds on a canonical fixture and archive-root implies file verification", () => {
  const fixture = createFileVerificationFixture();
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-fixture-archive-"));
  try {
    const local = validateArtifactDisposition({
      root: fixture.root,
      dispositionPath: fixture.dispositionPath,
      verifyFiles: true,
      now: evidenceTime,
    });
    assert.equal(local.ok, true, JSON.stringify(local, null, 2));

    const loaded = readArtifactDisposition(fixture.dispositionPath);
    const disposition = loaded.disposition;
    const reportContents = Buffer.from("{\"format\":\"fixture\"}\n", "utf8");
    const reportPath = path.join(archiveRoot, "evidence", "report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportContents);
    disposition.sourceReport.archivePath = "evidence/report.json";
    disposition.sourceReport.bytes = reportContents.byteLength;
    disposition.sourceReport.sha256 = createHash("sha256").update(reportContents).digest("hex");
    fs.writeFileSync(fixture.dispositionPath, `${JSON.stringify(disposition)}\n`, "utf8");

    const archiveImplied = validateArtifactDisposition({
      root: fixture.root,
      dispositionPath: fixture.dispositionPath,
      archiveRoot,
      now: evidenceTime,
    });
    assert.equal(archiveImplied.ok, true, JSON.stringify(archiveImplied, null, 2));

    const missingArchive = validateArtifactDisposition({
      root: fixture.root,
      dispositionPath: fixture.dispositionPath,
      archiveRoot: path.join(archiveRoot, "missing"),
      now: evidenceTime,
    });
    assert.equal(missingArchive.ok, false);
    assert.match(missingArchive.errors.join("\n"), /archived source report is missing/u);

    fs.rmSync(path.join(fixture.root, fixture.entries[0].repoRelativePath), { force: true });
    const missingFile = validateArtifactDisposition({
      root: fixture.root,
      dispositionPath: fixture.dispositionPath,
      archiveRoot,
      now: evidenceTime,
    });
    assert.equal(missingFile.ok, false);
    assert.match(missingFile.errors.join("\n"), /disposed artifact\(s\) are missing/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  }
});

test("archived source report verification uses an explicit external root and exact hash/size", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-root-"));
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-archive-"));
  try {
    const archivePath = path.join(archiveRoot, "evidence", "report.json");
    const contents = Buffer.from("{\"format\":\"fixture\"}\n", "utf8");
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, contents, "utf8");
    const sourceReport = {
      archiveRoot: "Tear-archives",
      archivePath: "evidence/report.json",
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
    assert.equal(verifyArchivedSourceReport({ root, archiveRoot, sourceReport }).ok, true);
    assert.equal(verifyArchivedSourceReport({ root, archiveRoot, sourceReport: { ...sourceReport, bytes: contents.byteLength + 1 } }).ok, false);
    assert.equal(verifyArchivedSourceReport({ root, archiveRoot, sourceReport: { ...sourceReport, sha256: "0".repeat(64) } }).ok, false);
    assert.equal(verifyArchivedSourceReport({ root, archiveRoot, sourceReport: { ...sourceReport, archivePath: "missing.json" } }).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  }
});

test("external archive verification is opt-in and fail-closed when requested", () => {
  const dispositionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-manifest-"));
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-disposition-archive-"));
  try {
    const loaded = readArtifactDisposition();
    const reportContents = Buffer.from("{\"format\":\"fixture\"}\n", "utf8");
    const reportPath = path.join(archiveRoot, "evidence", "report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportContents);
    const writeDisposition = (name, sourceReportChanges) => {
      const disposition = JSON.parse(JSON.stringify(loaded.disposition));
      disposition.sourceReport = { ...disposition.sourceReport, ...sourceReportChanges };
      const dispositionPath = path.join(dispositionRoot, name);
      fs.writeFileSync(dispositionPath, `${JSON.stringify(disposition)}\n`);
      return dispositionPath;
    };
    const noArchive = validateArtifactDisposition({
      root: repositoryRoot,
      dispositionPath: writeDisposition("no-archive.json", { archivePath: "missing/no-report.json" }),
      now: evidenceTime,
    });
    assert.equal(noArchive.ok, true, JSON.stringify(noArchive, null, 2));

    const sourceReport = {
      archiveRoot: "Tear-archives",
      archivePath: "evidence/report.json",
      bytes: reportContents.byteLength,
      sha256: createHash("sha256").update(reportContents).digest("hex"),
    };
    const correct = validateArtifactDisposition({
      root: repositoryRoot,
      dispositionPath: writeDisposition("correct-archive.json", sourceReport),
      archiveRoot,
      now: evidenceTime,
    });
    assert.equal(correct.ok, true, JSON.stringify(correct, null, 2));

    const missing = validateArtifactDisposition({
      root: repositoryRoot,
      dispositionPath: writeDisposition("missing-report.json", sourceReport),
      archiveRoot: path.join(dispositionRoot, "missing-archive"),
      now: evidenceTime,
    });
    assert.equal(missing.ok, false);
    assert.match(missing.errors.join("\n"), /archived source report is missing/u);

    const wrong = validateArtifactDisposition({
      root: repositoryRoot,
      dispositionPath: writeDisposition("wrong-report.json", { ...sourceReport, archivePath: "evidence/wrong-report.json" }),
      archiveRoot,
      now: evidenceTime,
    });
    assert.equal(wrong.ok, false);
    assert.match(wrong.errors.join("\n"), /archived source report is missing/u);
  } finally {
    fs.rmSync(dispositionRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  }
});
