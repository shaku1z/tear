import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  runParentLayoutCheck,
  validateParentLayoutPolicy,
} from "../scripts/check-parent-layout.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(repositoryRoot, "preservation", "workspace-parent-layout-policy.json");
const canonicalPolicy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const checkerPath = path.join(repositoryRoot, "scripts", "check-parent-layout.mjs");
const contractPath = path.join(repositoryRoot, "config", "workspace-contract.json");

function clonePolicy() {
  return JSON.parse(JSON.stringify(canonicalPolicy));
}

function assertInvalid(policy, pattern) {
  const errors = validateParentLayoutPolicy(policy);
  assert.notEqual(errors.length, 0, "the malformed policy should be rejected");
  if (pattern !== undefined) assert.match(errors.join("\n"), pattern);
}

function git(root, argumentsList, { allowFailure = false } = {}) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe", windowsHide: true });
  if (!allowFailure) assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return { status: result.status, stdout: String(result.stdout ?? "").trim(), stderr: String(result.stderr ?? "").trim() };
}

function writeFixtureFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function createFixtureRepository(root, remote, { oracleCommit = false } = {}) {
  if (oracleCommit) {
    const clone = spawnSync("git", ["clone", "--shared", "--no-tags", "--no-checkout", "--quiet", repositoryRoot, root], {
      cwd: path.dirname(root),
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
    });
    assert.equal(clone.status, 0, `fixture clone failed: ${clone.stderr || clone.stdout}`);
    git(root, ["remote", "set-url", "origin", remote]);
    git(root, ["checkout", "-q", "-B", "main", canonicalPolicy.canonical.oracle.lockedCommit]);
    git(root, ["sparse-checkout", "init", "--no-cone"]);
    git(root, ["sparse-checkout", "set", "--no-cone", "README.md"]);
  } else {
    fs.mkdirSync(root, { recursive: true });
    writeFixtureFile(root, "README.md", "parent-layout fixture\n");
    git(root, ["init", "-q"]);
  }
  git(root, ["config", "user.name", "Tear parent-layout test"]);
  git(root, ["config", "user.email", "tear-parent-layout@example.test"]);
  if (!oracleCommit) {
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "fixture"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["remote", "add", "origin", remote]);
  }
  git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
}

function createStrictFixture({ loose = false, forbidden = false, invalidPointer = false, extraReparse = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-parent-layout-strict-"));
  const workspaceRoot = path.join(base, "workspace");
  const tempRoot = path.join(base, "temp");
  const gameRoot = path.join(workspaceRoot, "Tear");
  const musicRoot = path.join(workspaceRoot, "tear-score");
  const wikiRoot = path.join(workspaceRoot, "tear-wiki");
  const oracleRoot = path.join(workspaceRoot, "Tear-oracle");
  const archiveRoot = path.join(workspaceRoot, "Tear-archives");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(archiveRoot, { recursive: true });
  createFixtureRepository(gameRoot, "git@github.com:shaku1z/tear.git", { oracleCommit: true });
  createFixtureRepository(musicRoot, "git@github.com:shaku1z/tear-music.git");
  createFixtureRepository(wikiRoot, "git@github.com:shaku1z/tear-wiki.git");
  git(gameRoot, ["worktree", "add", "-q", "--detach", oracleRoot, "HEAD"]);
  git(gameRoot, ["worktree", "lock", "--reason", "comparison-only fixture", oracleRoot]);

  const deferredSourceRoot = path.join(tempRoot, "Tear-budget-architecture");
  const deferredTargetRoot = path.join(tempRoot, "Tear-tearscore-normalization");
  const deferredSourceNode = path.join(deferredSourceRoot, "node_modules");
  const deferredTargetNode = path.join(deferredTargetRoot, "node_modules");
  fs.mkdirSync(deferredSourceRoot, { recursive: true });
  fs.mkdirSync(deferredTargetNode, { recursive: true });
  writeFixtureFile(deferredTargetNode, "Tear-hidden-behind-junction.txt", "opaque\n");
  let junctionAvailable = true;
  try {
    fs.symlinkSync(deferredTargetNode, deferredSourceNode, "junction");
  } catch {
    junctionAvailable = false;
  }
  fs.mkdirSync(path.join(archiveRoot, "tear-g5-fixture", "nested", "Tear-main-publication"), { recursive: true });
  if (loose) writeFixtureFile(tempRoot, "tear-loose-notes.txt", "review only\n");
  if (forbidden) fs.mkdirSync(path.join(tempRoot, "Tear-main-publication"));
  if (invalidPointer) {
    fs.mkdirSync(path.join(workspaceRoot, "Tear-invalid"));
    fs.writeFileSync(path.join(workspaceRoot, "Tear-invalid", ".git"), "gitdir: missing-admin\n", "utf8");
  }
  if (extraReparse) {
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside, { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(workspaceRoot, "Tear-extra-link"), "junction");
    } catch {
      junctionAvailable = false;
    }
  }
  return { base, workspaceRoot, tempRoot, gameRoot, musicRoot, wikiRoot, oracleRoot, archiveRoot, junctionAvailable };
}

