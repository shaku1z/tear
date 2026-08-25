import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_NAME_PREFIX,
  DISPATCH_EVENT_TYPE,
  GAME_REPOSITORY,
  VALIDATE_WORKFLOW_ID,
  VALIDATE_WORKFLOW_NAME,
  VALIDATE_WORKFLOW_PATH,
  WIKI_REPOSITORY,
  dispatchWikiReference,
  validatePublishedArtifact,
  validateValidateRun,
} from "../scripts/dispatch-wiki-reference.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const senderSource = fs.readFileSync(path.join(repositoryRoot, "scripts", "dispatch-wiki-reference.mjs"), "utf8");
const manualWorkflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", "dispatch-wiki-reference.yml"), "utf8");
const productionWorkflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", "deploy-production.yml"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));

const SOURCE_SHA = "a".repeat(40);
const RUN_ID = "123456789";
const ARTIFACT_ID = "987654321";
const ZIP = Buffer.from("exact game-reference zip fixture\n", "utf8");
const DIGEST = `sha256:${createHash("sha256").update(ZIP).digest("hex")}`;

function response(body, status = 200, location) {
  const bytes = Buffer.isBuffer(body) ? body : undefined;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return name.toLowerCase() === "location" ? location ?? null : null; } },
    async json() { return body; },
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
  };
}

function fixture({ run = {}, artifact = {}, artifacts = undefined, redirect = "https://example.blob.core.windows.net/artifact.zip?signature=fixture", blob = ZIP } = {}) {
  const canonicalRun = {
    id: Number(RUN_ID),
    name: VALIDATE_WORKFLOW_NAME,
    workflow_id: VALIDATE_WORKFLOW_ID,
    path: VALIDATE_WORKFLOW_PATH,
    status: "completed",
    conclusion: "success",
    event: "push",
    head_branch: "main",
    head_sha: SOURCE_SHA,
    repository: { full_name: GAME_REPOSITORY },
    head_repository: { full_name: GAME_REPOSITORY },
    ...run,
  };
  const canonicalArtifact = {
    id: Number(ARTIFACT_ID),
    name: `${ARTIFACT_NAME_PREFIX}${SOURCE_SHA}`,
    expired: false,
    size_in_bytes: ZIP.length,
    digest: DIGEST,
    expires_at: "2099-01-01T00:00:00Z",
    workflow_run: { id: Number(RUN_ID), head_branch: "main", head_sha: SOURCE_SHA },
    ...artifact,
  };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith(`/actions/runs/${RUN_ID}`)) return response(canonicalRun);
    if (url.endsWith(`/actions/runs/${RUN_ID}/artifacts?per_page=100`)) return response({ total_count: (artifacts ?? [canonicalArtifact]).length, artifacts: artifacts ?? [canonicalArtifact] });
    if (url.endsWith(`/actions/artifacts/${ARTIFACT_ID}/zip`)) return response(null, 302, redirect);
    if (url === redirect) return response(blob);
    if (url === `https://api.github.com/repos/${WIKI_REPOSITORY}/dispatches`) return response(null, 204);
    throw new Error(`unexpected URL ${url}`);
  };
  return { calls, fetchImpl, run: canonicalRun, artifact: canonicalArtifact };
}

test("sender verifies the protected Validate run, exact artifact, digest, and token boundaries before dispatch", async () => {
  const { calls, fetchImpl } = fixture();
  const result = await dispatchWikiReference({
    validationRunId: RUN_ID,
    expectedSha: SOURCE_SHA,
    githubToken: "game-token",
    wikiDeployToken: "wiki-token",
    fetchImpl,
    now: Date.parse("2026-08-24T00:00:00Z"),
  });
  assert.deepEqual(result, {
    sourceSha: SOURCE_SHA,
    validationRunId: RUN_ID,
    artifactId: ARTIFACT_ID,
    artifactName: `${ARTIFACT_NAME_PREFIX}${SOURCE_SHA}`,
    artifactDigest: DIGEST,
    artifactSize: ZIP.length,
  });
  assert.equal(calls.length, 5);
  assert.equal(calls[0].options.headers.Authorization, "Bearer game-token");
  assert.equal(calls[1].options.headers.Authorization, "Bearer game-token");
  const redirectCall = calls.find((call) => call.url === "https://example.blob.core.windows.net/artifact.zip?signature=fixture");
  assert.ok(redirectCall);
  assert.equal(redirectCall.options.headers, undefined, "blob redirect must never receive an API token");
  const dispatchCall = calls.at(-1);
  assert.equal(dispatchCall.options.headers.Authorization, "Bearer wiki-token");
  const envelope = JSON.parse(dispatchCall.options.body);
  assert.deepEqual(Object.keys(envelope).sort(), ["client_payload", "event_type"]);
  assert.equal(envelope.event_type, DISPATCH_EVENT_TYPE);
  assert.deepEqual(Object.keys(envelope.client_payload).sort(), ["artifact_id", "artifact_zip_base64", "game_commit", "validation_run_id"]);
  assert.equal(envelope.client_payload.game_commit, SOURCE_SHA);
  assert.equal(envelope.client_payload.validation_run_id, RUN_ID);
  assert.equal(envelope.client_payload.artifact_id, ARTIFACT_ID);
  assert.equal(envelope.client_payload.artifact_zip_base64, ZIP.toString("base64"));
});

