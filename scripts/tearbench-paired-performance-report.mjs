import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const budgets = JSON.parse(readFileSync(new URL("../config/browser-performance-budgets.json", import.meta.url), "utf8"));
const sampleCount = 3;
const outsideFrameDominanceMinimum = 0.75;
const scenarioContracts = Object.freeze({
  constrained: Object.freeze({ label: "4x constrained gameplay", budgetKey: "constrainedGameplay", kind: "simulation" }),
  verdant: Object.freeze({ label: "Verdant gameplay", budgetKey: "verdantGameplay", kind: "verdant" }),
});

function sha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`${label} must be an exact commit SHA`);
  return value;
}

function scenarioContract(value) {
  const contract = scenarioContracts[value];
  if (contract === undefined) throw new TypeError("paired performance scenario must be constrained or verdant");
  return contract;
}

function jsonLines(output) {
  return output.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function distribution(samples, selector) {
  const values = samples.map(selector);
  return { values, p50: percentile(values, 0.5), p95: percentile(values, 0.95),
    minimum: Math.min(...values), maximum: Math.max(...values) };
}

function finite(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

function validateTiming(value, label, minimumSamples) {
  if (!Number.isSafeInteger(value?.samples) || value.samples < minimumSamples) {
    throw new TypeError(`${label} samples are incomplete`);
  }
  if (![value.p50Ms, value.p95Ms, value.p99Ms, value.maxMs].every(finite)) {
    throw new TypeError(`${label} timing is invalid`);
  }
  if (value.p50Ms > value.p95Ms || value.p95Ms > value.p99Ms || value.p99Ms > value.maxMs) {
    throw new TypeError(`${label} percentiles are not monotonic`);
  }
  return value;
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
    sourceFingerprint: build.sourceFingerprint, toolchainDigest: build.toolchain.digest,
    configurationDigest: build.configuration.digest };
}

function readVerdantBudget(directory, side) {
  const bytes = readFileSync(resolve(directory, `${side}-browser-performance-budgets.json`), "utf8");
  const value = JSON.parse(bytes);
  if (value?.schemaVersion !== 1 || !isDeepStrictEqual(value.verdantGameplay, budgets.verdantGameplay)) {
    throw new TypeError(`${side} detached build does not retain the unchanged performance budget`);
  }
  return { sha256: createHash("sha256").update(bytes).digest("hex"), verdantGameplay: value.verdantGameplay };
}

function validateCounterMap(value, names, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || names.some((name) => !Number.isSafeInteger(value[name]) || value[name] < 0)) {
    throw new TypeError(`${label} counters are incomplete`);
  }
  return value;
}

function failure(id, label, actual, budget) {
  return { id, label, actual, budget, assertion: `${label}: ${actual} exceeded budget ${budget}` };
}

function failureHeadlines(output) {
  return output.split(/\r?\n/u).map((line) => line.trim()).flatMap((line) => {
    const match = line.match(/^(?:AssertionError(?: \[[^\]]+\])?):\s*(.+)$/u);
    return match === null ? [] : [match[1]];
  });
}

