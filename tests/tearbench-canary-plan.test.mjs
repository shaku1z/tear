import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";
import { createCanaryShardPlan } from "../scripts/tearbench-canary-plan.mjs";
import { createCanaryParityReport, createCanaryProviderMetrics } from "../scripts/tearbench-canary-report.mjs";
import { receiptSha256 } from "../scripts/tearbench-task-receipts.mjs";

function fixture() {
  const taskNodes = [
    { taskId: "build.one", resourceClass: "build", dependencies: [], timeoutMs: 10 },
    { taskId: "browser.a", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.b", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.c", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.d", resourceClass: "browser", dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
    { taskId: "browser.test-browser-performance", resourceClass: "browser",
      dependencies: [{ taskId: "build.one", outputId: "build-artifact" }], timeoutMs: 10 },
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
  assert.deepEqual(first.serialShard.taskIds, ["build.one", "browser.a", "browser.b", "browser.c", "browser.d",
    "browser.test-browser-performance", "headless.a", "unit.a"]);
  assert.deepEqual(first.performanceShard.taskIds, ["browser.test-browser-performance"]);
  assert.ok(first.browserShards.every((shard) => !shard.taskIds.includes("browser.test-browser-performance")));
  assert.deepEqual(new Set([first.buildShard, ...first.browserShards, ...first.coreShards, first.performanceShard].flatMap((shard) => shard.taskIds)),
    new Set(plan.requiredTaskIds));
  assert.equal(first.browserShards.find((shard) => shard.taskIds.includes("browser.a")).estimatedMs, 100);
});

test("canary parity proves exact equivalence and a planted aggregate rejection", () => {
  const performanceTaskId = "browser.test-browser-performance";
  const plan = { planDigest: "a".repeat(64), requiredTaskIds: ["task.a", "task.b", performanceTaskId],
    source: { revision: "b".repeat(40), state: "clean", fingerprint: "f".repeat(64) } };
  const shardPlan = { shardPlanDigest: "c".repeat(64),
    buildShard: { shardId: "build-1", taskIds: ["task.b"] }, browserShards: [{ shardId: "browser-1", taskIds: ["task.a"] }],
    coreShards: [], performanceShard: { shardId: "performance-1", taskIds: [performanceTaskId] },
    serialShard: { shardId: "serial-1", taskIds: ["task.a", "task.b", performanceTaskId] } };
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
  const serial = [makeReceipt("task.a", "serial"), makeReceipt("task.b", "serial", "passed", { produced }),
    makeReceipt(performanceTaskId, "serial")];
  const parallel = [makeReceipt("task.a", "browser"), makeReceipt("task.b", "build", "passed", { produced }),
    makeReceipt(performanceTaskId, "performance")];
  const providerReceipts = produced.map((entry) => { const unsigned = { format: "tear-build-provider-receipt", schemaVersion: 1,
    provider: "github-actions", artifactId: "789",
    artifactDigest: "d".repeat(64), artifactUrl: "https://github.com/shaku1z/tear/actions/runs/123/artifacts/789",
    repository: "shaku1z/tear", runId: "123", buildIdentityDigest: entry.buildIdentityDigest, buildRecordDigest: entry.recordDigest };
    return { ...unsigned, receiptDigest: receiptSha256(unsigned) }; });
  const providerUnsigned = { format: "tear-build-provider-bundle", schemaVersion: 1, repository: "shaku1z/tear", runId: "123",
    artifactId: "789", artifactDigest: "d".repeat(64), artifactUrl: "https://github.com/shaku1z/tear/actions/runs/123/artifacts/789", receipts: providerReceipts };
  const providerBundle = { ...providerUnsigned, bundleDigest: receiptSha256(providerUnsigned) };
  const common = { plan, shardPlan, serialReceipts: serial, parallelReceipts: parallel,
    serialTimings: [{ ...timing("serial-1", "serial", ["task.a", "task.b", performanceTaskId], 10000),
      runCreatedAt: "2026-08-31T00:00:06.000Z", readyAt: "2026-08-31T00:00:06.000Z",
      finishedAt: "2026-08-31T00:00:16.000Z" }],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), timing("browser-1", "browser", ["task.a"], 5000),
      timing("performance-1", "performance", [performanceTaskId], 3000)],
    serialCertificate: { status: "certified", planDigest: plan.planDigest },
    parallelCertificate: { status: "certified", planDigest: plan.planDigest }, providerBundle,
    generatedAt: "2026-08-31T00:01:00.000Z" };
  assert.equal(createCanaryParityReport(common).status, "equivalent");
  assert.deepEqual(createCanaryParityReport(common).providerOrigin,
    { kind: "github-actions", repository: "shaku1z/tear", workflow: "Canary", runId: "123", attempt: 1 });
  const foreignSerial = serial.map((receipt) => ({ ...receipt, origin: { ...receipt.origin, attempt: 2 } }));
  assert.equal(createCanaryParityReport({ ...common, serialReceipts: foreignSerial }).status, "mismatched");
  const metrics = createCanaryParityReport(common).metrics;
  assert.equal(metrics.parallel.queueMs, undefined);
  assert.equal(metrics.parallel.runnerMinutes, undefined);
  assert.equal(metrics.parallel.readinessWaitMs, 10);
  assert.equal(metrics.parallel.taskStageRunnerMinutes, 0.2);
  for (const invalid of [
    { runCreatedAt: "2026-08-31T00:00:00.000Z" },
    { runCreatedAt: "invalid", readyAt: "invalid" },
    { runCreatedAt: "2026-08-31T00:00:02.000Z", readyAt: "2026-08-31T00:00:02.000Z" },
    { finishedAt: "2026-08-31T00:00:05.000Z" },
  ]) {
    const report = createCanaryParityReport({ ...common,
      serialTimings: [{ ...common.serialTimings[0], ...invalid }] });
    assert.equal(report.status, "mismatched");
    assert.equal(report.metrics.wallTimeReductionRatio, null);
    assert.ok(report.errors.includes("serial comparison clock includes prior work or has invalid boundaries"));
  }
  assert.deepEqual(createCanaryParityReport(common).metrics.isolatedPerformance,
    { buildReadyToJobStartMs: 10, setupMs: 20, taskWallMs: 2980, jobWallMs: 3000 });
  const failedBrowserTiming = timing("browser-1", "browser", ["task.a"], 5000);
  failedBrowserTiming.taskResults[0].status = "failed";
  const planted = createCanaryParityReport({ ...common,
    parallelReceipts: [makeReceipt("task.a", "browser", "failed"), makeReceipt("task.b", "build", "passed", { produced }),
      makeReceipt(performanceTaskId, "performance")],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), failedBrowserTiming,
      timing("performance-1", "performance", [performanceTaskId], 3000)],
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
    parallelReceipts: [failed, recovered, makeReceipt("task.b", "build", "passed", { produced }),
      makeReceipt(performanceTaskId, "performance")],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), recoveredTiming,
      timing("performance-1", "performance", [performanceTaskId], 3000)] });
  assert.equal(recoveredReport.status, "equivalent");
  assert.equal(recoveredReport.retryHistory.parallel.find((entry) => entry.taskId === "task.a").disposition, "recovered-flaky");
  const unauthorized = { ...recovered, retryAuthorization: null };
  assert.equal(createCanaryParityReport({ ...common,
    parallelReceipts: [failed, unauthorized, makeReceipt("task.b", "build", "passed", { produced }),
      makeReceipt(performanceTaskId, "performance")],
    parallelTimings: [timing("build-1", "build", ["task.b"], 4000), recoveredTiming,
      timing("performance-1", "performance", [performanceTaskId], 3000)] }).status, "mismatched");
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

