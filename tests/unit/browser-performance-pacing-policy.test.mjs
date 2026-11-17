// The frame-pacing rule of tests/browser-performance.js: which host classes enforce interval budgets.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertPacingAssessment,
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
