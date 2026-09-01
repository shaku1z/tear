import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  certificateBindsPlan, createPlanCertificate, createTaskAttemptReceipt, expectedTaskBindings, receiptSha256, taskAttemptPath,
} from "../scripts/tearbench-task-receipts.mjs";
import { PERFORMANCE_TASK_ID } from "../scripts/tearbench-performance-sample.mjs";
import { verifyProtectedPlanCertificate } from "../scripts/verify-plan-certificate.mjs";

const origin = Object.freeze({ kind: "github-actions", repository: "shaku1z/tear", workflow: "Validate",
  runId: "12345", job: "validation", attempt: 1 });
const source = Object.freeze({ repository: "shaku1z/tear", revision: "a".repeat(40), state: "clean",
  fingerprint: "b".repeat(64), worktreeFingerprint: "c".repeat(64) });
const planPayload = Object.freeze({
  format: "tearbench-shadow-plan", schemaVersion: 1, profileId: "release",
  authoritativeGateUnchanged: true, source,
  executionRequirements: { toolchain: { node: "24.1.0", pnpm: "11.15.0", playwright: "1.55.0" },
    environment: { os: "linux", arch: "x64", runner: "ubuntu-latest" } },
  scopeDigest: "2".repeat(64), taskRegistryDigest: "3".repeat(16), policyDigest: "4".repeat(64), plannerPolicyDigest: "5".repeat(64),
  requiredTaskIds: ["task.a", "task.b"], requiredClaims: ["claim.a", "claim.b", "obligation.a"],
  taskNodes: [
    { taskId: "task.a", taskDefinitionDigest: "6".repeat(16), claimIds: ["claim.a"], resourceClass: "unit", resourceKeys: [], dependencies: [],
      outputs: [{ outputId: "proof", path: "artifacts/tearbench/missions/mission/task.a/proof.json" }] },
    { taskId: "task.b", taskDefinitionDigest: "7".repeat(16), claimIds: ["claim.b"], resourceClass: "unit", resourceKeys: [], dependencies: [], outputs: [] },
  ],
  obligations: [{ obligationId: "obligation.a", kind: "matrix", backend: "live", observationClass: "source-owned", taskIds: ["task.a"] }],
  explanations: [
    { taskId: "task.a", unprovedWithout: ["claim.a", "obligation.a"] },
    { taskId: "task.b", unprovedWithout: ["claim.b"] },
  ],
  diagnostics: { unsupported: ["invariant:unsupported"] },
});
const plan = Object.freeze({ ...planPayload, planDigest: receiptSha256(planPayload) });
const performancePlanPayload = Object.freeze({
  ...planPayload,
  requiredTaskIds: [PERFORMANCE_TASK_ID],
  requiredClaims: ["claim.performance"],
  taskNodes: [{ taskId: PERFORMANCE_TASK_ID, taskDefinitionDigest: "8".repeat(16), claimIds: ["claim.performance"],
    resourceClass: "browser", resourceKeys: [], dependencies: [], outputs: [] }],
  obligations: [],
  explanations: [{ taskId: PERFORMANCE_TASK_ID, unprovedWithout: ["claim.performance"] }],
  diagnostics: { unsupported: [] },
});
const performancePlan = Object.freeze({ ...performancePlanPayload, planDigest: receiptSha256(performancePlanPayload) });
const bytes = Buffer.from("artifact evidence\n", "utf8");
const artifact = Object.freeze({ outputId: "proof", path: "artifacts/tearbench/missions/mission/task.a/proof.json", sha256: receiptSha256(bytes), size: bytes.length });

function input(taskId, overrides = {}) {
  const bindings = expectedTaskBindings(plan, taskId);
  return {
    missionId: "mission", plan, taskId, attemptNumber: 1, source, authority: "protected-ci", origin,
    build: { requirement: bindings.build, attestations: [], produced: [] }, toolchain: bindings.toolchain,
    environment: bindings.environment, evidence: bindings.evidence,
    status: "passed", exitCode: 0, startedAt: "2026-08-31T00:00:00.000Z", finishedAt: "2026-08-31T00:00:01.000Z",
    artifacts: taskId === "task.a" ? [artifact] : [], ...overrides,
  };
}
function receipt(taskId, overrides) { return createTaskAttemptReceipt(input(taskId, overrides)); }
function certify(receipts, overrides = {}) {
  return createPlanCertificate({ plan, receipts, expectedOrigin: origin, artifactBytes: { [artifact.path]: bytes },
    generatedAt: "2026-08-31T00:01:00.000Z", ...overrides });
}
function resign(value) {
  const copy = structuredClone(value); delete copy.receiptDigest;
  return { ...copy, receiptDigest: receiptSha256(copy) };
}

