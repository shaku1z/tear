import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DeferredWorkspaceDependencyError,
  WINDOWS_IO_REPARSE_TAG_MOUNT_POINT,
  WINDOWS_IO_REPARSE_TAG_SYMLINK,
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

function runFixture(fixture, outputName = "audit.json", overrides = {}) {
  return runDeferredWorkspaceDependencyAudit({
    repoRoot: fixture.repoRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    outputPath: path.join(fixture.outputDirectory, outputName),
    secondWavePolicyPath: fixture.secondWavePolicyPath,
    parentPolicyPath: fixture.parentPolicyPath,
    now: "2026-08-23T12:00:00.000Z",
    ...overrides,
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

    assert.equal(report.summary.status, "historical-sizing-match");
    assert.deepEqual(report.summary.discrepancies, []);
    assert.equal(report.repositoryState.branch, "main");
    assert.equal(report.repositoryState.upstream, "origin/main");
    assert.equal(report.repositoryState.head, report.repositoryState.originMain);
    assert.equal(report.repositoryState.git.status, "directory");
    assert.equal(report.roots[0].git.status, "directory");
    assert.equal(report.roots[1].git.status, "directory");
    assert.equal(report.mutation.payloadHashes, "none");
    assert.equal(report.summary.payloadHashes, "none");
    assert.deepEqual(report.summary.sizingComparison.equalTotalsDoNotProve, ["content-equivalence", "path-equivalence", "mtime-equivalence"]);
    assert.equal(report.dependency.relation.reparseTag, process.platform === "win32" ? "0xA0000003" : null);
    assert.equal(report.dependency.relation.reparseType, process.platform === "win32" ? "mount-point" : "symlink-test-fixture");
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
    assert.equal(report.summary.status, "historical-sizing-match");
    assert.equal(report.roots[1].entries.some((entry) => entry.relativePath.startsWith("node_modules/")), false);
  } finally {
    cleanupFixture(fixture);
  }
});

test("a .git pointer is bounded metadata, records an invalid target, and counts pointer bytes", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    fs.rmSync(path.join(fixture.sourceRoot, ".git"), { recursive: true, force: true });
    const pointer = "gitdir: missing-gitdir\n";
    fs.writeFileSync(path.join(fixture.sourceRoot, ".git"), pointer, "utf8");
    const report = runFixture(fixture, "git-pointer.json");

    assert.equal(report.roots[0].git.status, "invalid-target");
    assert.equal(report.roots[0].git.target, path.join(fixture.sourceRoot, "missing-gitdir"));
    assert.equal(report.roots[0].git.targetExists, false);
    assert.equal(report.roots[0].git.bytes, Buffer.byteLength(pointer));
    assert.equal(report.roots[0].summary.observedBytes, 4_133_063 + Buffer.byteLength(pointer));
    assert.equal(report.summary.status, "stale-or-unexplained");
  } finally {
    cleanupFixture(fixture);
  }
});

test("a non-junction reparse tag is rejected through the injectable probe", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    assert.throws(
      () => runFixture(fixture, "symlink-tag.json", {
        reparseTagProbe: () => ({ value: WINDOWS_IO_REPARSE_TAG_SYMLINK }),
      }),
      (error) => error instanceof DeferredWorkspaceDependencyError && /mount-point junction|symbolic-link/u.test(error.message),
    );
    const report = runFixture(fixture, "injected-mount-point.json", {
      reparseTagProbe: () => ({ value: WINDOWS_IO_REPARSE_TAG_MOUNT_POINT }),
    });
    assert.equal(report.dependency.relation.reparseTag, "0xA0000003");
    assert.equal(report.dependency.relation.reparseType, "mount-point");
  } finally {
    cleanupFixture(fixture);
  }
});

test("a single file over the configured cap fails closed", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    createSizedFile(path.join(fixture.sourceRoot, "too-large.bin"), 134_217_729);
    assert.throws(
      () => runFixture(fixture, "cap-failure.json"),
      (error) => error instanceof DeferredWorkspaceDependencyError && /maxSingleFileBytes/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.outputDirectory, "cap-failure.json")), false);
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

test("an output parent alias is rejected before a report is written", (t) => {
  const fixture = createFixture();
  try {
    if (!requireJunction(t, fixture)) return;
    const alias = path.join(fixture.archiveRoot, "output-alias");
    try {
      fs.symlinkSync(fixture.outputDirectory, alias, process.platform === "win32" ? "junction" : "dir");
    } catch {
      t.skip("directory aliases are unavailable in this environment");
      return;
    }
    assert.throws(
      () => runFixture(fixture, "aliased-output.json", { outputPath: path.join(alias, "aliased-output.json") }),
      (error) => error instanceof DeferredWorkspaceDependencyError && /symlink or reparse|canonical directory/u.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(fixture.outputDirectory, "aliased-output.json")), false);
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

test("canonical repository identity drift is rejected across origin, branch, upstream, and head", (t) => {
  const cases = [
    {
      name: "wrong origin",
      mutate: (fixture) => git(fixture.repoRoot, ["remote", "set-url", "origin", "git@github.com:someone/other.git"]),
      pattern: /origin must identify/u,
    },
    {
      name: "wrong branch",
      mutate: (fixture) => git(fixture.repoRoot, ["checkout", "-q", "-b", "feature"]),
      pattern: /must be on main/u,
    },
    {
      name: "wrong upstream",
      mutate: (fixture) => git(fixture.repoRoot, ["config", "branch.main.merge", "refs/heads/develop"]),
      pattern: /must track origin\/main/u,
    },
    {
      name: "wrong head",
      mutate: (fixture) => git(fixture.repoRoot, ["commit", "--allow-empty", "-q", "-m", "head drift"]),
      pattern: /exactly equal origin\/main/u,
    },
  ];
  for (const identityCase of cases) {
    const fixture = createFixture();
    try {
      if (!requireJunction(t, fixture)) return;
      identityCase.mutate(fixture);
      assert.throws(
        () => runFixture(fixture, `${identityCase.name.replaceAll(" ", "-")}.json`),
        (error) => error instanceof DeferredWorkspaceDependencyError && identityCase.pattern.test(error.message),
        identityCase.name,
      );
    } finally {
      cleanupFixture(fixture);
    }
  }
});
