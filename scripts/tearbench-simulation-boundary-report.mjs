import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const budgets = JSON.parse(readFileSync(new URL("../config/browser-performance-budgets.json", import.meta.url), "utf8"));
const scenario = "4x constrained gameplay";

function exactSha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) throw new TypeError(`${label} must be an exact commit SHA`);
  return value;
}

function jsonLines(output) {
  return output.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function validateBuild(value, revision) {
  if (value?.format !== "tear-build-info" || value.schemaVersion !== 1 || value.target !== "standalone"
    || value.mode !== "test-standalone" || value.sha !== revision || value.sourceRevision !== revision
    || value.sourceState !== "clean" || !/^[0-9a-f]{64}$/u.test(value.sourceFingerprint ?? "")
    || !/^[0-9a-f]{64}$/u.test(value.artifactHash ?? "") || !/^[0-9a-f]{64}$/u.test(value.buildIdentityDigest ?? "")
    || !/^[0-9a-f]{64}$/u.test(value.toolchain?.digest ?? "") || !/^[0-9a-f]{64}$/u.test(value.configuration?.digest ?? "")) {
    throw new TypeError("simulation boundary build identity is incomplete or does not match its revision");
  }
  return { revision, sourceRevision: revision, sourceFingerprint: value.sourceFingerprint, artifactHash: value.artifactHash,
    buildIdentityDigest: value.buildIdentityDigest, toolchainDigest: value.toolchain.digest,
    configurationDigest: value.configuration.digest };
}

function validateTiming(value, label, { minimumSamples = 1, exactSamples } = {}) {
  if (!Number.isSafeInteger(value?.samples) || value.samples < minimumSamples
    || (exactSamples !== undefined && value.samples !== exactSamples)) throw new TypeError(`${label} samples are incomplete`);
  for (const field of ["p50Ms", "p95Ms", "p99Ms", "maxMs"]) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) {
      throw new TypeError(`${label} ${field} is invalid`);
    }
  }
  if (value.p50Ms > value.p95Ms || value.p95Ms > value.p99Ms || value.p99Ms > value.maxMs) {
    throw new TypeError(`${label} percentiles are not monotonic`);
  }
  return value;
}

function validateStepPoll(value, minimumObservations) {
  if (!Number.isSafeInteger(value?.observations) || value.observations < minimumObservations || value.histogram === null
    || typeof value.histogram !== "object" || Array.isArray(value.histogram)) {
    throw new TypeError("simulation step poll is incomplete");
  }
  let total = 0;
  for (const [steps, count] of Object.entries(value.histogram)) {
    if (!/^\d+$/u.test(steps) || !Number.isSafeInteger(count) || count < 1) throw new TypeError("simulation step poll is invalid");
    total += count;
  }
  if (total !== value.observations) throw new TypeError("simulation step poll observation count does not match its histogram");
  return value;
}

