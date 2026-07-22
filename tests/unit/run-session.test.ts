import { describe, expect, it } from "vitest";
import { createRunSession, type RunMode } from "../../src/gameplay/run/session";

const MODES: readonly RunMode[] = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"];

describe("run session factory", () => {
  it.each(MODES)("creates an isolated %s session with legacy-compatible counters", (mode) => {
    const mods: { weaponId?: string; owned: Record<string, number> } = { owned: {} };
    const session = createRunSession({
      mode,
      difficulty: "normal",
      weaponId: "spear",
      runSeed: 123,
      voidSeed: 456,
      mods,
      scaling: { coin: 1.1, score: 1.4, enemyHp: 1.3, enemyCount: 1.15 },
      achievementSnapshot: ["first"],
    });
    expect(session).toMatchObject({
      mode, diff: "normal", wave: 0, score: 0, clearTimer: -1,
      weaponId: "spear", runSeed: 123, voidSeed: 456,
      coinMod: 1.1, scoreMod: 1.4, diffHp: 1.3, diffCount: 1.15,
      chapterState: mode === "campaign" ? "LORE_ENTER" : "WAVE_LIVE",
    });
    expect(session.mods.weaponId).toBe("spear");
    expect(session.spawnQueue).toEqual([]);
    expect(session.waveLog).toEqual([]);
  });

  it("copies achievement identity and rejects invalid deterministic seeds", () => {
    const achievements = ["a"];
    const session = createRunSession({
      mode: "endless", difficulty: "easy", weaponId: "sword", runSeed: 1, voidSeed: 2,
      mods: {}, scaling: { coin: 1, score: 1, enemyHp: 1, enemyCount: 1 }, achievementSnapshot: achievements,
    });
    achievements.push("b");
    expect(session._achSnap).toEqual(["a"]);
    expect(() => createRunSession({
      mode: "endless", difficulty: "easy", weaponId: "sword", runSeed: 0, voidSeed: 2,
      mods: {}, scaling: { coin: 1, score: 1, enemyHp: 1, enemyCount: 1 }, achievementSnapshot: [],
    })).toThrow(RangeError);
  });
});
