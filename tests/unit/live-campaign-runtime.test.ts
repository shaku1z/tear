import { describe, expect, it, vi } from "vitest";
import { CampaignRuntimeState } from "../../src/gameplay/campaign/campaign-runtime-state";
import { createLiveCampaignRuntime } from "../../src/gameplay/campaign/campaign-runtime";
import { CampaignChapterController } from "../../src/gameplay/campaign/chapter-controller";
import { FinaleController } from "../../src/gameplay/campaign/finale-controller";
import type { ChapterPage } from "../../src/gameplay/campaign/chapter-controller";
import { createLiveWaveHost } from "../../src/app/run/wave-host";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom } from "../../src/domain/random";
import { PRESETS } from "../../src/gameplay/affixes";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { RunLifecycleController } from "../../src/gameplay/run/lifecycle";
import type { LiveWaveController, LiveWaveRun } from "../../src/gameplay/run/live-wave-controller";
import { STAGES } from "../../src/gameplay/stages";

function story(): CampaignRuntimeState {
  return new CampaignRuntimeState(
    () =>
      new CampaignChapterController({
        loreReveal: 0.1,
        chapterIn: 0.1,
        loreExit: 0.1,
        biomeRevealBrief: 0.1,
        biomeRevealFull: 0.2,
        readyBrief: 0.1,
        readyFull: 0.2,
        dialogueDuck: 0.4,
        biomeRevealDuck: 0.5,
      }),
    () =>
      new FinaleController({
        anchorRadius: 20,
        worldZoom: 0.8,
        silence: 0.1,
        wound: 0.1,
        relics: 0.1,
        cutAutoAt: 0.2,
        cutAutoStep: 0.1,
        cutSpeed: 10,
        restorationMin: 0.1,
        epilogueReveal: 0.1,
        rewardHold: 0.1,
      }),
  );
}