test("sender rejects noncanonical Validate provenance and stale expected SHA", () => {
  const valid = { id: Number(RUN_ID), name: VALIDATE_WORKFLOW_NAME, workflow_id: VALIDATE_WORKFLOW_ID, path: VALIDATE_WORKFLOW_PATH, status: "completed", conclusion: "success", event: "push", head_branch: "main", head_sha: SOURCE_SHA, repository: { full_name: GAME_REPOSITORY }, head_repository: { full_name: GAME_REPOSITORY } };
  for (const [field, value, pattern] of [
    ["workflow_id", 1, /canonical Validate/],
    ["path", ".github/workflows/other.yml", /canonical Validate workflow path/],
    ["name", "Other", /canonical Validate/],
    ["event", "pull_request", /protected-main/],
    ["head_branch", "feature", /protected-main/],
    ["head_repository", { full_name: "someone/else" }, /repository provenance/],
    ["conclusion", "failure", /successful and completed/],
  ]) {
    assert.throws(() => validateValidateRun({ ...valid, [field]: value }, { validationRunId: RUN_ID }), pattern, field);
  }
  assert.throws(() => validateValidateRun(valid, { validationRunId: RUN_ID, expectedSha: "b".repeat(40) }), /expected game SHA/);
});

test("sender requires one exact artifact and rejects metadata, expiry, redirect, and digest changes", async () => {
  const validArtifact = fixture().artifact;
  assert.doesNotThrow(() => validatePublishedArtifact(validArtifact, { sourceSha: SOURCE_SHA, validationRunId: RUN_ID, now: Date.parse("2026-08-24T00:00:00Z") }));
  for (const [label, artifact, pattern] of [
    ["name", { ...validArtifact, name: "other" }, /name/],
    ["digest", { ...validArtifact, digest: "not-a-digest" }, /digest/],
    ["expiry", { ...validArtifact, expired: true }, /expired/],
    ["size", { ...validArtifact, size_in_bytes: 49 * 1024 }, /size/],
    ["run", { ...validArtifact, workflow_run: { ...validArtifact.workflow_run, head_sha: "b".repeat(40) } }, /provenance/],
  ]) {
    assert.throws(() => validatePublishedArtifact(artifact, { sourceSha: SOURCE_SHA, validationRunId: RUN_ID, now: Date.parse("2026-08-24T00:00:00Z") }), pattern, label);
  }
  for (const [label, setup, pattern] of [
    ["duplicate", { artifacts: [validArtifact, validArtifact] }, /exactly one/],
    ["redirect", { redirect: "https://attacker.example/artifact.zip" }, /approved storage host/],
    ["port", { redirect: "https://example.blob.core.windows.net:444/artifact.zip" }, /approved storage host/],
    ["digest bytes", { blob: Buffer.from("x".repeat(ZIP.length), "utf8") }, /digest/],
  ]) {
    const { fetchImpl } = fixture(setup);
    await assert.rejects(() => dispatchWikiReference({ validationRunId: RUN_ID, githubToken: "game-token", wikiDeployToken: "wiki-token", fetchImpl, now: Date.parse("2026-08-24T00:00:00Z") }), pattern, label);
  }
});

test("sender, manual proof workflow, and production reuse expose only the intended contract", () => {
  assert.match(senderSource, /redirect:\s*"manual"/u);
  assert.match(senderSource, /blobResponse = await fetchImpl\(redirectUrl\.toString\(\), \{ redirect: "error" \}\)/u);
  assert.match(senderSource, /artifact_zip_base64/u);
  assert.doesNotMatch(senderSource, /console\.(?:log|error)\([^\n]*artifact_zip_base64/iu);
  assert.equal(packageJson.scripts["dispatch:wiki-reference"], "node scripts/dispatch-wiki-reference.mjs");

  assert.match(manualWorkflow, /workflow_dispatch:/u);
  assert.match(manualWorkflow, /validation_run_id:/u);
  assert.match(manualWorkflow, /github\.ref_protected/u);
  assert.match(manualWorkflow, /node scripts\/dispatch-wiki-reference\.mjs/u);
  const manualPermissions = manualWorkflow.slice(manualWorkflow.indexOf("permissions:"), manualWorkflow.indexOf("jobs:"));
  assert.match(manualPermissions, /actions:\s*read/u);
  assert.match(manualPermissions, /contents:\s*read/u);
  assert.doesNotMatch(manualPermissions, /write/u);
  assert.doesNotMatch(manualWorkflow, /wrangler|cloudflare|\bdeploy\b/iu);

  assert.match(productionWorkflow, /GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/u);
  assert.match(productionWorkflow, /VALIDATION_RUN_ID:\s*\$\{\{\s*steps\.validation\.outputs\.run_id\s*\}\}/u);
  assert.match(productionWorkflow, /pnpm dispatch:wiki-reference -- --validation-run-id "\$VALIDATION_RUN_ID" --expected-sha "\$GAME_COMMIT"/u);
  assert.doesNotMatch(productionWorkflow, /curl[^\n]*dispatch|client_payload[^\n]*game_commit/iu);
  const productionPermissions = productionWorkflow.slice(productionWorkflow.indexOf("permissions:"), productionWorkflow.indexOf("concurrency:"));
  assert.match(productionPermissions, /actions:\s*read/u);
  assert.match(productionPermissions, /contents:\s*read/u);
});
