import { describe, expect, it, vi } from "vitest";

import { createLiveAchievementToastPersistence } from "../../src/app/live-achievement-toast-persistence";

describe("live achievement-toast persistence adapter", () => {
  it("marks the profile entry and saves through the explicit adapter", () => {
    const save = vi.fn();
    const profile = { data: { seen: {} as Record<string, boolean> }, save };
    const persistence = createLiveAchievementToastPersistence(profile as never);

    persistence.markSeen("first-cut");
    persistence.save();

    expect(profile.data.seen).toEqual({ "first-cut": true });
    expect(save).toHaveBeenCalledOnce();
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
