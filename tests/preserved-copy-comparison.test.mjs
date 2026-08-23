import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { comparePreservedCopies } from "../scripts/compare-preserved-copies.mjs";

function git(root, argumentsList) {
  const result = spawnSync("git", ["-C", root, ...argumentsList], { encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-preserved-copy-comparison-"));
  const repoRoot = path.join(base, "Tear");
  const payloadRoot = path.join(base, "payload");
  const publicationRoot = path.join(payloadRoot, "Tear-main-publication");
  const receiptRoot = path.join(payloadRoot, "Tear-receipt-clean");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(publicationRoot, { recursive: true });
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "same.txt"), "same\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "canonical-only.txt"), "canonical\n", "utf8");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Tear comparison test"]);
  git(repoRoot, ["config", "user.email", "tear-comparison@example.test"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-q", "-m", "fixture"]);
  git(repoRoot, ["branch", "-M", "main"]);
  git(repoRoot, ["remote", "add", "origin", "https://example.test/tear.git"]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repoRoot, ["config", "branch.main.remote", "origin"]);
  git(repoRoot, ["config", "branch.main.merge", "refs/heads/main"]);

  const files = [
    [publicationRoot, "same.txt", "same\n"],
    [publicationRoot, "unique.txt", "unique\n"],
    [publicationRoot, "protected.dat", "protected\n"],
    [receiptRoot, "same.txt", "same\n"],
    [receiptRoot, "peer.txt", "unique\n"],
  ];
  for (const [root, relativePath, contents] of files) fs.writeFileSync(path.join(root, relativePath), contents, "utf8");
  const manifestEntries = [
    { sourceName: "Tear-main-publication", relativePath: "same.txt", kind: "file", bytes: 5, sha256: sha256("same\n") },
    { sourceName: "Tear-main-publication", relativePath: "unique.txt", kind: "file", bytes: 7, sha256: sha256("unique\n") },
    { sourceName: "Tear-main-publication", relativePath: "protected.dat", kind: "file", bytes: 10, sha256: null, reportReasonCodes: ["protected-name-pattern"] },
    { sourceName: "Tear-receipt-clean", relativePath: "same.txt", kind: "file", bytes: 5, sha256: sha256("same\n") },
    { sourceName: "Tear-receipt-clean", relativePath: "peer.txt", kind: "file", bytes: 7, sha256: sha256("unique\n") },
    { sourceName: "historical-copy", relativePath: "archived.txt", kind: "file", bytes: 7, sha256: sha256("unique\n") },
  ];
  const manifestPath = path.join(base, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ format: "tear-workspace-quarantine-manifest", schemaVersion: 1, entries: manifestEntries }, null, 2), "utf8");
  return { base, repoRoot, payloadRoot, manifestPath };
}

test("compares preserved copies by canonical path, content, peer copies, and protected metadata", () => {
  const value = fixture();
  try {
    const report = comparePreservedCopies({ repoRoot: value.repoRoot, payloadRoot: value.payloadRoot, manifestPaths: [value.manifestPath], now: new Date("2026-08-23T22:00:00.000Z") });
    assert.equal(report.canonical.branch, "main");
    assert.equal(report.canonical.clean, true);
    const publication = report.copies.find((copy) => copy.sourceName === "Tear-main-publication");
    const receipt = report.copies.find((copy) => copy.sourceName === "Tear-receipt-clean");
    assert.equal(publication.summary.canonicalExactPath, 1);
    assert.equal(publication.summary.uniqueContent, 0);
    assert.equal(publication.summary.protectedUnhashedEntries, 1);
    assert.equal(receipt.summary.canonicalExactPath, 1);
    assert.equal(receipt.summary.preservationContentDuplicates, 1);
    assert.equal(receipt.entries.find((entry) => entry.relativePath === "peer.txt").status, "preservation-content-duplicate");
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});

test("fails closed when a target copy is absent", () => {
  const value = fixture();
  try {
    fs.rmSync(path.join(value.payloadRoot, "Tear-receipt-clean"), { recursive: true, force: true });
    assert.throws(() => comparePreservedCopies({ repoRoot: value.repoRoot, payloadRoot: value.payloadRoot, manifestPaths: [value.manifestPath] }), /preserved target copy is missing/u);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
});
