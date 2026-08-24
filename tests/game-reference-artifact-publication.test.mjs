import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSafeArtifactDirectory,
  buildReceipt,
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
  return {
    format: "game-reference.v1",
    schemaVersion: 2,
    source: { repository: "shaku1z/tear", sha },
    terminologyVersion: "g4-terminology-v1",
    roster: { id: "final-five", schemaVersion: 1, activeWeaponIds: ["sword"], retiredWeaponIds: ["spear"] },
    collections: Object.fromEntries(collectionIds.map((id) => [id, { status: "complete", items: [] }])),
  };
}

test("Validate publishes the exact game-reference artifact only after functional success", () => {
  const functionalIndex = workflow.indexOf("- run: xvfb-run -a pnpm check:functional");
  const publishIndex = workflow.indexOf("- name: Publish exact game-reference manifest");
  const uploadIndex = workflow.indexOf("- uses: actions/upload-artifact@v4", publishIndex);
  assert.ok(functionalIndex >= 0, "Validate must retain the functional gate");
  assert.ok(publishIndex > functionalIndex, "publication must follow the functional gate");
  assert.ok(uploadIndex > publishIndex, "upload must follow manifest generation");
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

test("artifact output is fixed-scope and the publisher performs the required checks", () => {
  assert.equal(assertSafeArtifactDirectory(path.join(repositoryRoot, "artifacts", "game-reference"), repositoryRoot), path.join(repositoryRoot, "artifacts", "game-reference"));
  assert.throws(() => assertSafeArtifactDirectory(path.join(repositoryRoot, "dist"), repositoryRoot), /artifacts\/game-reference/u);
  assert.match(publisher, /process\.env\.GITHUB_SHA/u);
  assert.match(publisher, /"--expected-sha", sourceSha/u);
  assert.match(publisher, /createHash/u);
  assert.match(publisher, /game-reference\.v1\.json/u);
  assert.match(publisher, /game-reference\.v1\.receipt\.json/u);
  assert.match(publisher, /validateArtifactFiles\(fs\.readdirSync/u);
  assert.doesNotMatch(publisher, /wrangler|cloudflare|dispatch/iu, "publisher must not contain deployment or dispatch logic");
});
