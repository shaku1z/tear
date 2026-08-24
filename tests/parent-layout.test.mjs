import assert from "node:assert/strict";
import fs from "node:fs";
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

function clonePolicy() {
  return JSON.parse(JSON.stringify(canonicalPolicy));
}

function assertInvalid(policy, pattern) {
  const errors = validateParentLayoutPolicy(policy);
  assert.notEqual(errors.length, 0, "the malformed policy should be rejected");
  if (pattern !== undefined) assert.match(errors.join("\n"), pattern);
}

test("canonical parent-layout policy passes the portable checker", () => {
  assert.deepEqual(validateParentLayoutPolicy(canonicalPolicy), []);
  const result = runParentLayoutCheck({ root: repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.status, "valid");
  assert.equal(result.policyRelativePath, "preservation/workspace-parent-layout-policy.json");
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
