import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DeferredWorkspaceDependencyError,
  runDeferredWorkspaceDependencyAudit,
} from "../scripts/report-deferred-workspace-dependency.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secondWavePolicyPath = path.join(repositoryRoot, "preservation", "workspace-recovery-second-wave-sources.json");
const parentPolicyPath = path.join(repositoryRoot, "preservation", "workspace-parent-layout-policy.json");

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout ?? "").trim();
}

function createCanonicalRepository(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "deferred dependency fixture\n", "utf8");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Tear deferred dependency test"]);
  git(root, ["config", "user.email", "tear-deferred-dependency@example.test"]);
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  git(root, ["branch", "-M", "main"]);
  git(root, ["remote", "add", "origin", "git@github.com:shaku1z/tear.git"]);
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
}

function createSizedFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "w");
  try {
    fs.ftruncateSync(descriptor, bytes);
  } finally {
    fs.closeSync(descriptor);
  }
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-deferred-dependency-"));
  const repoRoot = path.join(base, "repo");
  const tempRoot = path.join(base, "temp");
  const archiveRoot = path.join(base, "archive");
  const sourceRoot = path.join(tempRoot, "Tear-budget-architecture");
  const targetRoot = path.join(tempRoot, "Tear-tearscore-normalization");
  const sourceNodeModules = path.join(sourceRoot, "node_modules");
  const targetNodeModules = path.join(targetRoot, "node_modules");
  const outputDirectory = path.join(archiveRoot, "2026-08-23-g5-deferred-dependency");

  createCanonicalRepository(repoRoot);
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "preservation"), { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(targetNodeModules, { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, ".git"));
  fs.mkdirSync(path.join(targetRoot, ".git"));
  fs.copyFileSync(secondWavePolicyPath, path.join(repoRoot, "preservation", "workspace-recovery-second-wave-sources.json"));
  fs.copyFileSync(parentPolicyPath, path.join(repoRoot, "preservation", "workspace-parent-layout-policy.json"));
  git(repoRoot, ["add", "preservation"]);
  git(repoRoot, ["commit", "-q", "-m", "fixture policies"]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  createSizedFile(path.join(sourceRoot, "payload.bin"), 4_133_063);
  createSizedFile(path.join(targetRoot, "payload.bin"), 30_660_424);
  fs.writeFileSync(path.join(targetNodeModules, "not-counted.bin"), "protected payload\n", "utf8");

  let junctionAvailable = true;
  try {
    fs.symlinkSync(targetNodeModules, sourceNodeModules, "junction");
  } catch {
    junctionAvailable = false;
  }

  return {
    base,
    repoRoot,
    tempRoot,
    archiveRoot,
    sourceRoot,
    targetRoot,
    sourceNodeModules,
    targetNodeModules,
    outputDirectory,
    junctionAvailable,
    secondWavePolicyPath: path.join(repoRoot, "preservation", "workspace-recovery-second-wave-sources.json"),
    parentPolicyPath: path.join(repoRoot, "preservation", "workspace-parent-layout-policy.json"),
  };
}

function cleanupFixture(fixture) {
  try {
    if (fs.existsSync(fixture.sourceNodeModules)) fs.unlinkSync(fixture.sourceNodeModules);
  } catch {
    // The fixture is temporary; recursive cleanup below is the final guard.
  }
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function runFixture(fixture, outputName = "audit.json") {
  return runDeferredWorkspaceDependencyAudit({
    repoRoot: fixture.repoRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    outputPath: path.join(fixture.outputDirectory, outputName),
    secondWavePolicyPath: fixture.secondWavePolicyPath,
    parentPolicyPath: fixture.parentPolicyPath,
    now: "2026-08-23T12:00:00.000Z",
  });
}

function requireJunction(t, fixture) {
  if (!fixture.junctionAvailable) {
    t.skip("directory junctions are unavailable in this environment");
    return false;
  }
  return true;
}

test("valid deferred dependency fixture reports a matching, metadata-only audit", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    const report = runFixture(fixture);

    assert.equal(report.summary.status, "match");
    assert.deepEqual(report.summary.discrepancies, []);
    assert.equal(report.repositoryState.branch, "main");
    assert.equal(report.repositoryState.upstream, "origin/main");
    assert.equal(report.repositoryState.head, report.repositoryState.originMain);
    assert.equal(report.repositoryState.git.status, "directory");
    assert.equal(report.roots[0].git.status, "directory");
    assert.equal(report.roots[1].git.status, "directory");
    assert.equal(report.mutation.payloadHashes, "none");
    assert.equal(report.summary.payloadHashes, "none");
    assert.equal(report.roots[0].entries.some((entry) => entry.relativePath === "node_modules/not-counted.bin"), false);
    assert.equal(report.roots[1].entries.some((entry) => entry.relativePath === "node_modules/not-counted.bin"), false);
    assert.equal(report.dependency.relation.targetMatches, true);
    assert.equal(fs.existsSync(report.outputPath), true);
  } finally {
    cleanupFixture(fixture);
  }
});

