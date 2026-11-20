// The frame-pacing rule of tests/browser-performance.js: which host classes enforce interval budgets.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertFrameCostAssessment,
  assertPacingAssessment,
  createFrameCostAssessment,
  createPacingAssessment,
  performanceHost,
} = require("../browser-performance-pacing-policy.js");

const scenario = { frameIntervalP99Ms: 34, frameIntervalMaxMs: 50 };
// The first nightly run's desktop measurement: three vsyncs in the worst interval, 6.4 ms of work.
const lateVsync = { p99Ms: 33.4, maxMs: 50.1 };

describe("browser performance pacing policy", () => {
  it("is shared under CI and controlled locally unless TEAR_PERF_HOST says otherwise", () => {
    expect(performanceHost({ CI: "true" })).toBe("shared");
    expect(performanceHost({})).toBe("controlled");
    expect(performanceHost({ CI: "true", TEAR_PERF_HOST: "controlled" })).toBe("controlled");
    expect(() => performanceHost({ TEAR_PERF_HOST: "fast" })).toThrow(/TEAR_PERF_HOST/u);
  });

  it("fails an exceeded interval budget on a controlled host", () => {
    const input = { label: "desktop gameplay", scenario, frameInterval: lateVsync, host: "controlled" };
    const assessment = createPacingAssessment(input);
    expect(assessment.enforcement).toBe("required");
    expect(() => assertPacingAssessment(assessment, input)).toThrow(/frame-interval max ms: 50.1 exceeded budget 50/u);
  });

  it("records an exceeded interval budget on a shared host and returns it for the log", () => {
    const input = { label: "desktop gameplay", scenario, frameInterval: lateVsync, host: "shared" };
    const assessment = createPacingAssessment(input);
    expect(assessment).toMatchObject({ host: "shared", enforcement: "diagnostic-on-shared-host", status: "exceeded" });
    expect(assertPacingAssessment(assessment, input)).toEqual([
      "diagnostic (diagnostic-on-shared-host): desktop gameplay frame-interval max ms: 50.1 exceeded budget 50",
    ]);
  });

  it("keeps CPU-throttled pacing diagnostic on every host", () => {
    const throttled = { ...scenario, cpuThrottleRate: 4 };
    for (const host of ["controlled", "shared"]) {
      const input = { label: "constrained", scenario: throttled, frameInterval: lateVsync, host };
      expect(createPacingAssessment(input).enforcement).toBe("diagnostic-under-cpu-throttle");
    }
  });

  it("rejects an unknown host", () => {
    expect(() => createPacingAssessment({ label: "x", scenario, frameInterval: lateVsync, host: "fast" })).toThrow(
      /host is invalid/u,
    );
  });
});

// The 4x constrained scenario of config/browser-performance-budgets.json, and the profile's cadence rule.
const profile = { displayStepMs: 16.67, judgedIntervalSteps: 2 };
const constrained = { simulationP95Ms: 10, frameP95Ms: 20, canonicalTickP95Ms: 3 };
const desktop = { simulationP95Ms: 4, frameP95Ms: 16.67 };
// Measured on the hosted runner: the unthrottled desktop run slowed from 17 ms to 33 ms between frames
// while the cost of one tick stayed at 1.1 to 1.3 ms; the per-frame figure rose from 9.7 to 14.6 ms and the
// frame-work figure, which includes the same caught-up ticks, from 12.5 to 18.7 ms.
const healthyCadence = { p50Ms: 16.7 };
const slowCadence = { p50Ms: 116.7 };
const cheapTick = { p95Ms: 1.2 };
const input = (overrides) => ({
  label: "4x constrained gameplay",
  scenario: constrained,
  profile,
  simulation: { p95Ms: 14.6 },
  frame: { p95Ms: 18.7 },
  canonicalTick: cheapTick,
  frameInterval: slowCadence,
  ...overrides,
});