function validateVerdantMeasurement(measured, side, index, diagnosticOutput, exitCode) {
  const prefix = `${side} sample ${index}`;
  const budget = budgets.verdantGameplay;
  const simulation = validateTiming(measured?.simulation, `${prefix} simulation`, budget.minimumSamples);
  const render = validateTiming(measured?.render, `${prefix} render`, budget.minimumSamples);
  const frame = validateTiming(measured?.frame, `${prefix} frame`, budget.minimumSamples);
  const frameInterval = validateTiming(measured?.frameInterval, `${prefix} frame interval`, budget.minimumSamples);
  const outsideFrameWork = validateTiming(measured?.outsideFrameWork, `${prefix} outside-frame work`, budget.minimumSamples);
  for (const field of ["p50Ms", "p95Ms", "p99Ms", "maxMs"]) {
    if (outsideFrameWork[field] > frameInterval[field]) {
      throw new TypeError(`${prefix} outside-frame work exceeds its frame interval`);
    }
  }
  if (!Number.isSafeInteger(measured?.newLongTasks) || measured.newLongTasks < 0) {
    throw new TypeError(`${prefix} long-task counter is incomplete`);
  }
  const gaugeNames = Object.keys(budget.ceilings);
  const peakGauges = validateCounterMap(measured?.peakGauges, gaugeNames, `${prefix} peak gauge`);
  const peakEnvironmentKinds = measured?.peakEnvironmentKinds;
  if (peakEnvironmentKinds === null || typeof peakEnvironmentKinds !== "object" || Array.isArray(peakEnvironmentKinds)
    || Object.values(peakEnvironmentKinds).some((value) => !Number.isSafeInteger(value) || value < 0)
    || ["bloom-well:", "graft-anchor:", "root-link:"].some((prefix) => !Object.entries(peakEnvironmentKinds)
      .some(([name, count]) => name.startsWith(prefix) && count > 0))) {
    throw new TypeError(`${prefix} environment-kind counters are incomplete`);
  }
  const failures = [
    failure("simulation-p95", "Verdant simulation p95 ms", simulation.p95Ms, budget.simulationP95Ms),
    failure("render-p95", "Verdant render p95 ms", render.p95Ms, budget.renderP95Ms),
    failure("frame-p95", "Verdant frame-work p95 ms", frame.p95Ms, budget.frameP95Ms),
    failure("frame-interval-p99", "Verdant frame-interval p99 ms", frameInterval.p99Ms, budget.frameIntervalP99Ms),
    failure("frame-interval-max", "Verdant frame-interval max ms", frameInterval.maxMs, budget.frameIntervalMaxMs),
    failure("new-long-tasks", "Verdant new >50 ms frames", measured.newLongTasks, budget.newLongTasksMax),
    ...Object.entries(budget.ceilings).map(([name, limit]) => failure(`peak-${name}`,
      `Verdant peak ${name} (${JSON.stringify(peakEnvironmentKinds)})`, peakGauges[name], limit)),
  ].filter(({ actual, budget: limit }) => actual > limit);
  if (peakGauges.enemies < 4) failures.push({ id: "integrated-roster",
    assertion: "Verdant workload did not retain Rootbound, Rootbinder, and ordinary enemies" });
  if (peakGauges.fields === 0 || peakGauges.combatObjects < 4) failures.push({ id: "integrated-relationships",
    assertion: "Verdant workload did not exercise Bloom, Grafts, and Rootbinder relationships together" });
  const headlines = failureHeadlines(diagnosticOutput);
  const statusMatches = failures.length === 0
    ? exitCode === 0 && headlines.length === 0
    : exitCode !== 0 && headlines.length === 1 && headlines[0] === failures[0].assertion;
  if (!statusMatches) throw new TypeError(`${prefix} status does not match its exact first measured assertion`);
  const pacingIds = new Set(["frame-interval-p99", "frame-interval-max"]);
  const gameWorkFailures = failures.filter(({ id }) => !pacingIds.has(id));
  const outsideDominance = frameInterval.p99Ms === 0 ? 0 : outsideFrameWork.p99Ms / frameInterval.p99Ms;
  const providerBoundaryEvidence = failures.length > 0 && gameWorkFailures.length === 0
    && failures.every(({ id }) => pacingIds.has(id)) && outsideDominance >= outsideFrameDominanceMinimum;
  return { index, exitCode, status: failures.length === 0 ? "passed" : "failed", failures, gameWorkFailures,
    providerBoundaryEvidence, outsideDominance: Number(outsideDominance.toFixed(3)), measurements: measured };
}

function validateConstrainedMeasurement(measured, side, index, diagnosticOutput, exitCode) {
  for (const [label, value] of [
    ["simulation p95", measured?.simulation?.p95Ms], ["render p95", measured?.render?.p95Ms],
    ["frame p95", measured?.frame?.p95Ms], ["frame interval p99", measured?.frameInterval?.p99Ms],
  ]) if (!finite(value)) throw new TypeError(`${side} sample ${index} ${label} is invalid`);
  const budgetMs = budgets.constrainedGameplay.simulationP95Ms;
  const expected = `4x constrained gameplay simulation p95 ms: ${measured.simulation.p95Ms} exceeded budget ${budgetMs}`;
  const headlines = failureHeadlines(diagnosticOutput);
  const statusMatches = measured.simulation.p95Ms > budgetMs
    ? exitCode !== 0 && headlines.length === 1 && headlines[0] === expected
    : exitCode === 0 && headlines.length === 0;
  if (!statusMatches) {
    throw new TypeError(`${side} sample ${index} failed outside its measured simulation budget assertion`);
  }
  return { index, exitCode, simulationP95Ms: measured.simulation.p95Ms, renderP95Ms: measured.render.p95Ms,
    frameP95Ms: measured.frame.p95Ms, frameIntervalP99Ms: measured.frameInterval.p99Ms, measurements: measured };
}

