import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const REQUIRED_RELEASE_EVIDENCE_IDS = Object.freeze([
  "full-check", "deterministic-scenarios", "graveyard", "browser-journeys",
  "base-comparison", "historical-replays", "interaction-matrices",
]);

export const REQUIRED_RELEASE_MATRIX_IDS = Object.freeze([
  "browser", "input", "platform", "viewport", "frameRate", "network",
  "interruption", "performance", "longRun",
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function insideWorkspace(root, path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) return undefined;
  const absolute = resolve(root, path);
  const stored = relative(root, absolute).replaceAll("\\", "/");
  return stored === "" || stored.startsWith("../") || isAbsolute(stored) ? undefined : { absolute, stored };
}

function namedEntries(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must name at least one covered proof`);
    return [];
  }
  const ids = value.map((entry) => entry?.id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) {
    errors.push(`${label} IDs must be non-empty and unique`);
  }
  return value;
}

function receiptEntry(entry, root, head, worktreeFingerprint, runtime, errors) {
  const receipt = insideWorkspace(root, entry?.receiptPath);
  if (!receipt || !isSha256(entry?.receiptSha256)) {
    errors.push(`evidence ${String(entry?.id)} has an invalid receipt reference`);
    return undefined;
  }
  return runtime.readFile(receipt.absolute).then((contents) => {
    if (sha256(contents) !== entry.receiptSha256) {
      errors.push(`evidence ${entry.id} receipt hash mismatch`);
      return undefined;
    }
    let record;
    try { record = JSON.parse(contents); } catch { errors.push(`evidence ${entry.id} receipt is not valid JSON`); return undefined; }
    if (record?.format !== "tearbench-evidence-receipt" || record?.schemaVersion !== 1) errors.push(`evidence ${entry.id} receipt format is invalid`);
    if (record?.id !== entry.id) errors.push(`evidence ${entry.id} receipt ID mismatch`);
    if (record?.status !== "passed" || record?.exitCode !== 0) errors.push(`evidence ${entry.id} receipt did not pass`);
    if (record?.commit !== head || record?.worktreeFingerprint !== worktreeFingerprint) errors.push(`evidence ${entry.id} receipt is not bound to this exact clean HEAD`);
    if (record?.command !== entry.command) errors.push(`evidence ${entry.id} receipt command mismatch`);
    if (typeof record?.timestamp !== "string" || Number.isNaN(Date.parse(record.timestamp))) errors.push(`evidence ${entry.id} receipt has no valid timestamp`);
    if (typeof record?.stdout !== "string" || typeof record?.stderr !== "string") errors.push(`evidence ${entry.id} receipt lacks captured command output`);
    if (record?.subject?.path !== entry.artifactPath || record?.subject?.sha256 !== entry.artifactSha256 || record?.subject?.size !== entry.artifactSize) {
      errors.push(`evidence ${entry.id} receipt subject does not match manifest`);
    }
    return record;
  }).catch(() => { errors.push(`evidence ${entry.id} receipt is missing`); return undefined; });
}

/**
 * Verify immutable release evidence.  This deliberately accepts its process
 * boundary as an adapter so unit tests can prove rejection behaviour without
 * giving test code a way to weaken the CLI's real git/filesystem checks.
 */
export async function verifyReleaseEvidenceManifest(manifest, runtime) {
  const errors = [];
  const root = runtime.root;
  const head = String(await runtime.git(["rev-parse", "HEAD"])).trim();
  const status = await runtime.git(["status", "--porcelain=v1", "-z"]);
  const worktreeFingerprint = sha256(status);
  if (typeof manifest !== "object" || manifest === null) return { verified: false, errors: ["evidence manifest must be an object"], head, worktreeFingerprint };
  if (manifest.format !== "tearbench-release-evidence-manifest" || manifest.schemaVersion !== 1) errors.push("unsupported release evidence manifest format");
  if (manifest.commit !== head) errors.push("manifest commit does not equal HEAD");
  if (status !== "") errors.push("release certification requires a clean worktree");
  if (manifest.worktreeFingerprint !== worktreeFingerprint) errors.push("manifest worktree fingerprint does not match the clean checked tree");

  const evidence = Array.isArray(manifest.evidence) ? manifest.evidence : [];
  const evidenceById = new Map();
  for (const entry of evidence) {
    if (typeof entry?.id !== "string" || evidenceById.has(entry.id)) { errors.push("evidence IDs must be unique non-empty strings"); continue; }
    evidenceById.set(entry.id, entry);
    if (entry.status !== "passed") errors.push(`evidence ${entry.id} is not passed`);
    if (entry.commit !== head || entry.worktreeFingerprint !== worktreeFingerprint) errors.push(`evidence ${entry.id} is not bound to this exact clean HEAD`);
    if (typeof entry.command !== "string" || entry.command.trim() === "") errors.push(`evidence ${entry.id} has no recorded command`);
    if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp))) errors.push(`evidence ${entry.id} has no valid timestamp`);
    const artifact = insideWorkspace(root, entry.artifactPath);
    if (!artifact || !isSha256(entry.artifactSha256) || !Number.isSafeInteger(entry.artifactSize) || entry.artifactSize < 0) { errors.push(`evidence ${entry.id} has an invalid artifact reference`); continue; }
    try {
      const contents = await runtime.readFile(artifact.absolute);
      if (sha256(contents) !== entry.artifactSha256) errors.push(`evidence ${entry.id} artifact hash mismatch`);
      if (Buffer.byteLength(contents) !== entry.artifactSize) errors.push(`evidence ${entry.id} artifact size mismatch`);
    } catch { errors.push(`evidence ${entry.id} artifact is missing`); }
    await receiptEntry(entry, root, head, worktreeFingerprint, runtime, errors);
  }
  for (const id of REQUIRED_RELEASE_EVIDENCE_IDS) if (!evidenceById.has(id)) errors.push(`required evidence is missing: ${id}`);

  const coverage = manifest.coverage ?? {};
  const arbitraryStates = namedEntries(coverage.arbitraryStates, "arbitrary-state coverage", errors);
  const journeys = namedEntries(coverage.journeys, "journey coverage", errors);
  const matrices = namedEntries(coverage.matrices, "matrix coverage", errors);
  for (const [label, entries] of [["arbitrary-state", arbitraryStates], ["journey", journeys], ["matrix", matrices]]) {
    for (const entry of entries) if (!evidenceById.has(entry?.evidenceId)) errors.push(`${label} proof ${String(entry?.id)} does not name a retained evidence record`);
  }
  const matrixIds = new Set(matrices.map((entry) => entry?.id));
  for (const id of REQUIRED_RELEASE_MATRIX_IDS) if (!matrixIds.has(id)) errors.push(`required matrix coverage is missing: ${id}`);

  for (const [label, proof] of [["preservation manifest", manifest.preservation?.runtimeManifest], ["preservation corpus", manifest.preservation?.corpus]]) {
    const artifact = insideWorkspace(root, proof?.path);
    if (!artifact || !isSha256(proof?.sha256)) { errors.push(`${label} hash proof is invalid`); continue; }
    try {
      if (sha256(await runtime.readFile(artifact.absolute)) !== proof.sha256) errors.push(`${label} hash mismatch`);
    } catch { errors.push(`${label} is missing`); }
  }
  return { verified: errors.length === 0, errors: Object.freeze(errors), head, worktreeFingerprint };
}

export function createReleaseCertificate({ manifestPath, verification, generatedAt }) {
  const unsigned = {
    format: "tear-release-certificate", schemaVersion: 2,
    status: verification.verified ? "certified" : "rejected",
    commit: verification.head,
    evidenceManifest: manifestPath,
    worktreeFingerprint: verification.worktreeFingerprint,
    errors: verification.errors,
    generatedAt,
  };
  return Object.freeze({ ...unsigned, certificateHash: sha256(JSON.stringify(unsigned)) });
}

export const realReleaseEvidenceRuntime = Object.freeze({
  root: process.cwd(),
  git: async (argumentsList) => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("git", argumentsList, { cwd: process.cwd(), encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${argumentsList.join(" ")} failed`);
    return result.stdout;
  },
  readFile,
});
