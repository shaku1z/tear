import { describe, expect, it } from "vitest";

import { createLiveStyleAchievementPersistence } from "../../src/app/live-style-achievement-persistence";

describe("live style achievement persistence adapter", () => {
  it("checks achievements before saving the profile through the explicit adapter", () => {
    const calls: string[] = [];
    const persistence = createLiveStyleAchievementPersistence({ check: () => { calls.push("check"); } },
      { save: () => { calls.push("save"); } });

    persistence.checkAndSave();

    expect(calls).toEqual(["check", "save"]);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
