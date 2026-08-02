import { describe, expect, it, vi } from "vitest";

import { createLiveBiomeProgressPersistence } from "../../src/app/live-biome-progress-persistence";

describe("live biome progress persistence adapter", () => {
  it("marks the biome before recording the resulting discovery maximum", () => {
    const order: string[] = [];
    const markBiome = vi.fn((name: string) => { order.push(`mark:${name}`); return 4; });
    const maxStat = vi.fn((stat: string, value: number) => { order.push(`max:${stat}:${String(value)}`); });
    const persistence = createLiveBiomeProgressPersistence({ markBiome, maxStat });

    persistence.remember("glassshore");

    expect(order).toEqual(["mark:glassshore", "max:biomesSeen:4"]);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
