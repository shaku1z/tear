import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { comparePreservedCopies, writeExclusiveReport } from "../scripts/compare-preserved-copies.mjs";

function git(root, argumentsList) {
  const result = spawnSync("git", ["-C", root, ...argumentsList], { encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeFixtureManifest(value, mutate = (manifest) => manifest) {
  const manifest = mutate(JSON.parse(JSON.stringify(value.manifest)));
  fs.writeFileSync(value.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  value.expectedManifestSha256 = sha256(fs.readFileSync(value.manifestPath));
  return { manifest, expectedSha256: value.expectedManifestSha256 };
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-preserved-copy-comparison-"));
  const workspaceRoot = path.join(base, "workspace");
  const tempRoot = path.join(base, "temp");
  const archiveGroupRoot = path.join(base, "archive-group");
  const repoRoot = path.join(workspaceRoot, "Tear");
  const payloadRoot = path.join(archiveGroupRoot, "payload");
  const publicationRoot = path.join(payloadRoot, "Tear-main-publication");
  const receiptRoot = path.join(payloadRoot, "Tear-receipt-clean");
  const publicationSourceRoot = path.join(tempRoot, "Tear-main-publication");
  const receiptSourceRoot = path.join(workspaceRoot, "Tear-receipt-clean");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(publicationRoot, { recursive: true });
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, "same.txt"), "same\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "canonical-only.txt"), "canonical\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "conflict.txt"), "canonical conflict\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "receipt-conflict.txt"), "canonical receipt conflict\n", "utf8");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Tear comparison test"]);
  git(repoRoot, ["config", "user.email", "tear-comparison@example.test"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-q", "-m", "fixture"]);
  git(repoRoot, ["branch", "-M", "main"]);
  git(repoRoot, ["remote", "add", "origin", "https://github.com/shaku1z/tear.git"]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repoRoot, ["config", "branch.main.remote", "origin"]);
  git(repoRoot, ["config", "branch.main.merge", "refs/heads/main"]);

  const files = [
    [publicationRoot, "same.txt", "same\n"],
    [publicationRoot, "unique.txt", "unique\n"],
    [publicationRoot, "conflict.txt", "publication conflict\n"],
    [publicationRoot, "protected.dat", "protected\n"],
    [receiptRoot, "same.txt", "same\n"],
    [receiptRoot, "peer.txt", "unique\n"],
    [receiptRoot, "receipt-conflict.txt", "receipt conflict\n"],
  ];
  for (const [root, relativePath, contents] of files) fs.writeFileSync(path.join(root, relativePath), contents, "utf8");
  const destination = path.join(archiveGroupRoot, "payload");
  const source = (sourceId, sourceName, sourceRoot, rootArgument) => ({ id: sourceId, name: sourceName, path: sourceRoot, rootArgument });
  const entry = (sourceId, sourceName, sourceRoot, relativePath, bytes, sha256Value) => ({
    sourceId,
    sourceName,
    sourceRoot,
    rootArgument: sourceName === "Tear-main-publication" ? "temp-root" : "workspace-root",
    relativePath,
    originalPath: path.join(sourceRoot, ...relativePath.split("/")),
    plannedPath: path.join(destination, sourceName, ...relativePath.split("/")),
    restoreRelativePath: `${sourceName}/${relativePath}`,
    kind: "file",
    bytes,
    sha256: sha256Value,
  });
  const publicationId = "publication-copy";
  const receiptId = "receipt-copies";
  const manifestEntries = [
    entry(publicationId, "Tear-main-publication", publicationSourceRoot, "same.txt", 5, sha256("same\n")),
    entry(publicationId, "Tear-main-publication", publicationSourceRoot, "unique.txt", 7, sha256("unique\n")),
    entry(publicationId, "Tear-main-publication", publicationSourceRoot, "conflict.txt", 21, sha256("publication conflict\n")),
    { ...entry(publicationId, "Tear-main-publication", publicationSourceRoot, "protected.dat", 10, null), reportReasonCodes: ["protected-name-pattern"] },
    entry(receiptId, "Tear-receipt-clean", receiptSourceRoot, "same.txt", 5, sha256("same\n")),
    entry(receiptId, "Tear-receipt-clean", receiptSourceRoot, "peer.txt", 7, sha256("unique\n")),
    entry(receiptId, "Tear-receipt-clean", receiptSourceRoot, "receipt-conflict.txt", 16, sha256("receipt conflict\n")),
    entry("historical-copy", "historical-copy", tempRoot, "archived.txt", 7, sha256("unique\n")),
  ];
  const manifest = {
    format: "tear-workspace-quarantine-manifest",
    schemaVersion: 1,
    roots: {
      workspaceRoot,
      tempRoot,
      archiveRoot: archiveGroupRoot,
      sourceRoots: [
        source(publicationId, "Tear-main-publication", publicationSourceRoot, "temp-root"),
        source(receiptId, "Tear-receipt-clean", receiptSourceRoot, "workspace-root"),
        source("historical-copy", "historical-copy", tempRoot, "temp-root"),
      ],
    },
    destination: { path: destination },
    entries: manifestEntries,
  };
  const manifestPath = path.join(archiveGroupRoot, "manifest.json");
  const value = { base, repoRoot, payloadRoot, archiveGroupRoot, manifestPath, manifest, expectedHead: git(repoRoot, ["rev-parse", "HEAD"]) };
  const written = writeFixtureManifest(value);
  value.expectedManifestSha256 = written.expectedSha256;
  return value;
}

function compare(value, overrides = {}) {
  return comparePreservedCopies({
    repoRoot: value.repoRoot,
    payloadRoot: value.payloadRoot,
    archiveGroupRoot: value.archiveGroupRoot,
    manifestPaths: [value.manifestPath],
    expectedManifestSha256: [value.expectedManifestSha256],
    expectedHead: value.expectedHead,
    now: new Date("2026-08-23T22:00:00.000Z"),
    ...overrides,
  });
}

test("compares preserved copies and treats path-conflict-only content as unmatched", () => {
  const value = fixture();
  try {
    const report = compare(value);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.canonical.origin, "github.com/shaku1z/tear.git");
    const publication = report.copies.find((copy) => copy.sourceName === "Tear-main-publication");
    const receipt = report.copies.find((copy) => copy.sourceName === "Tear-receipt-clean");
    assert.equal(publication.summary.canonicalExactPath, 1);
    assert.equal(publication.summary.unmatchedContent, 1);
    assert.equal(publication.summary.protectedUnhashedEntries, 1);
    assert.equal(publication.entries.find((entry) => entry.relativePath === "conflict.txt").status, "canonical-path-conflict");
    assert.equal(receipt.summary.canonicalExactPath, 1);
    assert.equal(receipt.summary.preservationContentDuplicates, 1);
    assert.equal(receipt.summary.unmatchedContent, 1);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("requires a matching expected SHA-256 for every supplied manifest", () => {
  const value = fixture();
  try {
    assert.throws(() => comparePreservedCopies({ repoRoot: value.repoRoot, payloadRoot: value.payloadRoot, archiveGroupRoot: value.archiveGroupRoot, manifestPaths: [value.manifestPath], expectedHead: value.expectedHead }), /one SHA-256 for every supplied manifest/u);
    assert.throws(() => compare(value, { expectedManifestSha256: ["0".repeat(64)] }), /manifest SHA-256 does not match/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("rejects wrong origin, expected head, duplicate entries, and source mappings", () => {
  const value = fixture();
  try {
    git(value.repoRoot, ["remote", "set-url", "origin", "https://example.test/tear.git"]);
    assert.throws(() => compare(value), /origin must normalize exactly/u);
    git(value.repoRoot, ["remote", "set-url", "origin", "https://github.com/shaku1z/tear.git"]);
    assert.throws(() => compare(value, { expectedHead: "0".repeat(40) }), /expected-head/u);
    writeFixtureManifest(value, (manifest) => { manifest.entries.push({ ...manifest.entries[0] }); return manifest; });
    assert.throws(() => compare(value), /duplicate preservation entry/u);
    writeFixtureManifest(value, (manifest) => { manifest.entries[0].sourceId = "wrong-source"; return manifest; });
    assert.throws(() => compare(value), /selected source identity is not exact/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("fails closed when an ordinary target file is absent from the manifest", () => {
  const value = fixture();
  try {
    fs.writeFileSync(path.join(value.payloadRoot, "Tear-main-publication", "unlisted.txt"), "unlisted\n", "utf8");
    assert.throws(() => compare(value), /ordinary files absent from manifest/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("fails closed when a target copy is absent", () => {
  const value = fixture();
  try {
    fs.rmSync(path.join(value.payloadRoot, "Tear-receipt-clean"), { recursive: true, force: true });
    assert.throws(() => compare(value), /preserved target copy is missing/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("requires an existing archive group at the comparison boundary", () => {
  const value = fixture();
  try {
    assert.throws(() => compare(value, { archiveGroupRoot: path.join(value.base, "missing") }), /archive-group-root must be an existing directory/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("exclusive report creation refuses a competing or pre-existing writer", () => {
  const value = fixture();
  try {
    const output = path.join(value.archiveGroupRoot, "exclusive-output.json");
    writeExclusiveReport(output, { writer: "first" });
    assert.throws(() => writeExclusiveReport(output, { writer: "second" }), /new-only and was created concurrently or already exists/u);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), { writer: "first" });
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});
