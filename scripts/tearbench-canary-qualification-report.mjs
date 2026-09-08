import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanaryProviderMetrics } from "./tearbench-canary-report.mjs";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";

export const REQUIRED_QUALIFICATION_SAMPLES = 5;
export const QUALIFICATION_RUNTIME = Object.freeze({
  runnerLabel: "ubuntu-latest",
  nodeVersion: "24",
  pnpmVersion: "11.15.0",
  performanceBrowser: Object.freeze({
    channel: "pinned",
    version: "152.0.7977.64",
    archiveSha256: "8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e",
  }),
});

function requireValue(condition, message) {
  if (!condition) throw new TypeError(`canary qualification: ${message}`);
}

function isDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function verifyDigest(value, field) {
  requireValue(value !== null && typeof value === "object", `missing ${field}`);
  const { [field]: digest, ...unsigned } = value;
  requireValue(isDigest(digest) && receiptSha256(unsigned) === digest, `altered ${field}`);
}

function number(value, label) {
  requireValue(Number.isFinite(value) && value >= 0, `invalid ${label}`);
  return value;
}

function ratio(value, label) {
  requireValue(Number.isFinite(value) && value >= 1, `invalid ${label}`);
  return value;
}

function percentile(values, quantile) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

function summary(values) {
  requireValue(values.length > 0, "empty metric series");
  return Object.freeze({
    values,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  });
}

function validateExpected(expected) {
  requireValue(expected?.repository === "shaku1z/tear"
    && expected.workflow === "TearBench Parallel Canary"
    && expected.headBranch === "main", "invalid protected campaign origin");
  requireValue(expected.source?.state === "clean" && /^[0-9a-f]{40}$/u.test(expected.source.revision)
    && isDigest(expected.source.fingerprint) && isDigest(expected.source.worktreeFingerprint),
  "invalid expected clean source");
  requireValue(isDigest(expected.planDigest) && isDigest(expected.shardPlanDigest)
    && Number.isSafeInteger(expected.taskCount) && expected.taskCount > 0, "invalid expected plan binding");
  requireValue(receiptSha256(expected.runtime) === receiptSha256(QUALIFICATION_RUNTIME),
    "runtime pins differ from the qualification contract");
  return expected;
}

function retryPathSummary(entries, label) {
  requireValue(Array.isArray(entries) && entries.length > 0, `missing ${label} retry history`);
  const taskIds = new Set();
  let retries = 0, initialFailures = 0, recoveredFlakes = 0, repeatedFailures = 0;
  for (const entry of entries) {
    requireValue(typeof entry?.taskId === "string" && entry.taskId.length > 0 && !taskIds.has(entry.taskId)
      && Array.isArray(entry.attempts) && entry.attempts.length >= 1 && entry.attempts.length <= 2,
    `invalid ${label} retry history`);
    taskIds.add(entry.taskId);
    const attempts = entry.attempts;
    for (const [attemptIndex, attempt] of attempts.entries()) {
      requireValue(attempt?.attemptNumber === attemptIndex + 1 && ["passed", "failed"].includes(attempt.status)
        && isDigest(attempt.receiptDigest), `invalid ${label} attempt sequence`);
      if (attemptIndex === 0) {
        requireValue(attempt.retryOf === null && attempt.retryAuthorization === null,
          `invalid ${label} initial attempt`);
      } else {
        requireValue(attempts[0].status === "failed" && attempt.retryOf === attempts[0].receiptDigest
          && typeof attempt.retryAuthorization === "string" && attempt.retryAuthorization.length > 0,
        `unauthorized or hidden ${label} retry`);
      }
    }
    const expectedDisposition = attempts.length === 2 && attempts[1].status === "passed"
      ? "recovered-flaky" : attempts.at(-1).status === "passed" ? "passed-first-attempt" : "failed";
    requireValue(entry.disposition === expectedDisposition, `fabricated ${label} retry disposition`);
    if (attempts[0].status === "failed") initialFailures += 1;
    retries += attempts.length - 1;
    if (entry.disposition === "recovered-flaky") recoveredFlakes += 1;
    if (entry.disposition === "failed" && attempts.length > 1) repeatedFailures += 1;
  }
  return Object.freeze({ tasks: entries.length, initialFailures, retries, recoveredFlakes, repeatedFailures,
    retryRate: Number((retries / entries.length).toFixed(6)) });
}