test("canonical live TearBench tasks pack only onto browser shards after the shared build", async () => {
  const registry = JSON.parse(await readFile(new URL("../src/tearbench/task-registry.json", import.meta.url), "utf8"));
  const liveTasks = registry.tasks.filter((task) => task.runner.kind === "tearbench" && task.runner.args[0] === "run");
  assert.ok(liveTasks.length > 0);
  const taskNodes = registry.tasks.filter((task) => liveTasks.includes(task)
    || task.taskId === "build.test-standalone" || task.taskId === "browser.test-browser-performance");
  const payload = { format: "tearbench-shadow-plan", schemaVersion: 1, profileId: "release",
    source: { revision: "a".repeat(40) }, requiredTaskIds: taskNodes.map((task) => task.taskId), taskNodes };
  const plan = { ...payload, planDigest: receiptSha256(payload) };
  const packed = createCanaryShardPlan({ plan, durationHistory: history, browserShardCount: 4, coreShardCount: 2 });
  const browserIds = packed.browserShards.flatMap((shard) => shard.taskIds);
  const coreIds = packed.coreShards.flatMap((shard) => shard.taskIds);
  for (const task of liveTasks) {
    assert.equal(browserIds.filter((id) => id === task.taskId).length, 1, task.taskId);
    assert.ok(!coreIds.includes(task.taskId), task.taskId);
    assert.ok(packed.serialShard.taskIds.indexOf("build.test-standalone") < packed.serialShard.taskIds.indexOf(task.taskId));
    assert.deepEqual(task.dependencies, [{ taskId: "build.test-standalone", outputId: "build-artifact" }]);
  }
});

