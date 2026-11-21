/**
 * The scripted player and the walls of the arena, on the real game, headless.
 * The player comes off a wall only when its observation says where the walls are. The headless observation left
 * them out, so a Riftlock player, which backs away from its target, reached the left wall two seconds into a run
 * and held left against it until it was defeated on wave 5 (easy, seed 117). The browser's observation had them and
 * the same run went to the end of the Adventure.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { agentView } from "../../src/playtest/boss-fight";
import { createBossPlayer } from "../../src/playtest/boss-player";
import { readPlayerBox } from "../../src/playtest/boss-view";
import { chapterHolds, skipChapter } from "../../src/playtest/headless/chapter";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { runScenario } from "../../src/playtest/run-play";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

/** The scripted player turns back within this far of a wall (the margin in `scripted-policy.ts`). */
const WALL_MARGIN_PIXELS = 140;
/** Longest the player may stay inside that margin. Pinned, it stayed for the whole run. */
const WALL_LIMIT_TICKS = 3 * TEAR_SIMULATION_TICKS_PER_SECOND;
const PLAYED_TICKS = 30 * TEAR_SIMULATION_TICKS_PER_SECOND;

describe("the scripted player and the walls", () => {
  it("is told where the walls are, as the live observation tells it", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario());
      expect(environment.policyObservation().diagnostics?.worldBounds).toEqual({
        minX: 0,
        maxX: CONFIG.view.w,
        minY: 0,
        maxY: CONFIG.view.h,
      });
    } finally {
      environment.dispose();
    }
  });

  it("does not stay against a wall", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario());
      const player = createBossPlayer("scripted");
      let atWall = 0;
      let longest = 0;
      for (let tick = 0; tick < PLAYED_TICKS; tick += 1) {
        if (chapterHolds(environment) && environment.cinematicActive()) skipChapter(environment);
        const view = agentView(environment, "riftlock");
        const { x } = view.state.player;
        atWall = x < WALL_MARGIN_PIXELS || x > CONFIG.view.w - WALL_MARGIN_PIXELS ? atWall + 1 : 0;
        longest = Math.max(longest, atWall);
        if (environment.step(player.decide(view, null, readPlayerBox(environment.world()))).terminated) break;
      }
      expect(longest).toBeLessThan(WALL_LIMIT_TICKS);
    } finally {
      environment.dispose();
    }
  }, 60_000);
});

function scenario() {
  return runScenario({
    mode: "campaign",
    difficulty: "easy",
    weapon: "riftlock",
    seed: "117",
    player: "scripted",
    maxTicks: PLAYED_TICKS + 1,
  });
}
