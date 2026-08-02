import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/gameplay/scoring/live-style-achievement-runtime", () => ({
  createLiveStyleAchievementRuntime: (options: { readonly achievementCheck: () => void }) => {
    options.achievementCheck();
    return Object.freeze({});
  },
}));

import { createLiveStyleHost } from "../../src/app/live-style-host";

describe("live style host persistence adapter", () => {
  it("uses the composition-owned achievement check/save operation", () => {
    const checkAndSave = vi.fn();
    createLiveStyleHost({
      dependencies: { styleAchievementPersistence: { checkAndSave } } as never,
      entities: {} as never, state: {} as never, tutorial: {} as never,
      captureGhost: vi.fn(), rankUp: vi.fn(), musicRankChanged: vi.fn(), addProjectile: vi.fn(),
    });

    expect(checkAndSave).toHaveBeenCalledOnce();
  });
});
