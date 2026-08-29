import { describe, expect, it } from "vitest";
import { bossKillIntents, type AchievementBoss, type AchievementRunState } from "../../src/gameplay/progression/achievement-runtime";

const run = (mode = "campaign"): AchievementRunState => ({ mode, runTime: 100, clearTimer: 0 });

describe("Rootbound achievement runtime", () => {
  it("records a full Regrowth interrupt only from the canonical resolved boss state", () => {
    const rootbound = (interruptClassification: "full-interrupt" | "partial-interrupt" | "no-interrupt" | null): AchievementBoss => ({
      isBoss: true, bossId: "rootbound",
      regrowthState: { phase: "resolved", interruptClassification },
    });
    expect(bossKillIntents(run(), rootbound("full-interrupt"))).toContainEqual({
      type: "profile-max", stat: "rootboundRegrowthFullInterrupt", value: 1,
    });
    for (const classification of ["partial-interrupt", "no-interrupt", null] as const) {
      expect(bossKillIntents(run(), rootbound(classification))).not.toContainEqual({
        type: "profile-max", stat: "rootboundRegrowthFullInterrupt", value: 1,
      });
    }
  });

  it("keeps Rootbound achievement work disabled in training modes", () => {
    const boss: AchievementBoss = {
      isBoss: true, bossId: "rootbound",
      regrowthState: { phase: "resolved", interruptClassification: "full-interrupt" },
    };
    expect(bossKillIntents(run("tutorial"), boss)).toEqual([]);
    expect(bossKillIntents(run("playground"), boss)).toEqual([]);
  });
});
