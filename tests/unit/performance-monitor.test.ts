import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../src/diagnostics/performance-monitor";

describe("PerformanceMonitor", () => {
  it("keeps bounded percentile samples and long-task counts", () => {
    const monitor = new PerformanceMonitor(4);
    for (const value of [100, 1, 2, 3, 4]) monitor.record("frame", value);
    const snapshot = monitor.snapshot();
    expect(snapshot.frame).toEqual({ samples: 4, p50Ms: 2, p95Ms: 4, p99Ms: 4, maxMs: 100 });
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

  it("resets timing samples without erasing long-task or gauge history", () => {
    const monitor = new PerformanceMonitor(2);
    monitor.record("frame", 60);
    monitor.record("simulation", 4);
    monitor.gauge("enemies", 8);
    monitor.resetTimingSamples();
    expect(monitor.snapshot()).toMatchObject({
      simulation: { samples: 0 },
      frame: { samples: 0 },
      frameInterval: { samples: 0 },
      outsideFrameWork: { samples: 0 },
      longTasks: 1,
      gauges: { enemies: 8 },
    });
  });

  it("keeps ring order independent from reusable percentile sorting", () => {
    const monitor = new PerformanceMonitor(4);
    for (const value of [4, 1, 3, 2]) monitor.record("render", value);
    expect(monitor.snapshot().render).toEqual({ samples: 4, p50Ms: 2, p95Ms: 4, p99Ms: 4, maxMs: 4 });

    monitor.record("render", 5);
    expect(monitor.snapshot().render).toEqual({ samples: 4, p50Ms: 2, p95Ms: 5, p99Ms: 5, maxMs: 5 });
  });
});