function readSample(directory, side, index, browserBinding, expectedBuild, scenario) {
  const prefix = resolve(directory, `${side}-${index}`);
  const stdout = readFileSync(`${prefix}.stdout`, "utf8"), stderr = readFileSync(`${prefix}.stderr`, "utf8");
  const statusText = readFileSync(`${prefix}.status`, "utf8").trim();
  if (!/^(?:0|[1-9]\d{0,2})$/u.test(statusText) || Number(statusText) > 255) {
    throw new TypeError(`${side} sample ${index} has an invalid exit code`);
  }
  const exitCode = Number(statusText), lines = jsonLines(stdout);
  const builds = lines.filter((entry) => entry.performanceBuild !== undefined).map((entry) => entry.performanceBuild);
  const runtimes = lines.filter((entry) => entry.browserRuntime !== undefined).map((entry) => entry.browserRuntime);
  const measurementLines = lines.filter((entry) => typeof entry.scenario === "string" && entry.measurements !== undefined);
  const measurements = measurementLines.filter((entry) => entry.scenario === scenario.label).map((entry) => entry.measurements);
  if (builds.length !== 1 || runtimes.length !== 1 || measurementLines.length !== 1 || measurements.length !== 1) {
    throw new TypeError(`${side} sample ${index} lacks one attributable build, runtime, and ${scenario.label} measurement`);
  }
  for (const field of ["sourceRevision", "sourceFingerprint", "artifactHash", "buildIdentityDigest"]) {
    if (builds[0]?.[field] !== expectedBuild[field]) {
      throw new TypeError(`${side} sample ${index} does not match its validated build identity`);
    }
  }
  if (runtimes[0]?.version !== browserBinding.version || runtimes[0]?.archiveSha256 !== browserBinding.archiveSha256) {
    throw new TypeError(`${side} sample ${index} used a different performance browser`);
  }
  const diagnosticOutput = `${stdout}\n${stderr}`;
  return scenario.kind === "verdant"
    ? validateVerdantMeasurement(measurements[0], side, index, diagnosticOutput, exitCode)
    : validateConstrainedMeasurement(measurements[0], side, index, diagnosticOutput, exitCode);
}

function summarizeConstrained(samples) {
  const budgetMs = budgets.constrainedGameplay.simulationP95Ms;
  const simulationP95Ms = distribution(samples, (entry) => entry.simulationP95Ms);
  return { samples, simulationP95Ms, allWithinBudget: simulationP95Ms.values.every((value) => value <= budgetMs),
    allExceedBudget: simulationP95Ms.values.every((value) => value > budgetMs) };
}

function summarizeVerdant(samples) {
  return { samples,
    simulationP95Ms: distribution(samples, (entry) => entry.measurements.simulation.p95Ms),
    renderP95Ms: distribution(samples, (entry) => entry.measurements.render.p95Ms),
    frameP95Ms: distribution(samples, (entry) => entry.measurements.frame.p95Ms),
    frameIntervalP99Ms: distribution(samples, (entry) => entry.measurements.frameInterval.p99Ms),
    frameIntervalMaxMs: distribution(samples, (entry) => entry.measurements.frameInterval.maxMs),
    outsideFrameP99Ms: distribution(samples, (entry) => entry.measurements.outsideFrameWork.p99Ms),
    outsideDominance: distribution(samples, (entry) => entry.outsideDominance),
    allPassed: samples.every(({ status }) => status === "passed"),
    allFailed: samples.every(({ status }) => status === "failed"),
    allGameWorkFailures: samples.every(({ gameWorkFailures }) => gameWorkFailures.length > 0),
    allProviderBoundaryEvidence: samples.every(({ providerBoundaryEvidence }) => providerBoundaryEvidence) };
}

