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

// Per-frame simulation and frame-work time are the cost of every fixed tick a frame catches up, so they grow
// with the frame interval whatever the code does: a runner that delivers 30 frames a second doubles them. A
// scenario that sets `canonicalTickP95Ms` therefore enforces the cost of one tick everywhere, and enforces the
// per-frame figures only while frames arrive near the profile's display step.
const PER_FRAME_BUDGET_IDS = Object.freeze(["simulation-p95", "frame-work-p95"]);

function frameCostBudgets({ scenario, simulation, frame, canonicalTick }) {
  return [
    ...(scenario.canonicalTickP95Ms === undefined
      ? []
      : [
          {
            id: "canonical-tick-p95",
            actual: canonicalTick.p95Ms,
            budget: scenario.canonicalTickP95Ms,
            name: "canonical tick p95 ms",
          },
        ]),
    { id: "simulation-p95", actual: simulation.p95Ms, budget: scenario.simulationP95Ms, name: "simulation p95 ms" },
    { id: "frame-work-p95", actual: frame.p95Ms, budget: scenario.frameP95Ms, name: "frame-work p95 ms" },
  ];
}

function createFrameCostAssessment({ label, scenario, profile, simulation, frame, canonicalTick, frameInterval }) {
  if (
    !finiteNonNegative(frameInterval?.p50Ms) ||
    !finiteNonNegative(simulation?.p95Ms) ||
    !finiteNonNegative(frame?.p95Ms) ||
    !finiteNonNegative(scenario?.simulationP95Ms) ||
    !finiteNonNegative(scenario?.frameP95Ms) ||
    !(profile?.displayStepMs > 0) ||
    !(profile?.judgedIntervalSteps >= 1) ||
    (scenario.canonicalTickP95Ms !== undefined &&
      (!finiteNonNegative(scenario.canonicalTickP95Ms) || !finiteNonNegative(canonicalTick?.p95Ms)))
  ) {
    throw new TypeError("browser performance frame-cost evidence is invalid");
  }
  const maxJudgedIntervalMs = profile.displayStepMs * profile.judgedIntervalSteps;
  const perFrameJudged = scenario.canonicalTickP95Ms === undefined || frameInterval.p50Ms <= maxJudgedIntervalMs;
  const failures = frameCostBudgets({ scenario, simulation, frame, canonicalTick })
    .filter(({ id }) => perFrameJudged || !PER_FRAME_BUDGET_IDS.includes(id))
    .filter(({ actual, budget }) => actual > budget)
    .map(({ id, actual, budget, name }) =>
      Object.freeze({ id, actual, budget, assertion: `${label} ${name}: ${actual} exceeded budget ${budget}` }),
    );
  return Object.freeze({
    format: "tear-frame-cost-assessment",
    schemaVersion: 1,
    perFrameJudged,
    frameIntervalP50Ms: frameInterval.p50Ms,
    maxJudgedIntervalMs,
    failures: Object.freeze(failures),
  });
}

/**
 * Fails on the first exceeded budget. Returns the line to print when the per-frame figure was not judged,
 * so a run on a slow cadence never passes silently.
 */
function assertFrameCostAssessment(assessment, input) {
  assert.deepEqual(
    assessment,
    createFrameCostAssessment(input),
    "browser performance frame-cost assessment is invalid",
  );
  if (assessment.failures.length > 0) assert.fail(assessment.failures[0].assertion);
  return assessment.perFrameJudged
    ? []
    : [
        `${input.label}: per-frame sim not judged: interval ${assessment.frameIntervalP50Ms} ms (frame work is not judged either)`,
      ];
}

module.exports = {
  assertFrameCostAssessment,
  assertPacingAssessment,
  createFrameCostAssessment,
  createPacingAssessment,
  performanceHost,
  PERFORMANCE_HOSTS,
};
