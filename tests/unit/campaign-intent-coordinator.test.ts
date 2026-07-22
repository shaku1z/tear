import { describe, expect, it, vi } from "vitest";

import { dispatchChapterIntents, dispatchFinaleIntents } from "../../src/app/campaign-intent-coordinator";

describe("campaign intent coordinators", () => {
  it("dispatches chapter and finale intents in authored order", () => {
    const order: string[] = [];
    dispatchChapterIntents([
      { type: "chapter-state", state: "READY", page: 2 },
      { type: "music-duck", amount: 0.5, duration: 1 },
      { type: "activate-prepared-wave" },
    ], {
      activatePreparedWave: () => order.push("activate"),
      setChapterState: (state, page) => order.push(`${state}:${String(page)}`),
      clearProjectiles: vi.fn(), musicDuck: () => order.push("duck"), resetStageBanner: vi.fn(), sound: vi.fn(),
    });
    dispatchFinaleIntents([
      { type: "begin-finale-lifecycle" },
      { type: "world-zoom", value: 0.8 },
      { type: "sound", cue: "final-cut", index: 2 },
      { type: "win-run", campaign: true },
    ], {
      beginLifecycle: () => order.push("finale"), clearCombat: vi.fn(), freezeVoid: vi.fn(),
      worldZoom: (value) => order.push(`zoom:${String(value)}`), finalBlade: vi.fn(), ring: vi.fn(), burst: vi.fn(),
      flash: vi.fn(), shake: vi.fn(), vibrate: vi.fn(), sound: (cue, index) => order.push(`${cue}:${String(index)}`),
      restoreStageZero: vi.fn(), restorePlayer: vi.fn(), voidMix: vi.fn(), musicDuck: vi.fn(),
      win: (campaign) => order.push(`win:${String(campaign)}`),
    });
    expect(order).toEqual(["READY:2", "duck", "activate", "finale", "zoom:0.8", "final-cut:2", "win:true"]);
  });
});
