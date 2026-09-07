import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const budgets = JSON.parse(readFileSync(new URL("../config/browser-performance-budgets.json", import.meta.url), "utf8"));
const scenario = "4x constrained gameplay";
const sampleCount = 3;

function sha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`${label} must be an exact commit SHA`);
  return value;
}

function jsonLines(stdout) {
  return stdout.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function validateBuild(build, revision, side) {
  if (build?.format !== "tear-build-info" || build.schemaVersion !== 1 || build.target !== "standalone"
    || build.mode !== "test-standalone" || build.sha !== revision || build.sourceRevision !== revision
    || build.sourceState !== "clean" || !/^[0-9a-f]{64}$/u.test(build.sourceFingerprint ?? "")
    || !/^[0-9a-f]{64}$/u.test(build.artifactHash ?? "")
    || !/^[0-9a-f]{64}$/u.test(build.buildIdentityDigest ?? "")
    || !/^[0-9a-f]{64}$/u.test(build.toolchain?.digest ?? "")
    || !/^[0-9a-f]{64}$/u.test(build.configuration?.digest ?? "")) {
    throw new TypeError(`${side} build identity is incomplete or does not match its revision`);
  }
  return { revision, sourceRevision: revision, artifactHash: build.artifactHash, buildIdentityDigest: build.buildIdentityDigest,
    sourceFingerprint: build.sourceFingerprint, toolchainDigest: build.toolchain?.digest,
    configurationDigest: build.configuration?.digest };
}

function readSample(directory, side, index, browserBinding, expectedBuild, budgetMs) {
  const prefix = resolve(directory, `${side}-${index}`);
  const stdout = readFileSync(`${prefix}.stdout`, "utf8"), stderr = readFileSync(`${prefix}.stderr`, "utf8");
  const exitCode = Number(readFileSync(`${prefix}.status`, "utf8").trim());
  if (!Number.isSafeInteger(exitCode) || exitCode < 0) throw new TypeError(`${side} sample ${index} has an invalid exit code`);
  const lines = jsonLines(stdout);
  const builds = lines.filter((entry) => entry.performanceBuild !== undefined).map((entry) => entry.performanceBuild);
  const runtimes = lines.filter((entry) => entry.browserRuntime !== undefined).map((entry) => entry.browserRuntime);
  const measurements = lines.filter((entry) => entry.scenario === scenario).map((entry) => entry.measurements);
  if (builds.length !== 1 || runtimes.length !== 1 || measurements.length !== 1) {
    throw new TypeError(`${side} sample ${index} lacks one attributable build, runtime, and constrained measurement`);
  }
  const sampleBuild = builds[0], runtime = runtimes[0], measured = measurements[0];
  for (const field of ["sourceRevision", "sourceFingerprint", "artifactHash", "buildIdentityDigest"]) {
    if (sampleBuild?.[field] !== expectedBuild[field]) {
      throw new TypeError(`${side} sample ${index} does not match its validated build identity`);
    }
  }
  if (runtime.version !== browserBinding.version || runtime.archiveSha256 !== browserBinding.archiveSha256) {
    throw new TypeError(`${side} sample ${index} used a different performance browser`);
  }
  for (const [label, value] of [
    ["simulation p95", measured.simulation?.p95Ms], ["render p95", measured.render?.p95Ms],
    ["frame p95", measured.frame?.p95Ms], ["frame interval p99", measured.frameInterval?.p99Ms],
  ]) if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${side} sample ${index} ${label} is invalid`);
  const diagnosticOutput = `${stdout}\n${stderr}`;
  const expectedBudgetAssertion = `${scenario} simulation p95 ms: ${measured.simulation.p95Ms} exceeded budget ${budgetMs}`;
  if (exitCode !== 0 && (!diagnosticOutput.includes("AssertionError") || !diagnosticOutput.includes(expectedBudgetAssertion))) {
    throw new TypeError(`${side} sample ${index} failed outside its measured simulation budget assertion`);
  }
  return { index, exitCode, simulationP95Ms: measured.simulation.p95Ms, renderP95Ms: measured.render.p95Ms,
    frameP95Ms: measured.frame.p95Ms, frameIntervalP99Ms: measured.frameInterval.p99Ms,
    measurements: measured };
}

function summarize(samples, budgetMs) {
  const values = samples.map((entry) => entry.simulationP95Ms);
  return { samples, simulationP95Ms: { values, p50: percentile(values, 0.5), p95: percentile(values, 0.95),
    minimum: Math.min(...values), maximum: Math.max(...values) },
  allWithinBudget: values.every((value) => value <= budgetMs), allExceedBudget: values.every((value) => value > budgetMs) };
}

export function createPairedPerformanceReport({ directory, baselineRevision, candidateRevision, browserVersion, browserArchiveSha256 }) {
  const baseline = sha(baselineRevision, "baseline revision"), candidate = sha(candidateRevision, "candidate revision");
  if (baseline === candidate) throw new TypeError("paired performance revisions must differ");
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(browserVersion ?? "") || !/^[0-9a-f]{64}$/u.test(browserArchiveSha256 ?? "")) {
    throw new TypeError("paired performance browser binding is incomplete");
  }
  const browser = { version: browserVersion, archiveSha256: browserArchiveSha256 };
  const build = {
    baseline: validateBuild(JSON.parse(readFileSync(resolve(directory, "baseline-build-info.json"), "utf8")), baseline, "baseline"),
    candidate: validateBuild(JSON.parse(readFileSync(resolve(directory, "candidate-build-info.json"), "utf8")), candidate, "candidate"),
  };
  const budgetMs = budgets.constrainedGameplay.simulationP95Ms;
  const results = Object.fromEntries(["baseline", "candidate"].map((side) => [side,
    summarize(Array.from({ length: sampleCount }, (_, offset) => readSample(
      directory, side, offset + 1, browser, build[side], budgetMs)), budgetMs)]));
  const outcome = results.baseline.allWithinBudget && results.candidate.allWithinBudget ? "both-within-budget"
    : results.baseline.allWithinBudget && results.candidate.allExceedBudget ? "candidate-regression-plausible"
      : results.baseline.allExceedBudget && results.candidate.allExceedBudget ? "pre-existing-budget-miss"
        : "inconclusive";
  const report = { format: "tearbench-paired-performance", schemaVersion: 1, generatedAt: new Date().toISOString(),
    scenario, sampleCountPerRevision: sampleCount, budget: { simulationP95Ms: budgetMs }, browser, revisions: { baseline, candidate },
    build, results, outcome };
  return { ...report, reportDigest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowed = ["--samples", "--baseline", "--candidate", "--artifact"];
  const options = process.argv.slice(2), keys = options.filter((_, index) => index % 2 === 0);
  if (options.length !== allowed.length * 2 || keys.some((value) => !allowed.includes(value)) || new Set(keys).size !== allowed.length) {
    throw new TypeError("usage: node scripts/tearbench-paired-performance-report.mjs --samples dir --baseline sha --candidate sha --artifact path");
  }
  const artifact = resolve(option("--artifact"));
  const report = createPairedPerformanceReport({ directory: resolve(option("--samples")), baselineRevision: option("--baseline"),
    candidateRevision: option("--candidate"), browserVersion: process.env.TEAR_PERF_BROWSER_VERSION,
    browserArchiveSha256: process.env.TEAR_PERF_BROWSER_ARCHIVE_SHA256 });
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`paired performance diagnostic: ${report.outcome}`);
  console.log(`artifact: ${artifact}`);
}
