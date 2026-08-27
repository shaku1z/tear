import { describe, expect, it } from "vitest";
import { applyVariant, findVariant, resolveDiscoveredVariantIds, rollVariant, selectVariant, VERDANT_VARIANT_IDS, type VariantEnemy, type VariantSelectionContext } from "../../src/gameplay/variants";
import { CONFIG } from "../../src/config/game-config";
import { createEnemyHarness, createStandardActor, updateActor } from "./enemy-test-harness";

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

  it("keeps legacy variants on the global wave gate in campaign", () => {
    expect(selectVariant("charger", context({ localWave: 1, globalWave: 11, random: { next: () => 0.6 } }))).toMatchObject({ id: "stalker" });
    expect(selectVariant("ranged", context({ localWave: 1, globalWave: 11, random: { next: () => 0.9 } }))).toMatchObject({ id: "chain" });
  });

  it("requires discovery and depth in Endless/Gauntlet, never global wave alone", () => {
    const noDiscovery = context({ mode: "endless", stageId: "grounds", discoveredVariantIds: [] });
    expect(selectVariant("charger", noDiscovery)).not.toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "gauntlet", globalWave: 999, discoveredVariantIds: ["briar-stalker"] }))).toMatchObject({ id: "briar-stalker" });
    expect(selectVariant("charger", context({ mode: "endless", localWave: 3, discoveredVariantIds: ["briar-stalker"] }))).not.toMatchObject({ id: "briar-stalker" });
  });

  it("derives run discovery from persisted Verdant biome entry only", () => {
    expect(resolveDiscoveredVariantIds("endless", [])).toEqual([]);
    expect(resolveDiscoveredVariantIds("endless", ["grounds"])).toEqual([]);
    expect(resolveDiscoveredVariantIds("endless", ["verdant-sanctum"])).toEqual(VERDANT_VARIANT_IDS);
    expect(resolveDiscoveredVariantIds("campaign", ["verdant-sanctum"])).toEqual([]);
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

  it("executes all four Verdant behavior branches with their authored counterplay", () => {
    const briarHarness = createEnemyHarness([0.1]);
    const briar = createStandardActor("charger", briarHarness.types);
    applyVariant(briar, findVariant("charger", "briar-stalker"));
    briarHarness.player.x = briar.x + 100;
    briar.atk = "windup"; briar.atkT = 0.001; briar.onGround = true;
    updateActor(briar, 1, briarHarness.platforms, briarHarness.player, []);
    expect(briar.behavior).toBe("briar-stalker");
    expect(briar.vy).toBeLessThan(0); // rising terrace-crossing lunge

    const seedHarness = createEnemyHarness([0.1]);
    const seedcaster = createStandardActor("ranged", seedHarness.types);
    applyVariant(seedcaster, findVariant("ranged", "seedcaster"));
    const rangedSeedcaster = seedcaster as typeof seedcaster & { aimTimer: number };
    rangedSeedcaster.aimTimer = 0; seedHarness.player.x = seedcaster.x + 220;
    const seeds: InstanceType<typeof seedHarness.Projectile>[] = [];
    updateActor(seedcaster, 180, seedHarness.platforms, seedHarness.player, seeds);
    const seed = seeds.find((projectile) => projectile.kind === "seed");
    expect(seed).toBeDefined();
    expect(seed).toMatchObject({ mine: true, armed: false, armT: 0.45 });

    const canopyHarness = createEnemyHarness([0.1]);
    const canopy = createStandardActor("flyer", canopyHarness.types);
    applyVariant(canopy, findVariant("flyer", "canopy-diver"));
    const canopyDiver = canopy as typeof canopy & { aimTimer: number; state: string };
    canopyDiver.aimTimer = 0; canopyHarness.player.x = canopy.x;
    updateActor(canopy, 1, canopyHarness.platforms, canopyHarness.player, []);
    expect(canopyDiver.state).toBe("warn"); // geometry-first warning before force
    updateActor(canopy, Math.ceil(0.75 * 120) + 1, canopyHarness.platforms, canopyHarness.player, []);
    expect(["dive", "hover"]).toContain(canopyDiver.state); // dive then grounded recovery

    const barkHarness = createEnemyHarness([0.1]);
    const bark = createStandardActor("armored", barkHarness.types);
    const ordinary = createStandardActor("armored", barkHarness.types);
    applyVariant(bark, findVariant("armored", "bark-sentinel"));
    bark.hit(20, 1, 0); ordinary.hit(20, 1, 0);
    expect(bark.weight).toBeGreaterThan(ordinary.weight);
    expect(Math.abs(bark.vx)).toBeLessThan(Math.abs(ordinary.vx));
    expect(bark.anchored).toBe(false);
    expect(bark.applyBreak(CONFIG.weapons.hammer.breakThreshold * 2)).toBe(true);
    bark.hit(bark.maxHp + bark.shield + 1, 1, 0);
    expect(bark.dead).toBe(true); // remains break/kill counterable
  });
});
