/**
 * The scripted player against an enemy that never comes to it, on the real game, headless.
 * A herald left alone keeps its distance; a player that only backs away never reaches it and the wave never ends
 * (seen at wave 23 of the autonomy journey, 2026-11-18).
 */
import { describe, expect, it } from "vitest";

import { TearLiveHierarchicalPolicy } from "../../src/agents/hierarchical-policy-adapter";
import { CONFIG } from "../../src/config/game-config";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { requireProductionHeadlessScenario } from "../../src/playtest/headless/production-headless-scenario";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

/** The herald must fall within this long of being left alone. With the stall it stood for minutes. */
const CLEAR_LIMIT_TICKS = 25 * TEAR_SIMULATION_TICKS_PER_SECOND;
/** The first wave has enemies in play within this long of the start. */
const FIRST_SPAWN_LIMIT_TICKS = 5 * TEAR_SIMULATION_TICKS_PER_SECOND;

function scenario(weapon: (typeof WEAPON_IDS)[number]): TearScenarioV1 {
  return requireProductionHeadlessScenario({
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: `scripted-player-pursuit-${weapon}`,
    version: 1,
    description: "The scripted player against one herald that keeps its distance",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: "117",
    start: { mode: "endless", difficulty: "easy", weapon },
    maxTicks: FIRST_SPAWN_LIMIT_TICKS + CLEAR_LIMIT_TICKS,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

/** Ticks until the lone herald is defeated, or null when it outlives the limit. */
function ticksToDefeatLoneHerald(weapon: (typeof WEAPON_IDS)[number]): number | null {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(scenario(weapon));
    const policy = new TearLiveHierarchicalPolicy("competent");
    const play = (): void => {
      environment.step(
        policy.decide({ state: environment.policyObservation(), ui: environment.policyUiObservation() }).actions,
      );
    };
    const living = (): number =>
      environment
        .world()
        .enemies()
        .filter((enemy) => !enemy.dead).length;
    for (let tick = 0; living() === 0; tick += 1) {
      if (tick >= FIRST_SPAWN_LIMIT_TICKS) throw new Error("the first wave never put an enemy in play");
      play();
    }
    // Far from the player, on the ground, with nothing else in play: the wave's remaining spawns come and go.
    environment.replaceEnemies([
      { id: "herald", x: CONFIG.view.w - 350, y: CONFIG.world.groundY - CONFIG.support.h / 2 },
    ]);
    const herald = environment.world().enemies()[0];
    for (let tick = 0; tick < CLEAR_LIMIT_TICKS; tick += 1) {
      if (herald?.dead === true) return tick;
      play();
    }
    return null;
  } finally {
    environment.dispose();
  }
}

describe("scripted player against an enemy that stays away", () => {
  it.each(WEAPON_IDS)("defeats a lone herald with %s", (weapon) => {
    expect(ticksToDefeatLoneHerald(weapon)).not.toBeNull();
  });
});
