import { describe, expect, it, vi } from "vitest";
import {
  createVerdantWaterFlow,
  sampleVerdantWaterSlope,
  verdantRippleEnvelope,
} from "../../src/presentation/verdant-water-flow";

describe("inlet-driven Verdant water proof slice", () => {
  it("moves a packet outward at 90 source pixels per second and dissipates it", () => {
    expect(verdantRippleEnvelope(90, 1)).toBeGreaterThan(verdantRippleEnvelope(180, 1) * 100);
    expect(verdantRippleEnvelope(180, 2)).toBeGreaterThan(verdantRippleEnvelope(90, 2) * 100);
    expect(verdantRippleEnvelope(180, 2)).toBeLessThan(verdantRippleEnvelope(90, 1));
    expect(verdantRippleEnvelope(90, -1)).toBe(0);
    expect(verdantRippleEnvelope(540, 6)).toBe(0);
  });

  it("has a spatially varying normal field, bounded offsets and repeatable seeks", () => {
    const sample = new Float64Array(2);
    sampleVerdantWaterSlope(1310, 760, 1, sample);
    const first = Array.from(sample);
    sampleVerdantWaterSlope(1390, 760, 1, sample);
    expect(sample[0]).toBeCloseTo(-(first[0] ?? 0), 10);
    expect(sample[1]).toBeCloseTo(first[1] ?? 0, 10);
    expect(Math.abs(first[0] ?? 0)).toBeGreaterThan(0.01);
    for (let time = 0; time < 12; time += 0.17) {
      for (let x = 180; x < 1480; x += 32) {
        sampleVerdantWaterSlope(x, 770, time, sample);
        expect(Math.abs(sample[0] ?? Infinity)).toBeLessThanOrEqual(5);
        expect(Math.abs(sample[1] ?? Infinity)).toBeLessThanOrEqual(1.4);
      }
    }
    sampleVerdantWaterSlope(1310, 760, 1, sample);
    expect(Array.from(sample)).toEqual(first);
  });

  it("keeps the lee transition continuous instead of introducing a hard seam", () => {
    const a = new Float64Array(2),
      b = new Float64Array(2);
    for (const [x, y] of [
      [1180, 760],
      [1150, 772],
    ]) {
      sampleVerdantWaterSlope((x ?? 0) - 0.001, (y ?? 0) - 0.001, 2, a);
      sampleVerdantWaterSlope((x ?? 0) + 0.001, (y ?? 0) + 0.001, 2, b);
      expect(Math.abs((a[0] ?? 0) - (b[0] ?? 0))).toBeLessThan(0.01);
      expect(Math.abs((a[1] ?? 0) - (b[1] ?? 0))).toBeLessThan(0.01);
    }
  });

  it("prepares a bounded water mesh and submits no draw in neutral or zero-flash mode", () => {
    const owner = createVerdantWaterFlow();
    expect(owner.cellCount).toBeGreaterThan(0);
    expect(owner.cellCount).toBeLessThanOrEqual(725);
    const drawImage = vi.fn(),
      transform = vi.fn();
    const context = new Proxy(
      { drawImage, transform },
      {
        get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined),
      },
    ) as unknown as CanvasRenderingContext2D;
    owner.draw(context, {} as CanvasImageSource, 1, "neutral", 1);
    owner.draw(context, {} as CanvasImageSource, 1, "live", 0);
    expect(drawImage).not.toHaveBeenCalled();
    owner.draw(context, {} as CanvasImageSource, 1, "live", 1);
    expect(drawImage).toHaveBeenCalledTimes(owner.cellCount * 2);
    for (const args of transform.mock.calls) for (const value of args) expect(Number.isFinite(value)).toBe(true);
  });

  it("moves left and center reflections at ordinary one-second intervals", () => {
    const a = new Float64Array(2),
      b = new Float64Array(2);
    for (const x of [380, 640, 850, 1050]) {
      sampleVerdantWaterSlope(x, 790, 0, a);
      sampleVerdantWaterSlope(x, 790, 1, b);
      expect(Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0))).toBeGreaterThan(0.5);
    }
  });
});
