import { describe, expect, it, vi } from "vitest";

const captured: { styleRuntime: unknown } = vi.hoisted(() => ({ styleRuntime: undefined }));

vi.mock("../../src/gameplay/scoring/live-style-achievement-runtime", () => ({
  createLiveStyleAchievementRuntime: (options: { readonly achievementCheck: () => void }) => {
    captured.styleRuntime = options;
    options.achievementCheck();
    return Object.freeze({});
  },
}));

import { createLiveStyleHost } from "../../src/app/live-style-host";

describe("live style host persistence adapter", () => {
  it("uses the composition-owned achievement check/save operation", () => {
    const checkAndSave = vi.fn();
    createLiveStyleHost({
      dependencies: {
        styleAchievementPersistence: { checkAndSave },
        profileStatsPersistence: { add: vi.fn(), max: vi.fn() },
      } as never,
      entities: {} as never, state: {} as never, tutorial: {} as never,
      captureGhost: vi.fn(), rankUp: vi.fn(), musicRankChanged: vi.fn(), addProjectile: vi.fn(),
    });

    expect(checkAndSave).toHaveBeenCalledOnce();
  });

  it("supplies each generic profile-stat port from the shared adapter", () => {
    const add = vi.fn();
    const max = vi.fn();
    createLiveStyleHost({
      dependencies: {
        styleAchievementPersistence: { checkAndSave: vi.fn() },
        profileStatsPersistence: { add, max },
      } as never,
      entities: {} as never, state: {} as never, tutorial: {} as never,
      captureGhost: vi.fn(), rankUp: vi.fn(), musicRankChanged: vi.fn(), addProjectile: vi.fn(),
    });

    const runtime = captured.styleRuntime as {
      readonly styleIntents: {
        readonly profileAdd: (stat: string, amount: number) => void;
        readonly profileMax: (stat: string, value: number) => void;
      };
      readonly profileMax: (stat: string, value: number) => void;
    };
    runtime.styleIntents.profileAdd("tricks", 1);
    runtime.styleIntents.profileMax("longestCombo", 4);
    runtime.profileMax("bestRank", 3);

    expect(add).toHaveBeenCalledWith("tricks", 1);
    expect(max).toHaveBeenNthCalledWith(1, "longestCombo", 4);
    expect(max).toHaveBeenNthCalledWith(2, "bestRank", 3);
  });
});
