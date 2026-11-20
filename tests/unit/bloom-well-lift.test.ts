/**
 * Who a Bloom Well lifts, measured on the real enemies and the real player standing on the floor of the
 * Verdant stage through one full cycle of a stage Well. The rule is the targets row in BLOOM_WELL_LIFT;
 * this file is what holds the game to it.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len } from "../../src/domain/geometry";
import { createPlayer, type PlayerInputPort, type PlayerPlatformPort } from "../../src/gameplay/entities/player";
import { bindLiveBloomWellActors } from "../../src/gameplay/environment/biome-actors/bloom-well-actors";
import { BLOOM_WELL_LIFT, BLOOM_WELL_TIMING, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { FIELD_HEAVY_ENEMY_WEIGHT, fieldEnemyClass } from "../../src/gameplay/environment/field-runtime";
import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { STAGE_ENVIRONMENT_DEFINITIONS } from "../../src/gameplay/environment/stage-environment-definitions";
import {
  createEnemyHarness,
  createTestPlayer,
  STANDARD_ACTOR_FACTORIES,
  type BehaviorActor,
} from "./enemy-test-harness";

const DT = 1 / BLOOM_WELL_TIMING.ticksPerSecond;
type ActorKind = keyof typeof STANDARD_ACTOR_FACTORIES;

function stageWithWells() {
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "bloom-well-lift" });
  activateStageEnvironment(environment, "verdant-sanctum", 0, "new-run", 800);
  const well = environment.fields()[0];
  if (well === undefined) throw new Error("the Verdant stage has no Bloom Well");
  return { environment, centre: well.geometry.x + (well.geometry.w ?? 0) / 2 };
}

/** How far the enemy rose above where it stood, with and without the Well. */
function enemyRise(kind: ActorKind, change?: (actor: BehaviorActor) => void): { lifted: number; alone: number } {
  const run = (wells: boolean): number => {
    const harness = createEnemyHarness([0.5]);
    const actor = STANDARD_ACTOR_FACTORIES[kind](harness.types);
    const { environment, centre } = stageWithWells();
    actor.x = centre;
    change?.(actor);
    const player = createTestPlayer({ x: 60 });
    if (wells)
      bindLiveBloomWellActors(
        environment,
        () => player,
        () => [actor],
        () => "enemy:1",
      );
    const start = actor.y;
    let top = start;
    for (let tick = 0; tick < BLOOM_WELL_TIMING.totalTicks; tick += 1) {
      environment.step(tick, DT, () => undefined);
      actor.update(DT, harness.platforms, player, []);
      // Kept in the column, so the measure is the Well and not where the enemy chose to walk.
      actor.x = centre;
      top = Math.min(top, actor.y);
    }
    return start - top;
  };
  return { lifted: run(true), alone: run(false) };
}

