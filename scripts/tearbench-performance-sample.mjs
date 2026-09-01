import { readFileSync } from "node:fs";

export const PERFORMANCE_TASK_ID = "browser.test-browser-performance";

const budgets = JSON.parse(readFileSync(new URL("../config/browser-performance-budgets.json", import.meta.url), "utf8"));
const policy = Object.freeze({
  schemaVersion: 1,
  reason: "outside-frame-contention",
  intervalBudgetMultiplierMinimum: 1.5,
  outsideFrameDominanceMinimum: 0.75,
});
const scenarioBudgets = new Map([
  ["desktop gameplay", budgets.activeGameplay],
  ["4x constrained gameplay", budgets.constrainedGameplay],
  ["Verdant gameplay", budgets.verdantGameplay],
  ["Pale gameplay", budgets.paleGameplay],
]);

function measurements(stdout) {
  if (typeof stdout !== "string") return [];
  return stdout.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try {
      const value = JSON.parse(line);
      return typeof value?.scenario === "string" && value.measurements !== undefined ? [value] : [];
    } catch { return []; }
  });
}

function finite(value) { return typeof value === "number" && Number.isFinite(value); }

function hasContentionSensitiveTerminalAssertion(stderr, scenario) {
  if (typeof stderr !== "string") return false;
  const labels = [
    `${scenario} simulation p95 ms`,
    `${scenario} frame-interval p99 ms`,
    `${scenario} frame-interval max ms`,
  ];
  return stderr.split(/\r?\n/u).some((line) => line.includes("AssertionError")
    && labels.some((label) => line.includes(`${label}:`)));
}

function invalidEvidence(entry) {
  const budget = scenarioBudgets.get(entry.scenario), measured = entry.measurements;
  if (budget === undefined || measured === null || typeof measured !== "object") return null;
  const intervalP99Ms = measured.frameInterval?.p99Ms;
  const outsideFrameP99Ms = measured.outsideFrameWork?.p99Ms;
  const frameWorkP95Ms = measured.frame?.p95Ms;
  const newLongTasks = measured.newLongTasks;
  if (![intervalP99Ms, outsideFrameP99Ms, frameWorkP95Ms, newLongTasks].every(finite)) return null;
  const intervalRatio = intervalP99Ms / budget.frameIntervalP99Ms;
  const outsideDominance = intervalP99Ms === 0 ? 0 : outsideFrameP99Ms / intervalP99Ms;
  if (intervalRatio < policy.intervalBudgetMultiplierMinimum
    || outsideFrameP99Ms <= budget.frameIntervalP99Ms
    || outsideDominance < policy.outsideFrameDominanceMinimum
    || frameWorkP95Ms > budget.frameP95Ms
    || newLongTasks > budget.newLongTasksMax) return null;
  return Object.freeze({ scenario: entry.scenario, intervalP99Ms, intervalBudgetP99Ms: budget.frameIntervalP99Ms,
    intervalRatio: Number(intervalRatio.toFixed(3)), outsideFrameP99Ms,
    outsideDominance: Number(outsideDominance.toFixed(3)), frameWorkP95Ms,
    frameWorkBudgetP95Ms: budget.frameP95Ms, newLongTasks });
}

/**
 * Classifies only the performance task's own emitted measurements. A Tear
 * frame-work or long-task regression can never be relabeled as infrastructure.
 */
export function classifyPerformanceSample({ taskId, status, stdout, stderr }) {
  if (taskId !== PERFORMANCE_TASK_ID) return null;
  if (status === "passed") return Object.freeze({ classification: "valid", policy });
  const emitted = measurements(stdout), terminal = emitted.at(-1);
  const terminalAssertion = terminal !== undefined
    && hasContentionSensitiveTerminalAssertion(stderr, terminal.scenario);
  const evidence = terminalAssertion ? [invalidEvidence(terminal)].filter((entry) => entry !== null) : [];
  return Object.freeze(evidence.length === 0
    ? { classification: "product-or-unclassified-failure", policy, evidence: [] }
    : { classification: "infrastructure-invalid", policy, evidence });
}

export function performanceSampleAllowsRetry(sampleValidity) {
  return sampleValidity?.classification === "infrastructure-invalid";
}