function providerFixture() {
  const time = (seconds) => new Date(Date.parse("2026-09-07T00:00:00Z") + seconds * 1000).toISOString();
  const shardPayload = { format: "tearbench-canary-shard-plan", schemaVersion: 1,
    planDigest: "a".repeat(64), browserShards: [{ shardId: "browser-1" }], coreShards: [{ shardId: "core-1" }] };
  const shardPlan = { ...shardPayload, shardPlanDigest: receiptSha256(shardPayload) };
  const reportPayload = { format: "tearbench-canary-parity-report", schemaVersion: 2, status: "mismatched", errors: ["performance failed"],
    providerOrigin: { kind: "github-actions", repository: "shaku1z/tear", workflow: "TearBench Parallel Canary", runId: "123", attempt: 1 },
    source: { revision: "b".repeat(40) }, planDigest: shardPlan.planDigest, shardPlanDigest: shardPlan.shardPlanDigest };
  const parityReport = { ...reportPayload, reportDigest: receiptSha256(reportPayload) };
  const run = { id: 123, run_attempt: 1, name: "TearBench Parallel Canary", repository: { full_name: "shaku1z/tear" }, path: ".github/workflows/tearbench-canary.yml",
    head_sha: parityReport.source.revision, event: "workflow_dispatch", status: "completed", conclusion: "failure",
    created_at: time(0), updated_at: time(180) };
  const entries = [["plan", 1, 5], ["build", 6, 15], ["browser (browser-1)", 16, 60], ["core (core-1)", 16, 80],
    ["performance", 83, 100], ["certify-parallel", 101, 105], ["serial", 101, 170], ["certify-serial", 171, 175], ["aggregate", 176, 180]];
  const jobs = { total_count: entries.length, jobs: entries.map(([name, start, end], index) => ({ id: index + 1, name,
    run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, status: "completed",
    conclusion: name === "performance" ? "failure" : "success", started_at: time(start), completed_at: time(end) })) };
  return { run, jobs, parityReport, shardPlan, generatedAt: time(181) };
}

test("provider clocks distinguish dependency wait, complete job cost and rejected decisions", () => {
  const input = providerFixture(), report = createCanaryProviderMetrics(input);
  const performance = report.jobs.find((job) => job.name === "performance");
  assert.equal(performance.dependencyReadyElapsedMs, 80000);
  assert.equal(performance.dispatchWaitMs, 3000);
  assert.equal(report.parallelDecisionWallMs, 105000);
  assert.equal(report.serialDecisionWallMs, 75000);
  assert.equal(report.parallelJobWallMs, 142000);
  assert.equal(report.serialJobWallMs, 73000);
  assert.equal(report.experimentJobWallMs, 219000);
  assert.equal(report.equivalenceReported, false);
  assert.equal(report.canonicalReleaseAuthority, false);
  assert.equal(report.providerJobsDigest, receiptSha256(input.jobs));
  assert.deepEqual(createCanaryProviderMetrics(input), report);
});