function retrySummary(report, taskParity) {
  const serial = retryPathSummary(report.retryHistory?.serial, "serial");
  const parallel = retryPathSummary(report.retryHistory?.parallel, "parallel");
  requireValue(serial.tasks === taskParity.serial && parallel.tasks === taskParity.parallel,
    "retry history task denominator differs from task parity");
  const tasks = serial.tasks + parallel.tasks;
  const retries = serial.retries + parallel.retries;
  return Object.freeze({ serial, parallel, tasks,
    initialFailures: serial.initialFailures + parallel.initialFailures,
    retries,
    recoveredFlakes: serial.recoveredFlakes + parallel.recoveredFlakes,
    repeatedFailures: serial.repeatedFailures + parallel.repeatedFailures,
    retryRate: Number((retries / tasks).toFixed(6)) });
}

function metricRows(providerMetrics, names, label) {
  const rows = providerMetrics.jobs.filter((row) => names.has(row.name));
  requireValue(rows.length > 0, `missing ${label} provider jobs`);
  return rows;
}

function validateArtifact(artifact, provider, rawRun, expected, index) {
  const metadata = artifact?.metadata;
  const expectedName = `tearbench-canary-aggregate-${provider.runId}-${provider.attempt}`;
  requireValue(Number.isSafeInteger(metadata?.id) && metadata.id > 0 && metadata.name === expectedName
    && metadata.expired === false && Number.isSafeInteger(metadata.size_in_bytes) && metadata.size_in_bytes > 0
    && typeof metadata.node_id === "string" && metadata.node_id.length > 0,
  `sample ${index} artifact metadata is invalid`);
  requireValue(metadata.url === `https://api.github.com/repos/${expected.repository}/actions/artifacts/${metadata.id}`
    && metadata.archive_download_url === `${metadata.url}/zip`, `sample ${index} artifact API origin is invalid`);
  requireValue(metadata.workflow_run?.id === provider.runId
    && metadata.workflow_run.head_branch === expected.headBranch
    && metadata.workflow_run.head_sha === expected.source.revision
    && Number.isSafeInteger(metadata.workflow_run.repository_id) && metadata.workflow_run.repository_id > 0
    && metadata.workflow_run.head_repository_id === metadata.workflow_run.repository_id,
  `sample ${index} artifact workflow binding is invalid`);
  requireValue(isDigest(artifact.archiveSha256) && metadata.digest === `sha256:${artifact.archiveSha256}`,
    `sample ${index} downloaded archive digest differs from provider metadata`);
  const created = Date.parse(metadata.created_at), updated = Date.parse(metadata.updated_at);
  requireValue(Number.isFinite(created) && Number.isFinite(updated) && updated >= created
    && created >= Date.parse(rawRun.created_at) && updated <= Date.parse(rawRun.updated_at),
    `sample ${index} artifact timestamps are invalid`);
  return Object.freeze({ artifactId: metadata.id, name: metadata.name, archiveSha256: artifact.archiveSha256,
    sizeInBytes: metadata.size_in_bytes, createdAt: metadata.created_at, updatedAt: metadata.updated_at });
}

function validateRunnerRows(rawJobs, provider, expected, index) {
  requireValue(Array.isArray(rawJobs?.jobs) && rawJobs.total_count === rawJobs.jobs.length,
    `sample ${index} raw jobs are incomplete`);
  const skipped = new Set(provider.skippedJobs.map((job) => job.jobId));
  const rows = rawJobs.jobs.filter((job) => !skipped.has(job.id)).map((job) => {
    requireValue(Array.isArray(job.labels) && job.labels.includes(expected.runtime.runnerLabel)
      && typeof job.runner_name === "string" && job.runner_name.length > 0
      && job.runner_group_name === "GitHub Actions", `sample ${index} runner identity is invalid`);
    return { jobId: job.id, name: job.name, labels: job.labels, runnerName: job.runner_name,
      runnerGroupName: job.runner_group_name };
  });
  requireValue(rows.length === provider.jobs.length, `sample ${index} runner rows differ from measured jobs`);
  return rows;
}

