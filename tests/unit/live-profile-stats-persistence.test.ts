import { describe, expect, it, vi } from "vitest";

import { createLiveProfileStatsPersistence } from "../../src/app/live-profile-stats-persistence";

describe("live profile stats persistence adapter", () => {
  it("maps generic add and max operations to the profile", () => {
    const addStat = vi.fn();
    const maxStat = vi.fn();
    const persistence = createLiveProfileStatsPersistence({ addStat, maxStat });
    persistence.add("waves", 2);
    persistence.max("highestWave", 7);
    expect(addStat).toHaveBeenCalledWith("waves", 2);
    expect(maxStat).toHaveBeenCalledWith("highestWave", 7);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