describe("live campaign runtime", () => {
  it("owns no-cinematic chapter completion through typed intent ports", () => {
    const run = { mode: "campaign", chapterState: "LORE_ENTER", score: 0, runTime: 0 };
    const activatePreparedWave = vi.fn();
    const chapterStates: string[] = [];
    const runtime = createLiveCampaignRuntime({
      runtime: story(),
      cinema: { start: vi.fn(), startBinding: vi.fn() },
      run: () => run,
      player: () => ({ x: 0, y: 0, vx: 0, vy: 0, onGround: true }),
      blade: () => ({}),
      stageAt: () => ({
        name: "Ash",
        blurb: "Descend",
        accent: "#f00",
        dark: false,
        chapter: { number: 1, symbol: "I", title: "Embers", intro: "Enter", pages: [] },
      }),
      preference: () => "off",
      preparedWave: () => true,
      activationDeferred: () => true,
      chapterIntents: {
        activatePreparedWave,
        setChapterState: (state) => {
          run.chapterState = state;
          chapterStates.push(state);
        },
        clearProjectiles: vi.fn(),
        musicDuck: vi.fn(),
        resetStageBanner: vi.fn(),
        sound: vi.fn(),
      },
      finaleIntents: {
        beginLifecycle: vi.fn(),
        clearCombat: vi.fn(),
        freezeVoid: vi.fn(),
        worldZoom: vi.fn(),
        finalBlade: vi.fn(),
        ring: vi.fn(),
        burst: vi.fn(),
        flash: vi.fn(),
        shake: vi.fn(),
        vibrate: vi.fn(),
        sound: vi.fn(),
        restoreStageZero: vi.fn(),
        restorePlayer: vi.fn(),
        voidMix: vi.fn(),
        musicDuck: vi.fn(),
        win: vi.fn(),
      },
      clearStageBeat: vi.fn(),
      prepareVictory: vi.fn(() => ({ isNew: false, earned: 0, coins: 0 })),
      win: vi.fn(),
      formatTime: () => "0:00",
      viewport: { width: 1600, height: 900 },
      perfectColor: () => "#fff",
      reducedMotion: () => false,
      lowGraphics: () => false,
    });
    expect(runtime.loreBusy()).toBe(true);
    runtime.beginChapter(0);
    expect(run.chapterState).toBe("WAVE_LIVE");
    expect(runtime.loreBusy()).toBe(false);
    expect(activatePreparedWave).toHaveBeenCalledOnce();
    expect(chapterStates).toContain("LORE_ENTER");
    expect(chapterStates.at(-1)).toBe("WAVE_LIVE");
  });

  it("plays a chapter in full the first time and skips it to the stage banner on a retry", () => {
    const launch = () => {
      let run = { mode: "campaign", chapterState: "LORE_ENTER", score: 0, runTime: 0 };
      const startBinding = vi.fn();
      const resetStageBanner = vi.fn();
      const runtime = createLiveCampaignRuntime({
        runtime: story(),
        cinema: { start: vi.fn(), startBinding },
        run: () => run,
        player: () => ({ x: 0, y: 0, vx: 0, vy: 0, onGround: true }),
        blade: () => ({}),
        stageAt: () => ({
          name: "Ash",
          blurb: "Descend",
          accent: "#f00",
          dark: false,
          chapter: { number: 1, symbol: "I", title: "Embers", intro: "Enter", pages: [{ label: "A", text: "B" }] },
        }),
        preference: () => "full",
        preparedWave: () => true,
        activationDeferred: () => true,
        chapterIntents: {
          activatePreparedWave: vi.fn(),
          setChapterState: (state) => {
            run.chapterState = state;
          },
          clearProjectiles: vi.fn(),
          musicDuck: vi.fn(),
          resetStageBanner,
          sound: vi.fn(),
        },
        finaleIntents: {
          beginLifecycle: vi.fn(),
          clearCombat: vi.fn(),
          freezeVoid: vi.fn(),
          worldZoom: vi.fn(),
          finalBlade: vi.fn(),
          ring: vi.fn(),
          burst: vi.fn(),
          flash: vi.fn(),
          shake: vi.fn(),
          vibrate: vi.fn(),
          sound: vi.fn(),
          restoreStageZero: vi.fn(),
          restorePlayer: vi.fn(),
          voidMix: vi.fn(),
          musicDuck: vi.fn(),
          win: vi.fn(),
        },
        clearStageBeat: vi.fn(),
        prepareVictory: vi.fn(() => ({ isNew: false, earned: 0, coins: 0 })),
        win: vi.fn(),
        formatTime: () => "0:00",
        viewport: { width: 1600, height: 900 },
        perfectColor: () => "#fff",
        reducedMotion: () => false,
        lowGraphics: () => false,
      });
      return {
        runtime,
        startBinding,
        resetStageBanner,
        run: () => run,
        retry: () => {
          run = { mode: "campaign", chapterState: "LORE_ENTER", score: 0, runTime: 0 };
        },
      };
    };

    const fresh = launch();
    expect(fresh.runtime.chapterGatesWave(0)).toBe(true);
    fresh.runtime.beginChapter(0);
    expect(fresh.startBinding).toHaveBeenCalledOnce();
    expect(fresh.run().chapterState).toBe("LORE_ENTER");
    fresh.retry();
    expect(fresh.runtime.chapterGatesWave(0)).toBe(false);
    fresh.runtime.beginChapter(0);
    expect(fresh.startBinding).toHaveBeenCalledOnce();
    expect(fresh.run().chapterState).toBe("WAVE_LIVE");
    expect(fresh.resetStageBanner).toHaveBeenCalled();
    // A different chapter in the same session is still a first viewing.
    expect(fresh.runtime.chapterGatesWave(1)).toBe(true);
  });

  it("forwards the portable immutable finale intent batch without app-layer encoding", () => {
    const run = { mode: "campaign", chapterState: "WAVE_LIVE", score: 42, runTime: 3 };
    const observed: unknown[] = [];
    const order: string[] = [];
    const runtime = createLiveCampaignRuntime({
      runtime: story(),
      cinema: { start: () => undefined, startBinding: vi.fn() },
      run: () => run,
      player: () => ({ x: 10, y: 20, vx: 0, vy: 0, onGround: true }),
      blade: () => ({}),
      stageAt: () => null,
      preference: () => "off",
      preparedWave: () => false,
      activationDeferred: () => false,
      chapterIntents: {
        activatePreparedWave: vi.fn(),
        setChapterState: vi.fn(),
        clearProjectiles: vi.fn(),
        musicDuck: vi.fn(),
        resetStageBanner: vi.fn(),
        sound: vi.fn(),
      },
      finaleIntents: {
        beginLifecycle: () => {
          order.push("adapter");
        },
        clearCombat: vi.fn(),
        freezeVoid: vi.fn(),
        worldZoom: vi.fn(),
        finalBlade: vi.fn(),
        ring: vi.fn(),
        burst: vi.fn(),
        flash: vi.fn(),
        shake: vi.fn(),
        vibrate: vi.fn(),
        sound: vi.fn(),
        restoreStageZero: vi.fn(),
        restorePlayer: vi.fn(),
        voidMix: vi.fn(),
        musicDuck: vi.fn(),
        win: vi.fn(),
      },
      observeFinaleIntents: (batch) => {
        observed.push(batch);
        order.push("observer");
      },
      clearStageBeat: vi.fn(),
      prepareVictory: () => ({ isNew: false, earned: 0, coins: 0 }),
      win: vi.fn(),
      formatTime: () => "0:03",
      viewport: { width: 1600, height: 900 },
      perfectColor: () => "#fff",
      reducedMotion: () => false,
      lowGraphics: () => false,
    });

    runtime.startAdventureFinale({ x: 30, y: 40 });

    expect(order.slice(0, 2)).toEqual(["observer", "adapter"]);
    expect(observed[0]).toEqual([
      { type: "begin-finale-lifecycle" },
      { type: "clear-combat" },
      { type: "freeze-void" },
      { type: "world-zoom", value: 0.8 },
      { type: "final-blade", active: true, restoredTrail: true },
    ]);
    expect(Object.isFrozen(observed[0])).toBe(true);
    expect((observed[0] as readonly unknown[]).every(Object.isFrozen)).toBe(true);
  });
});