const contendedOutput = `${JSON.stringify({ scenario: "4x constrained gameplay", measurements: {
  frame: { p95Ms: 14.6 }, frameInterval: { p99Ms: 150 }, outsideFrameWork: { p99Ms: 140.9 }, newLongTasks: 0,
} })}\n`;
const contendedFailure = "AssertionError [ERR_ASSERTION]: 4x constrained gameplay frame-interval p99 ms: 150 exceeded budget 50\n";
function performanceReceipt(overrides = {}) {
  const bindings = expectedTaskBindings(performancePlan, PERFORMANCE_TASK_ID);
  return createTaskAttemptReceipt({ missionId: "performance", plan: performancePlan, taskId: PERFORMANCE_TASK_ID,
    attemptNumber: 1, source, authority: "protected-ci", origin,
    build: { requirement: bindings.build, attestations: [], produced: [] }, toolchain: bindings.toolchain,
    environment: bindings.environment, evidence: bindings.evidence, status: "passed", exitCode: 0,
    startedAt: "2026-08-31T00:00:00.000Z", finishedAt: "2026-08-31T00:00:01.000Z",
    artifacts: [], stdout: "", stderr: "", ...overrides });
}
function certifyPerformance(receipts) {
  return createPlanCertificate({ plan: performancePlan, receipts, expectedOrigin: origin,
    generatedAt: "2026-08-31T00:01:00.000Z" });
}

test("immutable task attempts and a plan-derived protected certificate are deterministic and complete", () => {
  const left = receipt("task.a"), right = receipt("task.b");
  assert.match(left.executionKey, /^[0-9a-f]{64}$/u);
  assert.equal(left.immutablePath, taskAttemptPath(left));
  assert.equal(left.task.taskDefinitionDigest, plan.taskNodes[0].taskDefinitionDigest);
  assert.deepEqual(left.task.claimIds, ["claim.a"]);
  assert.deepEqual(left.bindings.evidence.backends, ["live"]);
  const certificate = certify([left, right]);
  assert.equal(certificate.status, "certified");
  assert.deepEqual(certificate.taskCoverage.missing, []);
  assert.deepEqual(certificate.claimCoverage.passed, plan.requiredClaims);
  assert.deepEqual(certificate.unsupported, plan.diagnostics.unsupported);
  assert.equal(certificateBindsPlan(certificate, plan), true);
});

test("receipt production rejects dirty release authority and malformed result/path identities", () => {
  assert.throws(() => receipt("task.a", { source: { ...source, state: "dirty" } }), /clean source/u);
  assert.throws(() => receipt("task.a", { status: "passed", exitCode: 1 }), /inconsistent/u);
  assert.throws(() => taskAttemptPath({ missionId: "../bad", taskId: "task.a", attemptNumber: 1, executionKey: "a".repeat(64) }), /safe stable/u);
});

test("certificate rejects stale definition, plan, policy, scope, build, toolchain, environment, backend, observation, and matrix bindings", () => {
  const fields = [
    ["task", "taskDefinitionDigest", "f".repeat(16)], ["plan", "digest", "f".repeat(64)],
    ["plan", "policyDigest", "f".repeat(64)], ["plan", "scopeDigest", "f".repeat(64)],
    ["bindings", "build", { kind: "other" }], ["bindings", "toolchain", { node: "old" }],
    ["bindings", "environment", { runner: "other" }],
    ["bindings", "evidence", { scopeDigest: plan.scopeDigest, backend: "headless", observationClass: "invented", matrixCell: "fps:30" }],
  ];
  for (const [section, key, value] of fields) {
    const hostile = structuredClone(receipt("task.a")); hostile[section][key] = value;
    const certificate = certify([resign(hostile), receipt("task.b")]);
    assert.equal(certificate.status, "rejected", `${section}.${key}`);
  }
});

