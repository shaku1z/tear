import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";
import { performanceSampleAllowsRetry, PERFORMANCE_TASK_ID } from "./tearbench-performance-sample.mjs";

async function jsonArtifacts(directory) {
  const values = [];
  const visit = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        try { values.push(JSON.parse(await readFile(child, "utf8"))); } catch { /* Non-JSON evidence is irrelevant here. */ }
      }
    }
  };
  await visit(resolve(directory)); return values;
}
function verifiedReceipts(values, planDigest) {
  return values.filter((value) => value?.format === "tearbench-task-attempt-receipt").map((receipt) => {
    const { receiptDigest, ...unsigned } = receipt;
    if (receiptSha256(unsigned) !== receiptDigest || receipt.plan?.digest !== planDigest) throw new TypeError("canary receipt is altered or belongs to another plan");
    return receipt;
  });
}
function verifiedTimings(values, planDigest, shardPlanDigest) {
  return values.filter((value) => value?.format === "tearbench-canary-shard-timing").map((timing) => {
    const { timingDigest, ...unsigned } = timing;
    if (receiptSha256(unsigned) !== timingDigest || timing.planDigest !== planDigest || timing.shardPlanDigest !== shardPlanDigest) {
      throw new TypeError("canary timing is altered or stale");
    }
    return timing;
  });
}
function resultMap(label, receipts, errors) {
  const grouped = new Map(), map = new Map();
  for (const receipt of receipts) {
    const id = receipt.task?.taskId;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(receipt);
  }
  for (const [taskId, entries] of grouped) {
    const attempts = entries.toSorted((left, right) => left.attemptNumber - right.attemptNumber);
    if (attempts.length > 2) errors.push(`${label} task ${taskId} exceeds the one-retry limit`);
    for (let index = 0; index < attempts.length; index++) {
      const attempt = attempts[index], previous = attempts[index - 1];
      if (attempt.attemptNumber !== index + 1
        || attempt.missionId !== attempts[0]?.missionId
        || attempt.executionKey !== attempts[0]?.executionKey
        || (index === 0 ? attempt.retryOf !== null : attempt.retryOf !== previous?.receiptDigest)) {
        errors.push(`${label} task ${taskId} has an incomplete or hidden retry chain`); break;
      }
    }
    if (attempts.length === 2 && (attempts[0].result?.status !== "failed"
      || typeof attempts[1].retryAuthorization !== "string" || attempts[1].retryAuthorization.length === 0)) {
      errors.push(`${label} task ${taskId} has an unauthorized or unnecessary retry`);
    }
    if (taskId === PERFORMANCE_TASK_ID && attempts.length === 2
      && (!performanceSampleAllowsRetry(attempts[0].result?.sampleValidity)
        || attempts[1].retryAuthorization !== `bounded-canary-invalid-sample-retry:${attempts[0].missionId}:${taskId}`)) {
      errors.push(`${label} task ${taskId} retry lacks receipt-proven infrastructure contention`);
    }
    map.set(taskId, attempts.at(-1));
  }
  return map;
}
function retryHistory(receipts) {
  const grouped = new Map();
  for (const receipt of receipts) {
    const taskId = receipt.task?.taskId;
    if (!grouped.has(taskId)) grouped.set(taskId, []);
    grouped.get(taskId).push(receipt);
  }
  return [...grouped].sort(([left], [right]) => left.localeCompare(right)).map(([taskId, entries]) => {
    const attempts = entries.toSorted((left, right) => left.attemptNumber - right.attemptNumber);
    return { taskId, disposition: attempts.length === 2 && attempts[0].result?.status === "failed"
      && attempts[1].result?.status === "passed" ? "recovered-flaky"
      : attempts.at(-1)?.result?.status === "passed" ? "passed-first-attempt" : "failed",
    attempts: attempts.map((entry) => ({ attemptNumber: entry.attemptNumber, status: entry.result?.status,
      receiptDigest: entry.receiptDigest, retryOf: entry.retryOf, retryAuthorization: entry.retryAuthorization,
      sampleValidity: entry.result?.sampleValidity ?? null })) };
  });
}
function timingSummary(timings, kind) {
  if (timings.length === 0) return { queueMs: 0, setupMs: 0, criticalPathMs: 0, longestJobMs: 0, runnerMinutes: 0, wallMs: 0 };
  const start = Math.min(...timings.map((entry) => Date.parse(entry.runCreatedAt)));
  const finish = Math.max(...timings.map((entry) => Date.parse(entry.finishedAt)));
  const build = timings.find((entry) => entry.shardId === "build-1");
  const criticalPathMs = kind === "parallel" && build !== undefined
    ? Math.max(build.workflowWaitMs + build.jobWallMs,
      ...timings.filter((entry) => entry.shardId !== "build-1").map((entry) =>
        Math.max(0, Date.parse(entry.readyAt) - Date.parse(entry.runCreatedAt)) + entry.queueMs + entry.jobWallMs))
    : Math.max(...timings.map((entry) => entry.workflowWaitMs + entry.jobWallMs));
  return { queueMs: Math.max(...timings.map((entry) => entry.queueMs)), workflowWaitMs: Math.max(...timings.map((entry) => entry.workflowWaitMs ?? 0)),
    setupMs: timings.reduce((sum, entry) => sum + entry.setupMs, 0), criticalPathMs,
    longestJobMs: Math.max(...timings.map((entry) => entry.jobWallMs)),
    runnerMinutes: Number((timings.reduce((sum, entry) => sum + entry.jobWallMs, 0) / 60000).toFixed(3)), wallMs: finish - start };
}
function verifyOwnership(label, receipts, timings, expectedShards, errors) {
  const expectedByTask = new Map(), timingByShard = new Map();
  for (const shard of expectedShards) for (const taskId of shard.taskIds) {
    if (expectedByTask.has(taskId)) errors.push(`${label} shard plan duplicates ${taskId}`);
    expectedByTask.set(taskId, shard.shardId);
  }
  for (const timing of timings) {
    if (timingByShard.has(timing.shardId)) errors.push(`${label} has duplicate timing for ${timing.shardId}`);
    timingByShard.set(timing.shardId, timing);
    const expected = expectedShards.find((shard) => shard.shardId === timing.shardId);
    const actualIds = timing.taskResults?.map((entry) => entry.taskId) ?? [];
    if (expected === undefined || JSON.stringify(actualIds) !== JSON.stringify(expected.taskIds)) errors.push(`${label} timing ownership differs for ${timing.shardId}`);
  }
  for (const shard of expectedShards) if (!timingByShard.has(shard.shardId)) errors.push(`${label} is missing timing for ${shard.shardId}`);
  const receiptsByTask = new Map();
  for (const receipt of receipts) {
    const taskId = receipt.task?.taskId;
    if (!receiptsByTask.has(taskId)) receiptsByTask.set(taskId, []);
    receiptsByTask.get(taskId).push(receipt);
  }
  for (const [taskId, taskReceipts] of receiptsByTask) {
    const shardId = expectedByTask.get(taskId);
    const timing = shardId === undefined ? undefined : timingByShard.get(shardId);
    const taskTiming = timing?.taskResults?.find((entry) => entry.taskId === taskId);
    const attempts = taskReceipts.toSorted((left, right) => left.attemptNumber - right.attemptNumber);
    const timingAttempts = taskTiming?.attempts;
    const attemptsMatch = Array.isArray(timingAttempts)
      ? attempts.length === timingAttempts.length && attempts.every((receipt, index) => {
        const attempt = timingAttempts[index];
        return attempt?.attemptNumber === receipt.attemptNumber && attempt.status === receipt.result?.status
          && attempt.receiptPath === receipt.immutablePath
          && JSON.stringify(attempt.sampleValidity ?? null) === JSON.stringify(receipt.result?.sampleValidity ?? null);
      })
      : attempts.length === 1 && taskTiming?.status === attempts[0]?.result?.status;
    if (taskReceipts.some((receipt) => timing?.missionId !== receipt.missionId) || !attemptsMatch
      || taskTiming?.status !== attempts.at(-1)?.result?.status) {
      errors.push(`${label} receipt ${taskId} was not produced by its assigned shard`);
    }
  }
}
function verifyProviderBundle(bundle, parallelReceipts, plan, errors) {
  const { bundleDigest, ...unsigned } = bundle ?? {};
  if (bundle?.format !== "tear-build-provider-bundle" || bundle.schemaVersion !== 1 || receiptSha256(unsigned) !== bundleDigest) {
    errors.push("provider build bundle is missing or altered"); return;
  }
  const origins = parallelReceipts.map((receipt) => receipt.origin), authoritativeOrigin = origins[0];
  const commonProtectedOrigin = origins.length > 0 && origins.every((origin) => origin?.kind === "github-actions"
    && origin.repository === authoritativeOrigin?.repository && origin.workflow === authoritativeOrigin?.workflow
    && origin.runId === authoritativeOrigin?.runId && origin.attempt === authoritativeOrigin?.attempt);
  const runId = authoritativeOrigin?.runId;
  if (!commonProtectedOrigin || bundle.repository !== authoritativeOrigin?.repository || bundle.runId !== runId
    || !/^[1-9][0-9]*$/u.test(String(bundle.artifactId))
    || !/^[0-9a-f]{64}$/u.test(bundle.artifactDigest)
    || !String(bundle.artifactUrl).includes(`/actions/runs/${String(runId)}/artifacts/${String(bundle.artifactId)}`)) {
    errors.push("provider build bundle origin or artifact identity is mismatched");
  }
  const produced = parallelReceipts.flatMap((receipt) => receipt.bindings?.build?.produced ?? []);
  if (bundle.receipts?.length !== produced.length || produced.length !== 4) errors.push("provider build bundle does not cover all four ordinary build records");
  for (const attestation of produced) {
    const provider = bundle.receipts?.find((receipt) => receipt.buildRecordDigest === attestation.recordDigest);
    const { receiptDigest, ...providerUnsigned } = provider ?? {};
    if (provider?.format !== "tear-build-provider-receipt" || provider.schemaVersion !== 1
      || receiptSha256(providerUnsigned) !== receiptDigest || provider?.provider !== "github-actions"
      || provider?.artifactId !== bundle.artifactId || provider?.artifactDigest !== bundle.artifactDigest
      || provider?.artifactUrl !== bundle.artifactUrl || provider?.repository !== bundle.repository
      || provider?.runId !== bundle.runId || provider?.buildIdentityDigest !== attestation.buildIdentityDigest) {
      errors.push(`provider receipt does not bind build ${attestation.taskId}:${attestation.outputId}`);
    }
  }
}