describe("live campaign chapter gate and the wave it holds", () => {
  // Wires the real wave controller, run lifecycle and campaign runtime the way
  // createLiveWaveComposition does, so the plan intents run in production order
  // (begin-campaign-chapter before prepare-wave).
  function adventure(preference: "full" | "brief" | "off") {
    const lifecycle = new RunLifecycleController();
    const chapters = story();
    const startBinding = vi.fn();
    const openDraft = vi.fn();
    let enemies = 0;
    const newRun = () => ({
      mode: "campaign" as const,
      diff: "normal" as const,
      wave: 0,
      diffHp: 1,
      diffCount: 1,
      bossOrder: BOSS_ROSTER.map((boss) => boss.id),
      bossIdx: 0,
      bossesBeaten: 0,
      curBoss: null,
      stage: null as number | null,
      spawnQueue: [] as LiveWaveRun["spawnQueue"],
      spawnTimer: 0,
      pendingBossOutro: null,
      waveTime: 0,
      waveKills: 0,
      wavePeak: 1,
      mult: 1,
      runTime: 0,
      clearTimer: -1,
      waveLog: [] as LiveWaveRun["waveLog"],
      _dmgThisWave: false,
      _dmgThisStage: false,
      mods: { owned: {} },
      chapterState: "LORE_ENTER",
      score: 0,
    });
    let run = newRun();
    let controller: LiveWaveController | null = null;
    const campaign = createLiveCampaignRuntime({
      runtime: chapters,
      cinema: { start: vi.fn(), startBinding },
      run: () => run,
      player: () => ({ x: 0, y: 0, vx: 0, vy: 0, onGround: true }),
      blade: () => ({}),
      stageAt: (index) => STAGES[index] ?? null,
      preference: () => preference,
      preparedWave: () => lifecycle.hasPreparedWave,
      activationDeferred: () => lifecycle.activationDeferred,
      chapterIntents: {
        activatePreparedWave: () => {
          controller?.activatePreparedWave();
        },
        setChapterState: (state) => {
          run.chapterState = state;
        },
        clearProjectiles: vi.fn(),
        musicDuck: vi.fn(),
        resetStageBanner: vi.fn(),
        sound: vi.fn(),
      },
      finaleIntents: {
        beginLifecycle: vi.fn(),
        clearCombat: vi.fn(),
        freezeVoid: vi.fn(),
        worldZoom: vi.fn(),
        finalBlade: vi.fn(),
        ring: vi.fn(),
        burst: vi.fn(),
        flash: vi.fn(),
        shake: vi.fn(),
        vibrate: vi.fn(),
        sound: vi.fn(),
        restoreStageZero: vi.fn(),
        restorePlayer: vi.fn(),
        voidMix: vi.fn(),
        musicDuck: vi.fn(),
        win: vi.fn(),
      },
      clearStageBeat: vi.fn(),
      prepareVictory: vi.fn(() => ({ isNew: false, earned: 0, coins: 0 })),
      win: vi.fn(),
      formatTime: () => "0:00",
      viewport: { width: 1600, height: 900 },
      perfectColor: () => "#fff",
      reducedMotion: () => false,
      lowGraphics: () => false,
    });
    const wave = createLiveWaveHost({
      run: () => run,
      tuning: () => CONFIG.run,
      stages: STAGES,
      presets: PRESETS,
      random: new SeededRandom("chapter-gate"),
      modeDefinition: () => ({}),
      currentStage: () => ({ index: run.stage ?? 0, accent: "#fff" }),
      stageHasChapter: campaign.chapterGatesWave,
      chapterFlowActive: () => chapters.chapterFlow !== null,
      lifecycle: {
        hasPreparedWave: () => lifecycle.hasPreparedWave,
        isWaveActive: () => lifecycle.isWaveActive,
        pendingReward: () => lifecycle.reward,
      },
      planIntents: {
        beginWipe: vi.fn(),
        loadStage: vi.fn(),
        setStageBanner: vi.fn(),
        beginCampaignChapter: (index, outro) => {
          campaign.beginChapter(index, outro as ChapterPage | null);
        },
        recordWave: vi.fn(),
        prepareWave: (index, boss, deferred) => {
          lifecycle.prepareWave(index, boss, deferred);
        },
        activateWave: () => {
          lifecycle.activateWave();
        },
        showWaveBanner: vi.fn(),
        playWaveSound: vi.fn(),
      },
      clearIntents: {
        clearWave: () => {
          lifecycle.clearWave();
        },
        bloom: vi.fn(),
        recordWave: vi.fn(),
        profileMax: vi.fn(),
        profileAdd: vi.fn(),
        dailyBump: vi.fn(),
        hordeCleared: vi.fn(),
        achievementCheck: vi.fn(),
        stageDone: vi.fn(),
        healPlayer: vi.fn(),
        prepareReward: (reward) => {
          lifecycle.prepareReward(reward);
        },
        startAdventureFinale: vi.fn(),
        winRun: vi.fn(),
        releasePointer: vi.fn(),
        openTierUp: vi.fn(),
        openDraft,
      },
      spawn: () => {
        enemies += 1;
      },
      enemyCount: () => enemies,
      loreBusy: campaign.loreBusy,
      achievementTracking: () => false,
      playerOneHit: () => false,
      playerHealth: () => ({ hp: 100, maxHp: 100 }),
      availableTierUpCount: () => 0,
      install: vi.fn(),
    });
    controller = wave;
    return {
      lifecycle,
      startBinding,
      openDraft,
      chapters,
      /** A new run of the same session: the menu START or the results RETRY. */
      start(sessionId: string) {
        run = newRun();
        enemies = 0;
        lifecycle.reset();
        chapters.reset();
        lifecycle.start(sessionId);
        wave.startNextWave();
      },
      /** Every enemy of the wave dies, then the clear pause elapses. */
      clearWave() {
        for (let tick = 0; tick < 1_200 && openDraft.mock.calls.length === 0; tick += 1) {
          run.spawnQueue = [];
          enemies = 0;
          wave.update(1 / 120);
        }
      },
    };
  }

  it("holds a first-viewed chapter's wave until its cinematic completes", () => {
    const game = adventure("full");
    game.start("first");
    expect(game.startBinding).toHaveBeenCalledOnce();
    expect(game.chapters.chapterFlow).not.toBeNull();
    expect(game.lifecycle.hasPreparedWave).toBe(true);
    expect(game.lifecycle.activationDeferred).toBe(true);
  });

  it("starts, clears and rewards the wave of a chapter skipped on retry", () => {
    const game = adventure("full");
    game.start("first");
    game.start("retry");
    expect(game.startBinding).toHaveBeenCalledOnce();
    expect(game.lifecycle.isWaveActive).toBe(true);
    game.clearWave();
    expect(game.openDraft).toHaveBeenCalledOnce();
    expect(game.lifecycle.reward).toBe("draft");
  });

  it("starts, clears and rewards the wave when chapter cinematics are off", () => {
    const game = adventure("off");
    game.start("off");
    expect(game.startBinding).not.toHaveBeenCalled();
    expect(game.lifecycle.isWaveActive).toBe(true);
    game.clearWave();
    expect(game.openDraft).toHaveBeenCalledOnce();
  });
});
