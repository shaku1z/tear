import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createSimulationBoundaryReport } from "../scripts/tearbench-simulation-boundary-report.mjs";

const revision = "a".repeat(40);
const browserVersion = "152.0.7977.64", browserArchiveSha256 = "b".repeat(64);

function build() {
  return { format: "tear-build-info", schemaVersion: 1, target: "standalone", mode: "test-standalone",
    sha: revision, sourceRevision: revision, sourceState: "clean", sourceFingerprint: "c".repeat(64),
    artifactHash: "d".repeat(64), buildIdentityDigest: "e".repeat(64),
    toolchain: { digest: "f".repeat(64) }, configuration: { digest: "1".repeat(64) } };
}

async function fixture({ aggregateP95Ms, tickP95Ms }, callback) {
  const directory = await mkdtemp(resolve(tmpdir(), "tearbench-simulation-boundary-"));
  try {
    const identity = build();
    const measurement = {
      simulation: { samples: 302, p50Ms: 5.1, p95Ms: aggregateP95Ms, p99Ms: 15, maxMs: 24 },
      canonicalTick: { samples: 600, p50Ms: 1.1, p95Ms: tickP95Ms, p99Ms: tickP95Ms + 1, maxMs: tickP95Ms + 2 },
      simulationStepPoll: { observations: 90, histogram: { 1: 10, 2: 70, 3: 10 } },
      render: { samples: 302, p50Ms: 2.1, p95Ms: 3.3, p99Ms: 4, maxMs: 5 },
      frame: { samples: 302, p50Ms: 8, p95Ms: 14.2, p99Ms: 17, maxMs: 19 },
      frameInterval: { samples: 302, p50Ms: 16, p95Ms: 40, p99Ms: 50, maxMs: 75 },
      outsideFrameWork: { samples: 302, p50Ms: 1, p95Ms: 3, p99Ms: 5, maxMs: 8 },
      newLongTasks: 0,
      peakGauges: { enemies: 8, projectiles: 2, effects: 4 },
    };
    const stdout = [
      JSON.stringify({ performanceBuild: { sourceRevision: identity.sourceRevision,
        sourceFingerprint: identity.sourceFingerprint, artifactHash: identity.artifactHash,
        buildIdentityDigest: identity.buildIdentityDigest } }),
      JSON.stringify({ browserRuntime: { version: browserVersion, archiveSha256: browserArchiveSha256 } }),
      JSON.stringify({ scenario: "4x constrained gameplay", measurements: measurement }),
      ...(aggregateP95Ms > 10
        ? [`AssertionError [ERR_ASSERTION]: 4x constrained gameplay simulation p95 ms: ${aggregateP95Ms} exceeded budget 10`] : []),
    ].join("\n");
    await Promise.all([
      writeFile(resolve(directory, "candidate-build-info.json"), JSON.stringify(identity)),
      writeFile(resolve(directory, "candidate-browser-performance-budgets.json"), JSON.stringify({
        referenceProfile: { sampleCapacity: 600 },
        constrainedGameplay: { simulationP95Ms: 10, renderP95Ms: 14, frameP95Ms: 20,
          frameIntervalP99Ms: 50, frameIntervalMaxMs: 75, newLongTasksMax: 0, minimumSamples: 300 },
      })),
      writeFile(resolve(directory, "candidate.stdout"), stdout),
      writeFile(resolve(directory, "candidate.stderr"), ""),
      writeFile(resolve(directory, "candidate.status"), aggregateP95Ms > 10 ? "1\n" : "0\n"),
    ]);
    await callback(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const input = (directory) => ({ directory, revision, browserVersion, browserArchiveSha256 });

test("simulation boundary report distinguishes aggregate, tick, and reproduced-budget outcomes", async () => {
  for (const [values, outcome] of [
    [{ aggregateP95Ms: 11.4, tickP95Ms: 1.8 }, "aggregate-boundary-miss"],
    [{ aggregateP95Ms: 12, tickP95Ms: 10.5 }, "canonical-tick-miss"],
    [{ aggregateP95Ms: 9.8, tickP95Ms: 1.7 }, "aggregate-within-budget"],
  ]) await fixture(values, async (directory) => {
    const report = createSimulationBoundaryReport(input(directory));
    assert.equal(report.outcome, outcome);
    assert.equal(report.measurements.simulation.p95Ms, values.aggregateP95Ms);
    assert.equal(report.measurements.canonicalTick.p95Ms, values.tickP95Ms);
    assert.match(report.reportDigest, /^[0-9a-f]{64}$/u);
  });
});

test("simulation boundary report rejects a stale aggregate assertion", async () => fixture({
  aggregateP95Ms: 11.4, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate.stdout");
  const stdout = await readFile(path, "utf8");
  await writeFile(path, stdout.replace("simulation p95 ms: 11.4 exceeded budget 10",
    "simulation p95 ms: 99 exceeded budget 10"));
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /exact first measured constrained assertion/u);
}));

test("simulation boundary report rejects incomplete step evidence", async () => fixture({
  aggregateP95Ms: 11.4, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate.stdout");
  const lines = (await readFile(path, "utf8")).split("\n");
  const measured = JSON.parse(lines[2]);
  measured.measurements.simulationStepPoll = { observations: 0, histogram: {} };
  lines[2] = JSON.stringify(measured);
  await writeFile(path, lines.join("\n"));
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /step poll is incomplete/u);
}));

test("simulation boundary report rejects evidence from a different build", async () => fixture({
  aggregateP95Ms: 11.4, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate.stdout");
  const lines = (await readFile(path, "utf8")).split("\n");
  const emitted = JSON.parse(lines[0]);
  emitted.performanceBuild.sourceFingerprint = "9".repeat(64);
  lines[0] = JSON.stringify(emitted);
  await writeFile(path, lines.join("\n"));
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /validated build identity/u);
}));