test("historical byte drift is recorded as stale-or-unexplained without mutating inputs", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    fs.appendFileSync(path.join(fixture.sourceRoot, "payload.bin"), "x", "utf8");
    const report = runFixture(fixture);

    assert.equal(report.summary.status, "stale-or-unexplained");
    assert.match(report.summary.discrepancies.join("\n"), /sourceObservedBytes/u);
    assert.equal(fs.statSync(path.join(fixture.sourceRoot, "payload.bin")).size, 4_133_064);
  } finally {
    cleanupFixture(fixture);
  }
});

test("an absent deferred-root .git is explicit metadata and does not trigger descent", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    fs.rmSync(path.join(fixture.sourceRoot, ".git"), { recursive: true, force: true });
    const report = runFixture(fixture);

    assert.equal(report.roots[0].git.status, "absent");
    assert.equal(report.roots[0].git.valid, false);
    assert.equal(report.summary.status, "match");
    assert.equal(report.roots[1].entries.some((entry) => entry.relativePath.startsWith("node_modules/")), false);
  } finally {
    cleanupFixture(fixture);
  }
});

test("wrong junction target and extra reparses fail closed", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    const wrongNodeModules = path.join(fixture.base, "wrong", "node_modules");
    fs.mkdirSync(wrongNodeModules, { recursive: true });
    fs.unlinkSync(fixture.sourceNodeModules);
    fs.symlinkSync(wrongNodeModules, fixture.sourceNodeModules, "junction");
    assert.throws(
      () => runFixture(fixture, "wrong-target.json"),
      (error) => error instanceof DeferredWorkspaceDependencyError && /exact target path|must target/u.test(error.message),
    );

    fs.unlinkSync(fixture.sourceNodeModules);
    fs.symlinkSync(fixture.targetNodeModules, fixture.sourceNodeModules, "junction");
    const outside = path.join(fixture.base, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(fixture.sourceRoot, "unexpected-link"), "junction");
    assert.throws(
      () => runFixture(fixture, "extra-reparse.json"),
      (error) => error instanceof DeferredWorkspaceDependencyError && /unexpected symlink or reparse/u.test(error.message),
    );
  } finally {
    cleanupFixture(fixture);
  }
});

test("output is new-only, stays in the archive, and rejects overwrite", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    const first = runFixture(fixture, "new-report.json");
    assert.equal(first.outputPath, path.join(fixture.outputDirectory, "new-report.json"));
    assert.throws(
      () => runFixture(fixture, "new-report.json"),
      (error) => error instanceof DeferredWorkspaceDependencyError && /already exists/u.test(error.message),
    );
    assert.throws(
      () => runDeferredWorkspaceDependencyAudit({
        repoRoot: fixture.repoRoot,
        tempRoot: fixture.tempRoot,
        archiveRoot: fixture.archiveRoot,
        outputPath: path.join(fixture.tempRoot, "unsafe.json"),
        secondWavePolicyPath: fixture.secondWavePolicyPath,
        parentPolicyPath: fixture.parentPolicyPath,
      }),
      (error) => error instanceof DeferredWorkspaceDependencyError && /inside archive-root|outside/u.test(error.message),
    );
  } finally {
    cleanupFixture(fixture);
  }
});

test("canonical repository drift is rejected before an audit report is written", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    fs.writeFileSync(path.join(fixture.repoRoot, "dirty.txt"), "dirty\n", "utf8");
    assert.throws(
      () => runFixture(fixture, "canonical-drift.json"),
      (error) => error instanceof DeferredWorkspaceDependencyError && /repo-root must be clean/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.outputDirectory, "canonical-drift.json")), false);
  } finally {
    cleanupFixture(fixture);
  }
});
