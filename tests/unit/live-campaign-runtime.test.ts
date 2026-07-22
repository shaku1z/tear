import { describe, expect, it, vi } from "vitest";
import { CampaignRuntimeState } from "../../src/app/campaign-runtime-state";
import { createLiveCampaignRuntime } from "../../src/app/live-campaign-runtime";
import { CampaignChapterController } from "../../src/gameplay/campaign/chapter-controller";
import { FinaleController } from "../../src/gameplay/campaign/finale-controller";

function story(): CampaignRuntimeState {
  return new CampaignRuntimeState(
    () => new CampaignChapterController({ loreReveal: 0.1, chapterIn: 0.1, loreExit: 0.1,
      biomeRevealBrief: 0.1, biomeRevealFull: 0.2, readyBrief: 0.1, readyFull: 0.2,
      dialogueDuck: 0.4, biomeRevealDuck: 0.5 }),
    () => new FinaleController({ anchorRadius: 20, worldZoom: 0.8, silence: 0.1, wound: 0.1,
      relics: 0.1, cutAutoAt: 0.2, cutAutoStep: 0.1, cutSpeed: 10, restorationMin: 0.1,
      epilogueReveal: 0.1, rewardHold: 0.1 }),
  );
}

describe("live campaign runtime", () => {
  it("owns no-cinematic chapter completion through typed intent ports", () => {
    const run = { mode: "campaign", chapterState: "LORE_ENTER", score: 0, runTime: 0 };
    const activatePreparedWave = vi.fn();
    const chapterStates: string[] = [];
    const runtime = createLiveCampaignRuntime({
      runtime: story(), cinema: { start: vi.fn() }, run: () => run,
      player: () => ({ x: 0, y: 0, vx: 0, vy: 0, onGround: true }), blade: () => ({}),
      stageAt: () => ({ name: "Ash", blurb: "Descend", accent: "#f00", dark: false,
        chapter: { number: 1, symbol: "I", title: "Embers", intro: "Enter", pages: [] } }),
      preference: () => "off", preparedWave: () => true, activationDeferred: () => true,
      chapterIntents: {
        activatePreparedWave, setChapterState: (state) => { run.chapterState = state; chapterStates.push(state); },
        clearProjectiles: vi.fn(), musicDuck: vi.fn(), resetStageBanner: vi.fn(), sound: vi.fn(),
      },
      finaleIntents: {
        beginLifecycle: vi.fn(), clearCombat: vi.fn(), freezeVoid: vi.fn(), worldZoom: vi.fn(), finalBlade: vi.fn(),
        ring: vi.fn(), burst: vi.fn(), flash: vi.fn(), shake: vi.fn(), vibrate: vi.fn(), sound: vi.fn(),
        restoreStageZero: vi.fn(), restorePlayer: vi.fn(), voidMix: vi.fn(), musicDuck: vi.fn(), win: vi.fn(),
      },
      clearBossBeat: vi.fn(), prepareVictory: vi.fn(() => ({ isNew: false, earned: 0, coins: 0 })),
      win: vi.fn(), formatTime: () => "0:00", viewport: { width: 1600, height: 900 },
      perfectColor: () => "#fff", reducedMotion: () => false, lowGraphics: () => false,
    });
    expect(runtime.loreBusy()).toBe(true);
    runtime.beginChapter(0);
    expect(run.chapterState).toBe("WAVE_LIVE");
    expect(runtime.loreBusy()).toBe(false);
    expect(activatePreparedWave).toHaveBeenCalledOnce();
    expect(chapterStates).toContain("LORE_ENTER");
    expect(chapterStates.at(-1)).toBe("WAVE_LIVE");
  });
});
