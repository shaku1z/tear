import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createPairedPerformanceReport } from "../scripts/tearbench-paired-performance-report.mjs";

const baseline = "a".repeat(40), candidate = "b".repeat(40);
const workflowRevision = "f".repeat(40);
const browserVersion = "152.0.7977.64", browserArchiveSha256 = "c".repeat(64);

function build(revision, identity) {
  return { format: "tear-build-info", schemaVersion: 1, target: "standalone", mode: "test-standalone",
    sha: revision, sourceRevision: revision, sourceState: "clean", sourceFingerprint: "d".repeat(64), artifactHash: identity.repeat(64),
    buildIdentityDigest: identity.repeat(64), toolchain: { digest: "e".repeat(64) }, configuration: { digest: "f".repeat(64) } };
}

function measurement(simulationP95Ms) {
  return { simulation: { p95Ms: simulationP95Ms }, render: { p95Ms: 3 }, frame: { p95Ms: 14 },
    frameInterval: { p99Ms: 150 }, outsideFrameWork: { p99Ms: 140 }, newLongTasks: 0 };
}

async function fixture(values, callback) {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-paired-performance-"));
  try {
    await Promise.all([
      writeFile(resolve(directory, "baseline-build-info.json"), JSON.stringify(build(baseline, "1"))),
      writeFile(resolve(directory, "candidate-build-info.json"), JSON.stringify(build(candidate, "2"))),
      ...["baseline", "candidate"].flatMap((side) => values[side].flatMap((value, offset) => {
        const prefix = resolve(directory, `${side}-${offset + 1}`);
        const sideBuild = build(side === "baseline" ? baseline : candidate, side === "baseline" ? "1" : "2");
        const performanceBuild = { sourceRevision: sideBuild.sourceRevision, sourceFingerprint: sideBuild.sourceFingerprint,
          artifactHash: sideBuild.artifactHash, buildIdentityDigest: sideBuild.buildIdentityDigest };
        const stdout = [JSON.stringify({ performanceBuild }),
          JSON.stringify({ browserRuntime: { version: browserVersion, archiveSha256: browserArchiveSha256 } }),
          JSON.stringify({ scenario: "4x constrained gameplay", measurements: measurement(value) })].join("\n");
        return [writeFile(`${prefix}.stdout`, stdout), writeFile(`${prefix}.stderr`, value > 10
          ? `AssertionError: 4x constrained gameplay simulation p95 ms: ${value} exceeded budget 10` : ""),
        writeFile(`${prefix}.status`, value > 10 ? "1\n" : "0\n")];
      })),
    ]);
    await callback(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const verdantBudget = {
  mode: "boss-test", durationMs: 8000, minimumSamples: 300, minimumCollectionRateFps: 8,
  simulationP95Ms: 6, renderP95Ms: 14, frameP95Ms: 16.67, frameIntervalP99Ms: 34,
  frameIntervalMaxMs: 50, newLongTasksMax: 0,
  ceilings: { enemies: 8, projectiles: 128, effects: 320, fields: 6, combatObjects: 12, routes: 4 },
};

function timing({ p95Ms = 3, p99Ms = p95Ms, maxMs = p99Ms, samples = 310 } = {}) {
  return { samples, p50Ms: Math.min(1, p95Ms), p95Ms, p99Ms, maxMs };
}

function verdantMeasurement(overrides = {}) {
  return {
    simulation: timing(), render: timing({ p95Ms: 2 }), frame: timing({ p95Ms: 5 }),
    frameInterval: timing({ p95Ms: 25, p99Ms: 30, maxMs: 33 }),
    outsideFrameWork: timing({ p95Ms: 20, p99Ms: 24, maxMs: 27 }),
    backingStore: { width: 1600, height: 900, cssWidth: 1600, cssHeight: 900, devicePixelRatio: 1 },
    newLongTasks: 0,
    peakGauges: { enemies: 4, projectiles: 2, effects: 16, fields: 4, combatObjects: 8, routes: 2 },
    peakEnvironmentKinds: { "bloom-well:active": 3, "graft-anchor:active": 3, "root-link:active": 4 },
    ...overrides,
  };
}

function verdantSample(measurements = verdantMeasurement(), assertion = "") {
  return { measurements, assertion, exitCode: assertion === "" ? 0 : 1 };
}

async function verdantFixture(samples, callback) {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-paired-verdant-"));
  try {
    const budgetFile = JSON.stringify({ schemaVersion: 1, verdantGameplay: verdantBudget });
    await Promise.all([
      writeFile(resolve(directory, "baseline-build-info.json"), JSON.stringify(build(baseline, "1"))),
      writeFile(resolve(directory, "candidate-build-info.json"), JSON.stringify(build(candidate, "2"))),
      writeFile(resolve(directory, "baseline-browser-performance-budgets.json"), budgetFile),
      writeFile(resolve(directory, "candidate-browser-performance-budgets.json"), budgetFile),
      ...["baseline", "candidate"].flatMap((side) => samples[side].flatMap((sample, offset) => {
        const prefix = resolve(directory, `${side}-${offset + 1}`);
        const sideBuild = build(side === "baseline" ? baseline : candidate, side === "baseline" ? "1" : "2");
        const performanceBuild = { sourceRevision: sideBuild.sourceRevision, sourceFingerprint: sideBuild.sourceFingerprint,
          artifactHash: sideBuild.artifactHash, buildIdentityDigest: sideBuild.buildIdentityDigest };
        const stdout = [JSON.stringify({ performanceBuild }),
          JSON.stringify({ browserRuntime: { version: browserVersion, archiveSha256: browserArchiveSha256 } }),
          JSON.stringify({ scenario: "Verdant gameplay", measurements: sample.measurements })].join("\n");
        return [writeFile(`${prefix}.stdout`, stdout), writeFile(`${prefix}.stderr`, sample.assertion),
          writeFile(`${prefix}.status`, `${sample.exitCode}\n`)];
      })),
    ]);
    await callback(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("paired diagnostic distinguishes a persistent baseline miss from a candidate regression", async () => {
  for (const [values, outcome] of [
    [{ baseline: [11.3, 11.8, 12.1], candidate: [11.9, 12.2, 12.4] }, "pre-existing-budget-miss"],
    [{ baseline: [8.8, 9.2, 9.9], candidate: [10.8, 11.4, 12] }, "candidate-regression-plausible"],
    [{ baseline: [9.8, 10.2, 10.5], candidate: [10.1, 10.4, 10.7] }, "inconclusive"],
  ]) await fixture(values, async (directory) => {
    const report = createPairedPerformanceReport({ directory, baselineRevision: baseline, candidateRevision: candidate,
      browserVersion, browserArchiveSha256, scenarioKey: "constrained", workflowRevision });
    assert.equal(report.outcome, outcome);
    assert.equal(report.sampleCountPerRevision, 3);
    assert.equal(report.results.baseline.simulationP95Ms.p50, [...values.baseline].sort((a, b) => a - b)[1]);
    assert.equal(report.results.candidate.simulationP95Ms.p95, Math.max(...values.candidate));
    assert.match(report.reportDigest, /^[0-9a-f]{64}$/u);
  });
});

test("paired diagnostic accepts benchmark budget assertions captured on stdout", async () => fixture({
  baseline: [11.5, 11.3, 11.2], candidate: [10.9, 11.9, 11.4],
}, async (directory) => {
  for (const side of ["baseline", "candidate"]) {
    for (const index of [1, 2, 3]) {
      const prefix = resolve(directory, `${side}-${index}`);
      const assertion = await readFile(`${prefix}.stderr`, "utf8");
      const stdout = await readFile(`${prefix}.stdout`, "utf8");
      await writeFile(`${prefix}.stdout`, `${stdout}\n${assertion}\n`);
      await writeFile(`${prefix}.stderr`, "");
    }
  }
  const report = createPairedPerformanceReport({ directory, baselineRevision: baseline, candidateRevision: candidate,
    browserVersion, browserArchiveSha256, scenarioKey: "constrained", workflowRevision });
  assert.equal(report.outcome, "pre-existing-budget-miss");
}));

test("paired diagnostic rejects missing or stale budget assertions", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion, browserArchiveSha256,
    scenarioKey: "constrained", workflowRevision };
  const stderr = resolve(directory, "baseline-1.stderr");
  await writeFile(stderr, "");
  assert.throws(() => createPairedPerformanceReport(input), /outside its measured simulation budget assertion/u);
  await writeFile(stderr, "AssertionError: 4x constrained gameplay simulation p95 ms: 99 exceeded budget 10");
  assert.throws(() => createPairedPerformanceReport(input), /outside its measured simulation budget assertion/u);
  await writeFile(stderr, "");
  await writeFile(resolve(directory, "baseline-1.status"), "0\n");
  assert.throws(() => createPairedPerformanceReport(input), /outside its measured simulation budget assertion/u);
}));

test("paired diagnostic rejects wrong revisions, browsers, and incomplete samples", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion, browserArchiveSha256,
    scenarioKey: "constrained", workflowRevision };
  assert.throws(() => createPairedPerformanceReport({ ...input, candidateRevision: baseline }), /must differ/u);
  assert.throws(() => createPairedPerformanceReport({ ...input, workflowRevision: "main" }), /workflow revision/u);
  assert.throws(() => createPairedPerformanceReport({ ...input, browserVersion: "latest" }), /browser binding/u);
  await writeFile(resolve(directory, "candidate-3.stdout"), "{}");
  assert.throws(() => createPairedPerformanceReport(input), /lacks one attributable build/u);
}));

