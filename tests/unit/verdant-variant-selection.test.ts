import { describe, expect, it } from "vitest";
import { applyVariant, findVariant, rollVariant, selectVariant, VERDANT_VARIANT_IDS, type VariantEnemy, type VariantSelectionContext } from "../../src/gameplay/variants";

const random = { next: () => 0.999 };

function context(overrides: Partial<VariantSelectionContext> = {}): VariantSelectionContext {
  return {
    stageId: "verdant-sanctum", localWave: 6, globalWave: 46, mode: "campaign", random,
    ...overrides,
  };
}

function enemy(kind: string): VariantEnemy {
  return { kind, behavior: "", contactReach: 0, speedMult: 1, hp: 100, maxHp: 100 };
}

describe("Verdant variant selection contract", () => {
  it("selects each authored Verdant family identity only in its campaign stage", () => {
    const families = ["charger", "ranged", "flyer", "armored"];
    expect(families.map((family) => selectVariant(family, context())?.id)).toEqual([
      "briar-stalker", "seedcaster", "canopy-diver", "bark-sentinel",
    ]);
    expect(VERDANT_VARIANT_IDS).toHaveLength(4);
    expect(selectVariant("charger", context({ stageId: "grounds", globalWave: 999 }))).not.toMatchObject({ id: "briar-stalker" });
  });

  it("uses authored local-wave gates in campaign and does not leak from legacy rolls", () => {
    expect(selectVariant("charger", context({ localWave: 3 }))).not.toMatchObject({ id: "briar-stalker" });
    for (let wave = 1; wave <= 999; wave += 1) expect(VERDANT_VARIANT_IDS).not.toContain(rollVariant("charger", wave, random)?.id);
  });

  it("requires discovery and depth in Endless/Gauntlet, never global wave alone", () => {
    const noDiscovery = context({ mode: "endless", stageId: "grounds", discoveredVariantIds: [] });
    expect(selectVariant("charger", noDiscovery)).not.toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "gauntlet", globalWave: 999, discoveredVariantIds: ["briar-stalker"] }))).toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "endless", localWave: 3, discoveredVariantIds: ["briar-stalker"] }))).not.toMatchObject({ id: "briar-stalker" });
  });

  it("allows explicit Playground/Enemy Test selection and rejects implicit sandbox leakage", () => {
    expect(selectVariant("charger", context({ mode: "playground", stageId: "grounds", explicitVariantId: "briar-stalker" }))).toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("armored", context({ mode: "sandbox", stageId: "grounds", explicitVariantId: "bark-sentinel" }))).toMatchObject({ id: "bark-sentinel" });
    expect(selectVariant("charger", context({ mode: "sandbox", stageId: "grounds" }))).not.toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "bossonly", stageId: "verdant-sanctum", discoveredVariantIds: VERDANT_VARIANT_IDS }))).not.toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "tutorial", stageId: "verdant-sanctum" }))).not.toMatchObject({ id: "briar-stalker" });
  });

  it("resolves a restored identity and applies a distinct family behavior", () => {
    const restored = findVariant("ranged", "seedcaster");
    expect(restored).not.toBeNull();
    const target = enemy("ranged");
    applyVariant(target, restored);
    expect(target).toMatchObject({ variant: "seedcaster", variantName: "Seedcaster", behavior: "seedcaster" });
    expect(findVariant("charger", "seedcaster")).toBeNull();
    const briar = enemy("charger"); applyVariant(briar, findVariant("charger", "briar-stalker"));
    expect(briar.behavior).toBe("briar-stalker");
    const bark = enemy("armored"); bark.weight = 1; applyVariant(bark, findVariant("armored", "bark-sentinel"));
    expect(bark).toMatchObject({ variant: "bark-sentinel", behavior: "bark-sentinel", weight: 1.25 });
  });
});
