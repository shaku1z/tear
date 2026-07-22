import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { Cinematics, type CinematicScript } from "../../src/presentation/cinematics";
import { FX } from "../../src/presentation/particles";

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

  it("routes presentation entropy through the cosmetic random boundary", () => {
    for (const moduleName of ["attract-runtime.ts", "particles.ts"]) {
      const source = readFileSync(new URL(`../../src/presentation/${moduleName}`, import.meta.url), "utf8");
      expect(source).not.toContain("Math.random(");
      expect(source).toContain("cosmeticRandom");
    }
  });
});