test("provider measurement rejects mixed sources, attempts, omissions, overlap and mutable reports", () => {
  const mutations = [
    (input) => { input.run.status = "in_progress"; },
    (input) => { input.run.conclusion = "success"; },
    (input) => { input.run.head_sha = "c".repeat(40); },
    (input) => { input.run.repository.full_name = "another/tear"; },
    (input) => { input.run.path = ".github/workflows/ci.yml"; },
    (input) => { input.jobs.jobs[0].run_attempt = 2; },
    (input) => { input.jobs.jobs[0].run_id = 456; },
    (input) => { input.jobs.jobs[0].head_sha = "c".repeat(40); },
    (input) => { input.jobs.jobs[0].completed_at = "invalid"; },
    (input) => { input.jobs.jobs[1].started_at = input.run.created_at; },
    (input) => { input.jobs.jobs[1].id = input.jobs.jobs[0].id; },
    (input) => { input.jobs.jobs[1].name = "unexpected"; },
    (input) => { input.jobs.jobs[1].name = input.jobs.jobs[0].name; },
    (input) => { input.jobs.jobs[1].conclusion = "cancelled"; },
    (input) => { input.jobs.jobs.pop(); },
    (input) => { input.jobs.jobs.pop(); input.jobs.total_count--; },
    (input) => { input.parityReport.status = "equivalent"; },
    (input) => { input.shardPlan.browserShards.pop(); },
    (input) => { input.generatedAt = "invalid"; },
    (input) => { input.generatedAt = input.run.created_at; },
  ];
  for (const mutate of mutations) {
    const input = providerFixture(); mutate(input);
    assert.throws(() => createCanaryProviderMetrics(input), /canary provider metrics:/u);
  }
});

test("provider equivalence requires the same receipt-origin run and attempt, including across legacy reports", () => {
  const input = providerFixture();
  const resign = (value, key) => { const { [key]: ignored, ...payload } = value; assert.ok(ignored); value[key] = receiptSha256(payload); };
  input.run.conclusion = "success";
  for (const job of input.jobs.jobs) job.conclusion = "success";
  input.parityReport.status = "equivalent"; input.parityReport.errors = [];
  resign(input.parityReport, "reportDigest");
  assert.equal(createCanaryProviderMetrics(input).equivalenceReported, true);
  for (const field of ["run_attempt", "id"]) {
    const crossAttempt = globalThis.structuredClone(input);
    crossAttempt.run[field] += 1;
    for (const job of crossAttempt.jobs.jobs) job[field === "id" ? "run_id" : "run_attempt"] = crossAttempt.run[field];
    assert.throws(() => createCanaryProviderMetrics(crossAttempt), /provider run\/attempt mismatch/u);
  }
  const legacy = globalThis.structuredClone(input);
  legacy.parityReport.schemaVersion = 1; delete legacy.parityReport.providerOrigin;
  resign(legacy.parityReport, "reportDigest");
  const diagnostic = createCanaryProviderMetrics(legacy);
  assert.equal(diagnostic.parityOriginBound, false);
  assert.equal(diagnostic.equivalenceReported, false);
  const missing = globalThis.structuredClone(input); delete missing.parityReport.providerOrigin;
  resign(missing.parityReport, "reportDigest");
  assert.throws(() => createCanaryProviderMetrics(missing), /provider run\/attempt mismatch/u);
  for (const shard of [null, { shardId: "foreign-1" }, { shardId: "browser-1" }]) {
    const duplicate = globalThis.structuredClone(input); duplicate.shardPlan.browserShards.push(shard);
    resign(duplicate.shardPlan, "shardPlanDigest");
    duplicate.parityReport.shardPlanDigest = duplicate.shardPlan.shardPlanDigest;
    resign(duplicate.parityReport, "reportDigest");
    assert.throws(() => createCanaryProviderMetrics(duplicate), /shard identity/u);
  }
});

test("provider metrics CLI retains a failed-run measurement without overwriting evidence", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-provider-metrics-"));
  try {
    const input = providerFixture(), args = ["scripts/tearbench-canary-report.mjs", "provider-metrics"];
    for (const [flag, value] of [["--run", input.run], ["--jobs", input.jobs], ["--report", input.parityReport], ["--shard-plan", input.shardPlan]]) {
      const path = resolve(directory, `${flag.slice(2)}.json`);
      await writeFile(path, JSON.stringify(value)); args.push(flag, path);
    }
    const output = resolve(directory, "measurement.json"); args.push("--artifact", output);
    const run = () => spawnSync(process.execPath, args, { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 10000 });
    const measured = run();
    assert.equal(measured.error, undefined);
    assert.equal(measured.status, 1, measured.stderr);
    assert.match(measured.stdout, /^MEASURED mismatched /u);
    const bytes = await readFile(output, "utf8"), report = JSON.parse(bytes);
    assert.equal(report.canonicalReleaseAuthority, false);
    assert.equal(report.jobs.find((job) => job.name === "performance").dispatchWaitMs, 3000);
    const duplicate = run();
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /EEXIST/u);
    assert.equal(await readFile(output, "utf8"), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
