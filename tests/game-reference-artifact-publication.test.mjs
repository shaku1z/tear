import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSafeArtifactDirectory,
  buildReceipt,
  publishGameReferenceArtifactForTest,
  validateArtifactFiles,
  validateManifestEnvelope,
  validatePublicationInputs,
  validateReceipt,
} from "../scripts/publish-game-reference-artifact.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");
const publisher = fs.readFileSync(path.join(repositoryRoot, "scripts", "publish-game-reference-artifact.mjs"), "utf8");
const sourceSha = "a".repeat(40);
const artifactName = `tear-game-reference-v1-${sourceSha}`;

function validManifest(sha = sourceSha) {
  const collectionIds = ["achievements", "bosses", "enemies", "modes", "public-tuning", "stages", "upgrades", "weapons"];
  const stageIds = ["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"];
  const bossIds = ["warden", "colossus", "aldric", "rootbound", "echo", "source"];
  const enemyIds = ["charger", "ranged", "flyer", "bomber", "armored", "priest", "mender", "herald", "anchor", "wraith", "chimera", "rootbinder"];
  return {
    format: "game-reference.v1",
    schemaVersion: 2,
    source: { repository: "shaku1z/tear", sha },
    terminologyVersion: "g4-terminology-v1",
    roster: { id: "final-five", schemaVersion: 1, activeWeaponIds: ["sword"], retiredWeaponIds: ["spear"] },
    collections: Object.fromEntries(collectionIds.map((id) => [id, { status: "complete", items: id === "stages" ? stageIds.map((stageId) => ({ id: stageId }))
      : id === "bosses" ? bossIds.map((bossId) => ({ id: bossId }))
        : id === "enemies" ? { families: enemyIds.map((familyId) => ({ id: familyId, variants: [] })), affixes: [], presets: [] } : [] }])),
  };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}

function createPublisherFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-publisher-"));
  fs.writeFileSync(path.join(fixtureRoot, ".gitignore"), "artifacts/\ndist/\n", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, "README.md"), "publisher fixture\n", "utf8");
  fs.mkdirSync(path.join(fixtureRoot, "config"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "config", "campaign-publication-boundary.json"), `${JSON.stringify({
    format: "tear-campaign-publication-boundary", schemaVersion: 1, status: "public", rulesetVersion: "test-public",
    activeStageIds: ["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"], previewStageIds: ["pale-traverse"],
  })}\n`, "utf8");
  git(fixtureRoot, "init", "-b", "main");
  git(fixtureRoot, "config", "user.name", "Tear Artifact Test");
  git(fixtureRoot, "config", "user.email", "artifact-test@invalid.example");
  git(fixtureRoot, "add", ".gitignore", "README.md", "config/campaign-publication-boundary.json");
  git(fixtureRoot, "commit", "-m", "fixture baseline");
  fs.mkdirSync(path.join(fixtureRoot, "artifacts", "tearbench"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "artifacts", "tearbench", "prior.json"), "retained evidence\n", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, "dist", "bundle.js"), "generated output\n", "utf8");
  return { fixtureRoot, sourceSha: git(fixtureRoot, "rev-parse", "HEAD") };
}

