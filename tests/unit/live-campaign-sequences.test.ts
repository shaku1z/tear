import { describe, expect, it, vi } from "vitest";
import { CampaignRuntimeState } from "../../src/app/campaign-runtime-state";
import { CampaignChapterController, type CampaignStage, type ChapterIntent } from "../../src/gameplay/campaign/chapter-controller";
import { FinaleController } from "../../src/gameplay/campaign/finale-controller";
import {
  launchAdventureFinale,
  launchCampaignChapter,
  type CampaignCinematicChannel,
  type CampaignCinematicScript,
} from "../../src/app/live-campaign-sequences";
import type { FinaleIntent } from "../../src/gameplay/campaign/finale-controller";

function runtime(): CampaignRuntimeState {
  return new CampaignRuntimeState(
    () => new CampaignChapterController({
      loreReveal: 0.1, chapterIn: 0.1, loreExit: 0.1, biomeRevealBrief: 0.1,
      biomeRevealFull: 0.2, readyBrief: 0.1, readyFull: 0.2, dialogueDuck: 0.5, biomeRevealDuck: 0.4,
    }),
    () => new FinaleController({
      anchorRadius: 20, worldZoom: 0.8, silence: 0.1, wound: 0.1, relics: 0.1,
      cutAutoAt: 0.2, cutAutoStep: 0.1, cutSpeed: 10, restorationMin: 0.1,
      epilogueReveal: 0.1, rewardHold: 0.1,
    }),
  );
}

const stage: CampaignStage = {
  name: "Ash Vault", blurb: "Descend", accent: "#f00", dark: false,
  chapter: { number: 1, symbol: "I", title: "Embers", intro: "Enter", pages: [{ label: "ASH", text: "Burn." }] },
};

class ExercisingCinema implements CampaignCinematicChannel {
  started = false;
  playerModes: unknown[] = [];

  start<Context>(
    script: CampaignCinematicScript<Context>,
    context: Context,
  ): void {
    this.started = true;
    this.playerModes = script.beats.map((beat) => beat.playerMode);
    const director = { elapsed: 0, progress: 0, skipTo: () => true };
    // The public channel is intentionally generic; exercising lifecycle callbacks is sufficient here.
    script.onStart?.(context, director);
    script.beats[0]?.onEnter?.(context, director);
    script.onComplete?.(context, director);
  }
}

class SkippingCinema implements CampaignCinematicChannel {
  start<Context>(script: CampaignCinematicScript<Context>, context: Context): void {
    const director = { elapsed: 1, progress: 1, skipTo: () => true };
    script.onStart?.(context, director);
    script.onSkip?.(context, director);
    script.beats.find((beat) => beat.id === "restoration")?.onEnter?.(context, director);
    script.onComplete?.(context, director);
  }
}

describe("live campaign sequences", () => {
  it("completes the no-cinematic policy synchronously and activates the prepared wave", () => {
    const state = runtime();
    const intents: ChapterIntent[] = [];
    let prologueShown = false;
    launchCampaignChapter({
      runtime: state, cinema: new ExercisingCinema(), stageIndex: 0, stage, priorOutro: null,
      brief: false, play: false, prologueShown: false,
      preparedWave: () => true, activationDeferred: () => true,
      dispatch: (next) => { intents.push(...next); },
      rememberPrologue: (shown) => { prologueShown = shown; },
      clearBossBeat: () => undefined,
    });

    expect(prologueShown).toBe(true);
    expect(state.chapterFlow).toBeNull();
    expect(intents.map((intent) => intent.type)).toContain("activate-prepared-wave");
    expect(intents.at(-1)).toEqual({ type: "music-duck", amount: 1, duration: 0.7 });
  });

  it("owns cinematic completion and clears the spanning chapter state", () => {
    const state = runtime();
    const cinema = new ExercisingCinema();
    const intents: ChapterIntent[] = [];
    launchCampaignChapter({
      runtime: state, cinema, stageIndex: 1, stage, priorOutro: null, brief: true, play: true,
      prologueShown: true, preparedWave: () => false, activationDeferred: () => false,
      dispatch: (next) => { intents.push(...next); }, rememberPrologue: () => undefined,
      clearBossBeat: () => undefined,
    });

    expect(cinema.started).toBe(true);
    expect(cinema.playerModes.every((mode) => mode === "locked")).toBe(true);
    expect(state.chapterFlow).toBeNull();
    expect(intents.map((intent) => intent.type)).toContain("clear-projectiles");
    expect(intents.map((intent) => intent.type)).toContain("chapter-state");
  });

  it("preserves the live blade velocity while assisting every skipped finale anchor", () => {
    const state = runtime();
    const intents: FinaleIntent[] = [];
    const assistVelocity = vi.fn(() => ({ x: 3, y: 4 }));
    const launched = launchAdventureFinale({
      runtime: state, cinema: new SkippingCinema(), viewportWidth: 1600,
      input: { campaign: true, recovered: false, prepared: { isNew: true },
        player: { x: 800, y: 300 }, viewport: { width: 1600, height: 900 }, score: 100,
        formattedTime: "1:00", perfectColor: "#fff" },
      dispatch: (next) => { intents.push(...next); }, stopPlayer: vi.fn(), assistVelocity,
    });
    expect(launched).toBe(true);
    expect(assistVelocity).toHaveBeenCalledTimes(3);
    expect(intents.filter((intent) => intent.type === "burst").map((intent) => ({ dx: intent.dx, dy: intent.dy })))
      .toEqual([{ dx: 3, dy: 4 }, { dx: 3, dy: 4 }, { dx: 3, dy: 4 }]);
    expect(state.finale).toBeNull();
  });
});