describe("who a Bloom Well lifts", () => {
  it("stands on the floor on every stage that has one, so it lifts whoever stands in it", () => {
    const wells = Object.values(STAGE_ENVIRONMENT_DEFINITIONS).flatMap((stage) =>
      stage.initialFields.filter((field) => field.kind === "bloom-well"),
    );
    expect(wells.length).toBeGreaterThan(0);
    for (const well of wells) expect(well.geometry.y + well.geometry.h).toBe(CONFIG.world.groundY);
  });

  it("lifts a light enemy off the floor, leaves a heavy one standing and never moves one that flies", () => {
    const column = Object.values(STAGE_ENVIRONMENT_DEFINITIONS["verdant-sanctum"].initialFields)[0]?.geometry.h ?? 0;
    const seen = new Set<string>();
    for (const kind of Object.keys(STANDARD_ACTOR_FACTORIES) as ActorKind[]) {
      const sample = STANDARD_ACTOR_FACTORIES[kind](createEnemyHarness([0.5]).types);
      const rise = enemyRise(kind);
      if (sample.flies) {
        expect(rise.lifted, kind).toBe(rise.alone);
        seen.add("flies");
        continue;
      }
      expect(rise.alone, kind).toBe(0);
      const enemyClass = fieldEnemyClass(sample);
      seen.add(enemyClass);
      if (BLOOM_WELL_LIFT.targets[enemyClass] * BLOOM_WELL_LIFT.force > CONFIG.world.gravity)
        expect(rise.lifted, kind).toBeGreaterThan(column * 0.8);
      else expect(rise.lifted, kind).toBe(0);
    }
    expect([...seen].sort()).toEqual(["flies", "heavy-enemy", "light-enemy"]);
  });

  it("sorts enemies by one weight line, shared by every stage field", () => {
    expect(fieldEnemyClass({ weight: FIELD_HEAVY_ENEMY_WEIGHT - 0.01 })).toBe("light-enemy");
    expect(fieldEnemyClass({ weight: FIELD_HEAVY_ENEMY_WEIGHT })).toBe("heavy-enemy");
    expect(fieldEnemyClass({})).toBe("light-enemy");
    expect(fieldEnemyClass({ weight: 0.5, isBoss: true })).toBe("boss");
    expect(fieldEnemyClass(CONFIG.rootbinder)).toBe("heavy-enemy");
    expect(fieldEnemyClass(CONFIG.armored)).toBe("heavy-enemy");
    expect(fieldEnemyClass(CONFIG.enemy)).toBe("light-enemy");
  });

  it("does not lift a light enemy that is anchored", () => {
    expect(enemyRise("ranged").lifted).toBeGreaterThan(0);
    expect(
      enemyRise("ranged", (actor) => {
        actor.anchored = true;
      }).lifted,
    ).toBe(0);
  });

  it("says who it moves from the same row that sets the lift", () => {
    const well = createBloomWellState({
      id: "well",
      ownerId: "stage",
      variant: "stage",
      geometry: { x: 0, y: 0, w: 10, h: 10 },
      patternId: "a",
    });
    expect(well.eligibility).toEqual({
      player: BLOOM_WELL_LIFT.targets.player > 0,
      enemies: BLOOM_WELL_LIFT.targets["light-enemy"] > 0 || BLOOM_WELL_LIFT.targets["heavy-enemy"] > 0,
      bosses: BLOOM_WELL_LIFT.targets.boss > 0,
    });
    expect(well.eligibility).toEqual({ player: true, enemies: true, bosses: false });
  });

  it("carries a player who stands in it above the highest platform, and lets them walk out on the way", () => {
    const input: PlayerInputPort & { held: Set<string> } = {
      held: new Set<string>(),
      right() {
        return this.held.has("right");
      },
      left: () => false,
      up: () => false,
      down: () => false,
      dashPressed: () => false,
      jumpPressed: () => false,
    };
    const Player = createPlayer({
      CONFIG,
      FX: { burst: () => undefined, drip: () => undefined },
      GFX: { low: true },
      Input: input,
      presentation: { draw: () => undefined },
      aabbOverlap,
      clamp,
      len,
    });
    const floor: PlayerPlatformPort = { x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: 100, floor: true };
    const ride = (walkOutAt: number): { top: number; x: number } => {
      const { environment, centre } = stageWithWells();
      const player = new Player(centre, CONFIG.world.groundY - CONFIG.player.h / 2);
      bindLiveBloomWellActors(
        environment,
        () => player,
        () => [],
        () => "",
      );
      input.held.clear();
      let top = player.y;
      for (let tick = 0; tick < BLOOM_WELL_TIMING.totalTicks; tick += 1) {
        if (tick === walkOutAt) input.held.add("right");
        environment.step(tick, DT, () => undefined);
        player.update(DT, [floor]);
        top = Math.min(top, player.y);
      }
      return { top, x: player.x };
    };
    const highestPlatform = 250;
    const stood = ride(Number.POSITIVE_INFINITY);
    expect(stood.top).toBeLessThan(highestPlatform - CONFIG.player.h / 2);
    // Walking out a quarter of a second into the lift ends the ride low: the player keeps control across it.
    const left = ride(BLOOM_WELL_TIMING.warningTicks + 30);
    expect(left.top).toBeGreaterThan(stood.top + 200);
    expect(left.x).toBeGreaterThan(stageWithWells().centre + 85);
  });
});