test("paired diagnostic rejects a measurement attributed to another build", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const path = resolve(directory, "candidate-2.stdout");
  const stdout = await readFile(path, "utf8");
  await writeFile(path, stdout.replace(`"artifactHash":"${"2".repeat(64)}"`, `"artifactHash":"${"3".repeat(64)}"`));
  assert.throws(() => createPairedPerformanceReport({ directory, baselineRevision: baseline, candidateRevision: candidate,
    browserVersion, browserArchiveSha256, scenarioKey: "constrained", workflowRevision }),
  /does not match its validated build identity/u);
}));

test("Verdant paired diagnostic preserves full measurements and classifies bounded outcomes", async () => {
  const pass = () => verdantSample();
  const frameRegression = () => verdantSample(verdantMeasurement({ frame: timing({ p95Ms: 18, p99Ms: 19, maxMs: 20 }) }),
    "AssertionError [ERR_ASSERTION]: Verdant frame-work p95 ms: 18 exceeded budget 16.67");
  const outsideBoundary = () => verdantSample(verdantMeasurement({
    frameInterval: timing({ p95Ms: 33, p99Ms: 51, maxMs: 51 }),
    outsideFrameWork: timing({ p95Ms: 31, p99Ms: 45, maxMs: 47 }),
  }), "AssertionError [ERR_ASSERTION]: Verdant frame-interval p99 ms: 51 exceeded budget 34");
  const dominanceBoundary = (outsideP99Ms) => verdantSample(verdantMeasurement({
    frameInterval: timing({ p95Ms: 33, p99Ms: 52, maxMs: 52 }),
    outsideFrameWork: timing({ p95Ms: 31, p99Ms: outsideP99Ms, maxMs: outsideP99Ms }),
  }), "AssertionError [ERR_ASSERTION]: Verdant frame-interval p99 ms: 52 exceeded budget 34");
  for (const [samples, outcome] of [
    [{ baseline: [pass(), pass(), pass()], candidate: [pass(), pass(), pass()] }, "both-within-budget"],
    [{ baseline: [pass(), pass(), pass()], candidate: [frameRegression(), frameRegression(), frameRegression()] },
      "candidate-regression-plausible"],
    [{ baseline: [outsideBoundary(), outsideBoundary(), outsideBoundary()],
      candidate: [outsideBoundary(), outsideBoundary(), outsideBoundary()] }, "shared-provider-boundary"],
    [{ baseline: [dominanceBoundary(39), dominanceBoundary(39), dominanceBoundary(39)],
      candidate: [dominanceBoundary(39), dominanceBoundary(39), dominanceBoundary(39)] }, "shared-provider-boundary"],
    [{ baseline: [dominanceBoundary(38.948), dominanceBoundary(38.948), dominanceBoundary(38.948)],
      candidate: [dominanceBoundary(38.948), dominanceBoundary(38.948), dominanceBoundary(38.948)] }, "inconclusive"],
    [{ baseline: [pass(), pass(), pass()],
      candidate: [outsideBoundary(), outsideBoundary(), outsideBoundary()] }, "inconclusive"],
    [{ baseline: [pass(), outsideBoundary(), pass()], candidate: [pass(), frameRegression(), pass()] }, "inconclusive"],
  ]) await verdantFixture(samples, async (directory) => {
    const report = createPairedPerformanceReport({ directory, baselineRevision: baseline, candidateRevision: candidate,
      browserVersion, browserArchiveSha256, scenarioKey: "verdant", workflowRevision });
    assert.equal(report.scenarioKey, "verdant");
    assert.equal(report.scenario, "Verdant gameplay");
    assert.equal(report.workflowRevision, workflowRevision);
    assert.equal(report.outcome, outcome);
    assert.deepEqual(report.results.baseline.samples[0].measurements, samples.baseline[0].measurements);
    assert.equal(report.canonicalReleaseAuthority, false);
  });
});

