/**
 * The new Rootbinder (plans/active/VERDANT_PALE_REBUILD.md, 2.2): its moves against the table, one update per tick,
 * and the rule that keeps it engineering-only until the switch slice.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import {
  ENGINEERING_ONLY_ENEMY_IDS,
  ENEMY_REBUILD_OF,
  enemyIdsAvailableOn,
} from "../../src/gameplay/run/content-director";
import { CONTENT_AVAILABILITY_SURFACES } from "../../src/gameplay/stages";
import { REPLAY_CONTENT_KIND_IDS } from "../../src/gameplay/snapshot/codec-ids";
import { playgroundKinds } from "../../src/gameplay/training/playground-controller";
import {
  ROOTBINDER_BODY,
  ROOTBINDER_MOVES as M,
} from "../../src/gameplay/entities/enemy-types/rootbound-rebuild/rootbinder-moves";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { createEnemyHarness, createTestPlayer } from "./enemy-test-harness";

const GROUND = CONFIG.world.groundY;

function setup(playerGap: number) {
  const harness = createEnemyHarness();
  const binder = new harness.types.RootbinderRebuild(500, GROUND - ROOTBINDER_BODY.h / 2);
  binder.spawnT = 0;
  const player = createTestPlayer({ x: 500 + playerGap });
  const projectiles: EnemyProjectile[] = [];
  const step = (): void => binder.update(1 / 120, harness.platforms, player, projectiles);
  /** Steps until the state is reached, and returns the ticks it took (Infinity if not within `limit`). */
  const until = (state: string, limit = 2000): number => {
    for (let tick = 1; tick <= limit; tick += 1) {
      step();
      if (binder.state === state) return tick;
    }
    return Infinity;
  };
  const settle = (): void => {
    for (let tick = 0; tick < 30; tick += 1) step();
  };
  return { binder, player, projectiles, step, until, settle };
}

describe("the new Rootbinder's moves (2.2)", () => {
  it("takes today's Rootbinder's body", () => {
    const { binder } = setup(400);
    expect(binder.kind).toBe("rootbinder-rebuild");
    expect([binder.hw * 2, binder.hh * 2, binder.maxHp]).toEqual([34, 46, 72]);
    expect(binder.contactDmg).toBe(7);
  });

  it("walks to keep 300 to 520 px from the player: away inside the band, toward it outside", () => {
    const near = setup(200);
    near.settle();
    expect(near.binder.vx).toBeLessThan(0);
    const far = setup(700);
    far.settle();
    expect(far.binder.vx).toBeGreaterThan(0);
    expect(far.binder.contactDamageEnabled()).toBe(true);
  });

  it("plants after 60 ticks in its band: kneels for 60, then planted, open and harmless", () => {
    const { binder, until, step } = setup(400);
    step(); // it lands on its first tick, and counts its band from the next
    expect(until("plantwind")).toBe(M.plant.settle);
    expect(until("planted")).toBe(M.plant.windup);
    expect(binder.contactDamageEnabled()).toBe(false);
    const before = binder.hp;
    binder.hit(10, 0, 0);
    expect(before - binder.hp).toBeCloseTo(10 * M.plant.damageTaken);
    expect(binder.state).toBe("planted");
    step();
    expect(binder.vx).toBe(0);
  });

  it("sends a Root Run every 180 ticks while planted: a jumpable ground shock along the floor at the player", () => {
    const { binder, projectiles, until } = setup(400);
    until("planted");
    expect(until("rootwind")).toBe(M.rootRun.every);
    expect(until("rootrecover")).toBe(M.rootRun.windup);
    expect(projectiles).toHaveLength(1);
    const [root] = projectiles;
    expect(root?.family).toBe("groundShock");
    expect(root?.vx).toBe(M.rootRun.speed);
    expect(root?.dmg).toBe(M.rootRun.damage);
    expect(root?.life).toBeCloseTo(M.rootRun.life / 120);
    expect(root?.y).toBeCloseTo(GROUND - M.rootRun.radius);
    expect(until("planted")).toBe(M.rootRun.recover);
    // From one Root Run's start to the next.
    expect(until("rootwind")).toBe(M.rootRun.every - M.rootRun.windup - M.rootRun.recover);
  });

  it("stands up after 480 planted ticks", () => {
    const { binder, until } = setup(400);
    until("planted");
    let ticks = 0;
    while (binder.state !== "walk" && ticks < 1000) {
      binder.update(1 / 120, [], createTestPlayer({ x: binder.x + 400 }), []);
      ticks += 1;
    }
    expect(ticks).toBe(M.plant.hold);
  });

  it("is uprooted by one hit of 30 % of its health, and hops 220 px away from the player", () => {
    const { binder, until } = setup(400);
    until("planted");
    const from = binder.x;
    binder.hit(M.uproot.hitShare * ROOTBINDER_BODY.hp, 0, 0);
    expect(binder.state).toBe("uprootwind");
    expect(until("hop")).toBe(M.uproot.windup);
    expect(until("hoprecover")).toBe(M.uproot.hopTicks);
    expect(binder.x).toBeCloseTo(from - M.uproot.hop);
    expect(binder.y).toBeCloseTo(GROUND - ROOTBINDER_BODY.h / 2);
    expect(until("walk")).toBe(M.uproot.recover);
  });

  it("is uprooted by a player within 140 px for 60 ticks, and a lighter hit leaves it planted", () => {
    const { binder, player, until, step } = setup(400);
    until("planted");
    binder.hit(5, 0, 0);
    expect(binder.state).toBe("planted");
    player.x = binder.x + 100;
    for (let tick = 1; tick < M.uproot.nearTicks; tick += 1) step();
    expect(binder.planted).toBe(true);
    step();
    expect(binder.state).toBe("uprootwind");
  });

  it("starts no move while its attacks are held", () => {
    const { binder, until } = setup(400);
    binder.attackHold = 1;
    expect(until("plantwind", 100)).toBe(Infinity);
    expect(until("plantwind")).toBeLessThanOrEqual(120 + M.plant.settle);
  });
});

describe("the new Rootbinder is engineering-only until the switch", () => {
  it("is the one enemy being rebuilt, and rebuilds the Rootbinder", () => {
    expect(ENGINEERING_ONLY_ENEMY_IDS).toEqual(["rootbinder-rebuild"]);
    expect(ENEMY_REBUILD_OF["rootbinder-rebuild"]).toBe("rootbinder");
  });

  it("is on no content surface, and replays never contain it", () => {
    for (const surface of CONTENT_AVAILABILITY_SURFACES)
      expect(enemyIdsAvailableOn(surface)).not.toContain("rootbinder-rebuild");
    expect(REPLAY_CONTENT_KIND_IDS).not.toContain("rootbinder-rebuild");
  });

  it("is in the Playground's spawn list on the engineering channel only", () => {
    const shown = (channel: "release" | "engineering") =>
      playgroundKinds(createSurfaceAvailability(channel).allows("playground:rebuilt-enemies"));
    expect(shown("engineering")).toContain("rootbinder-rebuild");
    expect(shown("release")).not.toContain("rootbinder-rebuild");
    expect(shown("release")).toContain("rootbinder");
  });
});