export function createCanaryParityReport({ plan, shardPlan, serialReceipts, parallelReceipts, serialTimings, parallelTimings,
  serialCertificate, parallelCertificate, providerBundle, plantedFailureTaskId = null, generatedAt }) {
  const errors = [], serial = resultMap("serial", serialReceipts, errors),
    parallel = resultMap("parallel", parallelReceipts, errors);
  verifyOwnership("serial", serialReceipts, serialTimings, [shardPlan.serialShard], errors);
  verifyOwnership("parallel", parallelReceipts, parallelTimings,
    [shardPlan.buildShard, ...shardPlan.browserShards, ...shardPlan.coreShards, shardPlan.performanceShard], errors);
  verifyProviderBundle(providerBundle, parallelReceipts, plan, errors);
  for (const taskId of plan.requiredTaskIds) {
    const left = serial.get(taskId), right = parallel.get(taskId);
    if (left === undefined) errors.push(`serial mission is missing ${taskId}`);
    if (right === undefined) errors.push(`parallel mission is missing ${taskId}`);
    if (left !== undefined && left.result?.status !== "passed") errors.push(`serial task did not pass: ${taskId}`);
    if (right !== undefined) {
      const expected = plantedFailureTaskId === taskId ? "failed" : "passed";
      if (right.result?.status !== expected) errors.push(`parallel task ${taskId} expected ${expected}`);
    }
    if (left !== undefined && right !== undefined) {
      if (JSON.stringify(left.task?.claimIds) !== JSON.stringify(right.task?.claimIds)) errors.push(`claim parity differs for ${taskId}`);
      const leftBuild = left.bindings?.build, rightBuild = right.bindings?.build;
      if (taskId !== plantedFailureTaskId && receiptSha256(leftBuild) !== receiptSha256(rightBuild)) errors.push(`build identity parity differs for ${taskId}`);
    }
  }
  for (const taskId of [...serial.keys(), ...parallel.keys()]) if (!plan.requiredTaskIds.includes(taskId)) errors.push(`mission has extra task ${taskId}`);
  if (serialCertificate?.status !== "certified" || serialCertificate.planDigest !== plan.planDigest) errors.push("serial certificate is not exact and certified");
  const expectedParallel = plantedFailureTaskId === null ? "certified" : "rejected";
  if (parallelCertificate?.status !== expectedParallel || parallelCertificate.planDigest !== plan.planDigest) {
    errors.push(`parallel certificate is not the expected ${expectedParallel} decision`);
  }
  const serialMetrics = timingSummary(serialTimings, "serial"), parallelMetrics = timingSummary(parallelTimings, "parallel");
  const browser = parallelTimings.filter((entry) => entry.shardId.startsWith("browser-"));
  const isolatedPerformance = parallelTimings.find((entry) => entry.shardId === shardPlan.performanceShard.shardId);
  const minBrowser = Math.min(...browser.map((entry) => Math.max(1, entry.taskWallMs)));
  const payload = { format: "tearbench-canary-parity-report", schemaVersion: 1, generatedAt,
    status: errors.length === 0 ? (plantedFailureTaskId === null ? "equivalent" : "expected-rejection-proved") : "mismatched",
    planDigest: plan.planDigest, shardPlanDigest: shardPlan.shardPlanDigest, source: plan.source,
    plantedFailureTaskId, taskParity: { required: plan.requiredTaskIds.length, serial: serial.size, parallel: parallel.size },
    claimParity: { serial: [...new Set(serialReceipts.flatMap((receipt) => receipt.task.claimIds))].sort(),
      parallel: [...new Set(parallelReceipts.flatMap((receipt) => receipt.task.claimIds))].sort() },
    retryHistory: { serial: retryHistory(serialReceipts), parallel: retryHistory(parallelReceipts) },
    metrics: { serial: serialMetrics, parallel: parallelMetrics,
      isolatedPerformance: isolatedPerformance === undefined ? null : {
        queueMs: isolatedPerformance.queueMs, setupMs: isolatedPerformance.setupMs,
        taskWallMs: isolatedPerformance.taskWallMs, jobWallMs: isolatedPerformance.jobWallMs,
      },
      browserShardBalanceRatio: browser.length === 0 ? null : Number((Math.max(...browser.map((entry) => entry.taskWallMs)) / minBrowser).toFixed(3)),
      wallTimeReductionRatio: serialMetrics.wallMs === 0 ? null : Number((parallelMetrics.wallMs / serialMetrics.wallMs).toFixed(3)) },
    errors };
  return Object.freeze({ ...payload, reportDigest: receiptSha256(payload) });
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const names = ["--plan", "--shard-plan", "--serial-dir", "--parallel-dir", "--serial-certificate", "--parallel-certificate", "--provider-bundle", "--artifact", "--plant-failure"];
  const args = process.argv.slice(2), values = {};
  if (args.length !== names.length * 2) throw new TypeError("invalid canary report arguments");
  for (let index = 0; index < args.length; index += 2) { if (!names.includes(args[index]) || values[args[index]] !== undefined) throw new TypeError("invalid canary report arguments"); values[args[index]] = args[index + 1]; }
  const plan = JSON.parse(await readFile(resolve(values["--plan"]), "utf8"));
  const shardPlan = JSON.parse(await readFile(resolve(values["--shard-plan"]), "utf8"));
  const serialValues = await jsonArtifacts(values["--serial-dir"]), parallelValues = await jsonArtifacts(values["--parallel-dir"]);
  const report = createCanaryParityReport({ plan, shardPlan,
    serialReceipts: verifiedReceipts(serialValues, plan.planDigest), parallelReceipts: verifiedReceipts(parallelValues, plan.planDigest),
    serialTimings: verifiedTimings(serialValues, plan.planDigest, shardPlan.shardPlanDigest),
    parallelTimings: verifiedTimings(parallelValues, plan.planDigest, shardPlan.shardPlanDigest),
    serialCertificate: JSON.parse(await readFile(resolve(values["--serial-certificate"]), "utf8")),
    parallelCertificate: JSON.parse(await readFile(resolve(values["--parallel-certificate"]), "utf8")),
    providerBundle: JSON.parse(await readFile(resolve(values["--provider-bundle"]), "utf8")),
    plantedFailureTaskId: values["--plant-failure"] === "none" ? null : values["--plant-failure"], generatedAt: new Date().toISOString() });
  const output = resolve(values["--artifact"]); await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`${report.status.toUpperCase()} ${report.reportDigest}`); if (report.errors.length > 0) process.exitCode = 1;
}
