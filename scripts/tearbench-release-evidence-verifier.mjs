import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const REQUIRED_RELEASE_EVIDENCE_IDS = Object.freeze([
  "full-check", "deterministic-scenarios", "graveyard", "browser-journeys",
  "base-comparison", "historical-replays", "interaction-matrices",
]);

const evidencePolicy = JSON.parse(readFileSync(new URL("../src/tearbench/evidence-policy.json", import.meta.url), "utf8"));
export const REQUIRED_RELEASE_MATRIX_IDS = Object.freeze(Object.keys(evidencePolicy.matrices));

export const REQUIRED_CORRECTION_IDS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => `TC-${String(index + 1)}`),
);

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

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function verifyMatrixCoverage(matrices, evidenceById, receiptRecords, errors) {
  const canonicalMatrixIds = new Set(REQUIRED_RELEASE_MATRIX_IDS);
  const evidenceOwners = new Map();
  for (const entry of matrices) {
    const matrixId = entry?.id;
    const evidenceId = entry?.evidenceId;
    if (!canonicalMatrixIds.has(matrixId)) {
      errors.push(`matrix coverage contains unknown canonical matrix: ${String(matrixId)}`);
      continue;
    }
    if (!nonEmptyString(evidenceId)) {
      errors.push(`matrix proof ${String(matrixId)} has no evidence ID`);
      continue;
    }
    const owner = evidenceOwners.get(evidenceId);
    if (owner !== undefined && owner !== matrixId) {
      errors.push(`matrix evidence ${evidenceId} is reused across unrelated matrix cells (${owner}, ${matrixId})`);
    } else {
      evidenceOwners.set(evidenceId, matrixId);
    }
    if (!nonEmptyString(entry?.backend) || !nonEmptyString(entry?.observationClass)) {
      errors.push(`matrix proof ${matrixId} must name backend and observation identity`);
      continue;
    }
    const evidence = evidenceById.get(evidenceId);
    const receipt = receiptRecords.get(evidenceId);
    if (evidence === undefined || receipt === undefined) continue;
    const expectedScope = {
      matrixId,
      backend: entry.backend,
      observationClass: entry.observationClass,
    };
    const manifestScope = evidence.scope;
    const receiptScope = receipt.scope;
    for (const [label, scope] of [["manifest", manifestScope], ["receipt", receiptScope]]) {
      if (scope?.matrixId !== expectedScope.matrixId
        || scope?.backend !== expectedScope.backend
        || scope?.observationClass !== expectedScope.observationClass) {
        errors.push(`matrix proof ${matrixId} evidence ${evidenceId} is not bound to the exact matrix/backend/observation identity in its ${label} scope`);
      }
    }
  }
}

async function readWorkspaceFile(runtime, path, label, errors) {
  const candidate = insideWorkspace(runtime.root, path);
  if (!candidate) {
    errors.push(`${label} path is outside the workspace`);
    return undefined;
  }
  try {
    const canonicalRoot = await runtime.realpath(runtime.root);
    const canonicalPath = await runtime.realpath(candidate.absolute);
    const stored = relative(canonicalRoot, canonicalPath).replaceAll("\\", "/");
    if (stored === "" || stored.startsWith("../") || isAbsolute(stored)) {
      errors.push(`${label} resolves outside the workspace`);
      return undefined;
    }
    return await runtime.readFile(canonicalPath);
  } catch {
    errors.push(`${label} is missing or cannot be resolved safely`);
    return undefined;
  }
}

function equalSourceIdentity(left, right) {
  return left?.repository === right?.repository
    && left?.revision === right?.revision
    && left?.state === right?.state
    && left?.fingerprint === right?.fingerprint
    && left?.worktreeFingerprint === right?.worktreeFingerprint;
}

