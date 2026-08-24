import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareArtifactDispositionEntries,
  readArtifactDisposition,
  validateArtifactDisposition,
  validateArtifactDispositionShape,
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