function cleanupStrictFixture(fixture) {
  try { git(fixture.gameRoot, ["worktree", "unlock", fixture.oracleRoot], { allowFailure: true }); } catch { /* fixture cleanup */ }
  try { git(fixture.gameRoot, ["worktree", "remove", "--force", fixture.oracleRoot], { allowFailure: true }); } catch { /* fixture cleanup */ }
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function strictResult(fixture) {
  return runParentLayoutCheck({
    root: fixture.gameRoot,
    strict: true,
    policyPath,
    contractPath,
    workspaceRoot: fixture.workspaceRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    oracleRoot: fixture.oracleRoot,
  });
}

test("canonical parent-layout policy passes the portable checker", () => {
  assert.deepEqual(validateParentLayoutPolicy(canonicalPolicy), []);
  const result = runParentLayoutCheck({ root: repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.status, "valid");
  assert.equal(result.policyRelativePath, "preservation/workspace-parent-layout-policy.json");
});

test("explicit policy paths remain bound to the workspace contract by default", () => {
  const missingContract = runParentLayoutCheck({
    root: repositoryRoot,
    policyPath,
    contractPath: path.join(repositoryRoot, "config", "missing-workspace-contract.json"),
  });
  assert.equal(missingContract.ok, false);
  assert.match(missingContract.errors.join("\n"), /could not read workspace contract/u);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-parent-layout-contract-"));
  const contractPath = path.join(fixtureRoot, "workspace-contract.json");
  try {
    const contract = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "config", "workspace-contract.json"), "utf8"));
    contract.parentLayoutPolicy = "./preservation/other-policy.json";
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    const wrongContract = runParentLayoutCheck({ root: repositoryRoot, policyPath, contractPath });
    assert.equal(wrongContract.ok, false);
    assert.match(wrongContract.errors.join("\n"), /workspace contract parentLayoutPolicy/u);

    contract.parentLayoutPolicy = "./preservation/workspace-parent-layout-policy.json";
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    const correctContract = runParentLayoutCheck({ root: repositoryRoot, policyPath, contractPath });
    assert.equal(correctContract.ok, true, correctContract.errors.join("\n"));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("strict inspection passes a clean fixture without descending archive payloads", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const result = strictResult(fixture);
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.equal(result.status, "pass");
    assert.equal(result.checks.deferredPair.status, "validated");
    assert.equal(result.classifications.some((entry) => entry.name === "Tear-main-publication"), false, "archive payload must remain opaque");
    assert.equal(result.classifications.some((entry) => entry.name === "Tear-hidden-behind-junction.txt"), false, "junction payload must remain opaque");
    const cli = spawnSync(process.execPath, [
      checkerPath,
      "--strict",
      "--root", fixture.gameRoot,
      "--policy", policyPath,
      "--contract", contractPath,
      "--workspace-root", fixture.workspaceRoot,
      "--temp-root", fixture.tempRoot,
      "--archive-root", fixture.archiveRoot,
      "--oracle-root", fixture.oracleRoot,
    ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe", windowsHide: true });
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.equal(JSON.parse(cli.stdout).status, "pass");
    assert.equal(result.noGo.length, 0);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection reports loose Tear-related items without failing the run", (t) => {
  const fixture = createStrictFixture({ loose: true });
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const result = strictResult(fixture);
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.equal(result.status, "review");
    assert.match(result.review.join("\n"), /tear-loose-notes\.txt/u);
    assert.deepEqual(result.noGo, []);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects missing canonical and deferred roots", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    fs.rmSync(fixture.musicRoot, { recursive: true, force: true });
    fs.rmSync(path.join(fixture.tempRoot, "Tear-budget-architecture"), { recursive: true, force: true });
    const result = strictResult(fixture);
    assert.equal(result.ok, false);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /canonical music root is missing/u);
    assert.match(result.noGo.join("\n"), /deferred junction source root is missing/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict Git subchecks report representative identity, branch, upstream, head, and dirty drift locally", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    git(fixture.musicRoot, ["remote", "set-url", "origin", "git@github.com:wrong/music.git"]);
    git(fixture.wikiRoot, ["config", "branch.main.merge", "refs/heads/develop"]);
    git(fixture.gameRoot, ["checkout", "-q", "-b", "feature"]);
    const parentHead = git(fixture.gameRoot, ["rev-parse", "HEAD^" ]).stdout;
    git(fixture.gameRoot, ["update-ref", "refs/remotes/origin/main", parentHead]);
    writeFixtureFile(fixture.gameRoot, "dirty.txt", "dirty\n");
    const result = strictResult(fixture);
    assert.equal(result.status, "no-go");
    assert.equal(result.checks.roots.oracle.status, "validated");
    assert.equal(result.checks.deferredPair.status, "validated", "deferred status must not inherit unrelated Git failures");
    assert.match(result.noGo.join("\n"), /canonical music origin must identify/u);
    assert.match(result.noGo.join("\n"), /canonical wiki upstream must be origin\/main/u);
    assert.match(result.noGo.join("\n"), /canonical game branch must be main/u);
    assert.match(result.noGo.join("\n"), /canonical game HEAD must equal origin\/main/u);
    assert.match(result.noGo.join("\n"), /canonical game Git worktree must be clean/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection marks forbidden development/deployment names as no-go", (t) => {
  const fixture = createStrictFixture({ forbidden: true });
  try {
    if (!fixture.junctionAvailable) t.diagnostic("directory junction unavailable; deferred pair also contributes a no-go");
    const result = strictResult(fixture);
    assert.equal(result.ok, false);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /forbidden name Tear-main-publication/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects extra, unlocked, and wrong-head oracle worktree states", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const extraRoot = path.join(fixture.base, "extra-worktree");
    git(fixture.gameRoot, ["worktree", "add", "-q", "--detach", extraRoot, "HEAD"]);
    const extra = strictResult(fixture);
    assert.equal(extra.status, "no-go");
    assert.match(extra.noGo.join("\n"), /exactly canonical game and locked oracle|unapproved Git worktree/u);
    git(fixture.gameRoot, ["worktree", "remove", "--force", extraRoot]);

    git(fixture.gameRoot, ["worktree", "unlock", fixture.oracleRoot]);
    const unlocked = strictResult(fixture);
    assert.equal(unlocked.status, "no-go");
    assert.match(unlocked.noGo.join("\n"), /oracle worktree must be locked/u);

    const wrongHead = git(fixture.oracleRoot, ["rev-parse", "HEAD^"]).stdout;
    git(fixture.oracleRoot, ["reset", "-q", "--hard", wrongHead]);
    const wrong = strictResult(fixture);
    assert.equal(wrong.status, "no-go");
    assert.match(wrong.noGo.join("\n"), /oracle HEAD must be/u);
    git(fixture.oracleRoot, ["reset", "-q", "--hard", canonicalPolicy.canonical.oracle.lockedCommit]);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects invalid .git pointers without descending into their payloads", (t) => {
  const fixture = createStrictFixture({ invalidPointer: true });
  try {
    if (!fixture.junctionAvailable) t.diagnostic("directory junction unavailable; deferred pair also contributes a no-go");
    const result = strictResult(fixture);
    assert.equal(result.ok, false);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /invalid \.git pointer target/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects extra immediate reparses but does not inspect nested archive payloads", (t) => {
  const fixture = createStrictFixture({ extraReparse: true });
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const result = strictResult(fixture);
    assert.equal(result.ok, false);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /Tear-extra-link.*immediate symlink or reparse/u);
    assert.equal(result.noGo.some((error) => /Tear-main-publication/u.test(error)), false, "nested archive contents must not be inspected");
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects a deferred junction resolving to the wrong target", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const sourceNode = path.join(fixture.tempRoot, "Tear-budget-architecture", "node_modules");
    const wrongTargetNode = path.join(fixture.tempRoot, "wrong-target", "node_modules");
    fs.mkdirSync(wrongTargetNode, { recursive: true });
    fs.unlinkSync(sourceNode);
    fs.symlinkSync(wrongTargetNode, sourceNode, "junction");
    const result = strictResult(fixture);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /deferred junction source must resolve exactly to target/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects an ancestor junction alias instead of treating it as a physical root", (t) => {
  const fixture = createStrictFixture();
  let aliasWorkspace;
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    aliasWorkspace = path.join(fixture.base, "workspace-alias");
    fs.symlinkSync(fixture.workspaceRoot, aliasWorkspace, "junction");
    const result = runParentLayoutCheck({
      root: path.join(aliasWorkspace, "Tear"),
      strict: true,
      policyPath,
      contractPath,
      workspaceRoot: aliasWorkspace,
      tempRoot: fixture.tempRoot,
      archiveRoot: path.join(aliasWorkspace, "Tear-archives"),
      oracleRoot: path.join(aliasWorkspace, "Tear-oracle"),
    });
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /workspace root must not be a symlink or reparse|must resolve to itself/u);
  } finally {
    if (aliasWorkspace !== undefined) fs.unlinkSync(aliasWorkspace);
    cleanupStrictFixture(fixture);
  }
});

test("strict inspection rejects case-insensitive immediate-child collisions when the host permits both names", (t) => {
  const fixture = createStrictFixture();
  try {
    if (!fixture.junctionAvailable) {
      t.skip("directory junctions are unavailable in this environment");
      return;
    }
    const first = path.join(fixture.tempRoot, "Tear-case-collision");
    const second = path.join(fixture.tempRoot, "tear-case-collision");
    fs.mkdirSync(first);
    try {
      fs.mkdirSync(second);
    } catch {
      t.skip("host filesystem is case-insensitive");
      return;
    }
    const names = fs.readdirSync(fixture.tempRoot);
    if (!names.includes("Tear-case-collision") || !names.includes("tear-case-collision")) {
      t.skip("host filesystem does not preserve case-colliding names");
      return;
    }
    const result = strictResult(fixture);
    assert.equal(result.status, "no-go");
    assert.match(result.noGo.join("\n"), /temporary root has a case-insensitive name collision/u);
  } finally {
    cleanupStrictFixture(fixture);
  }
});

test("strict CLI requires all explicit runtime roots and returns nonzero no-go JSON", () => {
  const result = spawnSync(process.execPath, [checkerPath, "--strict", "--root", repositoryRoot], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "no-go");
  assert.match(output.noGo.join("\n"), /requires explicit --workspace-root/u);
  assert.match(output.noGo.join("\n"), /requires explicit --temp-root/u);
  assert.match(output.noGo.join("\n"), /requires explicit --archive-root/u);
  assert.match(output.noGo.join("\n"), /requires explicit --oracle-root/u);
});

test("malformed policy shape, format, schema, and repository are rejected", () => {
  assertInvalid(null, /JSON object/u);

  const policy = clonePolicy();
  policy.format = "wrong-format";
  policy.schemaVersion = 2;
  policy.repository = "other/repository";
  assertInvalid(policy, /policy\.format|policy\.schemaVersion|policy\.repository/u);

  const extra = clonePolicy();
  extra.unexpected = true;
  assertInvalid(extra, /is not permitted/u);
});

test("canonical names are unique case-insensitively and identities are exact", () => {
  const collision = clonePolicy();
  collision.canonical.music.exactName = "tear";
  assertInvalid(collision, /collides with/u);

  const wrongIdentity = clonePolicy();
  wrongIdentity.canonical.wiki.repository = "shaku1z/other-wiki";
  wrongIdentity.canonical.wiki.branch = "develop";
  wrongIdentity.canonical.wiki.upstream = "origin/develop";
  assertInvalid(wrongIdentity, /canonical\.wiki\.(repository|branch|upstream)/u);
});

test("oracle identity and comparison-only lock contract are exact", () => {
  const policy = clonePolicy();
  policy.canonical.oracle.lockedCommit = "0".repeat(40);
  policy.canonical.oracle.requiredState = "attached";
  policy.canonical.oracle.lockReason = "temporary checkout";
  assertInvalid(policy, /canonical\.oracle\.(lockedCommit|requiredState|lockReason)/u);
});

test("reparse policy refuses by default and permits only the explicit deferred junction audit relation", () => {
  const unsafe = clonePolicy();
  unsafe.reparse.default = "follow";
  unsafe.reparse.deferredAuditRelation.move = true;
  assertInvalid(unsafe, /reparse\.default|deferredAuditRelation\.move/u);

  const extraException = clonePolicy();
  extraException.reparse.extraException = { operation: "move" };
  assertInvalid(extraException, /reparse\.extraException.*not permitted/u);

  const sameName = clonePolicy();
  sameName.reparse.deferredAuditRelation.target.exactName = "tear-budget-architecture";
  assertInvalid(sameName, /collides with|distinct/u);
});

test("approved and forbidden name patterns remain anchored, exact, and unambiguous", () => {
  const weak = clonePolicy();
  weak.names.forbiddenPatterns[0] = "Tear-main-publication";
  assertInvalid(weak, /exact mandated|anchored/u);

  const overbroad = clonePolicy();
  overbroad.names.forbiddenPatterns[0] = "^Tear-";
  assertInvalid(overbroad, /exact mandated/u);

  const incorrect = clonePolicy();
  incorrect.names.forbiddenPatterns[1] = "^Tear-g5-";
  assertInvalid(incorrect, /exact mandated|duplicate|overlap/u);

  const overlap = clonePolicy();
  overlap.names.approvedArchiveRecoveryPatterns.push("^Tear-main-");
  assertInvalid(overlap, /exact mandated|overlapping|overlap/u);
});

test("absolute paths are rejected anywhere in the policy", () => {
  const windowsPath = clonePolicy();
  windowsPath.reparse.deferredAuditRelation.source.relativePath = "C:\\tmp\\junction";
  assertInvalid(windowsPath, /absolute path/u);

  const posixPath = clonePolicy();
  posixPath.canonical.game.exactName = "/tmp/Tear";
  assertInvalid(posixPath, /absolute path/u);
});

test("loose items remain report-only and cannot mutate the workspace", () => {
  for (const field of ["autoMove", "autoDelete", "autoDeploy", "autoMerge"]) {
    const policy = clonePolicy();
    policy.looseItems[field] = true;
    assertInvalid(policy, new RegExp(`looseItems\\.${field} must be false`, "u"));
  }

  const mode = clonePolicy();
  mode.looseItems.mode = "auto-move";
  assertInvalid(mode, /looseItems\.mode must be report-only/u);
});
