import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { createCanaryProviderMetrics } from "../scripts/tearbench-canary-report.mjs";
import { createCanaryQualificationReport, QUALIFICATION_RUNTIME,
  REQUIRED_QUALIFICATION_SAMPLES } from "../scripts/tearbench-canary-qualification-report.mjs";
import { receiptSha256 } from "../scripts/tearbench-task-receipts.mjs";

const SOURCE = Object.freeze({ revision: "a".repeat(40), state: "clean", fingerprint: "b".repeat(64),
  worktreeFingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" });
const PLAN_DIGEST = "c".repeat(64);
const START = Date.parse("2026-09-08T00:00:00Z");
const REPORT_TIME = "2026-09-08T04:00:00Z";

function signed(payload, field = "reportDigest") { return { ...payload, [field]: receiptSha256(payload) }; }
function iso(milliseconds) { return new Date(START + milliseconds).toISOString(); }
function archiveBytes(index) { return Buffer.from(`qualification-archive-${index}`, "utf8"); }
function archiveDigest(index) { return createHash("sha256").update(archiveBytes(index)).digest("hex"); }

function shardPlanFixture() {
  return signed({ format: "tearbench-canary-shard-plan", schemaVersion: 1, planDigest: PLAN_DIGEST,
    buildShard: { shardId: "build-1", taskIds: [] }, browserShards: [{ shardId: "browser-1", taskIds: ["one"] }],
    coreShards: [{ shardId: "core-1", taskIds: ["two"] }],
    performanceShard: { shardId: "performance-1", taskIds: [] }, serialShard: { shardId: "serial-1", taskIds: [] } },
  "shardPlanDigest");
}

function retryEntry(taskId, retry = false) {
  const firstDigest = receiptSha256({ taskId, attemptNumber: 1 });
  return { taskId, disposition: retry ? "recovered-flaky" : "passed-first-attempt",
    attempts: retry ? [
      { attemptNumber: 1, status: "failed", receiptDigest: firstDigest, retryOf: null,
        retryAuthorization: null, sampleValidity: null },
      { attemptNumber: 2, status: "passed", receiptDigest: receiptSha256({ taskId, attemptNumber: 2 }),
        retryOf: firstDigest, retryAuthorization: "bounded-fixture-retry", sampleValidity: null },
    ] : [{ attemptNumber: 1, status: "passed", receiptDigest: firstDigest, retryOf: null,
      retryAuthorization: null, sampleValidity: null }] };
}

function rawJob(runId, jobId, name, start, end, conclusion = "success") {
  return { id: jobId, run_id: runId, run_attempt: 1, head_sha: SOURCE.revision, name,
    status: "completed", conclusion, started_at: iso(start), completed_at: iso(end), labels: ["ubuntu-latest"],
    runner_id: 1000000000 + jobId, runner_name: `GitHub Actions ${1000000000 + jobId}`,
    runner_group_id: 0, runner_group_name: "GitHub Actions" };
}

function rawEvidence(index, equivalent) {
  const offset = (index - 1) * 1500000;
  const runId = 9000 + index, ordinaryEnd = 300000 + index * 10000, performanceEnd = ordinaryEnd + 120000;
  const serialEnd = performanceEnd + 600000 + index * 10000, certSerialEnd = serialEnd + 60000;
  const aggregateEnd = certSerialEnd + 60000, runEnd = aggregateEnd + 60000;
  const run = { id: runId, run_attempt: 1, name: "TearBench Parallel Canary", head_branch: "main",
    head_sha: SOURCE.revision, repository: { full_name: "shaku1z/tear" },
    path: ".github/workflows/tearbench-canary.yml", event: "workflow_dispatch", status: "completed",
    conclusion: equivalent ? "success" : "failure", created_at: iso(offset), updated_at: iso(offset + runEnd) };
  const at = (milliseconds) => offset + milliseconds;
  const ranges = [
    ["plan", at(0), at(60000)], ["build", at(60000), at(180000)],
    ["browser (browser-1)", at(180000), at(ordinaryEnd)], ["core (core-1)", at(180000), at(ordinaryEnd - 10000)],
    ["performance", at(ordinaryEnd), at(performanceEnd)],
    ["certify-parallel", at(performanceEnd), at(performanceEnd + 60000)],
    ["serial", at(performanceEnd), at(serialEnd)], ["certify-serial", at(serialEnd), at(certSerialEnd)],
    ["aggregate", at(certSerialEnd), at(aggregateEnd)],
  ];
  const jobs = { total_count: 11, jobs: ranges.map(([name, start, end], jobIndex) =>
    rawJob(runId, runId * 100 + jobIndex, name, start, end,
      !equivalent && name === "aggregate" ? "failure" : "success")) };
  jobs.jobs.push(rawJob(runId, runId * 100 + 9, "simulation-boundary", offset, offset, "skipped"));
  jobs.jobs.push(rawJob(runId, runId * 100 + 10, "paired-performance", offset, offset, "skipped"));
  return { run, jobs, aggregateAt: at(aggregateEnd), providerGeneratedAt: at(runEnd + 60000) };
}

function sampleFixture(index, { equivalent = true } = {}) {
  const shardPlan = shardPlanFixture();
  const { run, jobs, aggregateAt, providerGeneratedAt } = rawEvidence(index, equivalent);
  const parityReport = signed({ format: "tearbench-canary-parity-report", schemaVersion: 3,
    generatedAt: iso(aggregateAt), campaignSlot: `sample-${index}`,
    status: equivalent ? "equivalent" : "mismatched", planDigest: PLAN_DIGEST,
    shardPlanDigest: shardPlan.shardPlanDigest, source: SOURCE,
    providerOrigin: { kind: "github-actions", repository: "shaku1z/tear", workflow: "TearBench Parallel Canary",
      runId: String(9000 + index), attempt: 1 }, plantedFailureTaskId: null,
    taskParity: { required: 2, serial: 2, parallel: 2 }, claimParity: { serial: ["a", "b"], parallel: ["a", "b"] },
    retryHistory: { serial: [retryEntry("one"), retryEntry("two")],
      parallel: [retryEntry("one"), retryEntry("two", index === 3)] },
    metrics: { serial: { criticalPathMs: 900000 + index * 1000, setupMs: 50000 + index },
      parallel: { criticalPathMs: 360000 + index * 1000, setupMs: 80000 + index },
      browserShardBalanceRatio: 1 + index / 100 }, errors: equivalent ? [] : ["performance failed"] });
  const providerMetrics = createCanaryProviderMetrics({ run, jobs, parityReport, shardPlan,
    generatedAt: iso(providerGeneratedAt) });
  const digest = archiveDigest(index), artifactId = 7000 + index;
  const artifact = { archiveSha256: digest, metadata: { id: artifactId,
    node_id: Buffer.from(`artifact:${artifactId}`).toString("base64"),
    name: `tearbench-canary-aggregate-${run.id}-1`, size_in_bytes: archiveBytes(index).length, expired: false,
    url: `https://api.github.com/repos/shaku1z/tear/actions/artifacts/${artifactId}`,
    archive_download_url: `https://api.github.com/repos/shaku1z/tear/actions/artifacts/${artifactId}/zip`,
    digest: `sha256:${digest}`, created_at: iso(aggregateAt), updated_at: iso(aggregateAt),
    workflow_run: { id: run.id, head_branch: "main", head_sha: SOURCE.revision,
      repository_id: 1, head_repository_id: 1 } } };
  return { run, jobs, shardPlan, parityReport, providerMetrics, artifact };
}

function expectedFixture() {
  return { repository: "shaku1z/tear", workflow: "TearBench Parallel Canary", headBranch: "main", source: SOURCE,
    planDigest: PLAN_DIGEST, shardPlanDigest: shardPlanFixture().shardPlanDigest, taskCount: 2,
    runtime: QUALIFICATION_RUNTIME };
}

function cohort() {
  return Array.from({ length: REQUIRED_QUALIFICATION_SAMPLES }, (_, index) => sampleFixture(index + 1));
}

function rebuildProvider(sample) {
  sample.providerMetrics = createCanaryProviderMetrics({ run: sample.run, jobs: sample.jobs,
    parityReport: sample.parityReport, shardPlan: sample.shardPlan, generatedAt: sample.providerMetrics.generatedAt });
}

test("five exact samples replay raw provider evidence and produce nearest-rank summaries", () => {
  const report = createCanaryQualificationReport({ samples: cohort(), expected: expectedFixture(),
    generatedAt: REPORT_TIME });
  assert.equal(report.status, "complete-equivalent-cohort");
  assert.equal(report.canonicalReleaseAuthority, false);
  assert.equal(report.samples.length, 5);
  assert.equal(report.summaries.parallelDecisionWallMs.p50, 510000);
  assert.equal(report.summaries.parallelDecisionWallMs.p95, 530000);
  assert.equal(report.summaries.initialFailures, 1);
  assert.equal(report.summaries.totalRetries, 1);
  assert.equal(report.summaries.recoveredFlakes, 1);
  assert.equal(report.summaries.retryRate.maximum, 0.25);
  assert.equal(report.samples[0].runnerJobs.length, 9);
  assert.equal(report.reportDigest, receiptSha256(Object.fromEntries(Object.entries(report)
    .filter(([key]) => key !== "reportDigest"))));
});

test("a complete failed normal sample rejects the cohort without hiding measurements", () => {
  const samples = cohort(); samples[2] = sampleFixture(3, { equivalent: false });
  const report = createCanaryQualificationReport({ samples, expected: expectedFixture(),
    generatedAt: REPORT_TIME });
  assert.equal(report.status, "rejected-cohort");
  assert.equal(report.samples[2].equivalent, false);
  assert.equal(report.summaries.parallelDecisionWallMs.values.length, 5);
});

test("qualification rejects incomplete, duplicate, cross-plan, altered, and unbound cohorts", () => {
  const mutations = [
    (samples) => samples.pop(),
    (samples) => { samples[4] = globalThis.structuredClone(samples[0]); },
    (_samples, expected) => { expected.planDigest = "f".repeat(64); },
    (samples) => { samples[4].providerMetrics = globalThis.structuredClone(samples[4].providerMetrics);
      samples[4].providerMetrics.attempt = 2; resign(samples[4].providerMetrics); },
    (samples) => { samples[4].artifact.metadata.name = "wrong"; },
    (samples) => { const duplicateId = samples[3].artifact.metadata.id;
      samples[4].artifact.metadata.id = duplicateId;
      samples[4].artifact.metadata.url = `https://api.github.com/repos/shaku1z/tear/actions/artifacts/${duplicateId}`;
      samples[4].artifact.metadata.archive_download_url = `${samples[4].artifact.metadata.url}/zip`; },
    (samples) => { samples[4].providerMetrics = globalThis.structuredClone(samples[4].providerMetrics);
      samples[4].providerMetrics.parallelDecisionWallMs += 1; resign(samples[4].providerMetrics); },
    (samples) => { samples[4].jobs.jobs.pop(); samples[4].jobs.total_count -= 1; },
    (samples) => { samples[4].jobs.jobs[0].labels = ["self-hosted"]; },
    (samples) => { samples[4].run.head_branch = "codex/not-main"; rebuildProvider(samples[4]); },
    (samples) => { samples[4].artifact.archiveSha256 = "0".repeat(64); },
    (samples) => { shiftSample(samples[4], -1500000); rebuildProvider(samples[4]); },
  ];
  for (const mutate of mutations) {
    const samples = cohort(), expected = globalThis.structuredClone(expectedFixture()); mutate(samples, expected);
    assert.throws(() => createCanaryQualificationReport({ samples, expected,
      generatedAt: REPORT_TIME }), /canary qualification:|canary provider metrics:/u);
  }
});

test("qualification rejects planted, duplicate-slot, malformed retry, and invalid balance evidence", () => {
  const mutations = [
    (sample) => { sample.parityReport.plantedFailureTaskId = "one"; },
    (sample) => { sample.parityReport.campaignSlot = "sample-4"; },
    (sample) => { sample.parityReport.retryHistory.parallel[0].attempts[0].attemptNumber = 2; },
    (sample) => { sample.parityReport.retryHistory.parallel[0].disposition = "recovered-flaky"; },
    (sample) => { sample.parityReport.metrics.browserShardBalanceRatio = 0.99; },
  ];
  for (const mutate of mutations) {
    const samples = cohort(), sample = samples[4]; mutate(sample); resign(sample.parityReport); rebuildProvider(sample);
    assert.throws(() => createCanaryQualificationReport({ samples, expected: expectedFixture(),
      generatedAt: REPORT_TIME }), /canary qualification:/u);
  }
});

test("qualification CLI verifies archive bytes and refuses to overwrite its report", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-qualification-"));
  try {
    const manifest = { format: "tearbench-canary-qualification-input", schemaVersion: 2,
      expected: expectedFixture(), samples: [] };
    for (const [index, sample] of cohort().entries()) {
      const number = index + 1, sampleDirectory = resolve(directory, `sample-${number}`); await mkdir(sampleDirectory);
      const files = { run: sample.run, jobs: sample.jobs, shardPlan: sample.shardPlan, parityReport: sample.parityReport,
        providerMetrics: sample.providerMetrics, artifactMetadata: sample.artifact.metadata };
      for (const [name, value] of Object.entries(files)) {
        await writeFile(resolve(sampleDirectory, `${name}.json`), JSON.stringify(value));
      }
      await writeFile(resolve(sampleDirectory, "artifact.zip"), archiveBytes(number));
      manifest.samples.push(Object.fromEntries([...Object.keys(files).map((name) =>
        [name, `sample-${number}/${name}.json`]), ["artifactArchive", `sample-${number}/artifact.zip`]]));
    }
    const manifestFile = resolve(directory, "manifest.json"), output = resolve(directory, "report.json");
    await writeFile(manifestFile, JSON.stringify(manifest));
    const run = () => spawnSync(process.execPath, ["scripts/tearbench-canary-qualification-report.mjs", "--manifest", manifestFile,
      "--artifact", output], { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 10000 });
    const first = run(); assert.equal(first.status, 0, first.stderr); assert.match(first.stdout, /^COMPLETE-EQUIVALENT-COHORT /u);
    const bytes = await readFile(output, "utf8");
    const duplicate = run(); assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /EEXIST/u);
    assert.equal(await readFile(output, "utf8"), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function resign(value) {
  const { reportDigest, ...payload } = value;
  assert.equal(typeof reportDigest, "string"); value.reportDigest = receiptSha256(payload);
}

function shiftSample(sample, milliseconds) {
  const shift = (value) => new Date(Date.parse(value) + milliseconds).toISOString();
  sample.run.created_at = shift(sample.run.created_at); sample.run.updated_at = shift(sample.run.updated_at);
  for (const job of sample.jobs.jobs) {
    job.started_at = shift(job.started_at); job.completed_at = shift(job.completed_at);
  }
  sample.artifact.metadata.created_at = shift(sample.artifact.metadata.created_at);
  sample.artifact.metadata.updated_at = shift(sample.artifact.metadata.updated_at);
}
