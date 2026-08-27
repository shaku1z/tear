import { describe, expect, it } from "vitest";

import { STAGES } from "../../src/gameplay/stages";
import { createBackdrop, type BackdropPolicy } from "../../src/presentation/backdrop";
import { biomeArtForStage } from "../../src/presentation/backdrop-biomes";

function canvas(): HTMLCanvasElement {
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy({}, {
    get: (_target, key) => key === "createRadialGradient" ? () => gradient : () => undefined,
  });
  return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
}

function policy(clock: { sim: number }, width: number, low = false): BackdropPolicy {
  return {
    clock,
    config: {
      view: { w: width, h: 900 }, world: { groundY: 760 }, source: { voidCrumbleStand: 1 },
      bossArena: { standBeforeWarn: 1, crackWarn: 1, brokenDuration: 1, reformWarn: 1 },
    },
    graphics: { low }, accessibility: { highContrast: false, flashScale: 1, reducedMotion: false },
    overscan: { x: width / 100, y: 4 }, theme: { dark: false },
    createCanvas: canvas, performance: { now: () => 5_000 },
  };
}

describe("Backdrop policy", () => {
  it("keeps clocks, effects, caches, and visual policy local to each controller", () => {
    const firstClock = { sim: 2 }, secondClock = { sim: 7 };
    const firstPolicy = policy(firstClock, 1_600);
    const secondPolicy = policy(secondClock, 2_000);
    const first = createBackdrop(firstPolicy), second = createBackdrop(secondPolicy);
    const stage = STAGES[0];
    if (stage === undefined) throw new Error("backdrop policy test requires a stage");

    expect([first.W, first.H, first.PX, first.PY]).toEqual([1_600, 900, 16, 4]);
    expect([second.W, second.H, second.PX, second.PY]).toEqual([2_000, 900, 20, 4]);
    expect(first.lowGraphics()).toBe(false);
    (firstPolicy.graphics as { low: boolean }).low = true;
    expect(first.lowGraphics()).toBe(true);
    expect(second.lowGraphics()).toBe(false);

    first.flare(10, 10, "#fff", 20, 1);
    second.flare(10, 10, "#fff", 20, 1);
    expect(first._fx[0]).toMatchObject({ end: 3, screen: false });
    expect(second._fx[0]).toMatchObject({ end: 8, screen: false });
    first.resetFx();
    expect(first._fx).toEqual([]);
    expect(second._fx).toHaveLength(1);

    const firstCache = first._get(stage), secondCache = second._get(stage);
    expect(firstCache).not.toBe(secondCache);
    expect(firstCache.vign).not.toBe(secondCache.vign);
    expect(firstCache.parts).not.toBe(secondCache.parts);
  });

  it("dispatches and caches biome art by stable stage ID rather than display name", () => {
    const controller = createBackdrop(policy({ sim: 0 }, 1_600));
    const stage = STAGES[0];
    if (stage === undefined) throw new Error("backdrop policy test requires a stage");
    const renamed = { ...stage, name: "A COPY EDIT MUST NOT CHANGE ART" } as typeof stage;

    expect(biomeArtForStage(renamed)).toBe(biomeArtForStage(stage));
    expect(controller._get(renamed)).toBe(controller._get(stage));
    expect(Object.keys(controller._cache)).toEqual([stage.id]);
  });
});