async function verifyCorrectionClosure(closure, manifest, evidenceById, receiptRecords, runtime, head, status, worktreeFingerprint, errors) {
  if (closure === undefined || closure === null || typeof closure !== "object") {
    errors.push("correction closure is missing");
    return { c40Status: "incomplete", blockers: Object.freeze([]) };
  }
  if (closure.format !== "tearbench-correction-closure" || closure.schemaVersion !== 1) errors.push("unsupported correction closure format");
  if (closure.status !== "correction-complete") errors.push("correction closure is not complete");
  if (!["incomplete", "certified"].includes(closure.c40Status)) errors.push("correction closure C40 status is invalid");
  if (!Array.isArray(closure.blockers)) errors.push("correction closure blockers must be an array");
  else {
    const blockerIds = closure.blockers.map((entry) => entry?.id);
    if (blockerIds.some((id) => typeof id !== "string" || id.length === 0) || new Set(blockerIds).size !== blockerIds.length) errors.push("correction closure blocker IDs must be unique non-empty strings");
    for (const blocker of closure.blockers) {
      if (typeof blocker?.owner !== "string" || blocker.owner.trim() === "") errors.push(`correction closure blocker ${String(blocker?.id)} has no owner`);
      if (typeof blocker?.status !== "string" || blocker.status.trim() === "") errors.push(`correction closure blocker ${String(blocker?.id)} has no status`);
      if (typeof blocker?.reason !== "string" || blocker.reason.trim() === "") errors.push(`correction closure blocker ${String(blocker?.id)} has no reason`);
    }
    if (closure.c40Status === "incomplete" && closure.blockers.length === 0) errors.push("incomplete C40 correction closure must name blockers");
    if (closure.c40Status === "certified" && closure.blockers.length !== 0) errors.push("certified C40 correction closure cannot contain blockers");
  }

  let runtimeSource;
  try { runtimeSource = typeof runtime.sourceIdentity === "function" ? await runtime.sourceIdentity() : undefined; }
  catch { errors.push("correction closure source identity could not be resolved"); }
  const source = closure.source;
  if (runtimeSource === undefined) errors.push("correction closure source identity is unavailable");
  else if (!equalSourceIdentity(source, { ...runtimeSource, repository: runtimeSource.repository ?? "shaku1z/tear" })) errors.push("correction closure source identity does not match the checked tree");
  if (source?.repository !== "shaku1z/tear" || source?.revision !== head || source?.state !== "clean"
    || source?.worktreeFingerprint !== worktreeFingerprint || !isSha256(source?.fingerprint)) errors.push("correction closure source identity is not clean and exact");
  if (status !== "") errors.push("correction closure requires a clean checked tree");

  const plan = closure.plan;
  if (plan?.path !== "plans/TEARBENCH_CURRENT_CORRECTION_PLAN.md" || !isSha256(plan?.sha256)) errors.push("correction closure plan reference is invalid");
  else {
    try {
      const contents = await readWorkspaceFile(runtime, plan.path, "correction closure plan", errors);
      if (contents !== undefined && sha256(contents) !== plan.sha256) errors.push("correction closure plan hash mismatch");
    } catch { errors.push("correction closure plan is missing"); }
  }

  const corrections = closure.corrections;
  if (!Array.isArray(corrections) || corrections.length !== REQUIRED_CORRECTION_IDS.length) errors.push("correction closure must contain exactly TC-1 through TC-9");
  else {
    const ids = corrections.map((entry) => entry?.id);
    if (ids.some((id, index) => id !== REQUIRED_CORRECTION_IDS[index])) errors.push("correction closure TC IDs must be exactly ordered TC-1 through TC-9");
    const focusedReceiptOwners = new Map();
    for (const entry of corrections) {
      if (entry?.status !== "complete") errors.push(`correction ${String(entry?.id)} is not complete`);
      if (!Array.isArray(entry?.focusedReceiptIds) || entry.focusedReceiptIds.length === 0
        || new Set(entry.focusedReceiptIds).size !== entry.focusedReceiptIds.length
        || entry.focusedReceiptIds.some((id) => typeof id !== "string" || id === "full-check" || !evidenceById.has(id)
          || receiptRecords.get(id)?.scope?.correctionId !== entry.id)) {
        errors.push(`correction ${String(entry?.id)} has invalid focused receipt IDs`);
      }
      for (const id of Array.isArray(entry?.focusedReceiptIds) ? entry.focusedReceiptIds : []) {
        if (focusedReceiptOwners.has(id) && focusedReceiptOwners.get(id) !== entry.id) errors.push(`focused receipt ${String(id)} is reused across corrections`);
        focusedReceiptOwners.set(id, entry.id);
      }
      if (entry?.postReviewDisposition !== "green") errors.push(`correction ${String(entry?.id)} lacks green post-review disposition`);
      const reportPath = typeof entry?.reportPath === "string" ? entry.reportPath.replaceAll("\\", "/") : "";
      if (!new RegExp(`^docs/checkpoints/tearbench-current-corrections/${String(entry?.id)}_[^/]+\\.md$`, "u").test(reportPath) || !isSha256(entry?.reportSha256)) {
        errors.push(`correction ${String(entry?.id)} has an invalid report reference`);
        continue;
      }
      try {
        const contents = await readWorkspaceFile(runtime, reportPath, `correction ${String(entry?.id)} report`, errors);
        if (contents !== undefined && sha256(contents) !== entry.reportSha256) errors.push(`correction ${String(entry?.id)} report hash mismatch`);
      } catch { errors.push(`correction ${String(entry?.id)} report is missing`); }
    }
  }

  const fullCheckEntries = [...evidenceById.values()].filter((entry) => entry?.id === "full-check" || entry?.command?.trim() === "pnpm check");
  if (fullCheckEntries.length !== 1) errors.push("correction closure requires exactly one final pnpm check evidence entry");
  const fullCheck = evidenceById.get("full-check");
  const finalFullCheck = closure.finalFullCheck;
  if (finalFullCheck?.evidenceId !== "full-check" || finalFullCheck?.receiptSha256 !== fullCheck?.receiptSha256) errors.push("correction closure final full-check receipt binding is invalid");
  const fullCheckReceipt = receiptRecords.get("full-check");
  if (fullCheck?.command?.trim() !== "pnpm check" || fullCheck?.status !== "passed" || fullCheckReceipt?.command !== "pnpm check") errors.push("final full-check receipt must be one passed exact pnpm check command");
  const generatedAt = Date.parse(manifest.generatedAt ?? "");
  const receiptAt = Date.parse(fullCheckReceipt?.timestamp ?? "");
  if (Number.isNaN(generatedAt) || Number.isNaN(receiptAt) || receiptAt > generatedAt) errors.push("final full-check receipt must precede manifest generation");

  for (const [id, evidence] of evidenceById) {
    if (!equalSourceIdentity(evidence?.source, source)) errors.push(`evidence ${id} source identity does not match correction closure`);
    const receipt = receiptRecords.get(id);
    if (receipt !== undefined && !equalSourceIdentity(receipt.source, source)) errors.push(`evidence ${id} receipt source identity does not match correction closure`);
  }
  return { c40Status: closure.c40Status, blockers: Object.freeze(Array.isArray(closure.blockers) ? [...closure.blockers] : []) };
}

