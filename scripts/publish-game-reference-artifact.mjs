import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const FULL_SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const GAME_REFERENCE_FORMAT = "game-reference.v1";
const GAME_REFERENCE_SCHEMA_VERSION = 2;
const GAME_REFERENCE_REPOSITORY = "shaku1z/tear";
const GAME_REFERENCE_TERMINOLOGY_VERSION = "g4-terminology-v1";
const ARTIFACT_FORMAT = "tear-game-reference-artifact-receipt.v1";
const ARTIFACT_RETENTION_DAYS = 90;
const MANIFEST_FILENAME = "game-reference.v1.json";
const RECEIPT_FILENAME = "game-reference.v1.receipt.json";
const ARTIFACT_NAME_PREFIX = "tear-game-reference-v1-";

function fullSha(value, label) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!FULL_SHA.test(normalized)) throw new TypeError(`${label} must be a full 40-character Git SHA`);
  return normalized;
}

function digest(value, label) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!DIGEST.test(normalized)) throw new TypeError(`${label} must be a 64-character SHA-256 digest`);
  return normalized;
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
}

function git(rootPath, ...args) {
  const result = spawnSync("git", args, { cwd: rootPath, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

/**
 * Validates the immutable identity used by the workflow before Vite or a game
 * module is started. The publication path is intentionally GitHub-SHA-only.
 */
export function validatePublicationInputs({ sourceSha, headSha, status, repository, artifactName, validationEvent, validationRef, validationRunId }) {
  const expectedSha = fullSha(sourceSha, "GITHUB_SHA");
  if (fullSha(headSha, "HEAD") !== expectedSha) throw new Error("GITHUB_SHA must equal the checked-out HEAD");
  if (typeof status !== "string" || status.length > 0) throw new Error("game-reference publication requires a clean worktree");
  if (repository !== GAME_REFERENCE_REPOSITORY) throw new Error(`GITHUB_REPOSITORY must be ${GAME_REFERENCE_REPOSITORY}`);
  if (validationEvent !== "push" || validationRef !== "refs/heads/main") throw new Error("game-reference publication requires a protected-main push Validate run");
  if (typeof validationRunId !== "string" || !/^[1-9][0-9]*$/u.test(validationRunId)) throw new Error("GITHUB_RUN_ID must be a numeric validation run ID");
  const expectedArtifactName = `${ARTIFACT_NAME_PREFIX}${expectedSha}`;
  if (artifactName !== expectedArtifactName) throw new Error(`artifactName must be ${expectedArtifactName}`);
  return expectedSha;
}

/** The generated manifest is checked again before any artifact file is written. */
export function validateManifestEnvelope(manifest, { sourceSha, repository = GAME_REFERENCE_REPOSITORY } = {}) {
  exactKeys(manifest, ["format", "schemaVersion", "source", "terminologyVersion", "roster", "collections"], "game-reference manifest");
  if (manifest.format !== GAME_REFERENCE_FORMAT || manifest.schemaVersion !== GAME_REFERENCE_SCHEMA_VERSION) {
    throw new TypeError("game-reference manifest format/schema is unsupported");
  }
  exactKeys(manifest.source, ["repository", "sha"], "game-reference manifest source");
  if (manifest.source.repository !== repository) throw new TypeError("game-reference manifest repository is not canonical");
  const manifestSha = fullSha(manifest.source.sha, "game-reference manifest source.sha");
  if (sourceSha !== undefined && manifestSha !== fullSha(sourceSha, "sourceSha")) throw new Error("game-reference manifest SHA is not the requested GITHUB_SHA");
  if (manifest.terminologyVersion !== GAME_REFERENCE_TERMINOLOGY_VERSION) throw new TypeError("game-reference manifest terminology is unsupported");
  exactKeys(manifest.roster, ["id", "schemaVersion", "activeWeaponIds", "retiredWeaponIds"], "game-reference manifest roster");
  if (manifest.roster.id !== "final-five" || !Array.isArray(manifest.roster.activeWeaponIds) || !Array.isArray(manifest.roster.retiredWeaponIds)) {
    throw new TypeError("game-reference manifest roster is incomplete");
  }
  const collectionIds = ["achievements", "bosses", "enemies", "modes", "public-tuning", "stages", "upgrades", "weapons"];
  exactKeys(manifest.collections, collectionIds, "game-reference manifest collections");
  for (const collectionId of collectionIds) {
    const collection = manifest.collections[collectionId];
    exactKeys(collection, ["status", "items"], `game-reference manifest collections.${collectionId}`);
    if (collection.status !== "complete") throw new TypeError(`game-reference collection ${collectionId} is not complete`);
  }
  const stageIds = manifest.collections.stages.items.map((stage) => stage?.id);
  if (stageIds.includes("verdant-sanctum") && !stageIds.includes("pale-traverse")) {
    throw new Error("game-reference publication prohibits a Verdant-without-Pale campaign catalog");
  }
  return manifestSha;
}

export function validateReceipt(receipt, { sourceSha, repository = GAME_REFERENCE_REPOSITORY, artifactName, manifestSha256, validationEvent, validationRef, validationRunId } = {}) {
  exactKeys(receipt, [
    "format", "repository", "sourceSha", "gameReferenceFormat", "gameReferenceSchemaVersion",
    "terminologyVersion", "artifactName", "manifestFilename", "manifestSha256", "receiptFilename",
    "retentionDays", "generatedBy", "validationRunId", "validationEvent", "validationRef",
  ], "game-reference artifact receipt");
  if (receipt.format !== ARTIFACT_FORMAT) throw new TypeError("game-reference artifact receipt format is unsupported");
  if (receipt.repository !== repository) throw new TypeError("game-reference artifact receipt repository is not canonical");
  if (sourceSha !== undefined && receipt.sourceSha !== fullSha(sourceSha, "sourceSha")) throw new Error("receipt sourceSha is not the requested GITHUB_SHA");
  fullSha(receipt.sourceSha, "receipt sourceSha");
  if (receipt.gameReferenceFormat !== GAME_REFERENCE_FORMAT || receipt.gameReferenceSchemaVersion !== GAME_REFERENCE_SCHEMA_VERSION) {
    throw new TypeError("receipt game-reference format/schema is unsupported");
  }
  if (receipt.terminologyVersion !== GAME_REFERENCE_TERMINOLOGY_VERSION) throw new TypeError("receipt terminology is unsupported");
  if (artifactName !== undefined && receipt.artifactName !== artifactName) throw new Error("receipt artifactName does not match the uploaded artifact");
  if (receipt.manifestFilename !== MANIFEST_FILENAME || receipt.receiptFilename !== RECEIPT_FILENAME) throw new TypeError("receipt filenames are not canonical");
  if (manifestSha256 !== undefined && receipt.manifestSha256 !== digest(manifestSha256, "manifestSha256")) throw new Error("receipt digest does not match the manifest");
  digest(receipt.manifestSha256, "receipt manifestSha256");
  if (validationEvent !== undefined && receipt.validationEvent !== validationEvent) throw new Error("receipt validationEvent does not match the workflow run");
  if (validationRef !== undefined && receipt.validationRef !== validationRef) throw new Error("receipt validationRef does not match the workflow run");
  if (validationRunId !== undefined && receipt.validationRunId !== validationRunId) throw new Error("receipt validationRunId does not match the workflow run");
  if (receipt.validationEvent !== "push" || receipt.validationRef !== "refs/heads/main" || !/^[1-9][0-9]*$/u.test(receipt.validationRunId)) {
    throw new TypeError("receipt validation provenance is not a protected-main push run");
  }
  if (receipt.retentionDays !== ARTIFACT_RETENTION_DAYS || receipt.generatedBy !== "pnpm publish:game-reference") {
    throw new TypeError("receipt retention or generator metadata is invalid");
  }
  return receipt;
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithinPath(base, target) {
  const relative = path.relative(comparablePath(base), comparablePath(target));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function lstatIfPresent(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Rejects aliases at every existing path component. The lexical path is
 * deliberately compared with native realpaths so junctions/reparse points
 * cannot redirect artifact writes, even when the final directory is absent.
 */
export function assertSafeArtifactDirectory(outputDirectory, repositoryRoot = root) {
  const resolvedRoot = path.resolve(repositoryRoot);
  const expected = path.resolve(resolvedRoot, "artifacts", "game-reference");
  if (comparablePath(outputDirectory) !== comparablePath(expected)) throw new Error("game-reference artifact output must remain artifacts/game-reference");
  const rootStat = lstatIfPresent(resolvedRoot);
  if (rootStat === undefined || !rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("canonical repository root must be a real directory");
  let canonicalRoot;
  try {
    canonicalRoot = path.resolve(fs.realpathSync.native(resolvedRoot));
  } catch (error) {
    throw new Error("canonical repository root realpath could not be verified", { cause: error });
  }
  if (comparablePath(canonicalRoot) !== comparablePath(resolvedRoot)) throw new Error("canonical repository root is an alias");
  const relative = path.relative(resolvedRoot, expected);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("game-reference artifact path escapes the repository root");
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const stat = lstatIfPresent(current);
    if (stat === undefined) break;
    if (stat.isSymbolicLink()) throw new Error(`game-reference artifact path contains a symlink, junction, or reparse point: ${current}`);
    if (!stat.isDirectory()) throw new Error(`game-reference artifact path component is not a directory: ${current}`);
    let realCurrent;
    try {
      realCurrent = path.resolve(fs.realpathSync.native(current));
    } catch (error) {
      throw new Error(`game-reference artifact path realpath could not be verified: ${current}`, { cause: error });
    }
    if (!isWithinPath(canonicalRoot, realCurrent)) throw new Error(`game-reference artifact path escapes the repository root through an alias: ${current}`);
    if (comparablePath(realCurrent) !== comparablePath(current)) throw new Error(`game-reference artifact path contains an alias: ${current}`);
  }
  return expected;
}

export function validateArtifactFiles(entries) {
  for (const entry of entries) {
    if (typeof entry !== "string" && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error("game-reference artifact must contain regular files only");
    }
  }
  const names = entries.map((entry) => typeof entry === "string" ? entry : entry.name).sort();
  const expected = [MANIFEST_FILENAME, RECEIPT_FILENAME].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error("game-reference artifact must contain exactly the manifest and receipt");
  }
  return names;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildReceipt({ sourceSha, artifactName, manifestSha256, validationRunId, validationEvent, validationRef }) {
  const sha = fullSha(sourceSha, "sourceSha");
  const receipt = {
    format: ARTIFACT_FORMAT,
    repository: GAME_REFERENCE_REPOSITORY,
    sourceSha: sha,
    gameReferenceFormat: GAME_REFERENCE_FORMAT,
    gameReferenceSchemaVersion: GAME_REFERENCE_SCHEMA_VERSION,
    terminologyVersion: GAME_REFERENCE_TERMINOLOGY_VERSION,
    artifactName,
    manifestFilename: MANIFEST_FILENAME,
    manifestSha256: digest(manifestSha256, "manifestSha256"),
    receiptFilename: RECEIPT_FILENAME,
    retentionDays: ARTIFACT_RETENTION_DAYS,
    generatedBy: "pnpm publish:game-reference",
    validationRunId,
    validationEvent,
    validationRef,
  };
  validateReceipt(receipt, {
    sourceSha: sha,
    artifactName,
    manifestSha256: receipt.manifestSha256,
    validationRunId,
    validationEvent,
    validationRef,
  });
  return receipt;
}

function runExporter(sourceSha, repositoryRoot = root) {
  const result = spawnSync(process.execPath, [
    path.join(repositoryRoot, "scripts", "export-game-reference.mjs"),
    "--sha", sourceSha,
    "--expected-sha", sourceSha,
  ], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`game-reference exporter failed: ${result.stderr || result.stdout}`);
  if (typeof result.stdout !== "string" || result.stdout.length === 0) throw new Error("game-reference exporter produced no manifest");
  return result.stdout;
}

function assertOutputDirectoryEmpty(outputDirectory) {
  const stat = fs.lstatSync(outputDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("game-reference artifact output must be a real directory");
  const entries = fs.readdirSync(outputDirectory, { withFileTypes: true });
  if (entries.length > 0) throw new Error("game-reference artifact output already contains files");
}

function publishGameReferenceArtifactInternal({
  repositoryRoot = root,
  sourceSha = process.env.GITHUB_SHA,
  repository = process.env.GITHUB_REPOSITORY ?? GAME_REFERENCE_REPOSITORY,
  artifactName = process.env.TEAR_GAME_REFERENCE_ARTIFACT_NAME,
  validationEvent = process.env.GITHUB_EVENT_NAME,
  validationRef = process.env.GITHUB_REF,
  validationRunId = process.env.GITHUB_RUN_ID,
} = {}, exporter = runExporter) {
  const resolvedRoot = path.resolve(repositoryRoot);
  const headSha = git(resolvedRoot, "rev-parse", "HEAD");
  const status = git(resolvedRoot, "status", "--porcelain=v1", "--untracked-files=all");
  const requestedSha = fullSha(sourceSha, "GITHUB_SHA");
  const resolvedArtifactName = artifactName ?? `${ARTIFACT_NAME_PREFIX}${requestedSha}`;
  validatePublicationInputs({
    sourceSha: requestedSha,
    headSha,
    status,
    repository,
    artifactName: resolvedArtifactName,
    validationEvent,
    validationRef,
    validationRunId,
  });
  const outputDirectory = assertSafeArtifactDirectory(path.resolve(resolvedRoot, "artifacts", "game-reference"), resolvedRoot);
  if (lstatIfPresent(outputDirectory) !== undefined) assertOutputDirectoryEmpty(outputDirectory);

  const encoded = exporter(requestedSha, resolvedRoot);
  let manifest;
  try {
    manifest = JSON.parse(encoded);
  } catch (error) {
    throw new Error(`game-reference exporter produced invalid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  validateManifestEnvelope(manifest, { sourceSha: requestedSha, repository });
  if (!encoded.endsWith("\n")) throw new Error("game-reference manifest must end with one newline");
  const manifestSha256 = createHash("sha256").update(Buffer.from(encoded, "utf8")).digest("hex");
  const receipt = buildReceipt({
    sourceSha: requestedSha,
    artifactName: resolvedArtifactName,
    manifestSha256,
    validationRunId,
    validationEvent,
    validationRef,
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  assertSafeArtifactDirectory(outputDirectory, resolvedRoot);
  assertOutputDirectoryEmpty(outputDirectory);
  fs.writeFileSync(path.join(outputDirectory, MANIFEST_FILENAME), encoded, "utf8");
  fs.writeFileSync(path.join(outputDirectory, RECEIPT_FILENAME), canonicalJson(receipt), "utf8");
  validateArtifactFiles(fs.readdirSync(outputDirectory, { withFileTypes: true }));
  console.log(`Published ${resolvedArtifactName}: ${MANIFEST_FILENAME} sha256=${manifestSha256}`);
  return { outputDirectory, artifactName: resolvedArtifactName, sourceSha: requestedSha, manifestSha256 };
}

export function publishGameReferenceArtifact(options = {}) {
  return publishGameReferenceArtifactInternal(options, runExporter);
}

/** Explicitly test-only seam; production CLI always uses the real Vite exporter above. */
export function publishGameReferenceArtifactForTest(options = {}) {
  const { exporter, ...publicationOptions } = options;
  if (typeof exporter !== "function") throw new TypeError("test publisher requires an exporter function");
  return publishGameReferenceArtifactInternal(publicationOptions, exporter);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  publishGameReferenceArtifact();
}
