import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
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

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceTime = new Date("2026-08-23T23:56:19.082Z");

test("the tracked artifact disposition binds the exact current files", () => {
  const loaded = readArtifactDisposition();
  assert.deepEqual(validateArtifactDispositionShape(loaded.disposition), []);
  const result = validateArtifactDisposition({ root: repositoryRoot, now: evidenceTime });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, "valid");
  assert.equal(result.current.summary.eligibleEntries, 104);
  assert.equal(result.current.summary.eligibleBytes, 31_683_314);
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