test("task claims cannot be relabeled to manufacture matrix or journey coverage", () => {
  const hostile = structuredClone(receipt("task.a")); hostile.task.claimIds = ["claim.a", "matrix:invented"];
  const certificate = certify([resign(hostile), receipt("task.b")]);
  assert.equal(certificate.status, "rejected");
  assert.ok(certificate.errors.some((error) => error.includes("relabeled")));
});

test("local and forged protected origins remain below release authority", () => {
  const local = receipt("task.a", { authority: "local-engineering", origin: { kind: "local" } });
  assert.equal(local.canonicalReleaseAuthority, false);
  assert.equal(certify([local, receipt("task.b")]).status, "rejected");
  const forged = structuredClone(receipt("task.a")); forged.origin.runId = "999";
  assert.equal(certify([resign(forged), receipt("task.b")]).status, "rejected");
  const siblingJob = receipt("task.a", { origin: { ...origin, job: "browser-2" } });
  assert.equal(certify([siblingJob, receipt("task.b")]).status, "certified");
  const siblingRun = receipt("task.a", { origin: { ...origin, job: "browser-2", attempt: 2 } });
  assert.equal(certify([siblingRun, receipt("task.b")]).status, "rejected");
});

test("failed and authorized passing attempts are retained as recovered-flaky; hidden or failed retries reject", () => {
  const failed = receipt("task.a", { status: "failed", exitCode: 1 });
  const recovered = receipt("task.a", { attemptNumber: 2, retryOf: failed.receiptDigest, retryAuthorization: "retry-policy-1" });
  const accepted = certify([failed, recovered, receipt("task.b")]);
  assert.equal(accepted.status, "certified");
  assert.equal(accepted.retryHistory.find((entry) => entry.taskId === "task.a").disposition, "recovered-flaky");
  const hidden = receipt("task.a", { attemptNumber: 2, retryOf: failed.receiptDigest });
  assert.equal(certify([failed, hidden, receipt("task.b")]).status, "rejected");
  const failedAgain = receipt("task.a", { attemptNumber: 2, retryOf: failed.receiptDigest, retryAuthorization: "retry-policy-1",
    status: "failed", exitCode: 2 });
  assert.equal(certify([failed, failedAgain, receipt("task.b")]).status, "rejected");
  assert.throws(() => receipt("task.a", { attemptNumber: 3 }), /initial run or one retry/u);
});

test("performance invalid-sample retries are receipt-proven, exact, bounded, and fail closed", () => {
  const failed = performanceReceipt({ status: "failed", exitCode: 1, stdout: contendedOutput, stderr: contendedFailure });
  assert.equal(failed.result.sampleValidity.classification, "infrastructure-invalid");
  const authorization = `bounded-canary-invalid-sample-retry:performance:${PERFORMANCE_TASK_ID}`;
  const recovered = performanceReceipt({ attemptNumber: 2, retryOf: failed.receiptDigest, retryAuthorization: authorization });
  const accepted = certifyPerformance([failed, recovered]);
  assert.equal(accepted.status, "certified", accepted.errors.join("\n"));
  assert.equal(accepted.retryHistory[0].attempts[0].sampleValidity.classification, "infrastructure-invalid");

  const wrongAuthorization = performanceReceipt({ attemptNumber: 2, retryOf: failed.receiptDigest,
    retryAuthorization: "bounded-canary-single-retry:performance:browser.test-browser-performance" });
  assert.equal(certifyPerformance([failed, wrongAuthorization]).status, "rejected");

  const productFailure = performanceReceipt({ status: "failed", exitCode: 1, stdout: contendedOutput,
    stderr: "AssertionError [ERR_ASSERTION]: 4x constrained gameplay did not exercise representative enemies\n" });
  assert.equal(productFailure.result.sampleValidity.classification, "product-or-unclassified-failure");
  const hiddenProductRetry = performanceReceipt({ attemptNumber: 2, retryOf: productFailure.receiptDigest,
    retryAuthorization: authorization });
  assert.equal(certifyPerformance([productFailure, hiddenProductRetry]).status, "rejected");

  const exhausted = performanceReceipt({ attemptNumber: 2, retryOf: failed.receiptDigest, retryAuthorization: authorization,
    status: "failed", exitCode: 1, stdout: contendedOutput, stderr: contendedFailure });
  assert.equal(certifyPerformance([failed, exhausted]).status, "rejected");
});