function validateSample(sample, index, generatedAt, expected) {
  const parity = sample?.parityReport, provider = sample?.providerMetrics, shardPlan = sample?.shardPlan;
  verifyDigest(parity, "reportDigest");
  verifyDigest(provider, "reportDigest");
  verifyDigest(shardPlan, "shardPlanDigest");
  requireValue(parity.format === "tearbench-canary-parity-report" && parity.schemaVersion === 3,
    `sample ${index} parity schema is not campaign-bound`);
  requireValue(provider.format === "tearbench-canary-provider-metrics" && provider.schemaVersion === 1,
    `sample ${index} provider schema is invalid`);
  const replayedProvider = createCanaryProviderMetrics({ run: sample.run, jobs: sample.jobs,
    parityReport: parity, shardPlan, generatedAt: provider.generatedAt });
  requireValue(replayedProvider.reportDigest === provider.reportDigest
    && replayedProvider.providerRunDigest === provider.providerRunDigest
    && replayedProvider.providerJobsDigest === provider.providerJobsDigest,
  `sample ${index} provider metrics do not replay from raw inputs`);
  requireValue(provider.parityReportDigest === parity.reportDigest && provider.planDigest === parity.planDigest
    && provider.shardPlanDigest === parity.shardPlanDigest
    && receiptSha256(provider.source) === receiptSha256(parity.source), `sample ${index} report binding mismatch`);
  requireValue(parity.providerOrigin?.kind === "github-actions"
    && parity.providerOrigin.repository === expected.repository
    && parity.providerOrigin.workflow === expected.workflow
    && parity.providerOrigin.runId === String(provider.runId)
    && parity.providerOrigin.attempt === provider.attempt, `sample ${index} provider origin mismatch`);
  requireValue(Number.isSafeInteger(provider.runId) && provider.runId > 0 && provider.attempt === 1,
    `sample ${index} must be an independent first workflow attempt`);
  requireValue(sample.run.head_branch === expected.headBranch, `sample ${index} is not from protected main`);
  requireValue(parity.plantedFailureTaskId === null, `sample ${index} is not a normal canary`);
  requireValue(parity.campaignSlot === `sample-${index}`, `sample ${index} campaign slot is mismatched`);
  requireValue(Number.isFinite(Date.parse(parity.generatedAt)) && Number.isFinite(Date.parse(provider.generatedAt))
    && Date.parse(generatedAt) >= Date.parse(parity.generatedAt) && Date.parse(generatedAt) >= Date.parse(provider.generatedAt),
  `sample ${index} measurement predates its inputs`);
  requireValue(receiptSha256(parity.source) === receiptSha256(expected.source)
    && parity.planDigest === expected.planDigest && parity.shardPlanDigest === expected.shardPlanDigest,
  `sample ${index} differs from the declared source or plan`);
  const artifact = validateArtifact(sample.artifact, provider, sample.run, expected, index);
  const runnerJobs = validateRunnerRows(sample.jobs, provider, expected, index);
  const taskParity = parity.taskParity;
  requireValue(taskParity?.required === expected.taskCount && Number.isSafeInteger(taskParity.serial)
    && Number.isSafeInteger(taskParity.parallel) && taskParity.serial > 0 && taskParity.parallel > 0,
  `sample ${index} task parity is invalid`);
  requireValue(Array.isArray(parity.claimParity?.serial) && Array.isArray(parity.claimParity?.parallel),
    `sample ${index} claim parity is missing`);
  const serialMetrics = parity.metrics?.serial, parallelMetrics = parity.metrics?.parallel;
  requireValue(serialMetrics !== null && typeof serialMetrics === "object"
    && parallelMetrics !== null && typeof parallelMetrics === "object", `sample ${index} in-task metrics are missing`);
  const retry = retrySummary(parity, taskParity);
  const parallelNames = new Set(provider.jobs.filter((row) => !["serial", "certify-serial", "aggregate"].includes(row.name))
    .map((row) => row.name));
  const serialNames = new Set(["serial", "certify-serial"]);
  const parallelRows = metricRows(provider, parallelNames, `sample ${index} parallel`);
  const serialRows = metricRows(provider, serialNames, `sample ${index} serial`);
  const maxDispatch = (rows) => Math.max(...rows.map((row) => number(row.dispatchWaitMs, `sample ${index} dispatch wait`)));
  const equivalent = provider.equivalenceReported === true && provider.runConclusion === "success"
    && provider.parityStatus === "equivalent" && parity.status === "equivalent" && parity.errors?.length === 0
    && taskParity.required === taskParity.serial && taskParity.required === taskParity.parallel
    && JSON.stringify(parity.claimParity.serial) === JSON.stringify(parity.claimParity.parallel);
  const providerInterval = {
    startedAt: new Date(Math.min(...provider.jobs.map((row) => Date.parse(row.startedAt)))).toISOString(),
    completedAt: new Date(Math.max(...provider.jobs.map((row) => Date.parse(row.completedAt)))).toISOString(),
  };
  return Object.freeze({ index, campaignSlot: parity.campaignSlot, runId: provider.runId, attempt: provider.attempt,
    artifact, source: parity.source, planDigest: parity.planDigest, shardPlanDigest: parity.shardPlanDigest,
    parityReportDigest: parity.reportDigest, providerReportDigest: provider.reportDigest,
    providerRunDigest: provider.providerRunDigest, providerJobsDigest: provider.providerJobsDigest,
    equivalent, taskParity, retry, runnerJobs, providerInterval,
    metrics: {
      parallelDecisionWallMs: number(provider.parallelDecisionWallMs, `sample ${index} parallel decision wall`),
      serialDecisionWallMs: number(provider.serialDecisionWallMs, `sample ${index} serial decision wall`),
      parallelJobWallMs: number(provider.parallelJobWallMs, `sample ${index} parallel job wall`),
      serialJobWallMs: number(provider.serialJobWallMs, `sample ${index} serial job wall`),
      experimentJobWallMs: number(provider.experimentJobWallMs, `sample ${index} experiment job wall`),
      experimentWallMs: number(provider.experimentWallMs, `sample ${index} experiment wall`),
      parallelCriticalPathMs: number(parallelMetrics.criticalPathMs, `sample ${index} parallel critical path`),
      serialCriticalPathMs: number(serialMetrics.criticalPathMs, `sample ${index} serial critical path`),
      parallelSetupMs: number(parallelMetrics.setupMs, `sample ${index} parallel setup`),
      serialSetupMs: number(serialMetrics.setupMs, `sample ${index} serial setup`),
      browserShardBalanceRatio: ratio(parity.metrics.browserShardBalanceRatio, `sample ${index} shard balance`),
      parallelMaxDispatchWaitMs: maxDispatch(parallelRows),
      serialMaxDispatchWaitMs: maxDispatch(serialRows),
    } });
}