describe("browser performance frame-cost rule", () => {
  it("does not judge the per-frame figure when frames arrive slower than the profile's cadence, and says so", () => {
    const slow = input({});
    const assessment = createFrameCostAssessment(slow);
    expect(assessment).toMatchObject({ perFrameJudged: false, frameIntervalP50Ms: 116.7, failures: [] });
    expect(assertFrameCostAssessment(assessment, slow)).toEqual([
      "4x constrained gameplay: per-frame sim not judged: interval 116.7 ms (frame work is not judged either)",
    ]);
  });

  it("judges the per-frame figure when frames arrive at the profile's cadence", () => {
    const healthy = input({ frameInterval: healthyCadence });
    const assessment = createFrameCostAssessment(healthy);
    expect(assessment.perFrameJudged).toBe(true);
    expect(() => assertFrameCostAssessment(assessment, healthy)).toThrow(/simulation p95 ms: 14.6 exceeded budget 10/u);
    const within = input({ frameInterval: healthyCadence, simulation: { p95Ms: 9.7 } });
    expect(assertFrameCostAssessment(createFrameCostAssessment(within), within)).toEqual([]);
  });

  it("treats frame work like the per-frame simulation figure, because it includes the same caught-up ticks", () => {
    const slow = input({ frame: { p95Ms: 27.3 } });
    expect(createFrameCostAssessment(slow).failures).toEqual([]);
    const healthy = input({ frameInterval: healthyCadence, simulation: { p95Ms: 9.7 }, frame: { p95Ms: 27.3 } });
    expect(() => assertFrameCostAssessment(createFrameCostAssessment(healthy), healthy)).toThrow(
      /frame-work p95 ms: 27.3 exceeded budget 20/u,
    );
  });

  it("switches at the profile's limit, read from the profile and not from a literal", () => {
    const atLimit = input({ frameInterval: { p50Ms: 33.34 }, simulation: { p95Ms: 14.6 } });
    expect(createFrameCostAssessment(atLimit)).toMatchObject({ perFrameJudged: true, maxJudgedIntervalMs: 33.34 });
    const pastLimit = input({ frameInterval: { p50Ms: 33.35 } });
    expect(createFrameCostAssessment(pastLimit).perFrameJudged).toBe(false);
    const stricter = input({ frameInterval: { p50Ms: 33.3 }, profile: { displayStepMs: 8, judgedIntervalSteps: 2 } });
    expect(createFrameCostAssessment(stricter).perFrameJudged).toBe(false);
  });

  it("enforces the cost of one tick whatever the cadence", () => {
    for (const frameInterval of [healthyCadence, slowCadence]) {
      const heavy = input({ frameInterval, simulation: { p95Ms: 2 }, canonicalTick: { p95Ms: 3.1 } });
      expect(() => assertFrameCostAssessment(createFrameCostAssessment(heavy), heavy)).toThrow(
        /canonical tick p95 ms: 3.1 exceeded budget 3/u,
      );
    }
  });

  it("judges the per-frame figure at any cadence for a scenario with no tick budget", () => {
    const unthrottled = input({ scenario: desktop, canonicalTick: undefined, frameInterval: slowCadence });
    expect(createFrameCostAssessment(unthrottled).perFrameJudged).toBe(true);
    expect(() => assertFrameCostAssessment(createFrameCostAssessment(unthrottled), unthrottled)).toThrow(
      /simulation p95 ms: 14.6 exceeded budget 4/u,
    );
  });

  it("rejects missing or malformed evidence and a stale assessment", () => {
    expect(() => createFrameCostAssessment(input({ canonicalTick: undefined }))).toThrow(/frame-cost evidence/u);
    expect(() => createFrameCostAssessment(input({ profile: { displayStepMs: 0, judgedIntervalSteps: 2 } }))).toThrow(
      /frame-cost evidence/u,
    );
    const slow = input({});
    const stale = createFrameCostAssessment(input({ frameInterval: healthyCadence }));
    expect(() => assertFrameCostAssessment(stale, slow)).toThrow(/frame-cost assessment is invalid/u);
  });
});
