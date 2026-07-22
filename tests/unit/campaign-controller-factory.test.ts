import { describe, expect, it } from "vitest";

import { createCampaignChapterController, createFinaleController } from "../../src/app/campaign-controller-factory";

const motion = { loreReveal: 1, chapterIn: 2, loreExit: 3, biomeRevealBrief: 4, biomeRevealFull: 5, readyBrief: 6, readyFull: 7 };
const config = {
  presentation: { dialogueDuck: 0.5, biomeRevealDuck: 0.7 },
  finale: { anchorRadius: 20, worldZoom: 0.8, silence: 1, wound: 1, relics: 1,
    cutAutoAt: 1, cutAutoStep: 1, cutSpeed: 1, restorationMin: 1, epilogueReveal: 1, rewardHold: 1 },
};

describe("campaign controller factory", () => {
  it("builds fresh chapter and finale controllers from shared runtime tuning", () => {
    expect(createCampaignChapterController(motion, config)).not.toBe(createCampaignChapterController(motion, config));
    const finale = createFinaleController(config);
    expect(finale.anchors(400, 400, { width: 1_600, height: 900 })).toHaveLength(3);
  });
});