test("performance sample classification is immutable and independently recomputed", () => {
  const passed = performanceReceipt();
  const missing = structuredClone(passed); delete missing.result.sampleValidity;
  const missingCertificate = certifyPerformance([resign(missing)]);
  assert.equal(missingCertificate.status, "rejected");
  assert.ok(missingCertificate.errors.some((error) => error.includes("classification is missing or malformed")));

  const tampered = structuredClone(passed);
  tampered.result.sampleValidity = { classification: "infrastructure-invalid", policy: {}, evidence: [] };
  const tamperedCertificate = certifyPerformance([resign(tampered)]);
  assert.equal(tamperedCertificate.status, "rejected");
  assert.ok(tamperedCertificate.errors.some((error) => error.includes("classification is missing or malformed")));
});

test("missing, extra, duplicate, and altered-artifact receipts fail closed", () => {
  const first = receipt("task.a"), second = receipt("task.b");
  assert.equal(certify([first]).status, "rejected");
  assert.equal(certify([first, first, second]).status, "rejected");
  const extra = structuredClone(second); extra.task.taskId = "task.extra";
  assert.equal(certify([first, resign(extra), second]).status, "rejected");
  assert.equal(certify([first, second], { artifactBytes: { [artifact.path]: Buffer.from("altered") } }).status, "rejected");
});

test("certificate digest binds exact plan and rejects certificate or plan mutation", () => {
  const certificate = certify([receipt("task.a"), receipt("task.b")]);
  assert.equal(certificateBindsPlan({ ...certificate, status: "rejected" }, plan), false);
  assert.equal(certificateBindsPlan(certificate, { ...plan, planDigest: "f".repeat(64) }), false);
});

test("build receipts bind canonical build-info paths and independently recomputed artifact hashes", () => {
  const buildPath = "artifacts/tearbench/generated/build", buildInfoPath = `${buildPath}/build-info.json`;
  const buildPlanPayload = { ...planPayload, requiredTaskIds: ["build", "consumer"], requiredClaims: ["claim.build", "claim.consumer"],
    taskNodes: [
      { taskId: "build", taskDefinitionDigest: "8".repeat(16), claimIds: ["claim.build"], resourceClass: "build", resourceKeys: [], dependencies: [],
        build: { target: "standalone", mode: "test-standalone" },
        outputs: [{ outputId: "build-artifact", path: buildPath }] },
      { taskId: "consumer", taskDefinitionDigest: "9".repeat(16), claimIds: ["claim.consumer"], resourceClass: "browser", resourceKeys: [],
        dependencies: [{ taskId: "build", outputId: "build-artifact" }], outputs: [] },
    ], obligations: [], explanations: [
      { taskId: "build", unprovedWithout: ["claim.build"] }, { taskId: "consumer", unprovedWithout: ["claim.consumer"] },
    ], diagnostics: { unsupported: [] } };
  const buildPlan = { ...buildPlanPayload, planDigest: receiptSha256(buildPlanPayload) };
  const info = Buffer.from(JSON.stringify({ format: "tear-build-info", schemaVersion: 1, sourceRevision: source.revision,
    sourceFingerprint: source.fingerprint, target: "standalone", mode: "test-standalone", artifactHash: "d".repeat(64),
    toolchain: { digest: "1".repeat(64) }, configuration: { digest: "2".repeat(64) }, buildIdentityDigest: "3".repeat(64),
    contentAddressedPath: `artifacts/tearbench/builds/${"3".repeat(64)}/payload` }), "utf8");
  const recordPath = "artifacts/tearbench/generated/builds/test-standalone.json";
  const recordUnsigned = { format: "tear-build-artifact-record", schemaVersion: 1, buildIdentityDigest: "3".repeat(64),
    artifactHash: "d".repeat(64), contentAddressedPath: `artifacts/tearbench/builds/${"3".repeat(64)}/payload` };
  const record = { ...recordUnsigned, recordDigest: receiptSha256(recordUnsigned) };
  const recordBytes = Buffer.from(JSON.stringify(record), "utf8");
  const attestation = { taskId: "build", outputId: "build-artifact", path: buildPath, buildInfoPath,
    buildInfoSha256: receiptSha256(info), artifactHash: "d".repeat(64), sourceRevision: source.revision,
    sourceFingerprint: source.fingerprint, target: "standalone", mode: "test-standalone",
    toolchainDigest: "1".repeat(64), configurationDigest: "2".repeat(64), buildIdentityDigest: "3".repeat(64),
    contentAddressedPath: `artifacts/tearbench/builds/${"3".repeat(64)}/payload`,
    recordPath, recordDigest: record.recordDigest };
  const make = (taskId, build, artifacts = []) => {
    const bindings = expectedTaskBindings(buildPlan, taskId);
    return createTaskAttemptReceipt({ missionId: "build-mission", plan: buildPlan, taskId, attemptNumber: 1,
      source, authority: "protected-ci", origin, build: { requirement: bindings.build, ...build },
      toolchain: bindings.toolchain, environment: bindings.environment, evidence: bindings.evidence,
      status: "passed", exitCode: 0, startedAt: "2026-08-31T00:00:00.000Z", finishedAt: "2026-08-31T00:00:01.000Z", artifacts });
  };
  const buildArtifactBytes = Buffer.from("x");
  const buildArtifact = { outputId: "build-artifact", path: buildPath, sha256: receiptSha256(buildArtifactBytes), size: buildArtifactBytes.length };
  const producer = make("build", { attestations: [], produced: [attestation] }, [buildArtifact]);
  const consumer = make("consumer", { attestations: [attestation], produced: [] });
  const certificateInput = { plan: buildPlan, receipts: [producer, consumer], expectedOrigin: origin,
    artifactBytes: { [buildPath]: buildArtifactBytes, [buildInfoPath]: info, [recordPath]: recordBytes },
    buildArtifactHashes: { [buildPath]: "d".repeat(64), [attestation.contentAddressedPath]: "d".repeat(64) },
    generatedAt: "2026-08-31T00:01:00.000Z" };
  const buildCertificate = createPlanCertificate(certificateInput);
  assert.equal(buildCertificate.status, "certified", buildCertificate.errors.join("\n"));
  assert.equal(createPlanCertificate({ ...certificateInput, buildArtifactHashes: { [buildPath]: "f".repeat(64) } }).status, "rejected");
  assert.throws(() => make("consumer", { attestations: [{ ...attestation, buildInfoPath: "other/build-info.json" }], produced: [] }), /stale or malformed/u);
});