test("Validate publishes the exact game-reference artifact only after functional success", () => {
  const functionalIndex = workflow.indexOf("- run: xvfb-run -a pnpm check:functional");
  const releaseUploadIndex = workflow.indexOf("- uses: actions/upload-artifact@v4", functionalIndex);
  const publishIndex = workflow.indexOf("- name: Publish exact game-reference manifest");
  const uploadIndex = workflow.indexOf("- uses: actions/upload-artifact@v4", publishIndex);
  assert.ok(functionalIndex >= 0, "Validate must retain the functional gate");
  assert.ok(releaseUploadIndex > functionalIndex, "release artifact must remain immediately after the functional gate");
  assert.ok(publishIndex > releaseUploadIndex, "publication must follow the existing release artifact");
  assert.ok(uploadIndex > publishIndex, "upload must follow manifest generation");
  const releaseArtifact = workflow.slice(releaseUploadIndex, publishIndex);
  assert.match(releaseArtifact, /name:\s*tear-release-targets-\$\{\{\s*github\.sha\s*\}\}/u);
  assert.match(releaseArtifact, /path:\s*\|\s*dist\s+artifacts\/packages\/tear-crazygames\.zip\s+artifacts\/tearbench/us);
  assert.match(releaseArtifact, /retention-days:\s*14/u);
  const publication = workflow.slice(publishIndex, workflow.indexOf("- uses: actions/upload-artifact@v4", uploadIndex + 1));
  assert.match(publication, /GITHUB_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/u);
  assert.match(publication, /GITHUB_REPOSITORY:\s*\$\{\{\s*github\.repository\s*\}\}/u);
  assert.match(publication, /GITHUB_EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/u);
  assert.match(publication, /GITHUB_REF:\s*\$\{\{\s*github\.ref\s*\}\}/u);
  assert.match(publication, /GITHUB_RUN_ID:\s*\$\{\{\s*github\.run_id\s*\}\}/u);
  assert.match(publication, /TEAR_GAME_REFERENCE_ARTIFACT_NAME:\s*tear-game-reference-v1-\$\{\{\s*github\.sha\s*\}\}/u);
  const mainPushCondition = "if: github.event_name == 'push' && github.ref == 'refs/heads/main'";
  assert.equal(publication.split(mainPushCondition).length - 1, 2, "both publication and upload must require a protected-main push");
  assert.match(publication, /run:\s*pnpm publish:game-reference/u);
  assert.match(publication, /name:\s*tear-game-reference-v1-\$\{\{\s*github\.sha\s*\}\}/u);
  assert.match(publication, /path:\s*artifacts\/game-reference/u);
  assert.match(publication, /if-no-files-found:\s*error/u);
  assert.match(publication, /retention-days:\s*90/u);
  assert.doesNotMatch(publication, /always\(\)/u, "publication must not run after a failed Validate gate");
  assert.doesNotMatch(publication, /wrangler|\bdeploy\b|dispatch/iu, "publication must not deploy or dispatch");
  assert.match(workflow, /name:\s*tear-release-targets-\$\{\{\s*github\.sha\s*\}\}/u, "existing release artifact must remain");
});

test("publication inputs bind GITHUB_SHA to a clean checked-out HEAD", () => {
  assert.equal(validatePublicationInputs({
    sourceSha,
    headSha: sourceSha,
    status: "",
    repository: "shaku1z/tear",
    artifactName,
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "12345",
  }), sourceSha);
  assert.throws(() => validatePublicationInputs({
    sourceSha,
    headSha: "b".repeat(40),
    status: "",
    repository: "shaku1z/tear",
    artifactName,
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "12345",
  }), /GITHUB_SHA must equal/u);
  assert.throws(() => validatePublicationInputs({
    sourceSha,
    headSha: sourceSha,
    status: " M src/example.ts",
    repository: "shaku1z/tear",
    artifactName,
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "12345",
  }), /clean worktree/u);
  assert.throws(() => validatePublicationInputs({
    sourceSha,
    headSha: sourceSha,
    status: "",
    repository: "someone/else",
    artifactName,
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "12345",
  }), /GITHUB_REPOSITORY/u);
  assert.throws(() => validatePublicationInputs({
    sourceSha,
    headSha: sourceSha,
    status: "",
    repository: "shaku1z/tear",
    artifactName: "tear-game-reference-v1-bad",
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "12345",
  }), /artifactName/u);
  assert.throws(() => validatePublicationInputs({
    sourceSha,
    headSha: sourceSha,
    status: "",
    repository: "shaku1z/tear",
    artifactName,
    validationEvent: "pull_request",
    validationRef: "refs/pull/1/merge",
    validationRunId: "12345",
  }), /protected-main push/u);
});

