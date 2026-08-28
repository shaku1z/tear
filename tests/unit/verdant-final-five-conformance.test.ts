import { describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { getWeapon } from "../../src/gameplay/weapons";
import { BLOOM_WELL_TIMING, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { createEnvironmentCombatObjectRuntime } from "../../src/gameplay/environment/combat-object-runtime";
import { resolveHeldEnvironmentWeaponContacts } from "../../src/gameplay/combat/environment-weapon-contact-runtime";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

interface ProductionBladeTransport {
  x: number; y: number; vx: number; vy: number; angle: number; aimX: number; aimY: number;
  state: string; flyTime: number; throwId: number;
  throwBlade(): boolean;
  _updateThrown(seconds: number, player: never, platforms: readonly never[]): void;
}

describe("Verdant Final Five conformance", () => {
  it.each(WEAPON_IDS)("dedupes %s object damage without reward, proc, or status leakage", (weaponId) => {
    const environment = new EnvironmentRuntime("verdant-sanctum", `dedupe-${weaponId}`);
    const original = Object.freeze({
      id: `graft-${weaponId}`, factoryId: "graft-anchor", kind: "graft-anchor" as const,
      ownerId: "rootbound", targetId: "rootbound", geometry: Object.freeze({ x: 20, y: -10, w: 20, h: 20 }),
      integrity: 100, maxIntegrity: 100, counterplayTags: Object.freeze(["cut", "break", "projectile-cut"]),
      procEligible: false, damageDedupeId: `graft-${weaponId}:damage`, state: "active" as const,
      stateTick: 0, cleanupReason: null,
    });
    environment.addCombatObject(original);
    const weapon = getWeapon(weaponId);
    expect(weapon.environmentCounterplay?.held).toBeDefined();
    const blade = { state: "held", swingId: 1, weapon, damageAt: () => 10 };
    const segment = { x1: 0, y1: 0, x2: 60, y2: 0, pad: 4 };

    expect(resolveHeldEnvironmentWeaponContacts({ environment, blade, segment, tick: 1 }).damaged).toBe(1);
    expect(resolveHeldEnvironmentWeaponContacts({ environment, blade, segment, tick: 2 }).damaged).toBe(0);
    const after = environment.combatObjects()[0];
    expect(after).toEqual({ ...original, integrity: 90, stateTick: 1 });
    for (const forbidden of ["bleedStacks", "burnT", "markT", "rootT", "seamT", "coins", "score", "reward"]) {
      expect(Object.hasOwn(after ?? {}, forbidden)).toBe(false);
    }
    expect(createEnvironmentCombatObjectRuntime(after!).policy).toEqual({
      countsAsOrdinaryEnemy: false, grantsEnemyReward: false, procEligible: false,
      counterplayTags: ["cut", "break", "projectile-cut"],
    });
  });

  it.each(WEAPON_IDS)("keeps %s transport outside Bloom Wells V1", (weaponId) => {
    const runProductionCrossing = (withBloomWell: boolean) => {
      const replay = createProductionReplayWorld({ seed: `bloom-transport-${weaponId}`, weaponId });
      const blade = replay.world.state.blade() as never as ProductionBladeTransport;
      blade.x = 100; blade.y = 100; blade.angle = 0; blade.aimX = 1; blade.aimY = 0; blade.state = "held";
      expect(blade.throwBlade()).toBe(true);
      const environment = replay.world.context.environment;
      if (withBloomWell) environment.addField(createBloomWellState({
        id: "final-five-well", ownerId: "stage-owner", variant: "stage",
        geometry: { x: 100, y: 100, radius: 160 }, patternId: "transport-exclusion",
      }));
      environment.setBloomWellActorsSource(() => []);
      environment.step(BLOOM_WELL_TIMING.warningTicks, 1 / BLOOM_WELL_TIMING.ticksPerSecond,
        () => { blade._updateThrown(1 / BLOOM_WELL_TIMING.ticksPerSecond, replay.world.state.player() as never, []); });
      return { x: blade.x, y: blade.y, vx: blade.vx, vy: blade.vy, angle: blade.angle,
        state: blade.state, flyTime: blade.flyTime, throwId: blade.throwId };
    };

    expect(runProductionCrossing(true)).toEqual(runProductionCrossing(false));
  });
});