test("production consumer requires the exact certified plan, source, coverage, and protected run origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "tear-plan-certificate-"));
  try {
    const receipts = [receipt("task.a"), receipt("task.b")];
    const certificate = certify(receipts);
    const planPath = join(root, "artifacts/tearbench/generated/plan.json"), certificatePath = join(root, "artifacts/tearbench/generated/certificate.json");
    await mkdir(join(root, "artifacts/tearbench/generated"), { recursive: true });
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    await writeFile(certificatePath, JSON.stringify(certificate), "utf8");
    const receiptPaths = [];
    for (const entry of receipts) {
      const path = join(root, entry.immutablePath); receiptPaths.push(path); await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, JSON.stringify(entry), "utf8");
    }
    const artifactPath = join(root, artifact.path); await mkdir(join(artifactPath, ".."), { recursive: true }); await writeFile(artifactPath, bytes);
    const common = { certificatePath, planPath, receiptPaths, workspaceRoot: root, expectedRepository: "shaku1z/tear",
      expectedSha: source.revision, expectedRunId: origin.runId, expectedRunAttempt: origin.attempt };
    const verified = await verifyProtectedPlanCertificate(common);
    assert.equal(verified.planDigest, plan.planDigest);
    await assert.rejects(verifyProtectedPlanCertificate({ ...common, expectedRunId: "999" }), /origin is forged or mismatched/u);
    await assert.rejects(verifyProtectedPlanCertificate({ ...common, certificatePath: undefined }), /requires a plan/u);
    const rejectedPath = join(root, "artifacts/tearbench/generated/rejected.json");
    await writeFile(rejectedPath, JSON.stringify({ ...certificate, status: "rejected" }), "utf8");
    await assert.rejects(verifyProtectedPlanCertificate({ ...common, certificatePath: rejectedPath }), /does not bind|not certified/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
