import type { BossId } from "../gameplay/run/content-director";
import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import { eligibleTierChoices } from "../gameplay/run/reward-selection";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameEnemy, GamePlayer, GameRun } from "./game-runtime-state";
import type { createLiveCampaignHost } from "./live-campaign-host";
import type { createLiveContentComposition } from "./live-content-composition";
import type { LiveRunControllerRegistry } from "./live-run-controller-api";
import { createLiveWaveHost } from "./live-wave-host";
import type { WavePlanIntentPort } from "./live-wave-intent-coordinator";

type CampaignHost = ReturnType<typeof createLiveCampaignHost>;
type Content = ReturnType<typeof createLiveContentComposition>;
type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

function bossId(value: string): BossId {
  if (value === "source" || value === "echo" || value === "aldric" || value === "colossus") return value;
  return "warden";
}

export interface LiveWaveCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;
  readonly stage: CampaignHost["stage"];
  readonly story: CampaignHost["story"];
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly enemies: () => GameEnemy[];
  readonly spawn: Content["spawn"];
  readonly loreBusy: () => boolean;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  readonly achievementTracker: Readonly<{
    hordeCleared: (seconds: number) => void;
    stageDone: () => void;
  }>;
  readonly beginWipe: () => void;
  readonly loadStage: (index: number) => void;
  readonly beginCampaignChapter: WavePlanIntentPort["beginCampaignChapter"];
  readonly setBannerSeconds: (value: number) => void;
  readonly startAdventureFinale: () => void;
  readonly winRun: () => void;
  readonly openTier: (choices: readonly GameRuntimeDependencies["UPGRADES"][number][]) => void;
  readonly openDraft: () => void;
  readonly canvas: HTMLCanvasElement;
}

/** Composes wave planning, presentation intents, rewards, and clear progression. */
export function createLiveWaveComposition(options: LiveWaveCompositionOptions): void {
  const d = options.dependencies;
  createLiveWaveHost({
    run: options.run,
    tuning: () => d.CONFIG.run,
    stages: d.STAGES.map((stage) => ({ ...stage, boss: bossId(stage.boss) })),
    presets: d.PRESETS,
    random: d.GAME_RANDOM_STREAMS.stream("world"),
    modeDefinition: (mode) => d.CONFIG.modes.find((candidate) => candidate.id === mode) ?? {},
    currentStage: () => ({ index: options.stage.index, accent: options.stage.current.accent }),
    stageHasChapter: () => true,
    chapterFlowActive: () => options.story.chapterFlow !== null,
    lifecycle: {
      hasPreparedWave: () => options.lifecycle.hasPreparedWave,
      isWaveActive: () => options.lifecycle.isWaveActive,
      pendingReward: () => options.lifecycle.reward,
    },
    planIntents: {
      beginWipe: options.beginWipe,
      loadStage: options.loadStage,
      setStageBanner: (name, duration) => { options.stage.setBanner(name, duration); },
      beginCampaignChapter: options.beginCampaignChapter,
      recordWave: (wave, marker) => { d.GHOST.wave(wave, marker); },
      snapshotReplay: (slot) => { d.GHOST.snapshot(options.canvas, slot); },
      prepareWave: (wave, boss, deferred) => { options.lifecycle.prepareWave(wave, boss, deferred); },
      activateWave: () => { options.lifecycle.activateWave(); },
      showWaveBanner: () => { options.setBannerSeconds(d.CONFIG.juice.bannerTime); },
      playWaveSound: () => { d.SFX.wave(); },
    },
    clearIntents: {
      clearWave: () => { options.lifecycle.clearWave(); },
      bloom: (color, strength, duration) => { d.Backdrop.bloom(color, strength, duration); },
      recordWave: (wave, marker) => { d.GHOST.wave(wave, marker); },
      profileMax: (stat, value) => { d.PROFILE.maxStat(stat, value); },
      profileAdd: (stat, value) => { d.PROFILE.addStat(stat, value); },
      dailyBump: (challenge, value, operation) => { d.DAILY.bump(challenge, value, operation); },
      hordeCleared: (seconds) => { options.achievementTracker.hordeCleared(seconds); },
      achievementCheck: options.achievementCheck,
      stageDone: () => { options.achievementTracker.stageDone(); },
      healPlayer: (amount) => { options.player().heal(amount); },
      prepareReward: (reward) => { options.lifecycle.prepareReward(reward); },
      startAdventureFinale: options.startAdventureFinale,
      winRun: options.winRun,
      releasePointer: () => { document.exitPointerLock(); },
      openTierUp: () => {
        const run = options.run();
        options.openTier(eligibleTierChoices(d.UPGRADES, run.mods.owned, run.mods.tier));
      },
      openDraft: options.openDraft,
    },
    spawn: options.spawn,
    enemyCount: () => options.enemies().length,
    loreBusy: options.loreBusy,
    achievementTracking: options.achievementTracking,
    playerOneHit: () => options.player().oneHit,
    availableTierUpCount: () => {
      const run = options.run();
      return eligibleTierChoices(d.UPGRADES, run.mods.owned, run.mods.tier).length;
    },
    install: (controller) => { options.controllers.installWave(controller); },
  });
}
