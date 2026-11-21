/**
 * The Adventure's closing scene, on the real game, headless.
 * A headless run that beat the last boss sat in the closing scene until its time limit: nothing skipped it, and
 * the scripted player has nothing to do in it. The run now holds confirm through it, as a player does, to the win.
 */
import { describe, expect, it } from "vitest";

import { stageIdsAvailableOn } from "../../src/gameplay/stages";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "../../src/gameplay/snapshot/snapshot-contract";
import { agentView } from "../../src/playtest/boss-fight";
import { createBossPlayer } from "../../src/playtest/boss-player";
import { readPlayerBox } from "../../src/playtest/boss-view";
import { chapterHolds, finaleHolds, skipChapter, skipFinale } from "../../src/playtest/headless/chapter";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { requireProductionHeadlessScenario } from "../../src/playtest/headless/production-headless-scenario";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

/** The last boss falls within this long. */
const BOSS_LIMIT_TICKS = 120 * TEAR_SIMULATION_TICKS_PER_SECOND;

describe("the Adventure's closing scene, headless", () => {
  it("holds the run after the last boss falls, and is skipped to the win as a player skips it", () => {
    const stages = stageIdsAvailableOn("adventure");
    // The player comes to the last boss with a build: the first pick of each draft the game offered on the way.
    const environment = createProductionHeadlessEnvironment({ build: () => 0 });
    try {
      environment.reset(
        requireProductionHeadlessScenario({
          format: TEAR_CONTRACT_FORMAT,
          kind: "scenario",
          schemaVersion: TEAR_CONTRACT_VERSION,
          id: "playtest-finale",
          version: 1,
          description: "The Adventure opened on its last boss",
          stateClass: "surgical-valid",
          executionClass: "engineering",
          seed: "1",
          start: {
            mode: "campaign",
            difficulty: "easy",
            weapon: "riftlock",
            wave: stages.length * 10,
            stage: stages.at(-1),
          },
          maxTicks: BOSS_LIMIT_TICKS * 2,
          assertions: ["runtime.finite-state"],
          tags: ["playtest"],
        }),
      );
      const player = createBossPlayer("scripted");
      for (let tick = 0; tick < BOSS_LIMIT_TICKS && !finaleHolds(environment); tick += 1) {
        if (chapterHolds(environment) && environment.cinematicActive()) expect(skipChapter(environment)).toBe(true);
        environment.step(player.decide(agentView(environment, "riftlock"), null, readPlayerBox(environment.world())));
      }
      expect(environment.policyObservation().player.hp).toBeGreaterThan(0);
      expect(finaleHolds(environment)).toBe(true);
      expect(skipFinale(environment)).toBe(true);
      expect(environment.policyUiObservation().screen).toBe("win");
    } finally {
      environment.dispose();
    }
  }, 120_000);
});
