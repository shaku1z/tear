import { describe, expect, it } from "vitest";

import { scenarioRunSeed, scenarioRunStartChoices } from "../../src/gameplay/run/run-start-choices";

describe("a scenario's start choices", () => {
  const runSeed = scenarioRunSeed("run-start-choices");

  it("fills a new player's start around what the scenario states", () => {
    expect(scenarioRunStartChoices({ runSeed, mode: "gauntlet", weaponId: "hammer" })).toMatchObject({
      mode: "gauntlet",
      weapon: "hammer",
      difficulty: "normal",
      boss: "shuffle",
      runSeed,
      metaRanks: {},
      cinematics: "full",
      playedChapters: [],
    });
    expect(scenarioRunStartChoices({ runSeed }).mode).toBe("endless");
  });

  it("refuses a seed that is not a run seed and a mode the game does not publish", () => {
    for (const bad of [0, 2 ** 32, 1.5, -1])
      expect(() => scenarioRunStartChoices({ runSeed: bad })).toThrow(/run seed/u);
    expect(() => scenarioRunStartChoices({ runSeed, mode: "waves" })).toThrow(/no run mode "waves"/u);
  });
});
