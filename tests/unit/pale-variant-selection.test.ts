import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { applyVariant, findVariant, PALE_VARIANT_IDS, resolveDiscoveredVariantIds, rollVariant, selectVariant,
  type VariantEnemy, type VariantSelectionContext } from "../../src/gameplay/variants";
import { stableVerificationHash } from "../../src/replay/hash";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench";
import { PALE_VARIANT_STATE_FORGE_SCENARIOS } from "../../src/tearbench/pale-state-forge-scenarios";
import { createEnemyHarness, createStandardActor, updateActor } from "./enemy-test-harness";

const random = { next: () => 0.999 };
const PALE_FAMILIES = [
  ["charger", "rime-runner"], ["ranged", "prism-seer"], ["flyer", "snowfall-kite"],
  ["bomber", "hailcaster"], ["armored", "glacier-guard"],
] as const;

function context(overrides: Partial<VariantSelectionContext> = {}): VariantSelectionContext {
  return { stageId: "pale-traverse", localWave: 6, globalWave: 46, mode: "campaign", random, ...overrides };
}

function enemy(kind: string): VariantEnemy {
  return { kind, behavior: "", contactReach: 0, speedMult: 1, hp: 100, maxHp: 100 };
}

describe("Pale variant selection contract", () => {
  it("selects each Pale identity only in its authored campaign stage", () => {
    expect(PALE_FAMILIES.map(([family]) => family)
      .map((family) => selectVariant(family, context())?.id)).toEqual(PALE_VARIANT_IDS);
    for (const [family, id] of PALE_FAMILIES) {
      for (const stageId of ["grounds", "verdant-sanctum"] as const) {
        expect(selectVariant(family, context({ stageId, globalWave: 999 }))).not.toMatchObject({ id });
      }
    }
  });

  it("uses local-wave gates and excludes Pale identities from legacy rolls", () => {
    for (const [family, id] of PALE_FAMILIES) {
      expect(selectVariant(family, context({ localWave: 1 }))).not.toMatchObject({ id });
    }
    for (let wave = 1; wave <= 999; wave += 1) {
      for (const [family] of PALE_FAMILIES) {
        expect(PALE_VARIANT_IDS).not.toContain(rollVariant(family, wave, random)?.id);
      }
    }
  });

  it("requires persisted Pale discovery in Endless and Gauntlet", () => {
    expect(selectVariant("charger", context({ mode: "endless", stageId: "grounds", discoveredVariantIds: [] })))
      .not.toMatchObject({ id: "rime-runner" });
    expect(selectVariant("charger", context({ mode: "gauntlet", stageId: "grounds",
      discoveredVariantIds: ["rime-runner"] }))).toMatchObject({ id: "rime-runner" });
    expect(selectVariant("charger", context({ mode: "endless", stageId: "grounds", localWave: 3,
      discoveredVariantIds: ["rime-runner"] }))).not.toMatchObject({ id: "rime-runner" });
    expect(resolveDiscoveredVariantIds("endless", ["pale-traverse"])).toEqual(PALE_VARIANT_IDS);
    expect(resolveDiscoveredVariantIds("gauntlet", ["The Verdant Sanctum", "The Pale Traverse"]))
      .toHaveLength(9);
  });

  it("allows explicit development selection without implicit mode leakage", () => {
    expect(selectVariant("charger", context({ mode: "playground", stageId: "grounds",
      explicitVariantId: "rime-runner" }))).toMatchObject({ id: "rime-runner" });
    expect(selectVariant("armored", context({ mode: "sandbox", stageId: "grounds",
      explicitVariantId: "glacier-guard" }))).toMatchObject({ id: "glacier-guard" });
    for (const [family, id] of PALE_FAMILIES) {
      expect(selectVariant(family, context({ mode: "sandbox", stageId: "pale-traverse" })))
        .not.toMatchObject({ id });
      expect(selectVariant(family, context({ mode: "playground", stageId: "pale-traverse" })))
        .not.toMatchObject({ id });
      for (const mode of ["tutorial", "bossonly"] as const) {
        expect(selectVariant(family, context({ mode, discoveredVariantIds: PALE_VARIANT_IDS })))
          .not.toMatchObject({ id });
      }
    }
  });

  it("restores canonical identities through the existing family lookup", () => {
    for (const [kind, id] of PALE_FAMILIES) {
      const target = enemy(kind); applyVariant(target, findVariant(kind, id));
      expect(target).toMatchObject({ variant: id });
      expect(target.behavior).not.toBe("");
    }
    expect(findVariant("ranged", "hailcaster")).toBeNull();
  });

  it("round-trips every Pale identity through the production State Forge boundary", () => {
    for (const { family: kind, variantId: id, seed } of PALE_VARIANT_STATE_FORGE_SCENARIOS) {
      const composition = createProductionGhostReplayComposition({ seed, mode: "endless" });
      const source = composition.create(undefined);
      const actor = source.replay.world.entities.createEnemy(kind, 360, 700,
        source.replay.world.state.run() as never) as never as VariantEnemy;
      applyVariant(actor, findVariant(kind, id));
      source.replay.world.state.setEnemies([actor] as never);
      const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward,
        `pale-${id}-restore-source`);
      const restored = composition.create(checkpoint.snapshot);
      expect(restored.replay.world.state.enemies()[0]).toMatchObject({ kind, variant: id,
        variantName: findVariant(kind, id)?.name, behavior: actor.behavior });
      const roundTrip = captureProductionReplayCheckpoint(restored.replay, restored.combat, restored.waveReward,
        `pale-${id}-restore-round-trip`);
      expect(stableVerificationHash(roundTrip.snapshot.state["tear.enemy.v1"]))
        .toBe(stableVerificationHash(checkpoint.snapshot.state["tear.enemy.v1"]));
      expect(roundTrip.snapshot.hashes.semantic).toBe(checkpoint.snapshot.hashes.semantic);
    }
  });

  it("executes the five Pale family behaviors with readable counterplay", () => {
    const chargerHarness = createEnemyHarness([0.1]);
    const runner = createStandardActor("charger", chargerHarness.types);
    applyVariant(runner, findVariant("charger", "rime-runner"));
    chargerHarness.player.x = runner.x + 120; runner.onGround = true;
    updateActor(runner, 1, chargerHarness.platforms, chargerHarness.player, []);
    expect(runner.atk).toBe("windup"); runner.atkT = 0.001;
    updateActor(runner, 1, chargerHarness.platforms, chargerHarness.player, []);
    expect(runner.atk).toBe("commit");
    const rimeRunner = runner as typeof runner & { onAuroraTrackInfluence(direction: -1 | 1, onTrack: boolean): void };
    const beforeTrack = rimeRunner.atkT; rimeRunner.onAuroraTrackInfluence(1, true);
    expect(rimeRunner.atkT).toBeGreaterThan(beforeTrack);
    rimeRunner.x = rimeRunner.hw; rimeRunner.atkDir = -1; rimeRunner.vx = -CONFIG.enemy.chargeSpeed;
    updateActor(rimeRunner, 1, chargerHarness.platforms, chargerHarness.player, []);
    expect(rimeRunner).toMatchObject({ atk: "commit", rimeRebounds: 1, atkDir: 1 });

    const rangedHarness = createEnemyHarness([0.1]);
    const prism = createStandardActor("ranged", rangedHarness.types);
    applyVariant(prism, findVariant("ranged", "prism-seer"));
    const ranged = prism as typeof prism & { aimTimer: number };
    ranged.aimTimer = 0; rangedHarness.player.x = prism.x + 240;
    const prismShots: InstanceType<typeof rangedHarness.Projectile>[] = [];
    updateActor(prism, 180, rangedHarness.platforms, rangedHarness.player, prismShots);
    expect(prismShots.filter((shot) => shot.kind === "prism-shard")).toHaveLength(2);
    const shard = prismShots[0]; if (!shard) throw new Error("Prism shard was not created");
    shard.deflect(1, 0, CONFIG.blade.perfectSpeed, true);
    expect(shard).toMatchObject({ kind: "prism-return", perfect: true, counterplay: "recombined return" });
    expect(prismShots.filter((shot) => shot.dead)).toHaveLength(1);

    const flyerHarness = createEnemyHarness([0.1]);
    const kite = createStandardActor("flyer", flyerHarness.types);
    applyVariant(kite, findVariant("flyer", "snowfall-kite"));
    const snowfall = kite as typeof kite & { aimTimer: number; state: string; warnT: number; snowWakeT: number };
    snowfall.aimTimer = 0; flyerHarness.player.x = kite.x;
    updateActor(kite, 1, flyerHarness.platforms, flyerHarness.player, []);
    expect(snowfall.state).toBe("warn"); snowfall.warnT = 0.001;
    updateActor(kite, 1, flyerHarness.platforms, flyerHarness.player, []);
    expect(snowfall.state).toBe("dive");
    snowfall.y = CONFIG.world.groundY - snowfall.hh - 1;
    updateActor(kite, 1, flyerHarness.platforms, flyerHarness.player, []);
    expect(snowfall).toMatchObject({ state: "recover", snowWakeT: 0.7 });

    const bomberHarness = createEnemyHarness([0.1]);
    const hailcaster = createStandardActor("bomber", bomberHarness.types);
    applyVariant(hailcaster, findVariant("bomber", "hailcaster"));
    const bomber = hailcaster as typeof hailcaster & { lobTimer: number };
    bomber.lobTimer = 0; bomberHarness.player.x = hailcaster.x + 200;
    const hail: InstanceType<typeof bomberHarness.Projectile>[] = [];
    updateActor(hailcaster, 1, bomberHarness.platforms, bomberHarness.player, hail);
    expect(hail[0]).toMatchObject({ kind: "hail-orb", bomb: true,
      counterplay: "deflect/detonate or ground shatter" });
    const orb = hail[0]; if (!orb) throw new Error("Hail orb was not created");
    const hailOwner = hailcaster as typeof hailcaster & { onProjectileGroundImpact(projectile: typeof orb): void };
    hailOwner.onProjectileGroundImpact(orb);
    updateActor(hailcaster, 1, bomberHarness.platforms, bomberHarness.player, hail);
    expect(hail.filter((shot) => shot.kind === "hail-shard")).toHaveLength(6);

    const armoredHarness = createEnemyHarness([0.1]);
    const guard = createStandardActor("armored", armoredHarness.types) as ReturnType<typeof createStandardActor> & { glacierCracked: boolean };
    applyVariant(guard, findVariant("armored", "glacier-guard")); guard.onGround = true;
    expect(guard.damageTakenMult()).toBe(0.28);
    guard.hit(1, 0, -1); expect(guard.glacierCracked).toBe(true);
    expect(guard.damageTakenMult()).toBe(0.5);
    expect(guard.applyBreak(CONFIG.weapons.hammer.breakThreshold * 2)).toBe(true);
    expect(guard).toMatchObject({ enraged: true, glacierCracked: true });
    expect(guard.damageTakenMult()).toBe(1.35);
  });
});