export function createSimulationBoundaryReport({ directory, revision, browserVersion, browserArchiveSha256,
  legacyPacingRequired = false }) {
  const sourceRevision = exactSha(revision, "candidate revision");
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(browserVersion ?? "") || !/^[0-9a-f]{64}$/u.test(browserArchiveSha256 ?? "")) {
    throw new TypeError("simulation boundary browser binding is incomplete");
  }
  const build = validateBuild(JSON.parse(readFileSync(resolve(directory, "candidate-build-info.json"), "utf8")), sourceRevision);
  const candidateBudgetBytes = readFileSync(resolve(directory, "candidate-browser-performance-budgets.json"), "utf8");
  const candidateBudgets = JSON.parse(candidateBudgetBytes);
  const budgetMs = budgets.constrainedGameplay.simulationP95Ms;
  const sampleCapacity = budgets.referenceProfile.sampleCapacity;
  const minimumFrameSamples = budgets.constrainedGameplay.minimumSamples;
  const minimumPollObservations = Math.floor(minimumFrameSamples / 10);
  const constrainedBudgetFields = ["cpuThrottleRate", "simulationP95Ms", "renderP95Ms", "frameP95Ms",
    "frameIntervalP99Ms", "frameIntervalMaxMs", "newLongTasksMax"];
  if (budgetMs !== 10 || sampleCapacity !== 600 || minimumFrameSamples !== 300
    || constrainedBudgetFields.some((field) => candidateBudgets?.constrainedGameplay?.[field]
      !== budgets.constrainedGameplay[field])
    || candidateBudgets?.referenceProfile?.sampleCapacity !== sampleCapacity
    || candidateBudgets?.constrainedGameplay?.minimumSamples !== minimumFrameSamples) {
    throw new TypeError("simulation boundary requires the unchanged candidate and reporter measurement contract");
  }
  const stdout = readFileSync(resolve(directory, "candidate.stdout"), "utf8");
  const stderr = readFileSync(resolve(directory, "candidate.stderr"), "utf8");
  const statusText = readFileSync(resolve(directory, "candidate.status"), "utf8").trim();
  if (!/^(?:0|[1-9]\d{0,2})$/u.test(statusText) || Number(statusText) > 255) {
    throw new TypeError("simulation boundary sample has an invalid exit code");
  }
  const exitCode = Number(statusText);
  const lines = jsonLines(stdout);
  const builds = lines.filter((entry) => entry.performanceBuild !== undefined).map((entry) => entry.performanceBuild);
  const runtimes = lines.filter((entry) => entry.browserRuntime !== undefined).map((entry) => entry.browserRuntime);
  const measurements = lines.filter((entry) => entry.scenario === scenario).map((entry) => entry.measurements);
  if (builds.length !== 1 || runtimes.length !== 1 || measurements.length !== 1) {
    throw new TypeError("simulation boundary sample lacks one attributable build, runtime, and constrained measurement");
  }
  for (const field of ["sourceRevision", "sourceFingerprint", "artifactHash", "buildIdentityDigest"]) {
    if (builds[0]?.[field] !== build[field]) throw new TypeError("simulation boundary sample does not match its validated build identity");
  }
  if (runtimes[0]?.version !== browserVersion || runtimes[0]?.archiveSha256 !== browserArchiveSha256) {
    throw new TypeError("simulation boundary sample used a different performance browser");
  }
  const measurement = measurements[0];
  const simulation = validateTiming(measurement?.simulation, "aggregate simulation", { minimumSamples: minimumFrameSamples });
  const canonicalTick = validateTiming(measurement?.canonicalTick, "canonical tick", { exactSamples: sampleCapacity });
  const simulationStepPoll = validateStepPoll(measurement?.simulationStepPoll, minimumPollObservations);
  const render = validateTiming(measurement?.render, "render", { minimumSamples: minimumFrameSamples });
  const frame = validateTiming(measurement?.frame, "frame", { minimumSamples: minimumFrameSamples });
  const frameInterval = validateTiming(measurement?.frameInterval, "frame interval", { minimumSamples: minimumFrameSamples });
  const outsideFrameWork = validateTiming(measurement?.outsideFrameWork, "outside-frame work",
    { minimumSamples: minimumFrameSamples });
  if (!Number.isSafeInteger(measurement?.newLongTasks) || measurement.newLongTasks < 0
    || !Number.isSafeInteger(measurement?.peakGauges?.enemies) || measurement.peakGauges.enemies < 0) {
    throw new TypeError("simulation boundary counters are incomplete");
  }
  const performanceBudget = budgets.constrainedGameplay;
  const sampleFailures = [
    { id: "simulation-p95", label: `${scenario} simulation p95 ms`, actual: simulation.p95Ms,
      budget: performanceBudget.simulationP95Ms },
    { id: "render-p95", label: `${scenario} render p95 ms`, actual: render.p95Ms,
      budget: performanceBudget.renderP95Ms },
    { id: "frame-p95", label: `${scenario} frame-work p95 ms`, actual: frame.p95Ms,
      budget: performanceBudget.frameP95Ms },
    { id: "frame-interval-p99", label: `${scenario} frame-interval p99 ms`, actual: frameInterval.p99Ms,
      budget: performanceBudget.frameIntervalP99Ms },
    { id: "frame-interval-max", label: `${scenario} frame-interval max ms`, actual: frameInterval.maxMs,
      budget: performanceBudget.frameIntervalMaxMs },
    { id: "new-long-tasks", label: `${scenario} new >50 ms frames`, actual: measurement.newLongTasks,
      budget: performanceBudget.newLongTasksMax },
  ].filter(({ actual, budget }) => actual > budget).map((failure) => ({ ...failure,
    assertion: `${failure.label}: ${failure.actual} exceeded budget ${failure.budget}` }));
  if (measurement.peakGauges.enemies === 0) sampleFailures.push({ id: "representative-enemies",
    label: `${scenario} representative enemies`, actual: 0, budget: 0,
    assertion: `${scenario} did not exercise representative enemies` });
  const pacingFailures = sampleFailures.filter(({ id }) => id === "frame-interval-p99" || id === "frame-interval-max");
  const expectedPacingAssessment = {
    format: "tear-browser-pacing-assessment", schemaVersion: 1,
    enforcement: "diagnostic-under-cpu-throttle", cpuThrottleRate: performanceBudget.cpuThrottleRate,
    status: pacingFailures.length === 0 ? "within-budget" : "exceeded",
    failures: pacingFailures.map(({ id, actual, budget, assertion }) => ({ id, actual, budget, assertion })),
  };
  const emittedPacingAssessment = measurement.pacingAssessment;
  if (emittedPacingAssessment === undefined && legacyPacingRequired !== true) {
    throw new TypeError("simulation boundary sample is missing its pacing assessment");
  }
  if (emittedPacingAssessment !== undefined && !isDeepStrictEqual(emittedPacingAssessment, expectedPacingAssessment)) {
    throw new TypeError("simulation boundary pacing assessment does not match its measured evidence");
  }
  const requiredFailures = emittedPacingAssessment === undefined ? sampleFailures
    : sampleFailures.filter(({ id }) => id !== "frame-interval-p99" && id !== "frame-interval-max");
  const exceeded = simulation.p95Ms > budgetMs;
  const failureHeadlines = `${stdout}\n${stderr}`.split(/\r?\n/u).map((line) => line.trim())
    .filter((line) => /^(?:AssertionError(?: \[[^\]]+\])?|Error):/u.test(line));
  const expectedHeadline = requiredFailures.length === 0 ? undefined
    : `AssertionError [ERR_ASSERTION]: ${requiredFailures[0].assertion}`;
  const statusMatches = requiredFailures.length === 0
    ? exitCode === 0 && failureHeadlines.length === 0
    : exitCode !== 0 && failureHeadlines.length === 1 && failureHeadlines[0] === expectedHeadline;
  if (!statusMatches) {
    throw new TypeError("simulation boundary status does not match its exact first measured constrained assertion");
  }
  const outcome = !exceeded ? "aggregate-within-budget"
    : canonicalTick.p95Ms <= budgetMs ? "aggregate-boundary-miss" : "canonical-tick-miss";
  const report = { format: "tearbench-simulation-boundary", schemaVersion: 1, generatedAt: new Date().toISOString(),
    canonicalReleaseAuthority: false,
    pacingEvidence: { mode: emittedPacingAssessment === undefined ? "legacy-required" : "structured-policy" },
    scenario, budget: { simulationP95Ms: budgetMs,
      sourceConfigSha256: createHash("sha256").update(candidateBudgetBytes).digest("hex") },
    browser: { version: browserVersion, archiveSha256: browserArchiveSha256 },
    revision: sourceRevision, build, exitCode, measurements: { ...measurement, simulation, canonicalTick,
      simulationStepPoll, render, frame, frameInterval, outsideFrameWork },
    sampleAssessment: { status: sampleFailures.length === 0 ? "passed" : "failed", failures: sampleFailures }, outcome };
  return { ...report, reportDigest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const required = ["--samples", "--revision", "--artifact"], allowed = [...required, "--legacy-pacing"];
  const options = process.argv.slice(2), keys = options.filter((_, index) => index % 2 === 0);
  const legacyPacing = option("--legacy-pacing");
  if (options.length % 2 !== 0 || ![required.length, allowed.length].includes(keys.length)
    || keys.some((value) => !allowed.includes(value)) || new Set(keys).size !== keys.length
    || required.some((value) => !keys.includes(value)) || (legacyPacing !== undefined && legacyPacing !== "required")) {
    throw new TypeError("usage: node scripts/tearbench-simulation-boundary-report.mjs --samples dir --revision sha --artifact path [--legacy-pacing required]");
  }
  const artifact = resolve(option("--artifact"));
  const report = createSimulationBoundaryReport({ directory: resolve(option("--samples")), revision: option("--revision"),
    browserVersion: process.env.TEAR_PERF_BROWSER_VERSION,
    browserArchiveSha256: process.env.TEAR_PERF_BROWSER_ARCHIVE_SHA256,
    legacyPacingRequired: legacyPacing === "required" });
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`simulation boundary diagnostic: ${report.outcome}`);
  console.log(`artifact: ${artifact}`);
}
