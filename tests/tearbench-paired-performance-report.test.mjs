import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    browserVersion, browserArchiveSha256 });
  assert.equal(report.outcome, "pre-existing-budget-miss");
}));

test("paired diagnostic rejects missing or stale budget assertions", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion, browserArchiveSha256 };
  const stderr = resolve(directory, "baseline-1.stderr");
  await writeFile(stderr, "");
  assert.throws(() => createPairedPerformanceReport(input), /outside its measured simulation budget assertion/u);
  await writeFile(stderr, "AssertionError: 4x constrained gameplay simulation p95 ms: 99 exceeded budget 10");
  assert.throws(() => createPairedPerformanceReport(input), /outside its measured simulation budget assertion/u);
}));

test("paired diagnostic rejects wrong revisions, browsers, and incomplete samples", async () => fixture({
  baseline: [11, 11, 11], candidate: [12, 12, 12],
}, async (directory) => {
  const input = { directory, baselineRevision: baseline, candidateRevision: candidate, browserVersion, browserArchiveSha256 };
  assert.throws(() => createPairedPerformanceReport({ ...input, candidateRevision: baseline }), /must differ/u);
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
    browserVersion, browserArchiveSha256 }), /does not match its validated build identity/u);
}));
