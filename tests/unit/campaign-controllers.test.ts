import { describe, expect, it } from "vitest";

import { CAMPAIGN_INTRO, CampaignChapterController } from "../../src/gameplay/campaign/chapter-controller";
import { FinaleController } from "../../src/gameplay/campaign/finale-controller";

const chapterTiming = { loreReveal: 0.5, chapterIn: 0.3, loreExit: 0.4, biomeRevealBrief: 0.5,
  biomeRevealFull: 1, readyBrief: 0.5, readyFull: 1, dialogueDuck: 0.4, biomeRevealDuck: 0.6 };
const stage = { name: "The Yard", blurb: "Steel remembers.", accent: "red", dark: false,
  chapter: { number: 1, symbol: "I", title: "WARDEN", intro: "Enter.", transition: "cut", pages: [{ label: "YARD", text: "A gate." }] } };

describe("campaign chapter controller", () => {
  it("shows the three-page prologue once and preserves beat timing", () => {
    const controller = new CampaignChapterController(chapterTiming);
    const first = controller.begin(0, stage, null, false);
    expect(first.flow.pages).toHaveLength(CAMPAIGN_INTRO.length + 1);
    expect(first.sequence.beats[1]).toMatchObject({ id: "page-0", completion: "confirm", duration: 2.35 });
    controller.complete(false, false);
    expect(controller.begin(0, stage, null, true).flow.pages).toHaveLength(1);
  });

  it("emits chapter state and deferred-wave activation in order", () => {
    const controller = new CampaignChapterController(chapterTiming); controller.begin(0, stage, null, false);
    expect(controller.enterBeat("page-2")).toEqual([
      { type: "chapter-state", state: "LORE_READ", page: 2 }, { type: "sound", cue: "chapter-dialogue" },
    ]);
    expect(controller.complete(true, true)).toEqual([
      { type: "chapter-state", state: "WAVE_LIVE" }, { type: "reset-stage-banner" },
      { type: "activate-prepared-wave" }, { type: "music-duck", amount: 1, duration: 0.7 },
    ]);
  });
});

describe("finale controller", () => {
  const config = { anchorRadius: 30, worldZoom: 0.8, silence: 1, wound: 2, relics: 3,
    cutAutoAt: 4, cutAutoStep: 1, cutSpeed: 500, restorationMin: 2, epilogueReveal: 1, rewardHold: 1 };

  it("preserves anchor geometry and restoration unlock order", () => {
    const controller = new FinaleController(config);
    const result = controller.start({ campaign: true, recovered: false, prepared: { isNew: true },
      player: { x: 800, y: 500 }, viewport: { width: 1600, height: 900 }, score: 1200,
      formattedTime: "01:23", perfectColor: "cyan" });
    expect(result.state?.anchors).toEqual([
      { x: 632, y: 428, r: 30, depth: 0.62, cut: false },
      { x: 974, y: 534, r: 30, depth: 0.82, cut: false },
      { x: 808, y: 326, r: 30, depth: 1, cut: false },
    ]);
    controller.sever(false, { x: 1, y: -1 }, "cyan", false, false);
    expect(controller.state).toMatchObject({ severed: 1, restoredColor: true, restoredGravity: false, tearClosed: false });
    controller.sever(false, { x: 1, y: -1 }, "cyan", false, false);
    controller.sever(false, { x: 1, y: -1 }, "cyan", false, false);
    expect(controller.state).toMatchObject({ severed: 3, restoredGravity: true, tearClosed: true });
  });

  it("emits relic cues once and auto-severs on the authored clock", () => {
    const controller = new FinaleController(config);
    controller.start({ campaign: true, recovered: false, prepared: { isNew: false }, player: { x: 800, y: 500 },
      viewport: { width: 1600, height: 900 }, score: 1, formattedTime: "00:01", perfectColor: "cyan" });
    controller.enterBeat("relics", 1600);
    expect(controller.updateBeat(1, 0.51).filter((intent) => intent.type === "sound")).toHaveLength(2);
    expect(controller.updateBeat(1.1, 0.51).filter((intent) => intent.type === "sound")).toHaveLength(0);
    controller.enterBeat("cut", 1600);
    controller.updateBeat(4, 0);
    expect(controller.state?.severed).toBe(1);
  });
});
