import { describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { BLOOM_WELL_TIMING, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

interface ProductionBladeTransport {
  x: number; y: number; vx: number; vy: number; angle: number; aimX: number; aimY: number;
  state: string; flyTime: number; throwId: number;
  throwBlade(): boolean;
  _updateThrown(seconds: number, player: never, platforms: readonly never[]): void;
}

describe("Verdant Final Five conformance", () => {
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
