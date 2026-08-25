import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";

export const GAME_REPOSITORY = "shaku1z/tear";
export const WIKI_REPOSITORY = "shaku1z/tear-wiki";
export const DISPATCH_EVENT_TYPE = "tear-game-deployed";
export const VALIDATE_WORKFLOW_ID = 322540049;
export const VALIDATE_WORKFLOW_PATH = ".github/workflows/ci.yml";
export const VALIDATE_WORKFLOW_NAME = "Validate";
export const ARTIFACT_NAME_PREFIX = "tear-game-reference-v1-";
export const MAX_ZIP_BYTES = 48 * 1024;
export const MAX_DISPATCH_BODY_BYTES = 65_535;

const API_ROOT = "https://api.github.com";
const FULL_SHA = /^[0-9a-f]{40}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const ARTIFACT_DIGEST = /^sha256:[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`wiki reference dispatch: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fullSha(value, label) {
  if (typeof value !== "string" || !FULL_SHA.test(value)) fail(`${label} must be a full lowercase SHA`);
  return value;
}

function positiveInteger(value, label) {
  const normalized = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof normalized !== "string" || !POSITIVE_INTEGER.test(normalized)) fail(`${label} must be a canonical positive integer`);
  return normalized;
}

function token(value, label) {
  if (typeof value !== "string" || value.length === 0 || /\s/u.test(value)) fail(`${label} is required`);
  return value;
}

function authorizationHeaders(accessToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token(accessToken, "GitHub API token")}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readJsonResponse(response, label) {
  if (!response || response.status !== 200 || response.ok === false) fail(`${label} request failed`);
  try {
    return await response.json();
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function requestGitHubJson(path, accessToken, fetchImpl) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    headers: authorizationHeaders(accessToken),
    redirect: "error",
  });
  return readJsonResponse(response, path);
}

export function validateValidateRun(run, { validationRunId, expectedSha } = {}) {
  if (!isRecord(run)) fail("Validate run metadata must be an object");
  const runId = positiveInteger(run.id, "Validate run ID");
  if (validationRunId !== undefined && runId !== positiveInteger(validationRunId, "validation run ID")) {
    fail("Validate run ID does not match the requested run");
  }
  if (run.name !== VALIDATE_WORKFLOW_NAME || String(run.workflow_id) !== String(VALIDATE_WORKFLOW_ID)) {
    fail("run is not the canonical Validate workflow");
  }
  if (run.path !== VALIDATE_WORKFLOW_PATH) fail("run path is not the canonical Validate workflow path");
  if (run.status !== "completed" || run.conclusion !== "success") fail("Validate run is not successful and completed");
  if (run.event !== "push" || run.head_branch !== "main") fail("Validate run is not a protected-main push");
  if (run.repository?.full_name !== GAME_REPOSITORY || run.head_repository?.full_name !== GAME_REPOSITORY) {
    fail("Validate run repository provenance is not canonical");
  }
  const sourceSha = fullSha(run.head_sha, "Validate run head SHA");
  if (expectedSha !== undefined && sourceSha !== fullSha(expectedSha, "expected game SHA")) {
    fail("Validate run head SHA does not match the expected game SHA");
  }
  return { runId, sourceSha };
}

export function validatePublishedArtifact(artifact, { sourceSha, validationRunId, now = Date.now() } = {}) {
  if (!isRecord(artifact)) fail("published artifact metadata must be an object");
  const expectedSha = fullSha(sourceSha, "game SHA");
  const runId = positiveInteger(validationRunId, "validation run ID");
  const artifactId = positiveInteger(artifact.id, "artifact ID");
  const expectedName = `${ARTIFACT_NAME_PREFIX}${expectedSha}`;
  if (artifact.name !== expectedName) fail("published artifact name is not source-bound");
  if (artifact.expired !== false) fail("published artifact is expired");
  const expiresAt = Date.parse(artifact.expires_at ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now) fail("published artifact has expired or no future expiry");
  if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > MAX_ZIP_BYTES) {
    fail("published artifact size is outside the bounded reference contract");
  }
  if (typeof artifact.digest !== "string" || !ARTIFACT_DIGEST.test(artifact.digest)) fail("published artifact digest is not a SHA-256 digest");
  const workflowRun = artifact.workflow_run;
  if (!isRecord(workflowRun) || positiveInteger(workflowRun.id, "artifact workflow run ID") !== runId || workflowRun.head_branch !== "main" || workflowRun.head_sha !== expectedSha) {
    fail("published artifact workflow provenance does not match the validated run");
  }
  return { artifactId, artifactName: artifact.name, artifactDigest: artifact.digest, artifactSize: artifact.size_in_bytes };
}

async function selectPublishedArtifact({ sourceSha, validationRunId, accessToken, fetchImpl }) {
  const runId = positiveInteger(validationRunId, "validation run ID");
  const listing = await requestGitHubJson(`/repos/${GAME_REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`, accessToken, fetchImpl);
  if (!isRecord(listing) || !Array.isArray(listing.artifacts)) fail("artifact listing is invalid");
  const totalCount = positiveInteger(listing.total_count, "artifact listing total_count");
  if (Number(totalCount) !== listing.artifacts.length) fail("artifact listing is incomplete or paginated");
  const expectedName = `${ARTIFACT_NAME_PREFIX}${fullSha(sourceSha, "game SHA")}`;
  const matches = listing.artifacts.filter((artifact) => isRecord(artifact) && artifact.name === expectedName);
  if (matches.length !== 1) fail("artifact name does not identify exactly one published artifact");
  return { artifact: matches[0], ...validatePublishedArtifact(matches[0], { sourceSha, validationRunId }) };
}

async function downloadPublishedArtifact({ artifactId, accessToken, fetchImpl }) {
  const endpoint = `${API_ROOT}/repos/${GAME_REPOSITORY}/actions/artifacts/${artifactId}/zip`;
  const response = await fetchImpl(endpoint, {
    headers: authorizationHeaders(accessToken),
    redirect: "manual",
  });
  if (![301, 302, 303, 307, 308].includes(response?.status)) fail("artifact download did not return the approved redirect");
  const location = response.headers?.get?.("location");
  if (typeof location !== "string" || location.length === 0) fail("artifact download redirect has no location");
  let redirectUrl;
  try { redirectUrl = new URL(location); } catch (error) { fail(`artifact download redirect is invalid: ${error.message}`); }
  const hostname = redirectUrl.hostname.toLowerCase();
  const approvedHost = hostname.endsWith(".blob.core.windows.net") || hostname === "pipelines.actions.githubusercontent.com" || hostname.endsWith(".actions.githubusercontent.com");
  if (redirectUrl.protocol !== "https:" || redirectUrl.username !== "" || redirectUrl.password !== "" || redirectUrl.port !== "" || redirectUrl.hash !== "" || !approvedHost) {
    fail("artifact download redirect is not an approved storage host");
  }
  const blobResponse = await fetchImpl(redirectUrl.toString(), { redirect: "error" });
  if (!blobResponse || !blobResponse.ok) fail("artifact blob download failed");
  if (blobResponse.body?.getReader) {
    const reader = blobResponse.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ZIP_BYTES) {
        await reader.cancel();
        fail("downloaded artifact exceeds the bounded reference contract");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  let bytes;
  try { bytes = Buffer.from(await blobResponse.arrayBuffer()); } catch (error) { fail(`artifact blob response is unreadable: ${error.message}`); }
  if (bytes.length > MAX_ZIP_BYTES) fail("downloaded artifact exceeds the bounded reference contract");
  return bytes;
}

function verifyArtifactBytes(bytes, { artifactDigest, artifactSize }) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== artifactSize) fail("downloaded artifact size does not match published metadata");
  if (bytes.length > MAX_ZIP_BYTES) fail("downloaded artifact exceeds the bounded reference contract");
  const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actualDigest !== artifactDigest) fail("downloaded artifact digest does not match published metadata");
  return bytes;
}

function buildDispatchBody({ sourceSha, validationRunId, artifactId, bytes }) {
  const artifactZipBase64 = bytes.toString("base64");
  const body = JSON.stringify({
    event_type: DISPATCH_EVENT_TYPE,
    client_payload: { game_commit: sourceSha, validation_run_id: validationRunId, artifact_id: String(artifactId), artifact_zip_base64: artifactZipBase64 },
  });
  if (Buffer.byteLength(body, "utf8") >= MAX_DISPATCH_BODY_BYTES) fail("repository dispatch payload exceeds the bounded GitHub limit");
  return body;
}

async function dispatchToWiki({ body, accessToken, fetchImpl }) {
  const response = await fetchImpl(`${API_ROOT}/repos/${WIKI_REPOSITORY}/dispatches`, {
    method: "POST",
    headers: { ...authorizationHeaders(accessToken), "Content-Type": "application/json" },
    body,
    redirect: "error",
  });
  if (!response || response.status !== 204 || response.ok === false) fail("wiki repository dispatch failed");
}

export async function dispatchWikiReference({ validationRunId, expectedSha, githubToken, wikiDeployToken, fetchImpl = globalThis.fetch, now = Date.now() }) {
  if (typeof fetchImpl !== "function") fail("fetch implementation is unavailable");
  const requestedRunId = positiveInteger(validationRunId, "validation run ID");
  const gameToken = token(githubToken, "GITHUB_TOKEN");
  const wikiToken = token(wikiDeployToken, "WIKI_DEPLOY_TOKEN");
  const run = await requestGitHubJson(`/repos/${GAME_REPOSITORY}/actions/runs/${requestedRunId}`, gameToken, fetchImpl);
  const { runId, sourceSha } = validateValidateRun(run, { validationRunId: requestedRunId, expectedSha });
  const selected = await selectPublishedArtifact({ sourceSha, validationRunId: runId, accessToken: gameToken, fetchImpl });
  const artifact = validatePublishedArtifact(selected.artifact, { sourceSha, validationRunId: runId, now });
  const bytes = verifyArtifactBytes(await downloadPublishedArtifact({ artifactId: artifact.artifactId, accessToken: gameToken, fetchImpl }), artifact);
  const body = buildDispatchBody({ sourceSha, validationRunId: runId, artifactId: artifact.artifactId, bytes });
  await dispatchToWiki({ body, accessToken: wikiToken, fetchImpl });
  return { sourceSha, validationRunId: runId, artifactId: artifact.artifactId, artifactName: artifact.artifactName, artifactDigest: artifact.artifactDigest, artifactSize: bytes.length };
}

function parseArgs(argv) {
  const values = { validationRunId: process.env.VALIDATION_RUN_ID, expectedSha: process.env.EXPECTED_GAME_SHA };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--validation-run-id" && flag !== "--expected-sha") || value === undefined) fail("CLI accepts only --validation-run-id and --expected-sha pairs");
    if (seen.has(flag)) fail(`duplicate CLI argument ${flag}`);
    seen.add(flag);
    if (flag === "--validation-run-id") values.validationRunId = value;
    else values.expectedSha = value;
  }
  if (values.validationRunId === undefined) fail("validation run ID is required");
  return values;
}

async function main() {
  const { validationRunId, expectedSha } = parseArgs(process.argv.slice(2));
  const result = await dispatchWikiReference({
    validationRunId,
    expectedSha,
    githubToken: process.env.GITHUB_TOKEN,
    wikiDeployToken: process.env.WIKI_DEPLOY_TOKEN,
  });
  console.log(`Dispatched ${DISPATCH_EVENT_TYPE} for game ${result.sourceSha}, validation run ${result.validationRunId}, artifact ${result.artifactId}.`);
}

if (process.argv[1]?.endsWith("dispatch-wiki-reference.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
