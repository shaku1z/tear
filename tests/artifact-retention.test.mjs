import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ARTIFACT_RETENTION_POLICY_PATH,
  readArtifactRetentionPolicy,
  runArtifactReport,
  validateArtifactRetentionPolicy,
  writeArtifactReport,
} from "../scripts/report-artifacts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reporterPath = path.join(repositoryRoot, "scripts", "report-artifacts.mjs");
const reportTime = new Date("2026-08-23T12:00:00.000Z");
const minAgeDays = 30;

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-artifact-report-"));
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n", "utf8");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear artifact test"]);
  git(root, ["config", "user.email", "tear-artifact@example.test"]);
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  git(root, ["branch", "-M", "main"]);
  git(root, ["remote", "add", "origin", "git@github.com:shaku1z/tear.git"]);
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function setMtime(filePath, date) {
  fs.utimesSync(filePath, date, date);
}

function runReport(root, options = {}) {
  return runArtifactReport({
    root,
    policyPath: DEFAULT_ARTIFACT_RETENTION_POLICY_PATH,
    sourceId: "ignored-artifacts",
    minAgeDays,
    now: reportTime,
    ...options,
  });
}

test("the tracked retention policy is valid and bounded to repository artifacts", () => {
  const loaded = readArtifactRetentionPolicy(DEFAULT_ARTIFACT_RETENTION_POLICY_PATH);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.policy.sourceRoots[0].relativePath, "artifacts");
  assert.equal(loaded.policy.boundary.externalRoots, false);
  assert.equal(loaded.policy.protected.reparsePoints, "refuse");

  const unsafe = JSON.parse(JSON.stringify(loaded.policy));
  unsafe.sourceRoots[0].relativePath = "../outside";
  assert.match(validateArtifactRetentionPolicy(unsafe).join("\n"), /artifacts|inside the repository/u);

  const unprotected = JSON.parse(JSON.stringify(loaded.policy));
  unprotected.protected.preservedPrefixes = [];
  assert.match(validateArtifactRetentionPolicy(unprotected).join("\n"), /artifacts\/t26w/u);
});

test("eligible old files are hashed and the report makes no source changes", () => {
  const root = createFixture();
  try {
    const filePath = path.join(root, "artifacts", "old.json");
    const oldDate = new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000);
    fs.writeFileSync(filePath, "old artifact\n", "utf8");
    setMtime(filePath, oldDate);
    const before = { contents: fs.readFileSync(filePath, "utf8"), mtimeMs: fs.statSync(filePath).mtimeMs };

    const manifest = runReport(root);
    const entry = manifest.entries.find((candidate) => candidate.relativePath === "old.json");
    assert.equal(entry?.decision, "eligible");
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(entry.bytes, Buffer.byteLength(before.contents));
    assert.equal(fs.readFileSync(filePath, "utf8"), before.contents);
    assert.equal(fs.statSync(filePath).mtimeMs, before.mtimeMs);
    assert.equal(manifest.restoreGuidance.status, "quarantine-deferred");
  } finally {
    cleanup(root);
  }
});

test("young and future files are classified without content hashes", () => {
  const root = createFixture();
  try {
    const youngPath = path.join(root, "artifacts", "young.json");
    const futurePath = path.join(root, "artifacts", "future.json");
    fs.writeFileSync(youngPath, "young\n", "utf8");
    fs.writeFileSync(futurePath, "future\n", "utf8");
    setMtime(youngPath, new Date(reportTime.getTime() - 24 * 60 * 60 * 1000));
    setMtime(futurePath, new Date(reportTime.getTime() + 24 * 60 * 60 * 1000));

    const manifest = runReport(root);
    const young = manifest.entries.find((candidate) => candidate.relativePath === "young.json");
    const future = manifest.entries.find((candidate) => candidate.relativePath === "future.json");
    assert.equal(young?.decision, "too-young");
    assert.equal(young?.sha256, null);
    assert.equal(future?.decision, "future");
    assert.equal(future?.sha256, null);
  } finally {
    cleanup(root);
  }
});

test("active evidence, preserved nested repositories, and nested .git pointers are never eligible", () => {
  const root = createFixture();
  try {
    const protectedPaths = [
      "tearbench/generated",
      "tearbench/receipts",
      "t26w",
    ];
    for (const relativePath of protectedPaths) {
      const filePath = path.join(root, "artifacts", relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "protected\n", "utf8");
      setMtime(filePath, new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000));
    }
    const pointerPath = path.join(root, "artifacts", "nested-pointer", ".git");
    fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
    fs.writeFileSync(pointerPath, "gitdir: missing-admin\n", "utf8");
    const nestedGitPath = path.join(root, "artifacts", "nested-directory", ".git", "hidden.bin");
    fs.mkdirSync(path.dirname(nestedGitPath), { recursive: true });
    fs.writeFileSync(nestedGitPath, "hidden\n", "utf8");
    const visiblePath = path.join(root, "artifacts", "nested-directory", "visible.bin");
    fs.writeFileSync(visiblePath, "visible\n", "utf8");
    setMtime(visiblePath, new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000));
    const recoveryFile = path.join(root, "artifacts", "Tear-archives", "recovery.bin");
    fs.mkdirSync(path.dirname(recoveryFile), { recursive: true });
    fs.writeFileSync(recoveryFile, "recovery\n", "utf8");
    setMtime(recoveryFile, new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000));

    const manifest = runReport(root);
    for (const relativePath of protectedPaths) {
      const entry = manifest.entries.find((candidate) => candidate.relativePath === relativePath);
      assert.equal(entry?.decision, "protected");
      assert.equal(entry?.sha256, null);
    }
    const recoveryEntry = manifest.entries.find((candidate) => candidate.relativePath === "Tear-archives");
    assert.equal(recoveryEntry?.decision, "refused");
    assert.ok(recoveryEntry?.reasonCodes.includes("recovery-archive"));
    const pointer = manifest.entries.find((candidate) => candidate.relativePath === "nested-pointer/.git");
    const nestedGit = manifest.entries.find((candidate) => candidate.relativePath === "nested-directory/.git");
    assert.equal(pointer?.decision, "refused");
    assert.ok(pointer?.reasonCodes.includes("nested-git"));
    assert.equal(nestedGit?.decision, "refused");
    assert.equal(manifest.entries.some((candidate) => candidate.relativePath === "nested-directory/.git/hidden.bin"), false);
    assert.equal(manifest.entries.find((candidate) => candidate.relativePath === "nested-directory/visible.bin")?.decision, "eligible");
  } finally {
    cleanup(root);
  }
});