export function createCanaryQualificationReport({ samples, expected, generatedAt }) {
  requireValue(Array.isArray(samples) && samples.length === REQUIRED_QUALIFICATION_SAMPLES,
    `exactly ${REQUIRED_QUALIFICATION_SAMPLES} samples are required`);
  requireValue(typeof generatedAt === "string" && Number.isFinite(Date.parse(generatedAt)), "invalid generation time");
  const declared = validateExpected(expected);
  const validated = samples.map((sample, index) => validateSample(sample, index + 1, generatedAt, declared));
  requireValue(new Set(validated.map((sample) => `${sample.runId}:${sample.attempt}`)).size === validated.length,
    "duplicate run/attempt sample");
  requireValue(new Set(validated.map((sample) => sample.campaignSlot)).size === REQUIRED_QUALIFICATION_SAMPLES,
    "duplicate campaign slot");
  requireValue(new Set(validated.map((sample) => sample.artifact.artifactId)).size === REQUIRED_QUALIFICATION_SAMPLES,
    "duplicate aggregate artifact");
  for (let index = 1; index < validated.length; index += 1) {
    requireValue(Date.parse(validated[index].providerInterval.startedAt)
      >= Date.parse(validated[index - 1].providerInterval.completedAt),
    `sample ${index + 1} overlaps sample ${index} provider work`);
  }
  const values = (field) => validated.map((sample) => sample.metrics[field]);
  const retryRates = validated.map((sample) => sample.retry.retryRate);
  const parallelCostRatios = validated.map((sample) => Number((sample.metrics.parallelJobWallMs
    / Math.max(1, sample.metrics.serialJobWallMs)).toFixed(6)));
  const wallReductionRatios = validated.map((sample) => Number((sample.metrics.parallelDecisionWallMs
    / Math.max(1, sample.metrics.serialDecisionWallMs)).toFixed(6)));
  const payload = { format: "tearbench-canary-qualification-report", schemaVersion: 1, generatedAt,
    canonicalReleaseAuthority: false, requiredSampleCount: REQUIRED_QUALIFICATION_SAMPLES,
    expected: declared, source: declared.source, planDigest: declared.planDigest, shardPlanDigest: declared.shardPlanDigest,
    status: validated.every((sample) => sample.equivalent) ? "complete-equivalent-cohort" : "rejected-cohort",
    samples: validated,
    summaries: {
      parallelDecisionWallMs: summary(values("parallelDecisionWallMs")),
      serialDecisionWallMs: summary(values("serialDecisionWallMs")),
      parallelCriticalPathMs: summary(values("parallelCriticalPathMs")),
      serialCriticalPathMs: summary(values("serialCriticalPathMs")),
      parallelJobWallMs: summary(values("parallelJobWallMs")),
      serialJobWallMs: summary(values("serialJobWallMs")),
      experimentJobWallMs: summary(values("experimentJobWallMs")),
      experimentWallMs: summary(values("experimentWallMs")),
      parallelSetupMs: summary(values("parallelSetupMs")),
      serialSetupMs: summary(values("serialSetupMs")),
      browserShardBalanceRatio: summary(values("browserShardBalanceRatio")),
      parallelMaxDispatchWaitMs: summary(values("parallelMaxDispatchWaitMs")),
      serialMaxDispatchWaitMs: summary(values("serialMaxDispatchWaitMs")),
      retryRate: summary(retryRates),
      parallelToSerialJobCostRatio: summary(parallelCostRatios),
      parallelToSerialDecisionWallRatio: summary(wallReductionRatios),
      initialFailures: validated.reduce((total, sample) => total + sample.retry.initialFailures, 0),
      totalRetries: validated.reduce((total, sample) => total + sample.retry.retries, 0),
      recoveredFlakes: validated.reduce((total, sample) => total + sample.retry.recoveredFlakes, 0),
      repeatedFailures: validated.reduce((total, sample) => total + sample.retry.repeatedFailures, 0),
    },
    limitations: [
      "This report aggregates exact protected samples but is not a release certificate or billing attestation",
      "ubuntu-latest is a mutable hosted-runner label; exact runner names are retained per sample",
      "No wall-time, flake, queue, shard-balance or runner-cost acceptance threshold is invented by this report",
      "A complete equivalent cohort does not prove planted-failure rejection or authorize required-check cutover",
    ] };
  return Object.freeze({ ...payload, reportDigest: receiptSha256(payload) });
}