async function receiptEntry(entry, root, head, worktreeFingerprint, runtime, errors) {
  const receipt = insideWorkspace(root, entry?.receiptPath);
  const canonicalReceiptPath = typeof entry?.id === "string" ? `artifacts/tearbench/receipts/${entry.id}.json` : undefined;
  if (!receipt || entry?.receiptPath !== canonicalReceiptPath || !isSha256(entry?.receiptSha256)) {
    errors.push(`evidence ${String(entry?.id)} has an invalid receipt reference`);
    return undefined;
  }
  const contents = await readWorkspaceFile(runtime, receipt.stored, `evidence ${String(entry?.id)} receipt`, errors);
  if (contents === undefined) return undefined;
  try {
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
    if (record?.timestamp !== entry.timestamp) errors.push(`evidence ${entry.id} receipt timestamp mismatch`);
    if (typeof record?.timestamp !== "string" || Number.isNaN(Date.parse(record.timestamp))) errors.push(`evidence ${entry.id} receipt has no valid timestamp`);
    if (typeof record?.stdout !== "string" || typeof record?.stderr !== "string") errors.push(`evidence ${entry.id} receipt lacks captured command output`);
    if (record?.subject?.path !== entry.artifactPath || record?.subject?.sha256 !== entry.artifactSha256 || record?.subject?.size !== entry.artifactSize) {
      errors.push(`evidence ${entry.id} receipt subject does not match manifest`);
    }
    return record;
  } catch { errors.push(`evidence ${entry.id} receipt is not valid JSON`); return undefined; }
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
  const receiptRecords = new Map();
  for (const entry of evidence) {
    if (typeof entry?.id !== "string" || entry.id.length === 0 || evidenceById.has(entry.id)) { errors.push("evidence IDs must be unique non-empty strings"); continue; }
    evidenceById.set(entry.id, entry);
    if (entry.status !== "passed") errors.push(`evidence ${entry.id} is not passed`);
    if (entry.commit !== head || entry.worktreeFingerprint !== worktreeFingerprint) errors.push(`evidence ${entry.id} is not bound to this exact clean HEAD`);
    if (typeof entry.command !== "string" || entry.command.trim() === "") errors.push(`evidence ${entry.id} has no recorded command`);
    if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp))) errors.push(`evidence ${entry.id} has no valid timestamp`);
    const artifact = insideWorkspace(root, entry.artifactPath);
    if (!artifact || !isSha256(entry.artifactSha256) || !Number.isSafeInteger(entry.artifactSize) || entry.artifactSize < 0) { errors.push(`evidence ${entry.id} has an invalid artifact reference`); continue; }
    try {
      const contents = await readWorkspaceFile(runtime, artifact.stored, `evidence ${entry.id} artifact`, errors);
      if (contents !== undefined && sha256(contents) !== entry.artifactSha256) errors.push(`evidence ${entry.id} artifact hash mismatch`);
      if (contents !== undefined && Buffer.byteLength(contents) !== entry.artifactSize) errors.push(`evidence ${entry.id} artifact size mismatch`);
    } catch { errors.push(`evidence ${entry.id} artifact is missing`); }
    const receipt = await receiptEntry(entry, root, head, worktreeFingerprint, runtime, errors);
    if (receipt !== undefined) receiptRecords.set(entry.id, receipt);
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
  verifyMatrixCoverage(matrices, evidenceById, receiptRecords, errors);

  for (const [label, proof] of [["preservation manifest", manifest.preservation?.runtimeManifest], ["preservation corpus", manifest.preservation?.corpus]]) {
    const artifact = insideWorkspace(root, proof?.path);
    if (!artifact || !isSha256(proof?.sha256)) { errors.push(`${label} hash proof is invalid`); continue; }
    try {
      const contents = await readWorkspaceFile(runtime, artifact.stored, label, errors);
      if (contents !== undefined && sha256(contents) !== proof.sha256) errors.push(`${label} hash mismatch`);
    } catch { errors.push(`${label} is missing`); }
  }
  const closureDisposition = await verifyCorrectionClosure(manifest.correctionClosure, manifest, evidenceById, receiptRecords, runtime, head, status, worktreeFingerprint, errors);
  const finalHead = String(await runtime.git(["rev-parse", "HEAD"])).trim();
  const finalStatus = await runtime.git(["status", "--porcelain=v1", "-z"]);
  let finalSource;
  try { finalSource = await runtime.sourceIdentity(); } catch { errors.push("final source identity could not be resolved"); }
  if (finalHead !== head || finalStatus !== status || !equalSourceIdentity(finalSource, manifest.correctionClosure?.source)) {
    errors.push("source identity changed during release evidence verification");
  }
  return { verified: errors.length === 0, errors: Object.freeze(errors), head, worktreeFingerprint,
    c40Status: closureDisposition.c40Status, blockers: closureDisposition.blockers };
}

