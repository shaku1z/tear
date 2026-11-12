import type * as StyleAchievementModule from "../../src/gameplay/scoring/live-style-achievement-runtime";
import { describe, expect, it, vi } from "vitest";

const captured: { styleRuntime: unknown } = vi.hoisted(() => ({ styleRuntime: undefined }));

vi.mock("../../src/gameplay/scoring/live-style-achievement-runtime", () => ({
  createLiveStyleAchievementRuntime: (options: { readonly achievementCheck: () => void }) => {
    captured.styleRuntime = options;
    options.achievementCheck();
    return Object.freeze({});
  },
}));

import { createLiveStyleHost } from "../../src/app/combat/style-host";

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
  it("keeps restored-mode Coach practice style math while refusing all outward persistence", async () => {
    const actual = await vi.importActual<typeof StyleAchievementModule>("../../src/gameplay/scoring/live-style-achievement-runtime");
    const writes: string[] = []; const observed = vi.fn(); let practice = true;
    const run = { mode: "campaign", runTime: 12, clearTimer: 0, combo: 0, comboTimer: 0, lastTrick: "", mult: 1, rank: "", wavePeak: 1 };
    const player = { x: 30, y: 40, onGround: false };
    createLiveStyleHost({ persistentEffects: () => !practice, observeStyle: observed,
      dependencies: { CONFIG: { trick: { pts: { parry: 15 }, variety: 1.5, decay: 4, drainRate: 10, hitLoss: .3, tiers: [] }, colors: {} },
        Input: { left: () => false, right: () => false, buzz: () => undefined }, GHOST: { recording: () => false },
        META: { level: () => 0 }, DAILY: { bump: () => { writes.push("daily"); } },
        styleAchievementPersistence: { checkAndSave: () => { writes.push("check/save"); } },
        profileStatsPersistence: { add: () => { writes.push("profile-add"); }, max: () => { writes.push("profile-max"); } } } as never,
      state: { player: () => player, run: () => run, enemies: () => [] } as never, entities: {} as never,
      tutorial: { mark: () => undefined } as never, captureGhost: vi.fn(), rankUp: vi.fn(), musicRankChanged: vi.fn(), addProjectile: vi.fn(),
    });
    const runtime = actual.createLiveStyleAchievementRuntime(captured.styleRuntime as Parameters<typeof actual.createLiveStyleAchievementRuntime>[0]);
    writes.length = 0;
    runtime.addStyle("parry"); runtime.achievements.parry(); runtime.achievements.onKill(); runtime.achievements.stageDone(); runtime.check();
    expect(run.combo).toBe(22.5); expect(run.mode).toBe("campaign"); expect(writes).toEqual([]); expect(runtime.tracks()).toBe(false);
    practice = false; runtime.addStyle("parry"); runtime.achievements.parry(); runtime.check();
    expect(observed).toHaveBeenCalledWith("parry", expect.objectContaining({ combo: 22.5 }), expect.objectContaining({ combo: 37.5 }), expect.objectContaining({ pts: { parry: 15 } }));
    expect(run.combo).toBe(37.5); expect(runtime.tracks()).toBe(true);
    expect(writes).toContain("profile-add"); expect(writes).toContain("profile-max"); expect(writes).toContain("daily"); expect(writes).toContain("check/save");
  });

});