test("symlink or junction fixtures are refused when the host permits creating one", () => {
  const root = createFixture();
  try {
    const target = path.join(root, "outside-target.txt");
    const link = path.join(root, "artifacts", "linked.txt");
    fs.writeFileSync(target, "outside\n", "utf8");
    let supported = true;
    let linkRelativePath = "linked.txt";
    try {
      fs.symlinkSync(target, link, "file");
    } catch {
      const targetDirectory = path.join(root, "junction-target");
      const junction = path.join(root, "artifacts", "linked-directory");
      try {
        fs.mkdirSync(targetDirectory);
        fs.symlinkSync(targetDirectory, junction, "junction");
        linkRelativePath = "linked-directory";
      } catch {
        supported = false;
      }
    }
    if (supported) {
      const manifest = runReport(root);
      const entry = manifest.entries.find((candidate) => candidate.relativePath === linkRelativePath);
      assert.equal(entry?.decision, "refused");
      assert.ok(entry?.reasonCodes.includes("symlink-or-reparse"));
    }
  } finally {
    cleanup(root);
  }
});

test("non-canonical roots, traversal policies, and output inside source fail closed", () => {
  const root = createFixture();
  try {
    const nestedRoot = path.join(root, "nested");
    fs.mkdirSync(nestedRoot);
    assert.throws(() => runReport(nestedRoot), /canonical Git root/u);

    const loaded = readArtifactRetentionPolicy(DEFAULT_ARTIFACT_RETENTION_POLICY_PATH);
    const unsafe = JSON.parse(JSON.stringify(loaded.policy));
    unsafe.sourceRoots[0].relativePath = "artifacts/../outside";
    assert.ok(validateArtifactRetentionPolicy(unsafe).length > 0);

    const filePath = path.join(root, "artifacts", "old.json");
    fs.writeFileSync(filePath, "old\n", "utf8");
    setMtime(filePath, new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000));
    const manifest = runReport(root);
    assert.throws(
      () => writeArtifactReport(path.join(root, "artifacts", "manifest.json"), manifest),
      /outside the scanned source root/u,
    );
    assert.equal(fs.existsSync(path.join(root, "artifacts", "manifest.json")), false);

    const existingOutput = path.join(root, "report.json");
    fs.writeFileSync(existingOutput, "do not overwrite\n", "utf8");
    assert.throws(() => writeArtifactReport(existingOutput, manifest), /refusing overwrite/u);
    assert.equal(fs.readFileSync(existingOutput, "utf8"), "do not overwrite\n");
  } finally {
    cleanup(root);
  }
});

test("a canonical Git root with a wrong or missing origin is rejected", () => {
  const wrongOrigin = createFixture();
  const missingOrigin = createFixture();
  try {
    git(wrongOrigin, ["remote", "set-url", "origin", "git@github.com:other/repository.git"]);
    assert.throws(() => runReport(wrongOrigin), /remote\.origin\.url.*shaku1z\/tear/u);
    git(missingOrigin, ["remote", "remove", "origin"]);
    assert.throws(() => runReport(missingOrigin), /remote\.origin\.url.*missing/u);
  } finally {
    cleanup(wrongOrigin);
    cleanup(missingOrigin);
  }
});

test("the default CLI prints JSON and does not create an output file", () => {
  const root = createFixture();
  try {
    const filePath = path.join(root, "artifacts", "old.json");
    fs.writeFileSync(filePath, "old\n", "utf8");
    setMtime(filePath, new Date(reportTime.getTime() - 31 * 24 * 60 * 60 * 1000));
    const result = spawnSync(process.execPath, [
      reporterPath,
      "--root",
      root,
      "--policy",
      DEFAULT_ARTIFACT_RETENTION_POLICY_PATH,
      "--source",
      "ignored-artifacts",
      "--min-age-days",
      String(minAgeDays),
    ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.format, "tear-artifact-retention-manifest");
    assert.equal(manifest.summary.eligibleEntries, 1);
    assert.equal(fs.readdirSync(path.join(root, "artifacts")).includes("manifest.json"), false);
  } finally {
    cleanup(root);
  }
});
