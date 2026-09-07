import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createPairedPerformanceReport } from "../scripts/tearbench-paired-performance-report.mjs";

const baseline = "a".repeat(40), candidate = "b".repeat(40);
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
        const stdout = [JSON.stringify({ browserRuntime: { version: browserVersion, archiveSha256: browserArchiveSha256 } }),
          JSON.stringify({ scenario: "4x constrained gameplay", measurements: measurement(value) })].join("\n");
        return [writeFile(`${prefix}.stdout`, stdout), writeFile(`${prefix}.stderr`, value > 10
          ? `AssertionError: 4x constrained gameplay simulation p95 ms: ${value} exceeded budget 10` : ""),
        writeFile(`${prefix}.status`, value > 10 ? "1\n" : "0\n")];
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
      browserVersion, browserArchiveSha256 });
    assert.equal(report.outcome, outcome);
    assert.equal(report.sampleCountPerRevision, 3);
    assert.equal(report.results.baseline.simulationP95Ms.p50, [...values.baseline].sort((a, b) => a - b)[1]);
    assert.equal(report.results.candidate.simulationP95Ms.p95, Math.max(...values.candidate));
    assert.match(report.reportDigest, /^[0-9a-f]{64}$/u);
  });
});

test("paired diagnostic rejects wrong revisions, browsers, and incomplete samples", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion, browserArchiveSha256 };
  assert.throws(() => createPairedPerformanceReport({ ...input, candidateRevision: baseline }), /must differ/u);
  assert.throws(() => createPairedPerformanceReport({ ...input, browserVersion: "latest" }), /browser binding/u);
  await writeFile(resolve(directory, "candidate-3.stdout"), "{}");
  assert.throws(() => createPairedPerformanceReport(input), /lacks one attributable/u);
}));
