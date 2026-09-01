import assert from "node:assert/strict";
import test from "node:test";
import { createCanaryShardPlan } from "../scripts/tearbench-canary-plan.mjs";
import { createCanaryParityReport } from "../scripts/tearbench-canary-report.mjs";
import { receiptSha256 } from "../scripts/tearbench-task-receipts.mjs";

function fixture() {
  const taskNodes = [
    { taskId: "build.one", resourceClass: "build", dependencies: [], timeoutMs: 10 },
    { taskId: "browser.a", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.b", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.c", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.d", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "unit.a", resourceClass: "unit", dependencies: [], timeoutMs: 10 },
    { taskId: "headless.a", resourceClass: "headless", dependencies: [], timeoutMs: 10 },
  ];
  const payload = { format: "tearbench-shadow-plan", schemaVersion: 1, profileId: "release", source: { revision: "a".repeat(40) },
    requiredTaskIds: taskNodes.map((task) => task.taskId), taskNodes };
  return { ...payload, planDigest: receiptSha256(payload) };
}
const history = { schemaVersion: 1, statistic: "p95", minimumSamples: 5, source: "test",
  fallbackMs: { build: 10, browser: 20, unit: 5, headless: 7 }, tasks: { "browser.a": { samples: 5, p95Ms: 100 } } };

test("canary packing is deterministic, bounded, dependency ordered, and exact", () => {
  const plan = fixture(), first = createCanaryShardPlan({ plan, durationHistory: history, browserShardCount: 4, coreShardCount: 2 });
  const second = createCanaryShardPlan({ plan, durationHistory: history, browserShardCount: 4, coreShardCount: 2 });
  assert.deepEqual(first, second);
  assert.equal(first.constraints.failFast, false);
  assert.equal(first.constraints.nativePlaywrightSharding, false);
  assert.equal(first.browserShards.length, 4);
  assert.equal(first.parity.status, "exact");
  assert.deepEqual(first.serialShard.taskIds, ["build.one", "browser.a", "browser.b", "browser.c", "browser.d", "headless.a", "unit.a"]);
  assert.deepEqual(new Set([first.buildShard, ...first.browserShards, ...first.coreShards].flatMap((shard) => shard.taskIds)),
    new Set(plan.requiredTaskIds));
  assert.equal(first.browserShards.find((shard) => shard.taskIds.includes("browser.a")).estimatedMs, 100);
});

test("canary parity proves exact equivalence and a planted aggregate rejection", () => {
  const plan = { planDigest: "a".repeat(64), requiredTaskIds: ["task.a", "task.b"],
    source: { revision: "b".repeat(40), state: "clean", fingerprint: "f".repeat(64) } };
  const shardPlan = { shardPlanDigest: "c".repeat(64),
    buildShard: { shardId: "build-1", taskIds: ["task.b"] }, browserShards: [{ shardId: "browser-1", taskIds: ["task.a"] }],
    coreShards: [], serialShard: { shardId: "serial-1", taskIds: ["task.a", "task.b"] } };
  const produced = Array.from({ length: 4 }, (_, index) => ({ taskId: `build.${String(index)}`, outputId: "build-artifact",
    recordDigest: String(index + 1).repeat(64), buildIdentityDigest: String(index + 5).repeat(64) }));
  const origin = { kind: "github-actions", repository: "shaku1z/tear", workflow: "Canary", runId: "123", job: "job", attempt: 1 };
  const makeReceipt = (taskId, missionId, status = "passed", build = {}, attempt = {}) => ({ missionId, origin,
    attemptNumber: attempt.attemptNumber ?? 1, executionKey: attempt.executionKey ?? `${missionId}:${taskId}`,
    immutablePath: attempt.immutablePath ?? `${missionId}/${taskId}/${String(attempt.attemptNumber ?? 1)}.json`,
    retryOf: attempt.retryOf ?? null, retryAuthorization: attempt.retryAuthorization ?? null,
    receiptDigest: attempt.receiptDigest ?? `${missionId}:${taskId}:${String(attempt.attemptNumber ?? 1)}`,
    task: { taskId, claimIds: [`claim.${taskId}`] }, result: { status }, bindings: { build } });
  const timing = (shardId, missionId, taskIds, wall) => ({ shardId, missionId, queueMs: 10, workflowWaitMs: 30,
    setupMs: 20, jobWallMs: wall, taskWallMs: wall - 20, taskResults: taskIds.map((taskId) => ({ taskId, status: "passed" })),
    runCreatedAt: "2026-08-31T00:00:00.000Z", readyAt: "2026-08-31T00:00:00.020Z",
    finishedAt: `2026-08-31T00:00:${String(wall / 1000).padStart(2, "0")}.000Z` });
  const serial = [makeReceipt("task.a", "serial"), makeReceipt("task.b", "serial", "passed", { produced })];
  const parallel = [makeReceipt("task.a", "browser"), makeReceipt("task.b", "build", "passed", { produced })];
  const providerReceipts = produced.map((entry) => { const unsigned = { format: "tear-build-provider-receipt", schemaVersion: 1,
    provider: "github-actions", artifactId: "789",
    artifactDigest: "d".repeat(64), artifactUrl: "https://github.com/shaku1z/tear/actions/runs/123/artifacts/789",
    repository: "shaku1z/tear", runId: "123", buildIdentityDigest: entry.buildIdentityDigest, buildRecordDigest: entry.recordDigest };
    return { ...unsigned, receiptDigest: receiptSha256(unsigned) }; });
  const providerUnsigned = { format: "tear-build-provider-bundle", schemaVersion: 1, repository: "shaku1z/tear", runId: "123",
    artifactId: "789", artifactDigest: "d".repeat(64), artifactUrl: "https://github.com/shaku1z/tear/actions/runs/123/artifacts/789", receipts: providerReceipts };
  const providerBundle = { ...providerUnsigned, bundleDigest: receiptSha256(providerUnsigned) };
  const common = { plan, shardPlan, serialReceipts: serial, parallelReceipts: parallel,
    serialTimings: [timing("serial-1", "serial", ["task.a", "task.b"], 10000)],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), timing("browser-1", "browser", ["task.a"], 5000)],
    serialCertificate: { status: "certified", planDigest: plan.planDigest },
    parallelCertificate: { status: "certified", planDigest: plan.planDigest }, providerBundle,
    generatedAt: "2026-08-31T00:01:00.000Z" };
  assert.equal(createCanaryParityReport(common).status, "equivalent");
  const failedBrowserTiming = timing("browser-1", "browser", ["task.a"], 5000);
  failedBrowserTiming.taskResults[0].status = "failed";
  const planted = createCanaryParityReport({ ...common,
    parallelReceipts: [makeReceipt("task.a", "browser", "failed"), makeReceipt("task.b", "build", "passed", { produced })],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), failedBrowserTiming],
    parallelCertificate: { status: "rejected", planDigest: plan.planDigest }, plantedFailureTaskId: "task.a" });
  assert.equal(planted.status, "expected-rejection-proved");
  assert.equal(createCanaryParityReport({ ...common, parallelReceipts: [makeReceipt("task.a", "browser")],
    parallelCertificate: { status: "rejected", planDigest: plan.planDigest } }).status, "mismatched");
  const mixedOrigin = parallel.map((receipt, index) => index === 0
    ? { ...receipt, origin: { ...receipt.origin, workflow: "Sibling", attempt: 2 } } : receipt);
  assert.equal(createCanaryParityReport({ ...common, parallelReceipts: mixedOrigin }).status, "mismatched");

  const failed = makeReceipt("task.a", "browser", "failed");
  const recovered = makeReceipt("task.a", "browser", "passed", {}, { attemptNumber: 2,
    retryOf: failed.receiptDigest, retryAuthorization: "canary-retry" });
  const recoveredTiming = timing("browser-1", "browser", ["task.a"], 5000);
  recoveredTiming.taskResults[0] = { taskId: "task.a", status: "passed", receiptPath: recovered.immutablePath,
    attempts: [failed, recovered].map((receipt) => ({ attemptNumber: receipt.attemptNumber,
      status: receipt.result.status, receiptPath: receipt.immutablePath })) };
  const recoveredReport = createCanaryParityReport({ ...common,
    parallelReceipts: [failed, recovered, makeReceipt("task.b", "build", "passed", { produced })],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), recoveredTiming] });
  assert.equal(recoveredReport.status, "equivalent");
  assert.equal(recoveredReport.retryHistory.parallel.find((entry) => entry.taskId === "task.a").disposition, "recovered-flaky");
  const unauthorized = { ...recovered, retryAuthorization: null };
  assert.equal(createCanaryParityReport({ ...common,
    parallelReceipts: [failed, unauthorized, makeReceipt("task.b", "build", "passed", { produced })],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), recoveredTiming] }).status, "mismatched");
});

test("canary packing rejects altered plans, unsupported classes, and missing duration policy", () => {
  const altered = fixture(); altered.requiredTaskIds = altered.requiredTaskIds.slice(1);
  assert.throws(() => createCanaryShardPlan({ plan: altered, durationHistory: history }), /exact valid/u);
  const endurance = fixture(), payload = { ...endurance, taskNodes: [...endurance.taskNodes,
    { taskId: "endurance.a", resourceClass: "endurance", dependencies: [] }], requiredTaskIds: [...endurance.requiredTaskIds, "endurance.a"] };
  delete payload.planDigest; payload.planDigest = receiptSha256(payload);
  assert.throws(() => createCanaryShardPlan({ plan: payload, durationHistory: history }), /unsupported task classes/u);
  assert.throws(() => createCanaryShardPlan({ plan: fixture(), durationHistory: { ...history, fallbackMs: {} } }), /no valid estimate/u);
});
