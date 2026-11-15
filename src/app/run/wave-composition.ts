import { releasePointerLock } from "../../platform/browser-pointer-lock";
import type { BossId } from "../../gameplay/run/content-director";
import { isBossDefinitionId } from "../../gameplay/run/boss-definitions";
import type { PreparedVictory } from "../../gameplay/run/outcome-planner";
import type { RunLifecycleController } from "../../gameplay/run/lifecycle";
import { eligibleTierChoices } from "../../gameplay/run/reward-selection";
import { createTearWaveFactPublisher } from "../../gameplay/runtime/gameplay-event-publishers";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameRun } from "../shell/game-runtime-state";
import type { createLiveCampaignHost } from "../campaign/campaign-host";
import type { createLiveContentComposition } from "../world/content-composition";
import type { LiveRunControllerRegistry } from "./run-controller-api";
import type { LiveWorldServices } from "../world/world-context";
import { createLiveWaveHost } from "./wave-host";
import type { WavePlanIntentPort } from "../../gameplay/run/wave-intent-dispatcher";

type CampaignHost = ReturnType<typeof createLiveCampaignHost>;
type Content = ReturnType<typeof createLiveContentComposition>;
type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

function bossId(value: string): BossId {
  return isBossDefinitionId(value) ? value : "warden";
}

export interface LiveWaveCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;
  readonly stage: CampaignHost["stage"];
  readonly story: CampaignHost["story"];
  readonly worldServices: Pick<LiveWorldServices, "random">;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
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
  /** The chapter about to begin for this stage plays a cinematic that will activate its wave. */
  readonly campaignChapterGatesWave: (stageIndex: number) => boolean;
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
  const publishWave = createTearWaveFactPublisher(d.GAMEPLAY_EVENTS);
  createLiveWaveHost({
    run: options.run,
    tuning: () => d.CONFIG.run,
    stages: d.STAGES.map((stage) => ({ ...stage, boss: bossId(stage.boss) })),
    // Ordinary mode rosters remain published-only; this lookup lets a
    // test-build engineering selection materialize Pale in its authored home.
    bossOnlyStages: d.PLAYGROUND_STAGES.map((stage) => ({ ...stage, boss: bossId(stage.boss) })),
    presets: d.PRESETS,
    random: options.worldServices.random.stream("world"),
    modeDefinition: (mode) => d.CONFIG.modes.find((candidate) => candidate.id === mode) ?? {},
    currentStage: () => ({ index: options.stage.index, accent: options.stage.current.accent }),
    // Defer a stage's first wave only behind a chapter cinematic that will play and later
    // release it; a skipped chapter (retry, "off") would otherwise strand the wave unactivated.
    stageHasChapter: options.campaignChapterGatesWave,
    chapterFlowActive: () => options.story.chapterFlow !== null,
    lifecycle: {
      hasPreparedWave: () => options.lifecycle.hasPreparedWave,
      isWaveActive: () => options.lifecycle.isWaveActive,
      pendingReward: () => options.lifecycle.reward,
    },
    planIntents: {
      beginWipe: options.beginWipe,
      loadStage: options.loadStage,
      setStageBanner: (name, duration) => {
        options.stage.setBanner(name, duration);
      },
      beginCampaignChapter: options.beginCampaignChapter,
      recordWave: publishWave,
      snapshotReplay: (slot) => {
        d.GHOST.snapshot(options.canvas, slot);
      },
      prepareWave: (wave, boss, deferred) => {
        const weapon = d.WEAPONS.find((candidate) => candidate.id === options.run().weaponId);
        weapon?.onReset?.({ blade: options.blade() });
        options.lifecycle.prepareWave(wave, boss, deferred);
      },
      activateWave: () => {
        options.lifecycle.activateWave();
      },
      showWaveBanner: () => {
        options.setBannerSeconds(d.CONFIG.juice.bannerTime);
      },
      playWaveSound: () => {
        d.SFX.wave();
      },
    },
    clearIntents: {
      clearWave: () => {
        options.lifecycle.clearWave();
      },
      bloom: (color, strength, duration) => {
        d.Backdrop.bloom(color, strength, duration);
      },
      recordWave: publishWave,
      profileMax: d.profileStatsPersistence.max,
      profileAdd: d.profileStatsPersistence.add,
      dailyBump: (challenge, value, operation) => {
        d.DAILY.bump(challenge, value, operation);
      },
      hordeCleared: (seconds) => {
        options.achievementTracker.hordeCleared(seconds);
      },
      achievementCheck: options.achievementCheck,
      stageDone: () => {
        options.achievementTracker.stageDone();
      },
      healPlayer: (amount) => {
        options.player().heal(amount);
      },
      prepareReward: (reward) => {
        options.lifecycle.prepareReward(reward);
      },
      startAdventureFinale: options.startAdventureFinale,
      winRun: options.winRun,
      releasePointer: () => {
        releasePointerLock(document);
      },
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
    install: (controller) => {
      options.controllers.installWave(controller);
    },
  });
}
