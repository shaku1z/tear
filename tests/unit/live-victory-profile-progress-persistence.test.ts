import { describe, expect, it, vi } from "vitest";

import { createLiveVictoryProfileProgressPersistence } from "../../src/app/live-victory-profile-progress-persistence";

describe("live victory profile progress persistence", () => {
  it("preserves victory profile-data mutations and their maxima", () => {
    const max = vi.fn();
    const profile = { data: {} };
    const persistence = createLiveVictoryProfileProgressPersistence(profile as never, { add: vi.fn(), max });

    persistence.markWeaponWin("hammer");
    persistence.setReward("restoredBladeTrail");
    persistence.markAdventureDifficulty("hard");

    expect(profile.data).toEqual({
      weaponsWon: { hammer: 1 }, rewards: { restoredBladeTrail: true }, advDiffs: { hard: 1 },
    });
    expect(max).toHaveBeenNthCalledWith(1, "distinctWeaponsWon", 1);
    expect(max).toHaveBeenNthCalledWith(2, "clearAdvAll", 1);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