test("manifest, digest, and receipt are all required and source-bound", () => {
  assert.equal(validateManifestEnvelope(validManifest(), { sourceSha }), sourceSha);
  const missingCollection = validManifest();
  delete missingCollection.collections.weapons;
  assert.throws(() => validateManifestEnvelope(missingCollection, { sourceSha }), /unexpected or missing/u);

  const sixStage = validManifest();
  assert.equal(validateManifestEnvelope(sixStage, { sourceSha }), sourceSha);
  sixStage.collections.stages.items[4] = { id: "pale-traverse" };
  assert.throws(() => validateManifestEnvelope(sixStage, { sourceSha }), /exact six published stages/u);
  sixStage.collections.stages.items[4] = { id: "voidspire" };
  sixStage.collections.bosses.items[4] = { id: "white-hart" };
  assert.throws(() => validateManifestEnvelope(sixStage, { sourceSha }), /exact six published bosses/u);
  sixStage.collections.bosses.items[4] = { id: "echo" };
  sixStage.collections.enemies.items.families[0].variants.push({ id: "rime-runner" });
  assert.throws(() => validateManifestEnvelope(sixStage, { sourceSha }), /Playground-only identity/u);

  const receipt = buildReceipt({
    sourceSha,
    artifactName,
    manifestSha256: "c".repeat(64),
    validationRunId: "12345",
    validationEvent: "push",
    validationRef: "refs/heads/main",
  });
  validateReceipt(receipt, {
    sourceSha,
    artifactName,
    manifestSha256: "c".repeat(64),
    validationRunId: "12345",
    validationEvent: "push",
    validationRef: "refs/heads/main",
  });
  const missingDigest = { ...receipt };
  delete missingDigest.manifestSha256;
  assert.throws(() => validateReceipt(missingDigest, { sourceSha, artifactName }), /unexpected or missing/u);
  assert.throws(() => validateReceipt(receipt, { sourceSha: "b".repeat(40), artifactName }), /sourceSha/u);
  assert.throws(() => validateArtifactFiles(["game-reference.v1.json"]), /exactly the manifest and receipt/u);
  assert.throws(() => validateArtifactFiles(["game-reference.v1.receipt.json"]), /exactly the manifest and receipt/u);
  assert.throws(() => validateArtifactFiles(["game-reference.v1.json", "game-reference.v1.receipt.json", "extra.txt"]), /exactly the manifest and receipt/u);
});

