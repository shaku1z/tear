import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalJson, certificateBindsPlan, createPlanCertificate, receiptSha256 } from "./tearbench-task-receipts.mjs";
import { calculateArtifactHash } from "./release-artifact.mjs";

async function safeInput(workspaceRoot, path, label) {
  const requested = resolve(workspaceRoot, path), lexical = relative(resolve(workspaceRoot), requested).replaceAll("\\", "/");
  const direct = await lstat(requested);
  if (direct.isSymbolicLink()) throw new TypeError(`${label} is a symlink or junction`);
  const canonicalRoot = await realpath(workspaceRoot), canonical = await realpath(requested);
  const stored = relative(canonicalRoot, canonical).replaceAll("\\", "/");
  if (stored === "" || stored.startsWith("../") || isAbsolute(stored) || stored !== lexical) throw new TypeError(`${label} resolves outside the release workspace or through an alias`);
  return { absolute: canonical, stored };
}
async function directoryManifest(path) {
  const entries = [];
  const visit = async (directory, prefix = "") => {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = resolve(directory, name), stored = prefix === "" ? name : `${prefix}/${name}`;
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new TypeError(`certificate artifact contains a symlink or junction: ${stored}`);
      if (metadata.isDirectory()) await visit(absolute, stored);
      else if (metadata.isFile()) { const bytes = await readFile(absolute); entries.push({ path: stored, sha256: receiptSha256(bytes), size: bytes.length }); }
      else throw new TypeError(`certificate artifact contains a non-file entry: ${stored}`);
    }
  };
  await visit(path);
  return Buffer.from(canonicalJson(entries), "utf8");
}
async function artifactBytes(workspaceRoot, stored) {
  const input = await safeInput(workspaceRoot, stored, "certificate artifact");
  const metadata = await stat(input.absolute);
  return metadata.isDirectory() ? directoryManifest(input.absolute) : readFile(input.absolute);
}

export async function verifyProtectedPlanCertificate({ certificatePath, planPath, receiptPaths, expectedRepository,
  expectedSha, expectedRunId, expectedWorkflow = "Validate", expectedJob = "validation", expectedRunAttempt,
  workspaceRoot = process.cwd() }) {
  if (!certificatePath || !planPath || !Array.isArray(receiptPaths) || receiptPaths.length === 0) {
    throw new TypeError("protected release requires a plan, its certificate, and immutable receipts");
  }
  const certificateInput = await safeInput(workspaceRoot, certificatePath, "plan certificate");
  const planInput = await safeInput(workspaceRoot, planPath, "protected plan");
  if (!certificateInput.stored.startsWith("artifacts/tearbench/generated/") || !planInput.stored.startsWith("artifacts/tearbench/generated/")) {
    throw new TypeError("protected plan and certificate must remain in the generated TearBench artifact store");
  }
  const certificate = JSON.parse(await readFile(certificateInput.absolute, "utf8"));
  const plan = JSON.parse(await readFile(planInput.absolute, "utf8"));
  const receipts = await Promise.all(receiptPaths.map(async (path) => {
    const input = await safeInput(workspaceRoot, path, "task receipt");
    if (!input.stored.startsWith("artifacts/tearbench/missions/")) throw new TypeError("protected receipt is outside the immutable mission store");
    const receipt = JSON.parse(await readFile(input.absolute, "utf8"));
    if (input.stored !== receipt.immutablePath) throw new TypeError("protected receipt path does not match its immutable identity");
    return receipt;
  }));
  const errors = [];
  if (!certificateBindsPlan(certificate, plan)) errors.push("certificate does not bind the exact plan bytes and digest");
  if (certificate.status !== "certified" || certificate.errors?.length !== 0) errors.push("plan certificate is not certified without errors");
  if (!['protected-main', 'release'].includes(plan.profileId) || plan.authoritativeGateUnchanged !== true) errors.push("plan is not an eligible protected release plan");
  if (plan.source?.state !== "clean" || plan.source?.revision !== expectedSha) errors.push("plan source is not the exact clean release revision");
  if (certificate.source?.state !== "clean" || certificate.source?.revision !== expectedSha) errors.push("certificate source is not the exact clean release revision");
  const origin = certificate.protectedOrigin;
  if (origin?.kind !== "github-actions" || origin.repository !== expectedRepository || origin.workflow !== expectedWorkflow
    || origin.runId !== String(expectedRunId) || origin.job !== expectedJob
    || !Number.isSafeInteger(origin.attempt) || origin.attempt < 1
    || (expectedRunAttempt !== undefined && origin.attempt !== Number(expectedRunAttempt))) {
    errors.push("certificate protected GitHub origin is forged or mismatched");
  }
  for (const [label, coverage] of [["task", certificate.taskCoverage], ["claim", certificate.claimCoverage]]) {
    if (!Array.isArray(coverage?.missing) || coverage.missing.length !== 0
      || !Array.isArray(coverage?.extra) || coverage.extra.length !== 0) errors.push(`${label} coverage is incomplete or contains extras`);
  }
  if (!Array.isArray(certificate.receiptDigests) || certificate.receiptDigests.length === 0) errors.push("certificate has no immutable receipt digests");
  const bytes = {}, buildArtifactHashes = {};
  for (const receipt of receipts) for (const artifact of receipt.artifacts ?? []) {
    try { bytes[artifact.path] = await artifactBytes(workspaceRoot, artifact.path); }
    catch { /* Aggregate verification emits the exact missing/altered error. */ }
  }
  for (const receipt of receipts) for (const attestation of [
    ...(receipt.bindings?.build?.attestations ?? []), ...(receipt.bindings?.build?.produced ?? []),
  ]) {
    try {
      bytes[attestation.buildInfoPath] = await artifactBytes(workspaceRoot, attestation.buildInfoPath);
      buildArtifactHashes[attestation.path] = (await calculateArtifactHash(resolve(workspaceRoot, attestation.path))).hash;
    }
    catch { /* Aggregate verification emits the exact missing/altered build error. */ }
  }
  let derived;
  try {
    derived = createPlanCertificate({ plan, receipts, expectedOrigin: origin, artifactBytes: bytes,
      buildArtifactHashes, generatedAt: certificate.generatedAt });
    if (canonicalJson(derived) !== canonicalJson(certificate)) errors.push("certificate does not equal independently derived plan and receipt coverage");
  } catch (error) { errors.push(`certificate could not be independently derived: ${error instanceof Error ? error.message : String(error)}`); }
  if (errors.length > 0) throw new Error(`protected plan certificate rejected:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ repository: expectedRepository, sha: expectedSha, runId: String(expectedRunId),
    planDigest: plan.planDigest, certificateDigest: certificate.certificateDigest });
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const certificatePath = process.env.TEAR_RELEASE_PLAN_CERTIFICATE;
  const planPath = process.env.TEAR_RELEASE_PLAN;
  const receiptPaths = (process.env.TEAR_RELEASE_PLAN_RECEIPTS ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const result = await verifyProtectedPlanCertificate({ certificatePath, planPath, receiptPaths,
    expectedRepository: process.env.TEAR_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "shaku1z/tear",
    expectedSha: process.env.TEAR_RELEASE_SHA || process.env.GITHUB_SHA,
    expectedRunId: process.env.TEAR_RELEASE_VALIDATION_RUN_ID,
    expectedRunAttempt: process.env.TEAR_RELEASE_VALIDATION_RUN_ATTEMPT });
  console.log(`PASS protected plan certificate: ${result.repository}@${result.sha} plan=${result.planDigest}`);
}
