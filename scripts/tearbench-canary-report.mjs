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
  if (timings.length === 0) return null;
  const start = Math.min(...timings.map((entry) => Date.parse(entry.runCreatedAt)));
  const finish = Math.max(...timings.map((entry) => Date.parse(entry.finishedAt)));
  const build = timings.find((entry) => entry.shardId === "build-1");
  const criticalPathMs = kind === "parallel" && build !== undefined
    ? Math.max(build.workflowWaitMs + build.jobWallMs,
      ...timings.filter((entry) => entry.shardId !== "build-1").map((entry) =>
        Math.max(0, Date.parse(entry.readyAt) - Date.parse(entry.runCreatedAt)) + entry.queueMs + entry.jobWallMs))
    : Math.max(...timings.map((entry) => entry.workflowWaitMs + entry.jobWallMs));
  return { readinessWaitMs: Math.max(...timings.map((entry) => entry.queueMs)), workflowWaitMs: Math.max(...timings.map((entry) => entry.workflowWaitMs ?? 0)),
    setupMs: timings.reduce((sum, entry) => sum + entry.setupMs, 0), criticalPathMs,
    longestJobMs: Math.max(...timings.map((entry) => entry.jobWallMs)),
    taskStageRunnerMinutes: Number((timings.reduce((sum, entry) => sum + entry.jobWallMs, 0) / 60000).toFixed(3)), wallMs: finish - start };
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
  serialCertificate, parallelCertificate, providerBundle, plantedFailureTaskId = null, campaignSlot = "single", generatedAt }) {
  if (!/^(?:single|sample-[1-5])$/u.test(campaignSlot)
    || (plantedFailureTaskId !== null && campaignSlot !== "single")) throw new TypeError("invalid canary campaign slot");
  const errors = [], serial = resultMap("serial", serialReceipts, errors),
    parallel = resultMap("parallel", parallelReceipts, errors);
  verifyOwnership("serial", serialReceipts, serialTimings, [shardPlan.serialShard], errors);
  verifyOwnership("parallel", parallelReceipts, parallelTimings,
    [shardPlan.buildShard, ...shardPlan.browserShards, ...shardPlan.coreShards, shardPlan.performanceShard], errors);
  verifyProviderBundle(providerBundle, parallelReceipts, plan, errors);
  const origin = parallelReceipts[0]?.origin;
  const originsMatch = origin?.kind === "github-actions" && Number.isSafeInteger(origin.attempt) && origin.attempt > 0
    && typeof origin.repository === "string" && typeof origin.workflow === "string" && /^[1-9][0-9]*$/u.test(origin.runId)
    && [...serialReceipts, ...parallelReceipts].every((receipt) => receipt.origin?.kind === "github-actions"
      && ["repository", "workflow", "runId", "attempt"].every((key) => receipt.origin[key] === origin[key]));
  if (!originsMatch) errors.push("serial and parallel receipt provider origins differ or are missing");
  const providerOrigin = originsMatch ? { kind: origin.kind, repository: origin.repository,
    workflow: origin.workflow, runId: origin.runId, attempt: origin.attempt } : null;
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
  const browser = parallelTimings.filter((entry) => entry.shardId.startsWith("browser-"));
  const isolatedPerformance = parallelTimings.find((entry) => entry.shardId === shardPlan.performanceShard.shardId);
  const serialTiming = serialTimings.find((entry) => entry.shardId === shardPlan.serialShard.shardId);
  const serialStart = Date.parse(serialTiming?.runCreatedAt), serialReady = Date.parse(serialTiming?.readyAt);
  const serialFinish = Date.parse(serialTiming?.finishedAt), parallelFinish = Date.parse(isolatedPerformance?.finishedAt);
  const comparisonClockValid = [serialStart, serialReady, serialFinish, parallelFinish].every(Number.isFinite)
    && serialStart === serialReady && serialStart >= parallelFinish && serialFinish >= serialStart;
  if (!comparisonClockValid) errors.push("serial comparison clock includes prior work or has invalid boundaries");
  const serialMetrics = comparisonClockValid ? timingSummary(serialTimings, "serial") : null;
  const parallelMetrics = comparisonClockValid ? timingSummary(parallelTimings, "parallel") : null;
  const minBrowser = Math.min(...browser.map((entry) => Math.max(1, entry.taskWallMs)));
  const payload = { format: "tearbench-canary-parity-report", schemaVersion: 3, generatedAt, campaignSlot,
    status: errors.length === 0 ? (plantedFailureTaskId === null ? "equivalent" : "expected-rejection-proved") : "mismatched",
    planDigest: plan.planDigest, shardPlanDigest: shardPlan.shardPlanDigest, source: plan.source, providerOrigin,
    plantedFailureTaskId, taskParity: { required: plan.requiredTaskIds.length, serial: serial.size, parallel: parallel.size },
    claimParity: { serial: [...new Set(serialReceipts.flatMap((receipt) => receipt.task.claimIds))].sort(),
      parallel: [...new Set(parallelReceipts.flatMap((receipt) => receipt.task.claimIds))].sort() },
    retryHistory: { serial: retryHistory(serialReceipts), parallel: retryHistory(parallelReceipts) },
    metrics: { scope: "in-task clocks, not complete provider job or certificate clocks",
      limitations: ["Readiness wait may include unfinished workflow dependencies; it is not runner queue time",
        "Task-stage runner minutes exclude planning, certification, uploads and cleanup",
        "A completed provider-metrics report is required for full job accounting"],
      serial: serialMetrics, parallel: parallelMetrics,
      isolatedPerformance: isolatedPerformance === undefined ? null : {
        buildReadyToJobStartMs: isolatedPerformance.queueMs, setupMs: isolatedPerformance.setupMs,
        taskWallMs: isolatedPerformance.taskWallMs, jobWallMs: isolatedPerformance.jobWallMs,
      },
      browserShardBalanceRatio: browser.length === 0 ? null : Number((Math.max(...browser.map((entry) => entry.taskWallMs)) / minBrowser).toFixed(3)),
      wallTimeReductionRatio: !comparisonClockValid || serialMetrics.wallMs === 0 ? null
        : Number((parallelMetrics.wallMs / serialMetrics.wallMs).toFixed(3)) },
    errors };
  return Object.freeze({ ...payload, reportDigest: receiptSha256(payload) });
}