test("manifest validation consumes and fails closed on the target repository publication policy", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-policy-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "config"), { recursive: true });
    const policyPath = path.join(fixtureRoot, "config", "campaign-publication-boundary.json");
    const policy = {
      format: "tear-campaign-publication-boundary",
      schemaVersion: 1,
      status: "engineering-only",
      rulesetVersion: "test-policy",
      activeStageIds: ["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"],
      previewStageIds: ["pale-traverse"],
    };
    fs.writeFileSync(policyPath, `${JSON.stringify(policy)}\n`, "utf8");
    assert.throws(() => validateManifestEnvelope(validManifest(), { sourceSha, repositoryRoot: fixtureRoot }), /publication prohibited/u);

    policy.status = "public";
    [policy.activeStageIds[3], policy.activeStageIds[4]] = [policy.activeStageIds[4], policy.activeStageIds[3]];
    fs.writeFileSync(policyPath, `${JSON.stringify(policy)}\n`, "utf8");
    assert.throws(() => validateManifestEnvelope(validManifest(), { sourceSha, repositoryRoot: fixtureRoot }), /exact six published stage order/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("artifact output is fixed-scope and the publisher performs the required checks", () => {
  assert.equal(assertSafeArtifactDirectory(path.join(repositoryRoot, "artifacts", "game-reference"), repositoryRoot), path.join(repositoryRoot, "artifacts", "game-reference"));
  assert.throws(() => assertSafeArtifactDirectory(path.join(repositoryRoot, "dist"), repositoryRoot), /artifacts\/game-reference/u);
  assert.match(publisher, /process\.env\.GITHUB_SHA/u);
  assert.match(publisher, /assertCampaignPublicationAllowed/u, "publication must consume the tracked campaign boundary");
  assert.match(publisher, /campaign-publication-boundary\.mjs/u, "publication must use the shared policy validator");
  assert.match(publisher, /"--expected-sha", sourceSha/u);
  assert.match(publisher, /createHash/u);
  assert.match(publisher, /game-reference\.v1\.json/u);
  assert.match(publisher, /game-reference\.v1\.receipt\.json/u);
  assert.match(publisher, /validateArtifactFiles\(fs\.readdirSync/u);
  assert.match(publisher, /fs\.mkdirSync\(outputDirectory, \{ recursive: true \}\);\s+assertSafeArtifactDirectory\(outputDirectory, resolvedRoot\);\s+assertOutputDirectoryEmpty\(outputDirectory\)/u);
  assert.doesNotMatch(publisher, /wrangler|cloudflare|dispatch/iu, "publisher must not contain deployment or dispatch logic");
});

test("rejects symlink or junction aliases, including an aliased parent with no final directory", (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-path-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-outside-"));
  const aliasKind = process.platform === "win32" ? "junction" : "dir";
  let aliasCreated = false;
  try {
    fs.mkdirSync(path.join(fixtureRoot, "artifacts"), { recursive: true });
    try {
      fs.symlinkSync(outsideRoot, path.join(fixtureRoot, "artifacts", "game-reference"), aliasKind);
      aliasCreated = true;
    } catch (error) {
      if (process.platform === "win32") {
        try {
          fs.symlinkSync(outsideRoot, path.join(fixtureRoot, "artifacts", "game-reference"), "dir");
          aliasCreated = true;
        } catch {
          // The host may disallow both junction and directory-link creation.
        }
      }
      if (!aliasCreated && !(error && typeof error === "object" && "code" in error)) throw error;
    }
    if (!aliasCreated) {
      t.skip("host disallows the symlink/junction fixture required for alias testing");
      return;
    }
    assert.throws(
      () => assertSafeArtifactDirectory(path.join(fixtureRoot, "artifacts", "game-reference"), fixtureRoot),
      /symlink|junction|reparse|alias|escapes/u,
    );

    const parentFixture = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-parent-alias-"));
    const parentOutside = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-parent-outside-"));
    try {
      fs.symlinkSync(parentOutside, path.join(parentFixture, "artifacts"), aliasKind);
      assert.throws(
        () => assertSafeArtifactDirectory(path.join(parentFixture, "artifacts", "game-reference"), parentFixture),
        /symlink|junction|reparse|alias|escapes/u,
      );
    } finally {
      fs.rmSync(parentFixture, { recursive: true, force: true });
      fs.rmSync(parentOutside, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("publishes through the test-only exporter seam without dirtying ignored outputs and refuses stale overwrite", () => {
  const { fixtureRoot, sourceSha: fixtureSha } = createPublisherFixture();
  const fixtureArtifactName = `tear-game-reference-v1-${fixtureSha}`;
  const exporter = (requestedSha) => `${JSON.stringify(validManifest(requestedSha))}\n`;
  const options = {
    repositoryRoot: fixtureRoot,
    sourceSha: fixtureSha,
    repository: "shaku1z/tear",
    artifactName: fixtureArtifactName,
    validationEvent: "push",
    validationRef: "refs/heads/main",
    validationRunId: "987654321",
    exporter,
  };
  try {
    assert.equal(fs.readFileSync(path.join(fixtureRoot, "artifacts", "tearbench", "prior.json"), "utf8"), "retained evidence\n");
    assert.equal(fs.readFileSync(path.join(fixtureRoot, "dist", "bundle.js"), "utf8"), "generated output\n");
    assert.equal(git(fixtureRoot, "status", "--porcelain=v1", "--untracked-files=all"), "", "ignored operational outputs must not dirty-block publication");
    const result = publishGameReferenceArtifactForTest(options);
    const outputDirectory = result.outputDirectory;
    const names = fs.readdirSync(outputDirectory).sort();
    assert.deepEqual(names, ["game-reference.v1.json", "game-reference.v1.receipt.json"]);
    const manifestBytes = fs.readFileSync(path.join(outputDirectory, "game-reference.v1.json"));
    const receiptPath = path.join(outputDirectory, "game-reference.v1.receipt.json");
    const receiptBytes = fs.readFileSync(receiptPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    const manifestDigest = createHash("sha256").update(manifestBytes).digest("hex");
    assert.equal(receipt.manifestSha256, manifestDigest);
    assert.equal(receipt.sourceSha, fixtureSha);
    assert.equal(receipt.artifactName, fixtureArtifactName);
    assert.equal(receipt.validationRunId, "987654321");
    assert.equal(receipt.validationEvent, "push");
    assert.equal(receipt.validationRef, "refs/heads/main");
    assert.equal(git(fixtureRoot, "status", "--porcelain=v1", "--untracked-files=all"), "", "ignored artifacts must remain outside Git status");
    const beforeManifest = Buffer.from(manifestBytes);
    const beforeReceipt = Buffer.from(receiptBytes);
    assert.throws(() => publishGameReferenceArtifactForTest(options), /already contains files/u);
    assert.deepEqual(fs.readFileSync(path.join(outputDirectory, "game-reference.v1.json")), beforeManifest);
    assert.deepEqual(fs.readFileSync(receiptPath), beforeReceipt);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
