import { describe, expect, it } from "vitest";

import { stageDefinition } from "../../src/gameplay/stages";
import { createBackdrop, type BackdropPolicy } from "../../src/presentation/backdrop";
import { PALE_BACKDROP_LIMITS } from "../../src/presentation/backdrop-biomes";

interface DrawCounts {
  readonly fills: number;
  readonly strokes: number;
  readonly curves: number;
  readonly images: number;
  readonly fillRects: readonly (readonly number[])[];
}

function renderPale(
  options: { low?: boolean; reducedMotion?: boolean; highContrast?: boolean } = {},
  view = { left: -224, top: -126, right: 1_824, bottom: 1_026 },
): DrawCounts {
  let fills = 0, strokes = 0, curves = 0, images = 0;
  const fillRects: number[][] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy({}, {
    get: (_target, key) => {
      if (key === "fill") return () => { fills += 1; };
      if (key === "fillRect") return (...args: number[]) => { fills += 1; fillRects.push(args); };
      if (key === "stroke") return () => { strokes += 1; };
      if (key === "bezierCurveTo") return () => { curves += 1; };
      if (key === "drawImage") return () => { images += 1; };
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => gradient;
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const policy: BackdropPolicy = {
    clock: { sim: 0 },
    config: {
      view: { w: 1_600, h: 900 }, world: { groundY: 760 }, source: { voidCrumbleStand: 1 },
      bossArena: { standBeforeWarn: 1, crackWarn: 1, brokenDuration: 1, reformWarn: 1 },
    },
    graphics: { low: options.low ?? false },
    accessibility: {
      highContrast: options.highContrast ?? false,
      flashScale: 1,
      reducedMotion: options.reducedMotion ?? false,
    },
    overscan: { x: 224, y: 126 }, theme: { dark: false },
    createCanvas: () => canvas, performance: { now: () => 0 },
  };
  const stage = stageDefinition("pale-traverse");
  createBackdrop(policy).draw(context, stage, 3, 800, view);
  return { fills, strokes, curves, images, fillRects };
}

describe("Pale Traverse backdrop", () => {
  it("draws aurora, jagged mountain layers, framing pines, village scale, and frozen field", () => {
    const counts = renderPale();
    expect(counts.fills).toBeGreaterThanOrEqual(30);
    expect(counts.strokes).toBeGreaterThanOrEqual(7);
  });

  it("reduces decorative budgets while preserving the landmark silhouette", () => {
    const full = renderPale(), low = renderPale({ low: true });
    const expectedStrokeReduction =
      PALE_BACKDROP_LIMITS.auroraBands - PALE_BACKDROP_LIMITS.lowGraphicsAuroraBands
      + PALE_BACKDROP_LIMITS.reflectionBands - PALE_BACKDROP_LIMITS.lowGraphicsReflectionBands;
    expect(full.strokes - low.strokes).toBe(expectedStrokeReduction);
    expect(low.fills).toBeGreaterThanOrEqual(15);
  });

  it("uses bounded abstract reflections and no live-scene image mirror", () => {
    expect(PALE_BACKDROP_LIMITS).toMatchObject({
      reflectionBands: 4,
      lowGraphicsReflectionBands: 2,
      auroraBands: 3,
      lowGraphicsAuroraBands: 1,
    });
    expect(renderPale().images).toBe(0);
    expect(renderPale({ low: true }).images).toBe(0);
  });

  it("supports reduced motion, high contrast, and true viewport bleed without changing stage layout", () => {
    const stage = stageDefinition("pale-traverse");
    const layout = structuredClone(stage.layout);
    for (const view of [
      { left: -320, top: -70, right: 1_920, bottom: 970 },
      { left: 0, top: -150, right: 1_600, bottom: 1_050 },
    ]) {
      const rendered = renderPale({ reducedMotion: true, highContrast: true }, view);
      expect(rendered.fillRects).toContainEqual([view.left, view.top, view.right - view.left, view.bottom - view.top]);
    }
    expect(stage.layout).toEqual(layout);
  });
});
