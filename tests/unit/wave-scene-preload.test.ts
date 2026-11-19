// A stage's painted background is fetched one wave before the run reaches the
// stage, and never for a stage the mode does not lead to next.
import { describe, expect, it } from "vitest";
import { stageIdAfterWave, startingStageId } from "../../src/app/run/wave-composition";
import { STAGES } from "../../src/gameplay/stages";

describe("painted background preload", () => {
  it("names the next campaign stage during the boss wave before it", () => {
    const verdant = STAGES.findIndex((stage) => stage.id === "verdant-sanctum");
    expect(verdant).toBeGreaterThan(0);
    const boss = verdant * 10;
    expect(stageIdAfterWave("campaign", boss, STAGES)).toBe("verdant-sanctum");
    expect(stageIdAfterWave("campaign", boss - 1, STAGES)).toBe(STAGES[verdant - 1]?.id);
  });

  it("names nothing after the campaign's last wave", () => {
    expect(stageIdAfterWave("campaign", STAGES.length * 10, STAGES)).toBeUndefined();
  });

  it("stays on the opening stage through a new run's first waves", () => {
    for (const mode of ["campaign", "endless"] as const) {
      expect(stageIdAfterWave(mode, 1, STAGES)).toBe(STAGES[0]?.id);
    }
    // A Gauntlet trial's stage is its boss's home, read from the trial order.
    expect(stageIdAfterWave("gauntlet", 1, STAGES, [STAGES[0]?.boss ?? ""])).toBe(STAGES[0]?.id);
    expect(stageIdAfterWave("gauntlet", 1, STAGES)).toBeUndefined();
  });

  it("follows the endless stage cycle, wrapping after the last stage", () => {
    expect(stageIdAfterWave("endless", 5, STAGES)).toBe(STAGES[1]?.id);
    expect(stageIdAfterWave("endless", STAGES.length * 5, STAGES)).toBe(STAGES[0]?.id);
  });

  it("names nothing for modes that pick their stage another way", () => {
    for (const mode of ["bossonly", "tutorial", "playground"] as const) {
      expect(stageIdAfterWave(mode, 1, STAGES)).toBeUndefined();
    }
  });

  it("names the stage a run opens on, for the setup screen to prepare", () => {
    for (const mode of ["campaign", "endless"] as const) {
      expect(startingStageId(mode, "shuffle", STAGES)).toBe(STAGES[0]?.id);
    }
    // A Gauntlet draws its trial order when the run starts, so its first stage is not known here.
    expect(startingStageId("gauntlet", "shuffle", STAGES)).toBeUndefined();
    // A boss run with a chosen boss opens on that boss's stage, whichever stage that is.
    for (const stage of STAGES) {
      expect(startingStageId("bossonly", stage.boss, STAGES)).toBe(stage.id);
    }
    // A shuffled boss run and the practice modes are not known before the run starts.
    expect(startingStageId("bossonly", "shuffle", STAGES)).toBeUndefined();
    expect(startingStageId("playground", "shuffle", STAGES)).toBeUndefined();
  });
});