function classifyVerdant(results) {
  if (results.baseline.allPassed && results.candidate.allPassed) return "both-within-budget";
  if (results.baseline.allPassed && results.candidate.allFailed && results.candidate.allGameWorkFailures) {
    return "candidate-regression-plausible";
  }
  if (results.baseline.allProviderBoundaryEvidence && results.candidate.allProviderBoundaryEvidence) {
    return "shared-provider-boundary";
  }
  if (results.baseline.allFailed && results.candidate.allFailed
    && results.baseline.allGameWorkFailures && results.candidate.allGameWorkFailures) return "pre-existing-budget-miss";
  return "inconclusive";
}

export function createPairedPerformanceReport({ directory, baselineRevision, candidateRevision, browserVersion,
  browserArchiveSha256, scenarioKey = "constrained", workflowRevision }) {
  const baseline = sha(baselineRevision, "baseline revision"), candidate = sha(candidateRevision, "candidate revision");
  const workflow = sha(workflowRevision, "workflow revision");
  if (baseline === candidate) throw new TypeError("paired performance revisions must differ");
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(browserVersion ?? "") || !/^[0-9a-f]{64}$/u.test(browserArchiveSha256 ?? "")) {
    throw new TypeError("paired performance browser binding is incomplete");
  }
  const scenario = scenarioContract(scenarioKey);
  const browser = { version: browserVersion, archiveSha256: browserArchiveSha256 };
  const build = {
    baseline: validateBuild(JSON.parse(readFileSync(resolve(directory, "baseline-build-info.json"), "utf8")), baseline, "baseline"),
    candidate: validateBuild(JSON.parse(readFileSync(resolve(directory, "candidate-build-info.json"), "utf8")), candidate, "candidate"),
  };
  const sourceBudgets = scenario.kind === "verdant"
    ? { baseline: readVerdantBudget(directory, "baseline"), candidate: readVerdantBudget(directory, "candidate") }
    : undefined;
  const samples = Object.fromEntries(["baseline", "candidate"].map((side) => [side,
    Array.from({ length: sampleCount }, (_, offset) => readSample(
      directory, side, offset + 1, browser, build[side], scenario))]));
  const results = Object.fromEntries(["baseline", "candidate"].map((side) => [side, scenario.kind === "verdant"
    ? summarizeVerdant(samples[side]) : summarizeConstrained(samples[side])]));
  const outcome = scenario.kind === "verdant" ? classifyVerdant(results)
    : results.baseline.allWithinBudget && results.candidate.allWithinBudget ? "both-within-budget"
      : results.baseline.allWithinBudget && results.candidate.allExceedBudget ? "candidate-regression-plausible"
        : results.baseline.allExceedBudget && results.candidate.allExceedBudget ? "pre-existing-budget-miss" : "inconclusive";
  const report = { format: "tearbench-paired-performance", schemaVersion: 2, generatedAt: new Date().toISOString(),
    canonicalReleaseAuthority: false, workflowRevision: workflow, scenarioKey, scenario: scenario.label,
    sampleCountPerRevision: sampleCount, budget: budgets[scenario.budgetKey],
    ...(sourceBudgets === undefined ? {} : { sourceBudgets }), browser, revisions: { baseline, candidate }, build, results, outcome };
  return { ...report, reportDigest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowed = ["--samples", "--baseline", "--candidate", "--scenario", "--workflow-revision", "--artifact"];
  const options = process.argv.slice(2), keys = options.filter((_, index) => index % 2 === 0);
  if (options.length !== allowed.length * 2 || keys.some((value) => !allowed.includes(value))
    || new Set(keys).size !== allowed.length) {
    throw new TypeError("usage: node scripts/tearbench-paired-performance-report.mjs --samples dir --baseline sha "
      + "--candidate sha --scenario constrained|verdant --workflow-revision sha --artifact path");
  }
  const artifact = resolve(option("--artifact"));
  const report = createPairedPerformanceReport({ directory: resolve(option("--samples")),
    baselineRevision: option("--baseline"), candidateRevision: option("--candidate"), scenarioKey: option("--scenario"),
    workflowRevision: option("--workflow-revision"), browserVersion: process.env.TEAR_PERF_BROWSER_VERSION,
    browserArchiveSha256: process.env.TEAR_PERF_BROWSER_ARCHIVE_SHA256 });
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`paired performance diagnostic: ${report.outcome}`);
  console.log(`artifact: ${artifact}`);
}
