import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { UPGRADE_HOOK_BINDINGS, bindUpgradeHook, type UpgradeHookName } from "../../src/gameplay/upgrade-hooks";
import type { UpgradeEvent, UpgradeMods } from "../../src/gameplay/upgrades";
import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";

// Rule over all upgrades: every upgrade hook must run in the production replay world when the
// replay world's own code raises its event. A hook added later is covered without a new case;
// a new hook list needs a trigger below, and the test says so.

function replayWorld() {
  const source = createProductionGhostReplayComposition({
    runSeed: scenarioRunSeed("replay-upgrade-hooks"),
    mode: "campaign",
  }).create(undefined);
  const world = source.replay.world;
  const run = world.state.run();
  if (run === null) throw new Error("the replay world has no run");
  const spawn = () => {
    const enemy = world.entities.createEnemy("charger", 400, CONFIG.world.groundY - 40, run);
    world.state.setEnemies([...world.state.enemies(), enemy]);
    return enemy;
  };
  return { combat: source.combat, mods: run.mods as unknown as UpgradeMods, spawn };
}

type World = ReturnType<typeof replayWorld>;
const shot = { x: 380, y: 300 };
const triggers: Partial<Record<UpgradeHookName | "onParry", (world: World) => void>> = {
  onKill: ({ combat, spawn }) => {
    combat.killRuntime.resolve(spawn(), "swing");
  },
  onEnemyDeath: ({ combat, spawn }) => {
    combat.killRuntime.resolve(spawn(), "swing");
  },
  onSkillKill: ({ combat, spawn }) => {
    combat.killRuntime.resolve(spawn(), "skill");
  },
  onHit: ({ combat, spawn }) => {
    const enemy = spawn();
    combat.collision.makeHitEvent(enemy, enemy.x, enemy.y);
  },
  onSlam: ({ combat, spawn }) => {
    combat.collision.makeSlamEvent(spawn());
  },
  onParry: ({ combat }) => {
    combat.collision.makePerfectParryEvent(shot as never);
  },
  onPerfectParry: ({ combat }) => {
    combat.collision.makePerfectParryEvent(shot as never);
  },
  onReflectedHit: ({ combat, spawn }) => {
    combat.combatEntities.reflectedHit(spawn(), shot as never, null);
  },
  onThrowResolve: ({ combat, spawn }) => {
    combat.collision.emitThrowResolve(spawn(), 10);
  },
};

describe("every upgrade hook runs in the production replay world", () => {
  for (const { id, hook } of UPGRADE_HOOK_BINDINGS) {
    it(`${id} (${hook})`, () => {
      const world = replayWorld();
      const trigger = triggers[hook];
      if (trigger === undefined) throw new Error(`add a replay-world trigger for the ${hook} hook list`);
      bindUpgradeHook(id, { mods: world.mods, config: CONFIG });
      const handlers = world.mods[hook];
      const handler = handlers[handlers.length - 1];
      if (handler === undefined) throw new Error(`${id} did not bind a ${hook} handler`);
      const seen: UpgradeEvent[] = [];
      handlers[handlers.length - 1] = (event) => {
        seen.push(event);
        handler(event);
      };
      // Give each hook the upgrade state that makes it act, so its whole body runs.
      Object.assign(world.mods, { killHeal: 4, backlash: 12, backlashSurge: 1, backlashMark: 1 });
      trigger(world);
      expect(seen.length, `${id} was not raised`).toBeGreaterThan(0);
      for (const event of seen) {
        expect(typeof event.dealAoE, `${id}: area damage`).toBe("function");
        expect(typeof event.fx.explode, `${id}: effects`).toBe("function");
        expect(event.player, `${id}: player`).toBeDefined();
      }
    });
  }

  it("builds the kill event live play builds, with Overrun stacking on a clean kill", () => {
    const world = replayWorld();
    const seen: UpgradeEvent[] = [];
    world.mods.onKill.push((event) => seen.push(event));
    world.combat.killRuntime.resolve(world.spawn(), "swing");
    expect(typeof seen[0]?.addOverrunStack).toBe("function");
    expect(typeof seen[0]?.cleanElimination).toBe("boolean");
  });
});
