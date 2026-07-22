import { describe, expect, it, vi } from "vitest";

import { CampaignRuntimeState } from "../../src/app/campaign-runtime-state";
import { createCampaignChapterController, createFinaleController } from "../../src/app/campaign-controller-factory";

const motion = { loreReveal: 1, chapterIn: 1, loreExit: 1, biomeRevealBrief: 1, biomeRevealFull: 1, readyBrief: 1, readyFull: 1 };
const config = { presentation: { dialogueDuck: 1, biomeRevealDuck: 1 }, finale: { anchorRadius: 10, worldZoom: 1,
  silence: 1, wound: 1, relics: 1, cutAutoAt: 1, cutAutoStep: 1, cutSpeed: 1,
  restorationMin: 1, epilogueReveal: 1, rewardHold: 1 } };

describe("campaign runtime state", () => {
  it("owns controller replacement, finale synchronization and cinematic protection", () => {
    const createChapter = vi.fn(() => createCampaignChapterController(motion, config));
    const createFinale = vi.fn(() => createFinaleController(config));
    const state = new CampaignRuntimeState(createChapter, createFinale);
    const firstChapter = state.chapterController;
    state.applyProtection({ active: true, lastMode: "landing" });
    expect(state.protection()).toEqual({ active: true, lastMode: "landing" });
    state.resetChapter();
    expect(state.chapterController).not.toBe(firstChapter);
    expect(createChapter).toHaveBeenCalledTimes(2);
    expect(state.syncFinale()).toBeNull();
    state.reset();
    expect(state.protection()).toEqual({ active: false, lastMode: null });
  });
});