test("Verdant paired diagnostic rejects wrong scenarios, missing evidence, stale assertions, and budget drift", async () => {
  const intervalFailure = verdantSample(verdantMeasurement({
    frameInterval: timing({ p95Ms: 33, p99Ms: 51, maxMs: 51 }),
    outsideFrameWork: timing({ p95Ms: 31, p99Ms: 45, maxMs: 47 }),
  }), "AssertionError [ERR_ASSERTION]: Verdant frame-interval p99 ms: 51 exceeded budget 34");
  await verdantFixture({ baseline: [intervalFailure, intervalFailure, intervalFailure],
    candidate: [intervalFailure, intervalFailure, intervalFailure] }, async (directory) => {
    const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion,
      browserArchiveSha256, scenarioKey: "verdant", workflowRevision };
    const path = resolve(directory, "baseline-1.stdout");
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace("Verdant gameplay", "4x constrained gameplay"));
    assert.throws(() => createPairedPerformanceReport(input), /Verdant gameplay measurement/u);
    await writeFile(path, original.replace(/"outsideFrameWork":\{[^}]+\},/u, ""));
    assert.throws(() => createPairedPerformanceReport(input), /outside-frame work/u);
    await writeFile(path, original.replace("root-link:active", "unrelated:active"));
    assert.throws(() => createPairedPerformanceReport(input), /environment-kind counters/u);
    await writeFile(path, original.replace('"p99Ms":45,"maxMs":47', '"p99Ms":52,"maxMs":52'));
    assert.throws(() => createPairedPerformanceReport(input), /outside-frame work exceeds its frame interval/u);
    await writeFile(path, original);
    await writeFile(resolve(directory, "baseline-1.stderr"),
      "AssertionError [ERR_ASSERTION]: Verdant frame-interval p99 ms: 99 exceeded budget 34");
    assert.throws(() => createPairedPerformanceReport(input), /exact first measured assertion/u);
    const budgetPath = resolve(directory, "candidate-browser-performance-budgets.json");
    const drifted = JSON.parse(await readFile(budgetPath, "utf8"));
    drifted.verdantGameplay.frameIntervalP99Ms = 35;
    await writeFile(budgetPath, JSON.stringify(drifted));
    assert.throws(() => createPairedPerformanceReport(input), /unchanged performance budget/u);
  });
});