// Post-run accounting only. Supplied provider snapshots are not credentials,
// independently verified task evidence, billing records, or release authority.
export function createCanaryProviderMetrics({ run, jobs, parityReport, shardPlan, generatedAt }) {
  const requireValue = (condition, message) => { if (!condition) throw new TypeError(`canary provider metrics: ${message}`); };
  const date = (value) => {
    requireValue(typeof value === "string" && Number.isFinite(Date.parse(value)), "invalid timestamp");
    return Date.parse(value);
  };
  const verifyDigest = (value, field) => {
    requireValue(value !== null && typeof value === "object", `missing ${field}`);
    const { [field]: digest, ...unsigned } = value;
    requireValue(receiptSha256(unsigned) === digest, `altered ${field}`);
  };
  verifyDigest(parityReport, "reportDigest"); verifyDigest(shardPlan, "shardPlanDigest");
  requireValue(parityReport.format === "tearbench-canary-parity-report" && [1, 2, 3].includes(parityReport.schemaVersion)
    && ["equivalent", "expected-rejection-proved", "mismatched"].includes(parityReport.status) && Array.isArray(parityReport.errors)
    && parityReport.planDigest === shardPlan.planDigest && parityReport.shardPlanDigest === shardPlan.shardPlanDigest,
  "report/shard plan mismatch");
  requireValue(run?.repository?.full_name === "shaku1z/tear" && run.path === ".github/workflows/tearbench-canary.yml"
    && run.event === "workflow_dispatch" && run.status === "completed" && ["success", "failure"].includes(run.conclusion)
    && Number.isSafeInteger(run.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0
    && /^[0-9a-f]{40}$/u.test(run.head_sha) && run.head_sha === parityReport.source?.revision, "run origin, source or completion mismatch");
  requireValue(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length, "incomplete job pagination");
  const parityOriginBound = parityReport.schemaVersion >= 2;
  if (parityOriginBound) {
    const origin = parityReport.providerOrigin;
    requireValue(origin?.kind === "github-actions" && origin.repository === run.repository.full_name
      && origin.workflow === run.name && origin.runId === String(run.id) && origin.attempt === run.run_attempt,
    "parity report provider run/attempt mismatch");
  }
  requireValue(shardPlan.format === "tearbench-canary-shard-plan" && shardPlan.schemaVersion === 1
    && Array.isArray(shardPlan.browserShards) && Array.isArray(shardPlan.coreShards), "missing shard topology");
  requireValue(shardPlan.browserShards.every((shard) => /^browser-[1-9][0-9]*$/u.test(shard?.shardId))
    && shardPlan.coreShards.every((shard) => /^core-[1-9][0-9]*$/u.test(shard?.shardId)), "invalid shard identity");
  const ordinary = [...shardPlan.browserShards.map((shard) => `browser (${shard.shardId})`),
    ...shardPlan.coreShards.map((shard) => `core (${shard.shardId})`)];
  requireValue(new Set(ordinary).size === ordinary.length, "duplicate shard identity");
  const dependencies = new Map([
    ["plan", []], ["build", ["plan"]], ...ordinary.map((name) => [name, ["plan", "build"]]),
    ["performance", ["plan", "build", ...ordinary]], ["serial", ["plan", "performance"]],
    ["certify-parallel", ["plan", "build", ...ordinary, "performance"]],
    ["certify-serial", ["plan", "serial"]],
    ["aggregate", ["plan", "build", ...ordinary, "performance", "serial", "certify-parallel", "certify-serial"]],
  ]);
  const skippedModeNames = new Set(["simulation-boundary", "paired-performance"]);
  const expectedJobNames = new Set([...dependencies.keys(), ...skippedModeNames]);
  const indexed = new Map(), seenNames = new Set(), ids = new Set(), skippedJobs = [];
  const started = date(run.created_at), finished = date(run.updated_at);
  requireValue(finished >= started, "reversed run clock");
  for (const job of jobs.jobs) {
    requireValue(expectedJobNames.has(job.name) && !seenNames.has(job.name) && !ids.has(job.id)
      && Number.isSafeInteger(job.id) && job.id > 0 && job.run_id === run.id && job.run_attempt === run.run_attempt
      && job.head_sha === run.head_sha && job.status === "completed", "unknown, duplicate, incomplete or mismatched job");
    const skippedMode = skippedModeNames.has(job.name);
    requireValue(skippedMode ? job.conclusion === "skipped" : ["success", "failure"].includes(job.conclusion),
      "invalid job conclusion for selected canary mode");
    const start = date(job.started_at), end = date(job.completed_at);
    requireValue(start >= started && end >= start && end <= finished, "invalid job interval");
    seenNames.add(job.name); ids.add(job.id);
    if (skippedMode) {
      skippedJobs.push({ name: job.name, jobId: job.id, conclusion: job.conclusion,
        startedAt: job.started_at, completedAt: job.completed_at });
    } else indexed.set(job.name, { job, start, end });
  }
  requireValue(seenNames.size === expectedJobNames.size && indexed.size === dependencies.size, "missing workflow job");
  requireValue(run.conclusion !== "success" || jobs.jobs.every((job) => ["success", "skipped"].includes(job.conclusion)),
    "successful run contains failed jobs");
  requireValue(parityReport.status !== "equivalent" || parityReport.errors.length === 0, "equivalent report contains errors");
  const rows = [...dependencies].map(([name, needs]) => {
    const { job, start, end } = indexed.get(name);
    const ready = Math.max(started, ...needs.map((dependency) => indexed.get(dependency).end));
    requireValue(start >= ready, `job started before its dependencies: ${name}`);
    return { name, jobId: job.id, conclusion: job.conclusion, dependencies: needs,
      readyAt: new Date(ready).toISOString(), startedAt: job.started_at, completedAt: job.completed_at,
      dependencyReadyElapsedMs: ready - started, dispatchWaitMs: start - ready, jobWallMs: end - start };
  });
  const parallelNames = ["plan", "build", ...ordinary, "performance", "certify-parallel"];
  const sum = (names) => rows.filter((row) => names.includes(row.name)).reduce((total, row) => total + row.jobWallMs, 0);
  const payload = { format: "tearbench-canary-provider-metrics", schemaVersion: 1, generatedAt,
    repository: run.repository.full_name, runId: run.id, attempt: run.run_attempt, source: parityReport.source,
    runConclusion: run.conclusion, parityStatus: parityReport.status,
    parityOriginBound, equivalenceReported: parityOriginBound && parityReport.status === "equivalent" && run.conclusion === "success",
    planDigest: parityReport.planDigest, shardPlanDigest: shardPlan.shardPlanDigest, parityReportDigest: parityReport.reportDigest,
    providerRunDigest: receiptSha256(run), providerJobsDigest: receiptSha256(jobs),
    parallelDecisionWallMs: indexed.get("certify-parallel").end - started,
    serialDecisionWallMs: indexed.get("certify-serial").end - indexed.get("performance").end,
    parallelJobWallMs: sum(parallelNames), serialJobWallMs: sum(["serial", "certify-serial"]),
    experimentJobWallMs: rows.reduce((total, row) => total + row.jobWallMs, 0),
    experimentWallMs: indexed.get("aggregate").end - started, jobs: rows, skippedJobs,
    canonicalReleaseAuthority: false,
    limitations: ["Provider snapshots are supplied data, not an authenticated release certificate",
      "Legacy schema-1 parity reports have no run/attempt origin binding and cannot report equivalence here",
      "Dependency-ready elapsed time is measured from run creation, not per-job queue entry",
      "Job wall time includes setup, uploads and cleanup but is not a billing attestation",
      "Dispatch wait starts after all dependencies finish; it includes provider scheduling",
      "Decision clocks include certification jobs even when the decision rejects the candidate",
      "One run is not a p50/p95 qualification or speedup acceptance"] };
  requireValue(date(generatedAt) >= finished, "measurement predates run completion");
  return Object.freeze({ ...payload, reportDigest: receiptSha256(payload) });
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "provider-metrics") {
    const options = process.argv.slice(3), values = {};
    const allowed = ["--run", "--jobs", "--report", "--shard-plan", "--artifact"];
    if (options.length !== allowed.length * 2) throw new TypeError("provider-metrics requires --run --jobs --report --shard-plan --artifact");
    for (let index = 0; index < options.length; index += 2) {
      if (!allowed.includes(options[index]) || values[options[index]] !== undefined) throw new TypeError("invalid provider-metrics arguments");
      values[options[index]] = options[index + 1];
    }
    const json = async (name) => JSON.parse(await readFile(resolve(values[name]), "utf8"));
    const report = createCanaryProviderMetrics({ run: await json("--run"), jobs: await json("--jobs"),
      parityReport: await json("--report"), shardPlan: await json("--shard-plan"), generatedAt: new Date().toISOString() });
    const output = resolve(values["--artifact"]); await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(`MEASURED ${report.parityStatus} ${report.reportDigest}`);
    // Successful measurement does not turn a failed run into qualification.
    if (!report.equivalenceReported) process.exitCode = 1;
  } else {
  const names = ["--plan", "--shard-plan", "--serial-dir", "--parallel-dir", "--serial-certificate", "--parallel-certificate", "--provider-bundle", "--artifact", "--plant-failure", "--campaign-slot"];
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
    plantedFailureTaskId: values["--plant-failure"] === "none" ? null : values["--plant-failure"],
    campaignSlot: values["--campaign-slot"], generatedAt: new Date().toISOString() });
  const output = resolve(values["--artifact"]); await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`${report.status.toUpperCase()} ${report.reportDigest}`); if (report.errors.length > 0) process.exitCode = 1;
  }
}
