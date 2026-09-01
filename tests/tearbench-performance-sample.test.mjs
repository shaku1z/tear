import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPerformanceSample,
  performanceSampleAllowsRetry,
  PERFORMANCE_TASK_ID,
} from "../scripts/tearbench-performance-sample.mjs";

function output(overrides = {}) {
  const measurements = {
    frame: { p95Ms: 14.6 },
    frameInterval: { p99Ms: 150 },
    outsideFrameWork: { p99Ms: 140.9 },
    newLongTasks: 0,
    ...overrides,
  };
  return `${JSON.stringify({ scenario: "4x constrained gameplay", measurements })}\n`;
}
const failure = "AssertionError [ERR_ASSERTION]: 4x constrained gameplay frame-interval p99 ms: 150 exceeded budget 50\n";

test("classifies only directly evidenced outside-frame contention", () => {
  const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout: output(), stderr: failure });
  assert.equal(sample.classification, "infrastructure-invalid");
  assert.equal(sample.evidence[0].scenario, "4x constrained gameplay");
  assert.ok(sample.evidence[0].outsideDominance > 0.9);
  assert.equal(performanceSampleAllowsRetry(sample), true);
});

test("never relabels Tear frame-work or long-task regressions as infrastructure", () => {
  for (const stdout of [
    output({ frame: { p95Ms: 20.1 } }),
    output({ newLongTasks: 1 }),
    output({ frameInterval: { p99Ms: 60 }, outsideFrameWork: { p99Ms: 58 } }),
  ]) {
    const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout, stderr: failure });
    assert.equal(sample.classification, "product-or-unclassified-failure");
    assert.equal(performanceSampleAllowsRetry(sample), false);
  }
});

test("never relabels simulation or render regressions using uncorrelated outside-frame contention", () => {
  for (const stderr of [
    "AssertionError [ERR_ASSERTION]: 4x constrained gameplay simulation p95 ms: 12 exceeded budget 10\n",
    "AssertionError [ERR_ASSERTION]: 4x constrained gameplay render p95 ms: 15 exceeded budget 14\n",
  ]) {
    const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout: output(), stderr });
    assert.equal(sample.classification, "product-or-unclassified-failure");
    assert.equal(performanceSampleAllowsRetry(sample), false);
  }
});

test("missing, malformed, passing, and unrelated evidence cannot authorize an invalid-sample retry", () => {
  assert.equal(classifyPerformanceSample({ taskId: "unit.example", status: "failed", stdout: output(), stderr: failure }), null);
  for (const stdout of ["", "not json\n", `${JSON.stringify({ scenario: "4x constrained gameplay", measurements: {} })}\n`]) {
    const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout, stderr: failure });
    assert.equal(sample.classification, "product-or-unclassified-failure");
    assert.equal(performanceSampleAllowsRetry(sample), false);
  }
  assert.equal(classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "passed", stdout: output(), stderr: "" }).classification, "valid");
});

test("an earlier infrastructure-looking scenario cannot hide a later product regression", () => {
  const later = output({ frame: { p95Ms: 22 }, frameInterval: { p99Ms: 160 }, outsideFrameWork: { p99Ms: 150 } });
  const stdout = `${output()}${later}`;
  const stderr = "AssertionError [ERR_ASSERTION]: 4x constrained gameplay frame-work p95 ms: 22 exceeded budget 20\n";
  const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout, stderr });
  assert.equal(sample.classification, "product-or-unclassified-failure");
  assert.equal(performanceSampleAllowsRetry(sample), false);
});

test("same-scenario workload and roster assertions remain product failures", () => {
  for (const stderr of [
    "AssertionError [ERR_ASSERTION]: 4x constrained gameplay did not exercise representative enemies\n",
    "AssertionError [ERR_ASSERTION]: 4x constrained gameplay retained the wrong exact roster\n",
  ]) {
    const sample = classifyPerformanceSample({ taskId: PERFORMANCE_TASK_ID, status: "failed", stdout: output(), stderr });
    assert.equal(sample.classification, "product-or-unclassified-failure");
    assert.equal(performanceSampleAllowsRetry(sample), false);
  }
});
