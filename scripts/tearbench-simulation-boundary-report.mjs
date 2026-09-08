import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

export function createSimulationBoundaryReport({ directory, revision, browserVersion, browserArchiveSha256 }) {
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
  if (budgetMs !== 10 || sampleCapacity !== 600 || minimumFrameSamples !== 300
    || candidateBudgets?.constrainedGameplay?.simulationP95Ms !== budgetMs
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
  const exceeded = simulation.p95Ms > budgetMs;
  const expectedAssertion = `${scenario} simulation p95 ms: ${simulation.p95Ms} exceeded budget ${budgetMs}`;
  const failureHeadlines = `${stdout}\n${stderr}`.split(/\r?\n/u).map((line) => line.trim())
    .filter((line) => /^(?:AssertionError(?: \[[^\]]+\])?|Error):/u.test(line));
  const expectedHeadline = `AssertionError [ERR_ASSERTION]: ${expectedAssertion}`;
  const statusMatches = exceeded
    ? exitCode !== 0 && failureHeadlines.length === 1 && failureHeadlines[0] === expectedHeadline
    : exitCode === 0 && failureHeadlines.length === 0;
  if (!statusMatches) {
    throw new TypeError("simulation boundary status does not match its exact measured aggregate budget assertion");
  }
  const outcome = !exceeded ? "aggregate-within-budget"
    : canonicalTick.p95Ms <= budgetMs ? "aggregate-boundary-miss" : "canonical-tick-miss";
  const report = { format: "tearbench-simulation-boundary", schemaVersion: 1, generatedAt: new Date().toISOString(),
    scenario, budget: { simulationP95Ms: budgetMs,
      sourceConfigSha256: createHash("sha256").update(candidateBudgetBytes).digest("hex") },
    browser: { version: browserVersion, archiveSha256: browserArchiveSha256 },
    revision: sourceRevision, build, exitCode, measurements: { ...measurement, simulation, canonicalTick,
      simulationStepPoll, render, frame, frameInterval, outsideFrameWork }, outcome };
  return { ...report, reportDigest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowed = ["--samples", "--revision", "--artifact"];
  const options = process.argv.slice(2), keys = options.filter((_, index) => index % 2 === 0);
  if (options.length !== allowed.length * 2 || keys.some((value) => !allowed.includes(value)) || new Set(keys).size !== allowed.length) {
    throw new TypeError("usage: node scripts/tearbench-simulation-boundary-report.mjs --samples dir --revision sha --artifact path");
  }
  const artifact = resolve(option("--artifact"));
  const report = createSimulationBoundaryReport({ directory: resolve(option("--samples")), revision: option("--revision"),
    browserVersion: process.env.TEAR_PERF_BROWSER_VERSION,
    browserArchiveSha256: process.env.TEAR_PERF_BROWSER_ARCHIVE_SHA256 });
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`simulation boundary diagnostic: ${report.outcome}`);
  console.log(`artifact: ${artifact}`);
}
