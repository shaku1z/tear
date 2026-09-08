const assert = require("node:assert/strict");

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function createPacingAssessment({ label, scenario, frameInterval }) {
  const cpuThrottleRate = scenario?.cpuThrottleRate;
  if (cpuThrottleRate !== undefined && (!Number.isFinite(cpuThrottleRate) || cpuThrottleRate < 1)) {
    throw new TypeError("browser performance CPU throttle rate is invalid");
  }
  if (typeof label !== "string" || label.length === 0
    || !finiteNonNegative(frameInterval?.p99Ms) || !finiteNonNegative(frameInterval?.maxMs)
    || !finiteNonNegative(scenario?.frameIntervalP99Ms) || !finiteNonNegative(scenario?.frameIntervalMaxMs)) {
    throw new TypeError("browser performance pacing evidence is invalid");
  }
  const failures = [{ id: "frame-interval-p99", actual: frameInterval.p99Ms,
    budget: scenario.frameIntervalP99Ms, label: `${label} frame-interval p99 ms` },
  { id: "frame-interval-max", actual: frameInterval.maxMs,
    budget: scenario.frameIntervalMaxMs, label: `${label} frame-interval max ms` }]
    .filter(({ actual, budget }) => actual > budget)
    .map(({ id, actual, budget, label: failureLabel }) => Object.freeze({ id, actual, budget,
      assertion: `${failureLabel}: ${actual} exceeded budget ${budget}` }));
  return Object.freeze({
    format: "tear-browser-pacing-assessment",
    schemaVersion: 1,
    enforcement: cpuThrottleRate !== undefined && cpuThrottleRate > 1
      ? "diagnostic-under-cpu-throttle" : "required",
    ...(cpuThrottleRate !== undefined && { cpuThrottleRate }),
    status: failures.length === 0 ? "within-budget" : "exceeded",
    failures: Object.freeze(failures),
  });
}

function assertPacingAssessment(assessment, input) {
  const expected = createPacingAssessment(input);
  assert.deepEqual(assessment, expected, "browser performance pacing assessment is invalid");
  if (assessment.enforcement === "diagnostic-under-cpu-throttle") return;
  if (assessment.failures.length > 0) assert.fail(assessment.failures[0].assertion);
}

module.exports = { assertPacingAssessment, createPacingAssessment };