function manifestPath(base, value, label) {
  requireValue(typeof value === "string" && value.length > 0, `missing ${label} path`);
  const path = resolve(base, value), local = relative(base, path);
  requireValue(!isAbsolute(value) && local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local),
    `${label} path escapes the manifest directory`);
  return path;
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  if (args.length !== 4) throw new TypeError("usage: node scripts/tearbench-canary-qualification-report.mjs --manifest path --artifact path");
  for (let index = 0; index < args.length; index += 2) {
    requireValue(["--manifest", "--artifact"].includes(args[index]) && values[args[index]] === undefined, "invalid arguments");
    values[args[index]] = args[index + 1];
  }
  const manifestFile = resolve(values["--manifest"]), manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  requireValue(manifest?.format === "tearbench-canary-qualification-input" && manifest.schemaVersion === 2
    && Array.isArray(manifest.samples), "invalid manifest");
  const base = dirname(manifestFile);
  const json = async (sample, field) => JSON.parse(await readFile(manifestPath(base, sample[field], field), "utf8"));
  const samples = await Promise.all(manifest.samples.map(async (sample) => {
    const archive = await readFile(manifestPath(base, sample.artifactArchive, "artifactArchive"));
    return {
      run: await json(sample, "run"),
      jobs: await json(sample, "jobs"),
      shardPlan: await json(sample, "shardPlan"),
      parityReport: await json(sample, "parityReport"),
      providerMetrics: await json(sample, "providerMetrics"),
      artifact: { metadata: await json(sample, "artifactMetadata"),
        archiveSha256: createHash("sha256").update(archive).digest("hex") },
    };
  }));
  const report = createCanaryQualificationReport({ samples, expected: manifest.expected,
    generatedAt: new Date().toISOString() });
  const output = resolve(values["--artifact"]); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(`${report.status.toUpperCase()} ${report.reportDigest}`);
  if (report.status !== "complete-equivalent-cohort") process.exitCode = 1;
}
