import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../src/diagnostics/performance-monitor";

describe("PerformanceMonitor", () => {
  it("keeps bounded percentile samples and long-task counts", () => {
    const monitor = new PerformanceMonitor(4);
    for (const value of [1, 2, 3, 100, 4]) monitor.record("frame", value);
    const snapshot = monitor.snapshot();
    expect(snapshot.frame).toEqual({ samples: 4, p50Ms: 3, p95Ms: 100, maxMs: 100 });
    expect(snapshot.longTasks).toBe(1);
  });

  it("rejects invalid samples and returns stable sorted gauges", () => {
    const monitor = new PerformanceMonitor(2);
    monitor.record("simulation", Number.NaN);
    monitor.gauge("projectiles", 4);
    monitor.gauge("enemies", 8);
    expect(monitor.snapshot()).toMatchObject({
      simulation: { samples: 0 },
      gauges: { enemies: 8, projectiles: 4 },
    });
  });
});
