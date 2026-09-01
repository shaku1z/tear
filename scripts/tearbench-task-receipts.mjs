import { createHash } from "node:crypto";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE_PROFILES = new Set(["pull-request", "protected-main", "release"]);

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("receipt data contains a non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => {
    if (value[key] === undefined) throw new TypeError(`receipt field ${key} is undefined`);
    return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
  }).join(",")}}`;
  throw new TypeError("receipt data is not canonical JSON");
}

export function receiptSha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");
}

function canonicalStrings(values) { return [...new Set(values)].sort(); }
function same(left, right) { return canonicalJson(left) === canonicalJson(right); }
function assertSafeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new TypeError(`${label} must be a safe stable ID`);
  return value;
}
function assertTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
  return value;
}
function planTask(plan, taskId) {
  const task = plan?.taskNodes?.find((entry) => entry.taskId === taskId);
  if (task === undefined || !plan.requiredTaskIds?.includes(taskId)) throw new RangeError(`plan does not require task ${taskId}`);
  return task;
}
export function expectedTaskBindings(plan, taskId) {
  const task = planTask(plan, taskId);
  const obligations = (plan.obligations ?? []).filter((entry) => entry.taskIds?.includes(taskId));
  const buildDependencies = (task.dependencies ?? []).filter((entry) => entry.outputId === "build-artifact").map((entry) => {
    const producer = planTask(plan, entry.taskId);
    const output = (producer.outputs ?? []).find((candidate) => candidate.outputId === entry.outputId);
    if (output === undefined) throw new TypeError(`plan task ${taskId} requires missing build output ${entry.taskId}:${String(entry.outputId)}`);
    if (producer.build === null || producer.build === undefined) throw new TypeError(`plan build producer ${producer.taskId} has no target/mode identity`);
    return { taskId: entry.taskId, outputId: entry.outputId, path: output.path,
      target: producer.build.target, mode: producer.build.mode };
  });
  const buildOutputs = (task.outputs ?? []).filter((entry) => entry.outputId === "build-artifact")
    .map((entry) => {
      if (task.build === null || task.build === undefined) throw new TypeError(`plan build producer ${taskId} has no target/mode identity`);
      return { taskId, outputId: entry.outputId, path: entry.path, target: task.build.target, mode: task.build.mode };
    });
  return Object.freeze({
    build: Object.freeze({ kind: task.resourceClass === "build" ? "produces-build-output"
      : buildDependencies.length > 0 ? "consumes-verified-build" : "not-applicable",
    sourceRevision: plan.source.revision, sourceFingerprint: plan.source.fingerprint,
    dependencies: buildDependencies, outputs: buildOutputs }),
    toolchain: Object.freeze({ ...(plan.executionRequirements?.toolchain ?? {}) }),
    environment: Object.freeze({ ...(plan.executionRequirements?.environment ?? {}), resourceClass: task.resourceClass,
      resourceKeys: [...(task.resourceKeys ?? [])].sort() }),
    evidence: Object.freeze({ scopeDigest: plan.scopeDigest,
      obligationIds: obligations.map((entry) => entry.obligationId).sort(),
      backends: [...new Set(obligations.map((entry) => entry.backend).filter(Boolean))].sort(),
      observationClasses: [...new Set(obligations.map((entry) => entry.observationClass).filter(Boolean))].sort(),
      matrixCells: [...new Set(obligations.filter((entry) => entry.kind === "matrix").map((entry) => entry.obligationId))].sort() }),
  });
}
function protectedOrigin(origin) {
  return origin?.kind === "github-actions"
    && origin.repository === "shaku1z/tear"
    && typeof origin.workflow === "string" && origin.workflow.length > 0
    && typeof origin.runId === "string" && /^[1-9][0-9]*$/u.test(origin.runId)
    && typeof origin.job === "string" && origin.job.length > 0
    && Number.isSafeInteger(origin.attempt) && origin.attempt > 0;
}
function sameProtectedRun(left, right) {
  return protectedOrigin(left) && protectedOrigin(right)
    && left.kind === right.kind && left.repository === right.repository && left.workflow === right.workflow
    && left.runId === right.runId && left.attempt === right.attempt;
}

export function taskAttemptPath(value) {
  const { missionId, attemptNumber, executionKey } = value;
  const taskId = value.taskId ?? value.task?.taskId;
  assertSafeId(missionId, "mission ID"); assertSafeId(taskId, "task ID");
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 2) throw new TypeError("attempt number must be the initial run or one retry");
  if (!SHA256.test(executionKey)) throw new TypeError("execution key must be SHA-256");
  return `artifacts/tearbench/missions/${missionId}/${taskId}/attempt-${String(attemptNumber).padStart(4, "0")}-${executionKey.slice(0, 12)}.json`;
}

export function createTaskAttemptReceipt(input) {
  const { plan } = input;
  const { planDigest, ...planPayload } = plan ?? {};
  if (plan?.format !== "tearbench-shadow-plan" || plan.schemaVersion !== 1 || !SHA256.test(planDigest)
    || receiptSha256(planPayload) !== planDigest) {
    throw new TypeError("task receipt requires one canonical VAP-3 plan");
  }
  const missionId = assertSafeId(input.missionId, "mission ID");
  const taskId = assertSafeId(input.taskId, "task ID");
  const task = planTask(plan, taskId);
  const attemptNumber = input.attemptNumber;
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 2) throw new TypeError("attempt number must be the initial run or one retry");
  if (RELEASE_PROFILES.has(plan.profileId) && input.source?.state !== "clean") {
    throw new TypeError("release-authority receipts require a clean source");
  }
  if (!same(input.source, plan.source)) throw new TypeError("receipt source does not match plan source");
  if (!['local-engineering', 'protected-ci'].includes(input.authority)) throw new TypeError("receipt authority is invalid");
  if (input.authority === "protected-ci" && !protectedOrigin(input.origin)) throw new TypeError("protected receipt origin is invalid");
  if (!input.build || !input.toolchain || !input.environment || !input.evidence) throw new TypeError("receipt identity bindings are incomplete");
  const expectedBindings = expectedTaskBindings(plan, taskId);
  if (!same(input.build?.requirement, expectedBindings.build) || !Array.isArray(input.build?.attestations)
    || !Array.isArray(input.build?.produced)) {
    throw new TypeError("receipt build binding does not match the plan");
  }
  if (input.build.attestations.length !== expectedBindings.build.dependencies.length) throw new TypeError("receipt build attestations are incomplete");
  for (const dependency of expectedBindings.build.dependencies) {
    const attestation = input.build.attestations.find((entry) => entry.taskId === dependency.taskId && entry.outputId === dependency.outputId);
    if (attestation?.path !== dependency.path || attestation.buildInfoPath !== `${dependency.path}/build-info.json`
      || !SHA256.test(attestation.buildInfoSha256)
      || !SHA256.test(attestation.artifactHash) || attestation.sourceRevision !== plan.source.revision
      || attestation.sourceFingerprint !== plan.source.fingerprint || attestation.target !== dependency.target
      || attestation.mode !== dependency.mode || !SHA256.test(attestation.toolchainDigest)
      || !SHA256.test(attestation.configurationDigest) || !SHA256.test(attestation.buildIdentityDigest)
      || !SHA256.test(attestation.recordDigest)
      || attestation.recordPath !== `artifacts/tearbench/generated/builds/${dependency.mode}.json`
      || attestation.contentAddressedPath !== `artifacts/tearbench/builds/${attestation.buildIdentityDigest}/payload`) {
      throw new TypeError("receipt build attestation is stale or malformed");
    }
  }
  if (input.build.produced.length > expectedBindings.build.outputs.length
    || (input.status === "passed" && input.build.produced.length !== expectedBindings.build.outputs.length)) {
    throw new TypeError("receipt produced build attestations are incomplete");
  }
  for (const output of expectedBindings.build.outputs) {
    const attestation = input.build.produced.find((entry) => entry.taskId === output.taskId && entry.outputId === output.outputId);
    if (attestation?.path !== output.path || attestation.buildInfoPath !== `${output.path}/build-info.json`
      || !SHA256.test(attestation.buildInfoSha256) || !SHA256.test(attestation.artifactHash)
      || attestation.sourceRevision !== plan.source.revision || attestation.sourceFingerprint !== plan.source.fingerprint
      || attestation.target !== output.target || attestation.mode !== output.mode || !SHA256.test(attestation.toolchainDigest)
      || !SHA256.test(attestation.configurationDigest) || !SHA256.test(attestation.buildIdentityDigest)
      || !SHA256.test(attestation.recordDigest)
      || attestation.recordPath !== `artifacts/tearbench/generated/builds/${output.mode}.json`
      || attestation.contentAddressedPath !== `artifacts/tearbench/builds/${attestation.buildIdentityDigest}/payload`) {
      throw new TypeError("receipt produced build attestation is stale or malformed");
    }
  }
  for (const field of ["toolchain", "environment", "evidence"]) {
    if (!same(input[field], expectedBindings[field])) throw new TypeError(`receipt ${field} binding does not match the plan`);
  }
  if (input.evidence.scopeDigest !== plan.scopeDigest) throw new TypeError("receipt scope does not match plan scope");
  const startedAt = assertTimestamp(input.startedAt, "receipt start");
  const finishedAt = assertTimestamp(input.finishedAt, "receipt finish");
  if (Date.parse(finishedAt) < Date.parse(startedAt)) throw new TypeError("receipt finish precedes its start");
  if (!['passed', 'failed'].includes(input.status) || !Number.isSafeInteger(input.exitCode)
    || (input.status === "passed") !== (input.exitCode === 0)) throw new TypeError("receipt result is inconsistent");
  const artifacts = (input.artifacts ?? []).map((artifact) => {
    if (typeof artifact?.path !== "string" || artifact.path.length === 0 || artifact.path.startsWith("/")
      || artifact.path.includes("..") || artifact.path.includes("\\")
      || !SHA256.test(artifact.sha256) || !Number.isSafeInteger(artifact.size) || artifact.size < 0) {
      throw new TypeError("receipt artifact binding is invalid");
    }
    const expectedOutput = (task.outputs ?? []).find((entry) => entry.outputId === artifact.outputId);
    if (expectedOutput === undefined || expectedOutput.path !== artifact.path) throw new TypeError("receipt artifact is not owned by the task output contract");
    return { outputId: artifact.outputId, path: artifact.path, sha256: artifact.sha256, size: artifact.size };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (input.status === "passed" && artifacts.length !== (task.outputs ?? []).length) throw new TypeError("passing receipt does not bind every declared task output");
  const identity = {
    missionId, planDigest: plan.planDigest, profileId: plan.profileId, source: input.source,
    taskId, taskDefinitionDigest: task.taskDefinitionDigest, taskRegistryDigest: plan.taskRegistryDigest,
    policyDigest: plan.policyDigest, plannerPolicyDigest: plan.plannerPolicyDigest, scopeDigest: plan.scopeDigest,
    buildDigest: receiptSha256(input.build), toolchainDigest: receiptSha256(input.toolchain),
    environmentDigest: receiptSha256(input.environment), evidenceDigest: receiptSha256(input.evidence),
  };
  const executionKey = receiptSha256(identity);
  const attemptId = `${missionId}:${taskId}:${String(attemptNumber)}`;
  const unsigned = {
    format: "tearbench-task-attempt-receipt", schemaVersion: 1, missionId, attemptId, attemptNumber,
    executionKey, immutablePath: taskAttemptPath({ missionId, taskId, attemptNumber, executionKey }),
    retryOf: input.retryOf ?? null, retryAuthorization: input.retryAuthorization ?? null,
    authority: input.authority, canonicalReleaseAuthority: input.authority === "protected-ci" && RELEASE_PROFILES.has(plan.profileId),
    origin: input.origin ?? { kind: "local" }, source: input.source,
    plan: { digest: plan.planDigest, profileId: plan.profileId, taskRegistryDigest: plan.taskRegistryDigest,
      policyDigest: plan.policyDigest, plannerPolicyDigest: plan.plannerPolicyDigest, scopeDigest: plan.scopeDigest },
    task: { taskId, taskDefinitionDigest: task.taskDefinitionDigest, claimIds: canonicalStrings(task.claimIds) },
    bindings: { build: input.build, toolchain: input.toolchain, environment: input.environment, evidence: input.evidence },
    result: { status: input.status, exitCode: input.exitCode, startedAt, finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt), stdout: input.stdout ?? "", stderr: input.stderr ?? "" },
    artifacts,
  };
  return Object.freeze({ ...unsigned, receiptDigest: receiptSha256(unsigned) });
}

function verifyBuildAttestation(attestation, expected, plan, artifactBytes, buildArtifactHashes, label, errors) {
  const buildInfoPath = `${expected.path}/build-info.json`, bytes = artifactBytes[buildInfoPath];
  if (attestation?.taskId !== expected.taskId || attestation?.outputId !== expected.outputId
    || attestation?.path !== expected.path || attestation?.buildInfoPath !== buildInfoPath
    || bytes === undefined || receiptSha256(bytes) !== attestation.buildInfoSha256) {
    errors.push(`${label} ${expected.taskId}:${String(expected.outputId)} is missing or altered`); return;
  }
  try {
    const info = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const expectedRecordPath = `artifacts/tearbench/generated/builds/${expected.mode}.json`;
    const recordBytes = artifactBytes[expectedRecordPath];
    const record = recordBytes === undefined ? undefined : JSON.parse(Buffer.from(recordBytes).toString("utf8"));
    const { recordDigest, ...recordUnsigned } = record ?? {};
    if (info.sourceRevision !== plan.source.revision || info.sourceFingerprint !== plan.source.fingerprint
      || info.artifactHash !== attestation.artifactHash || !SHA256.test(info.artifactHash)
      || info.target !== expected.target || info.mode !== expected.mode
      || info.toolchain?.digest !== attestation.toolchainDigest || info.configuration?.digest !== attestation.configurationDigest
      || info.buildIdentityDigest !== attestation.buildIdentityDigest || info.contentAddressedPath !== attestation.contentAddressedPath
      || attestation.recordPath !== expectedRecordPath || recordDigest !== attestation.recordDigest
      || receiptSha256(recordUnsigned) !== recordDigest || record?.buildIdentityDigest !== info.buildIdentityDigest
      || record?.artifactHash !== info.artifactHash || record?.contentAddressedPath !== info.contentAddressedPath
      || buildArtifactHashes[expected.path] !== info.artifactHash
      || buildArtifactHashes[info.contentAddressedPath] !== info.artifactHash) errors.push(`${label} is stale or its complete build identity is unverified`);
  } catch { errors.push(`${label} is not valid build-info JSON`); }
}

function verifyReceipt(receipt, plan, task, expectedOrigin, artifactBytes, buildArtifactHashes, errors) {
  const label = `receipt ${String(receipt?.attemptId ?? "<unknown>")}`;
  if (receipt?.format !== "tearbench-task-attempt-receipt" || receipt.schemaVersion !== 1) { errors.push(`${label} format is invalid`); return false; }
  const { receiptDigest, ...unsigned } = receipt;
  if (!SHA256.test(receiptDigest) || receiptSha256(unsigned) !== receiptDigest) errors.push(`${label} digest is invalid`);
  if (receipt.plan?.digest !== plan.planDigest || receipt.plan?.taskRegistryDigest !== plan.taskRegistryDigest
    || receipt.plan?.policyDigest !== plan.policyDigest || receipt.plan?.plannerPolicyDigest !== plan.plannerPolicyDigest
    || receipt.plan?.scopeDigest !== plan.scopeDigest || receipt.plan?.profileId !== plan.profileId) errors.push(`${label} plan/policy/scope binding is stale`);
  if (!same(receipt.source, plan.source)) errors.push(`${label} source binding is stale`);
  if (receipt.task?.taskId !== task.taskId || receipt.task?.taskDefinitionDigest !== task.taskDefinitionDigest) errors.push(`${label} task definition binding is stale`);
  if (!same(canonicalStrings(receipt.task?.claimIds ?? []), canonicalStrings(task.claimIds))) errors.push(`${label} task claims were relabeled`);
  if (receipt.bindings?.evidence?.scopeDigest !== plan.scopeDigest) errors.push(`${label} evidence scope is stale`);
  const expectedBindings = expectedTaskBindings(plan, task.taskId);
  if (receipt.bindings?.build?.requirement === undefined || !same(receipt.bindings.build.requirement, expectedBindings.build)
    || receipt.bindings?.build?.attestations?.length !== expectedBindings.build.dependencies.length
    || receipt.bindings?.build?.produced?.length !== expectedBindings.build.outputs.length) errors.push(`${label} build binding is stale or mismatched`);
  for (const dependency of expectedBindings.build.dependencies) {
    const attestation = receipt.bindings?.build?.attestations?.find((entry) => entry.taskId === dependency.taskId && entry.outputId === dependency.outputId);
    verifyBuildAttestation(attestation, dependency, plan, artifactBytes, buildArtifactHashes, `${label} build attestation`, errors);
  }
  for (const output of expectedBindings.build.outputs) {
    const attestation = receipt.bindings?.build?.produced?.find((entry) => entry.taskId === output.taskId && entry.outputId === output.outputId);
    verifyBuildAttestation(attestation, output, plan, artifactBytes, buildArtifactHashes, `${label} produced build attestation`, errors);
  }
  for (const field of ["toolchain", "environment", "evidence"]) {
    if (!same(receipt.bindings?.[field], expectedBindings[field])) errors.push(`${label} ${field} binding is stale or mismatched`);
  }
  const identity = {
    missionId: receipt.missionId, planDigest: plan.planDigest, profileId: plan.profileId, source: plan.source,
    taskId: task.taskId, taskDefinitionDigest: task.taskDefinitionDigest, taskRegistryDigest: plan.taskRegistryDigest,
    policyDigest: plan.policyDigest, plannerPolicyDigest: plan.plannerPolicyDigest, scopeDigest: plan.scopeDigest,
    buildDigest: receiptSha256(receipt.bindings?.build), toolchainDigest: receiptSha256(receipt.bindings?.toolchain),
    environmentDigest: receiptSha256(receipt.bindings?.environment), evidenceDigest: receiptSha256(receipt.bindings?.evidence),
  };
  if (receipt.executionKey !== receiptSha256(identity)) errors.push(`${label} execution key is invalid`);
  try {
    if (receipt.immutablePath !== taskAttemptPath({ ...receipt, taskId: receipt.task?.taskId })) errors.push(`${label} immutable path is invalid`);
  } catch { errors.push(`${label} immutable path is invalid`); }
  if (RELEASE_PROFILES.has(plan.profileId)) {
    if (receipt.source?.state !== "clean") errors.push(`${label} release source is dirty`);
    if (receipt.authority !== "protected-ci" || receipt.canonicalReleaseAuthority !== true) errors.push(`${label} is below protected release authority`);
    if (!sameProtectedRun(receipt.origin, expectedOrigin)) errors.push(`${label} protected origin is forged or mismatched`);
  }
  if (!['passed', 'failed'].includes(receipt.result?.status)
    || (receipt.result?.status === "passed") !== (receipt.result?.exitCode === 0)) errors.push(`${label} result is invalid`);
  for (const artifact of receipt.artifacts ?? []) {
    const output = (task.outputs ?? []).find((entry) => entry.outputId === artifact.outputId);
    if (output === undefined || output.path !== artifact.path) errors.push(`${label} artifact is not owned by task output ${String(artifact.outputId)}`);
    const bytes = artifactBytes[artifact.path];
    if (bytes === undefined || receiptSha256(bytes) !== artifact.sha256 || Buffer.byteLength(bytes) !== artifact.size) {
      errors.push(`${label} artifact ${String(artifact.path)} is missing or altered`);
    }
  }
  return true;
}

export function createPlanCertificate({ plan, receipts, expectedOrigin, artifactBytes = {}, buildArtifactHashes = {}, generatedAt }) {
  assertTimestamp(generatedAt, "certificate generation");
  const { planDigest, ...planPayload } = plan ?? {};
  if (plan?.format !== "tearbench-shadow-plan" || !SHA256.test(planDigest) || receiptSha256(planPayload) !== planDigest) {
    throw new TypeError("certificate requires a canonical self-bound plan");
  }
  const errors = [], byTask = new Map(), seenAttempts = new Set(), seenDigests = new Set();
  const extras = [], duplicates = [], retryHistory = [], passed = [];
  for (const receipt of receipts) {
    const taskId = receipt?.task?.taskId;
    const task = plan.taskNodes.find((entry) => entry.taskId === taskId);
    if (task === undefined || !plan.requiredTaskIds.includes(taskId)) { extras.push(String(taskId)); continue; }
    if (seenDigests.has(receipt.receiptDigest) || seenAttempts.has(receipt.attemptId)) duplicates.push(receipt.attemptId);
    seenDigests.add(receipt.receiptDigest); seenAttempts.add(receipt.attemptId);
    verifyReceipt(receipt, plan, task, expectedOrigin, artifactBytes, buildArtifactHashes, errors);
    const values = byTask.get(taskId) ?? []; values.push(receipt); byTask.set(taskId, values);
  }
  const missing = plan.requiredTaskIds.filter((id) => !byTask.has(id));
  for (const taskId of plan.requiredTaskIds) {
    const attempts = [...(byTask.get(taskId) ?? [])].sort((a, b) => a.attemptNumber - b.attemptNumber);
    if (attempts.length === 0) continue;
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index], previous = attempts[index - 1];
      if (attempt.attemptNumber !== index + 1 || (index === 0 ? attempt.retryOf !== null : attempt.retryOf !== previous.receiptDigest)) {
        errors.push(`task ${taskId} retry chain is incomplete or hidden`);
      }
    }
    const final = attempts.at(-1);
    if (attempts.length > 2) errors.push(`task ${taskId} exceeds the one-retry limit`);
    if (attempts.some((entry) => entry.executionKey !== attempts[0]?.executionKey)) errors.push(`task ${taskId} retry changed execution identity`);
    const failures = attempts.filter((entry) => entry.result?.status === "failed");
    const recovered = final?.result?.status === "passed" && failures.length > 0;
    if (final?.result?.status !== "passed") errors.push(`task ${taskId} has no passing terminal attempt`);
    if (recovered && (typeof final.retryAuthorization !== "string" || final.retryAuthorization.length === 0)) {
      errors.push(`task ${taskId} recovered through an unauthorized retry`);
    }
    if (final?.result?.status === "passed") passed.push(taskId);
    retryHistory.push({ taskId, disposition: recovered ? "recovered-flaky" : final?.result?.status === "passed" ? "passed-first-attempt" : "failed",
      attempts: attempts.map((entry) => ({ attemptId: entry.attemptId, receiptDigest: entry.receiptDigest,
        status: entry.result?.status, retryOf: entry.retryOf, retryAuthorization: entry.retryAuthorization })) });
  }
  if (missing.length > 0) errors.push(`required tasks are missing: ${missing.join(", ")}`);
  if (extras.length > 0) errors.push(`unexpected task receipts: ${canonicalStrings(extras).join(", ")}`);
  if (duplicates.length > 0) errors.push(`duplicate attempts: ${canonicalStrings(duplicates).join(", ")}`);
  const explanationByTask = new Map(plan.explanations.map((entry) => [entry.taskId, entry.unprovedWithout]));
  const coveredClaims = canonicalStrings(passed.flatMap((taskId) => explanationByTask.get(taskId) ?? []));
  const missingClaims = plan.requiredClaims.filter((claim) => !coveredClaims.includes(claim));
  const extraClaims = coveredClaims.filter((claim) => !plan.requiredClaims.includes(claim));
  if (missingClaims.length > 0) errors.push(`required claims are missing: ${missingClaims.join(", ")}`);
  if (extraClaims.length > 0) errors.push(`unexpected claims were derived: ${extraClaims.join(", ")}`);
  const artifactDigests = canonicalStrings(receipts.flatMap((receipt) => (receipt.artifacts ?? []).map((artifact) => artifact.sha256)));
  const unsigned = {
    format: "tearbench-plan-certificate", schemaVersion: 1, status: errors.length === 0 ? "certified" : "rejected",
    generatedAt, planDigest: plan.planDigest, source: plan.source, protectedOrigin: expectedOrigin ?? null,
    taskRegistryDigest: plan.taskRegistryDigest, policyDigest: plan.policyDigest, plannerPolicyDigest: plan.plannerPolicyDigest,
    receiptDigests: canonicalStrings(receipts.map((receipt) => receipt.receiptDigest).filter((digest) => SHA256.test(digest))),
    artifactDigests, taskCoverage: { required: [...plan.requiredTaskIds], passed: canonicalStrings(passed), missing,
      extra: canonicalStrings(extras), duplicateAttempts: canonicalStrings(duplicates) },
    claimCoverage: { required: [...plan.requiredClaims], passed: coveredClaims, missing: missingClaims, extra: extraClaims },
    unsupported: [...plan.diagnostics.unsupported], retryHistory, errors: canonicalStrings(errors),
  };
  return Object.freeze({ ...unsigned, certificateDigest: receiptSha256(unsigned) });
}

export function certificateBindsPlan(certificate, plan) {
  if (certificate?.format !== "tearbench-plan-certificate" || certificate.schemaVersion !== 1
    || certificate.planDigest !== plan?.planDigest || !SHA256.test(certificate.certificateDigest)) return false;
  const { certificateDigest, ...unsigned } = certificate;
  const { planDigest, ...planPayload } = plan;
  return receiptSha256(planPayload) === planDigest && receiptSha256(unsigned) === certificateDigest;
}