test("simulation boundary report rejects candidate budget drift", async () => fixture({
  aggregateP95Ms: 11.4, tickP95Ms: 1.8,
}, async (directory) => {
  await writeFile(resolve(directory, "candidate-browser-performance-budgets.json"), JSON.stringify({
    referenceProfile: { sampleCapacity: 600 },
    constrainedGameplay: { simulationP95Ms: 12, renderP95Ms: 14, frameP95Ms: 20,
      frameIntervalP99Ms: 50, frameIntervalMaxMs: 75, newLongTasksMax: 0, minimumSamples: 300 },
  }));
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /unchanged candidate and reporter measurement contract/u);
}));

test("simulation boundary report rejects drift in a later constrained budget", async () => fixture({
  aggregateP95Ms: 9.8, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate-browser-performance-budgets.json");
  const candidateBudgets = JSON.parse(await readFile(path, "utf8"));
  candidateBudgets.constrainedGameplay.frameIntervalP99Ms = 60;
  await writeFile(path, JSON.stringify(candidateBudgets));
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /unchanged candidate and reporter measurement contract/u);
}));

test("simulation boundary report rejects empty status and incomplete timing coverage", async () => {
  await fixture({ aggregateP95Ms: 9.8, tickP95Ms: 1.8 }, async (directory) => {
    await writeFile(resolve(directory, "candidate.status"), "\n");
    assert.throws(() => createSimulationBoundaryReport(input(directory)), /invalid exit code/u);
  });
  await fixture({ aggregateP95Ms: 11.4, tickP95Ms: 1.8 }, async (directory) => {
    const path = resolve(directory, "candidate.stdout");
    const lines = (await readFile(path, "utf8")).split("\n");
    const measured = JSON.parse(lines[2]);
    measured.measurements.canonicalTick.samples = 599;
    lines[2] = JSON.stringify(measured);
    await writeFile(path, lines.join("\n"));
    assert.throws(() => createSimulationBoundaryReport(input(directory)), /canonical tick samples are incomplete/u);
  });
  await fixture({ aggregateP95Ms: 11.4, tickP95Ms: 1.8 }, async (directory) => {
    const path = resolve(directory, "candidate.stdout");
    const lines = (await readFile(path, "utf8")).split("\n");
    const measured = JSON.parse(lines[2]);
    delete measured.measurements.outsideFrameWork;
    lines[2] = JSON.stringify(measured);
    await writeFile(path, lines.join("\n"));
    assert.throws(() => createSimulationBoundaryReport(input(directory)), /outside-frame work samples are incomplete/u);
  });
});

test("simulation boundary report rejects a conflicting failure headline", async () => fixture({
  aggregateP95Ms: 11.4, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate.stderr");
  await writeFile(path, "Error: unrelated browser failure\n");
  assert.throws(() => createSimulationBoundaryReport(input(directory)), /exact first measured constrained assertion/u);
}));

test("simulation boundary report separates a later constrained failure from its aggregate outcome", async () => fixture({
  aggregateP95Ms: 9.8, tickP95Ms: 1.8,
}, async (directory) => {
  const path = resolve(directory, "candidate.stdout");
  const lines = (await readFile(path, "utf8")).split("\n");
  const measured = JSON.parse(lines[2]);
  measured.measurements.frameInterval.p99Ms = 100;
  measured.measurements.frameInterval.maxMs = 100.1;
  lines[2] = JSON.stringify(measured);
  lines.push("AssertionError [ERR_ASSERTION]: 4x constrained gameplay frame-interval p99 ms: 100 exceeded budget 50");
  await Promise.all([
    writeFile(path, lines.join("\n")),
    writeFile(resolve(directory, "candidate.status"), "1\n"),
  ]);
  const report = createSimulationBoundaryReport(input(directory));
  assert.equal(report.outcome, "aggregate-within-budget");
  assert.deepEqual(report.sampleAssessment, { status: "failed", failures: [{
    id: "frame-interval-p99", label: "4x constrained gameplay frame-interval p99 ms",
    actual: 100, budget: 50,
    assertion: "4x constrained gameplay frame-interval p99 ms: 100 exceeded budget 50",
  }, {
    id: "frame-interval-max", label: "4x constrained gameplay frame-interval max ms",
    actual: 100.1, budget: 75,
    assertion: "4x constrained gameplay frame-interval max ms: 100.1 exceeded budget 75",
  }] });
}));

test("simulation boundary report rejects duplicate or malformed measurements", async () => {
  await fixture({ aggregateP95Ms: 11.4, tickP95Ms: 1.8 }, async (directory) => {
    const path = resolve(directory, "candidate.stdout");
    const stdout = await readFile(path, "utf8");
    await writeFile(path, `${stdout}\n${stdout.split("\n")[2]}`);
    assert.throws(() => createSimulationBoundaryReport(input(directory)), /lacks one attributable/u);
  });
  await fixture({ aggregateP95Ms: 11.4, tickP95Ms: 1.8 }, async (directory) => {
    const path = resolve(directory, "candidate.stdout");
    const lines = (await readFile(path, "utf8")).split("\n");
    const measured = JSON.parse(lines[2]);
    measured.measurements.canonicalTick.p99Ms = 1;
    lines[2] = JSON.stringify(measured);
    await writeFile(path, lines.join("\n"));
    assert.throws(() => createSimulationBoundaryReport(input(directory)), /percentiles are not monotonic/u);
  });
});
