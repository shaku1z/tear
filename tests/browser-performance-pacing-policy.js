const assert = require("node:assert/strict");

// Frame pacing (the requestAnimationFrame interval) measures the host's scheduler as much as the
// game. On a shared CI runner, a neighbour's load or a late vsync moves the worst interval while
// the game's own frame work stays small. So the interval budgets are required only on a controlled
// host: the release machine, or any local run. On a shared host they are recorded, not enforced.
// The caller asserts frame work, which is the game's own cost, on every host.
const PERFORMANCE_HOSTS = Object.freeze(["controlled", "shared"]);

/** The host class: TEAR_PERF_HOST when set, otherwise shared under CI and controlled locally. */
function performanceHost(env = process.env) {
  const host = env.TEAR_PERF_HOST || (env.CI ? "shared" : "controlled");
  if (!PERFORMANCE_HOSTS.includes(host)) {
    throw new TypeError(`TEAR_PERF_HOST must be one of ${PERFORMANCE_HOSTS.join(", ")}; got ${host}`);
  }
  return host;
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function enforcementFor(cpuThrottleRate, host) {
  if (cpuThrottleRate !== undefined && cpuThrottleRate > 1) return "diagnostic-under-cpu-throttle";
  return host === "shared" ? "diagnostic-on-shared-host" : "required";
}

function createPacingAssessment({ label, scenario, frameInterval, host = "controlled" }) {
  const cpuThrottleRate = scenario?.cpuThrottleRate;
  if (cpuThrottleRate !== undefined && (!Number.isFinite(cpuThrottleRate) || cpuThrottleRate < 1)) {
    throw new TypeError("browser performance CPU throttle rate is invalid");
  }
  if (!PERFORMANCE_HOSTS.includes(host)) throw new TypeError("browser performance host is invalid");
  if (
    typeof label !== "string" ||
    label.length === 0 ||
    !finiteNonNegative(frameInterval?.p99Ms) ||
    !finiteNonNegative(frameInterval?.maxMs) ||
    !finiteNonNegative(scenario?.frameIntervalP99Ms) ||
    !finiteNonNegative(scenario?.frameIntervalMaxMs)
  ) {
    throw new TypeError("browser performance pacing evidence is invalid");
  }
  const failures = [
    {
      id: "frame-interval-p99",
      actual: frameInterval.p99Ms,
      budget: scenario.frameIntervalP99Ms,
      label: `${label} frame-interval p99 ms`,
    },
    {
      id: "frame-interval-max",
      actual: frameInterval.maxMs,
      budget: scenario.frameIntervalMaxMs,
      label: `${label} frame-interval max ms`,
    },
  ]
    .filter(({ actual, budget }) => actual > budget)
    .map(({ id, actual, budget, label: failureLabel }) =>
      Object.freeze({ id, actual, budget, assertion: `${failureLabel}: ${actual} exceeded budget ${budget}` }),
    );
  return Object.freeze({
    format: "tear-browser-pacing-assessment",
    schemaVersion: 2,
    host,
    enforcement: enforcementFor(cpuThrottleRate, host),
    ...(cpuThrottleRate !== undefined && { cpuThrottleRate }),
    status: failures.length === 0 ? "within-budget" : "exceeded",
    failures: Object.freeze(failures),
  });
}

/**
 * Fails on the first exceeded budget when the assessment is required. A diagnostic assessment
 * returns its exceeded budgets as log lines instead; the report keeps them in full.
 */
function assertPacingAssessment(assessment, input) {
  const expected = createPacingAssessment(input);
  assert.deepEqual(assessment, expected, "browser performance pacing assessment is invalid");
  if (assessment.enforcement !== "required") {
    return assessment.failures.map((failure) => `diagnostic (${assessment.enforcement}): ${failure.assertion}`);
  }
  if (assessment.failures.length > 0) assert.fail(assessment.failures[0].assertion);
  return [];
}

module.exports = { assertPacingAssessment, createPacingAssessment, performanceHost, PERFORMANCE_HOSTS };
