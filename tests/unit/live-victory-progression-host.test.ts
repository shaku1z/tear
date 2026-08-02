import { describe, expect, it, vi } from "vitest";

import { createLiveVictoryProgressionExecutor } from "../../src/app/live-victory-progression-host";

describe("live victory progression host", () => {
  it("routes generic stats through the shared adapter while retaining profile-data progress", () => {
    const add = vi.fn();
    const max = vi.fn();
    const checkAchievements = vi.fn();
    const finishRecording = vi.fn();
    const profile = { data: {} };
    const execute = createLiveVictoryProgressionExecutor({
      PROFILE: profile,
      profileStatsPersistence: { add, max },
      DAILY: { bump: vi.fn() },
      Cloud: { logEvent: vi.fn() },
    } as never, checkAchievements, finishRecording);

    execute([
      { type: "profile-add", stat: "wins", value: 1 },
      { type: "profile-max", stat: "bestScore", value: 40 },
      { type: "mark-weapon-win", weaponId: "hammer" },
      { type: "mark-adventure-difficulty", difficulty: "hard" },
    ]);

    expect(add).toHaveBeenCalledWith("wins", 1);
    expect(max).toHaveBeenNthCalledWith(1, "bestScore", 40);
    expect(max).toHaveBeenNthCalledWith(2, "distinctWeaponsWon", 1);
    expect(max).toHaveBeenNthCalledWith(3, "clearAdvAll", 1);
    expect(profile.data).toEqual({ weaponsWon: { hammer: 1 }, advDiffs: { hard: 1 } });
    expect(checkAchievements).not.toHaveBeenCalled();
    expect(finishRecording).not.toHaveBeenCalled();
  });
});
