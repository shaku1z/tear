import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG, GFX } from "../../src/config/game-config";
import { Cinematics, type CinematicScript } from "../../src/presentation/cinematics";
import { createParticleSystem } from "../../src/presentation/particles";

const FX = createParticleSystem();

describe("presentation system boundaries", () => {
  it("requires a fresh post-arm confirm before advancing a cinematic line", () => {
    const director = new Cinematics.Director();
    const script = {
      id: "input-latch",
      beats: [
        { id: "line", line: "Hold inheritance must not skip this.", completion: "confirm" },
        { id: "next", duration: 1 },
      ],
    } satisfies CinematicScript;

    director.start(script);
    director.update(0.2, {});
    director.update(0.01, { key: true });
    expect(director.beatId).toBe("line");
    expect(director.revealProgress).toBe(1);

    director.update(0.01, {});
    director.update(0.01, { key: true });
    expect(director.beatId).toBe("next");
  });

  it("keeps the shared particle pool within its configured allocation cap", () => {
    FX.reset();
    for (let index = 0; index < CONFIG.effects.highBudget * 3; index += 1) {
      FX.ring(100, 100);
    }
    expect(FX.list.length).toBeLessThanOrEqual(CONFIG.effects.highBudget);
    FX.reset();
  });

  it("returns immutable admission receipts without claiming randomized particle state", () => {
    const effects = createParticleSystem();
    const ring = effects.ring(100, 100, 8, "#abc");
    const burst = effects.burst(100, 100, 1, -1, 3, "#def");

    expect(ring).toEqual({
      accepted: true, requested: 1, emitted: 1,
      rejected: { culled: 0, budget: 0 }, listDelta: 1,
    });
    expect(burst).toEqual({
      accepted: true, requested: 3, emitted: 3,
      rejected: { culled: 0, budget: 0 }, listDelta: 3,
    });
    expect(Object.isFrozen(ring)).toBe(true);
    expect(Object.isFrozen(ring.rejected)).toBe(true);
    expect(Object.isFrozen(burst)).toBe(true);
    expect(Object.isFrozen(burst.rejected)).toBe(true);
    expect(burst).not.toHaveProperty("particles");
  });

  it("distinguishes culling from complete and partial budget rejection", () => {
    const priorLow = GFX.low;
    GFX.low = false;
    try {
      const culled = createParticleSystem();
      culled.setViewRect({ left: 0, top: 0, right: 100, bottom: 100 });
      expect(culled.ring(1000, 1000)).toEqual({
        accepted: false, requested: 1, emitted: 0,
        rejected: { culled: 1, budget: 0 }, listDelta: 0,
      });
      expect(culled.burst(1000, 1000, 1, 0, 3)).toEqual({
        accepted: false, requested: 3, emitted: 0,
        rejected: { culled: 3, budget: 0 }, listDelta: 0,
      });

      const budgeted = createParticleSystem();
      for (let index = 0; index < CONFIG.effects.highBudget - 2; index++) budgeted.ring(10, 10);
      expect(budgeted.burst(10, 10, 1, 0, 4)).toEqual({
        accepted: true, requested: 4, emitted: 2,
        rejected: { culled: 0, budget: 2 }, listDelta: 2,
      });
      expect(budgeted.ring(10, 10)).toEqual({
        accepted: false, requested: 1, emitted: 0,
        rejected: { culled: 0, budget: 1 }, listDelta: 0,
      });
    } finally {
      GFX.low = priorLow;
    }
  });

  it("routes presentation entropy through the cosmetic random boundary", () => {
    for (const moduleName of ["attract-runtime.ts", "particles.ts"]) {
      const source = readFileSync(new URL(`../../src/presentation/${moduleName}`, import.meta.url), "utf8");
      expect(source).not.toContain("Math.random(");
      expect(source).toContain("cosmeticRandom");
    }
  });
});