export function createReleaseCertificate({ manifestPath, manifestSha256, verification, generatedAt }) {
  const errors = [...verification.errors];
  if (verification.verified && !isSha256(manifestSha256)) errors.push("certified release evidence requires an exact manifest SHA-256");
  if (verification.c40Status !== "certified") {
    const blockers = Array.isArray(verification.blockers) ? verification.blockers : [];
    errors.push(...blockers.map((blocker) => `C40 blocker ${String(blocker.id)} (${String(blocker.owner)}): ${String(blocker.reason)}`));
    if (blockers.length === 0) errors.push("C40 remains incomplete without a certified disposition");
  }
  const unsigned = {
    format: "tear-release-certificate", schemaVersion: 2,
    status: verification.verified && verification.c40Status === "certified" && errors.length === 0 ? "certified" : "rejected",
    commit: verification.head,
    evidenceManifest: manifestPath,
    evidenceManifestSha256: manifestSha256 ?? null,
    worktreeFingerprint: verification.worktreeFingerprint,
    errors: Object.freeze(errors),
    generatedAt,
  };
  return Object.freeze({ ...unsigned, certificateHash: sha256(JSON.stringify(unsigned)) });
}

/** Verify the one-way certificate-to-manifest byte binding before consumption. */
export function releaseCertificateBindsManifest(certificate, manifestContents) {
  if (certificate?.format !== "tear-release-certificate" || certificate.schemaVersion !== 2
    || !isSha256(certificate.evidenceManifestSha256) || !isSha256(certificate.certificateHash)) return false;
  const { certificateHash, ...unsigned } = certificate;
  return sha256(manifestContents) === certificate.evidenceManifestSha256
    && sha256(JSON.stringify(unsigned)) === certificateHash;
}

export const realReleaseEvidenceRuntime = Object.freeze({
  root: process.cwd(),
  git: async (argumentsList) => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("git", argumentsList, { cwd: process.cwd(), encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${argumentsList.join(" ")} failed`);
    return result.stdout;
  },
  sourceIdentity: async () => {
    const { RELEASE_REPOSITORY, readSourceIdentitySync } = await import("./release-artifact.mjs");
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: process.cwd(), encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "git status failed");
    return Object.freeze({ repository: RELEASE_REPOSITORY, ...readSourceIdentitySync(process.cwd()),
      worktreeFingerprint: sha256(result.stdout) });
  },
  readFile,
  realpath: async (path) => {
    const { realpath } = await import("node:fs/promises");
    return realpath(path);
  },
});
