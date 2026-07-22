import { describe, expect, it } from "vitest";
import { TearWipe } from "../../src/presentation/tear-wipe";

function contextStub(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  return new Proxy({} as CanvasRenderingContext2D, {
    get(target, key) {
      if (key === "createLinearGradient") return () => gradient;
      const current = Reflect.get(target, key) as unknown;
      return current ?? (() => undefined);
    },
    set(target, key, value) { return Reflect.set(target, key, value); },
  });
}

function canvasStub(context: CanvasRenderingContext2D): HTMLCanvasElement {
  return { width: 1600, height: 900, getContext: () => context } as unknown as HTMLCanvasElement;
}

describe("TearWipe", () => {
  it("captures a frame and bounds transition particles", () => {
    const context = contextStub();
    const wipe = new TearWipe({
      canvas: canvasStub(context), context,
      createCanvas: () => canvasStub(context),
      reducedEffects: () => false, flashScale: () => 1,
      random: () => 0.5, ease: (value) => value,
      maxParticles: 8,
    });
    wipe.begin();
    for (let frame = 0; frame < 100; frame += 1) wipe.draw(1 / 120);
    expect(wipe.active).toBe(true);
    expect(wipe.remainingSeconds).toBeGreaterThan(0);
    expect(wipe.particleCount).toBeLessThanOrEqual(8);
  });

  it("does not allocate sparks in reduced-effects mode", () => {
    const context = contextStub();
    const wipe = new TearWipe({
      canvas: canvasStub(context), context,
      createCanvas: () => canvasStub(context),
      reducedEffects: () => true, flashScale: () => 0,
      random: () => 0.5, ease: (value) => value,
    });
    wipe.begin();
    wipe.draw(0.25);
    expect(wipe.particleCount).toBe(0);
  });
});
