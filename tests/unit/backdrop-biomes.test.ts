import { describe, expect, it } from "vitest";

import { STAGES } from "../../src/gameplay/stages";
import { createBackdrop, type BackdropPolicy } from "../../src/presentation/backdrop";

interface DrawCounts { readonly fills: number; readonly strokes: number; readonly arcs: number; readonly curves: number }

function renderVerdant(low: boolean): DrawCounts {
  let fills = 0, strokes = 0, arcs = 0, curves = 0;
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy({}, {
    get: (_target, key) => {
      if (key === "fill" || key === "fillRect") return () => { fills += 1; };
      if (key === "stroke") return () => { strokes += 1; };
      if (key === "arc") return () => { arcs += 1; };
      if (key === "bezierCurveTo") return () => { curves += 1; };
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
    graphics: { low }, accessibility: { highContrast: false, flashScale: 1 },
    overscan: { x: 224, y: 126 }, theme: { dark: false },
    createCanvas: () => canvas, performance: { now: () => 0 },
  };
  const stage = STAGES.find((candidate) => candidate.id === "verdant-sanctum");
  if (stage === undefined) throw new Error("Verdant stage is required");
  createBackdrop(policy).draw(context, stage, 3, 800, { left: -224, top: -126, right: 1_824, bottom: 1_026 });
  return { fills, strokes, arcs, curves };
}

describe("Verdant backdrop", () => {
  it("draws layered sanctuary geometry through the stable Verdant stage identity", () => {
    const counts = renderVerdant(false);
    expect(counts.fills).toBeGreaterThanOrEqual(20);
    expect(counts.strokes).toBeGreaterThanOrEqual(16);
    expect(counts.arcs).toBeGreaterThanOrEqual(8);
    expect(counts.curves).toBeGreaterThanOrEqual(16);
  });

  it("keeps the structural silhouette while low graphics removes ambient motes", () => {
    const full = renderVerdant(false), low = renderVerdant(true);
    expect(low.strokes).toBe(full.strokes);
    expect(low.arcs).toBeLessThan(full.arcs);
    expect(low.curves).toBe(full.curves);
  });
});
