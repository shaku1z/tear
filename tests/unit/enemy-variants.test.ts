import { describe, expect, it } from "vitest";
import { rollVariant, selectVariant } from "../../src/gameplay/variants";

describe("enemy variant selector compatibility", () => {
  it("keeps the legacy injected-wave API deterministic and Verdant-safe", () => {
    const random = { next: () => 0.999 };
    expect(rollVariant("bomber", 99, random)?.id).toBe("geomancer");
    expect(rollVariant("charger", 999, random)?.id).not.toBe("briar-stalker");
  });

  it("accepts the typed context overload without touching global randomness", () => {
    let draws = 0;
    const variant = selectVariant("charger", {
      stageId: "verdant-sanctum", localWave: 4, globalWave: 44, mode: "campaign",
      random: { next: () => { draws += 1; return 0.999; } },
    });
    expect(variant?.id).toBe("briar-stalker");
    expect(draws).toBe(1);
  });
});
