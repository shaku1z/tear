import type { RunStartChoices } from "../../gameplay/run/run-start-choices";
import { bindLiveHammerMeteor } from "../../gameplay/combat/live-hammer-meteor";
import type { PreparedVictory, RunResultInfo } from "../../gameplay/run/outcome-planner";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import type { MusicDirector } from "../../audio/music-director";
import type { RunLifecycleController } from "../../gameplay/run/lifecycle";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type {
  GameBlade,
  GameEnemy,
  GamePlayer,
  GameProjectile,
  GameRun,
} from "../../gameplay/runtime/game-runtime-state";
import type { LiveGameHostState } from "../world/game-host-state";
import type { LiveWorldEntityConstructionPort } from "../world/world-entity-factory";
import type { LiveWorldServices } from "../world/world-context";
import type { AppTransitionContext } from "../interface/app-state-controller";
import type { AppScreen } from "../../domain/screen-catalog";
import type { LiveRunControllerRegistry } from "./run-controller-api";
import type { createLiveCampaignHost } from "../campaign/campaign-host";
import type { LiveTrainingHost } from "../training/training-host";
import type { createLiveWeaponRuntime } from "../../gameplay/combat/live-weapon-runtime";
import { createLiveContentComposition } from "../world/content-composition";
import { createLiveOutcomeComposition } from "./outcome-composition";
import type { ReplayRunEnd } from "../../replay/recorder";
import { createLiveRunStartHost, type LiveOpeningCaptureBoundary } from "./run-start-host";
import { createLiveVictoryProgressionExecutor } from "./victory-progression-host";
import { createLiveWaveComposition } from "./wave-composition";
import type { OutcomeChronologyEffect } from "../../gameplay/run/outcome-chronology-journal";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { EnvironmentRuntimeState } from "../../gameplay/environment/environment-contracts";
import { loadRunStage } from "../world/run-stage";
import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import type { RunStartWorld } from "./run-start-world";
import type { CinematicPreference } from "../../gameplay/campaign/cinematic-preference";
import type { AttackPresentationCueSink } from "../../gameplay/combat/attack-presentation-cue";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;
type Controllers = LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;
type CampaignHost = ReturnType<typeof createLiveCampaignHost>;
type TrainingHost = LiveTrainingHost;
type WeaponRuntime = ReturnType<typeof createLiveWeaponRuntime<GameEnemy>>;

export interface LiveRunOrchestrationOptions {
  readonly runInstalled?: (run: GameRun) => void;
  readonly runStarted?: (start: RunStartChoices) => void;
  /** The run reached its outcome; `keep` says whether its replay record is kept. */
  readonly replayRunEnded?: (run: ReplayRunEnd["run"], keep: boolean) => void;
  readonly observeTerminal?: (outcome: "defeat" | "victory") => void;
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly state: LiveGameHostState;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: Controllers;
  readonly campaign: CampaignHost;
  readonly training: TrainingHost;
  readonly baselinePractice?: () => boolean;
  readonly weapon: WeaponRuntime;
  readonly music: MusicDirector;
  readonly width: number;
  readonly height: number;
  readonly canvas: HTMLCanvasElement;
  readonly testMode: boolean;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly enemies: () => GameEnemy[];
  readonly actorId: (enemy: GameEnemy) => string;
  readonly observeBossIntro?: (actorId: string, duration: number, delay: number) => void;
  readonly setEnemies: (value: GameEnemy[]) => void;
  readonly setProjectiles: (value: GameProjectile[]) => void;
  readonly selectedBoss: () => string;
  readonly worldServices: Pick<
    LiveWorldServices,
    "configuration" | "random" | "clock" | "effects" | "mirror" | "bossFeedback"
  >;
  readonly environment: EnvironmentRuntimeState;
  readonly attackPresentation: AttackPresentationCueSink;
  readonly applySettings: () => void;
  /** The world a run starts in; the same constructor builds a detached world. */
  readonly world: RunStartWorld;
  readonly combat: Readonly<{ resetClock(): void; resetIdentity(): void }>;
  readonly hud: Readonly<{ restore(value: undefined): void }>;
  readonly cinematicPreference: () => CinematicPreference;
  readonly race?: Readonly<{
    active(): boolean;
    apply(): boolean;
    finalize(): void;
    discovery(ordinary: readonly string[]): readonly string[];
  }>;
  readonly createRunSeed?: () => number;
  readonly withOpeningCapture?: (boundary: LiveOpeningCaptureBoundary, record: () => void) => void;
  readonly openingExposed?: (runId: string) => void;
  readonly discardOpeningCapture?: () => void;
  readonly authoritativeResult: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly setScreen: (screen: AppScreen, context?: AppTransitionContext) => void;
  readonly requestPointerLock: () => void;
  readonly beginWipe: () => void;
  readonly wipeRemainingSeconds: () => number;
  readonly setBannerSeconds: (value: number) => void;
  readonly openTier: (choices: readonly GameRuntimeDependencies["UPGRADES"][number][]) => void;
  readonly openDraft: () => void;
  readonly resetRewards: () => void;
  readonly saveBest: (mode: string, difficulty: string, wave: number, score: number, seconds: number) => boolean;
  readonly getBest: (mode: string, difficulty: string) => Readonly<{ wave: number; score: number; time: number }>;
  readonly awardCoins: (score: number) => number;
  readonly economyTelemetry: (earned: number) => Readonly<Record<string, unknown>>;
  readonly setLastRecording: (recording: ReplayPacket | null) => void;
  readonly setLastVaultId: (id: string | null) => void;
  readonly setOutcome: (result: RunResultInfo) => void;
  readonly resetWinSeconds: () => void;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  readonly practiceSession?: LiveGhostPracticeSessionState;
  readonly achievementTracker: Readonly<{ hordeCleared(seconds: number): void; stageDone(): void }>;
  readonly emitMusicOutcome: (outcome: "defeat" | "victory") => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  /** Test-only synchronous terminal receipt sink. */
  readonly observeOutcomeChronology?: (effect: OutcomeChronologyEffect) => void;
}

/** Installs the run transaction, content, wave, terminal, and victory controllers. */
export function createLiveRunOrchestration(options: LiveRunOrchestrationOptions) {
  const d = options.dependencies;
  const { stage, story, runtime: campaignRuntime, cinema } = options.campaign;
  const { tutorial, runtime: playgroundRuntime } = options.training;
  const addShake = (amount: number): void => {
    options.weapon.addShake(amount);
  };
  const addZoom = (amount: number): void => {
    options.weapon.addZoom(amount);
  };
  const dealArea: LiveRunOrchestrationOptions["weapon"]["dealArea"] = (...args) => options.weapon.dealArea(...args);
  const stageLoad = {
    load: (index: number) => {
      options.controllers.api.loadStage(index);
    },
    enemies: options.enemies,
    environment: options.environment,
    tick: () => options.authoritativeResult()?.tick ?? 0,
  };
  const loadTransitionStage = (index: number): void => {
    loadRunStage(stageLoad, index, "stage-transition");
  };
  const content = createLiveContentComposition({
    dependencies: d,
    entities: options.entities,
    state: options.state,
    worldServices: options.worldServices,
    stage,
    width: options.width,
    height: options.height,
    run: options.run,
    player: options.player,
    enemies: options.enemies,
    actorId: options.actorId,
    wipeRemainingSeconds: options.wipeRemainingSeconds,
    setBossIntro: (enemy, duration, delay) => {
      options.state.setBossIntro({ boss: enemy, t: 0, dur: duration, delay });
      options.observeBossIntro?.(options.actorId(enemy), duration, delay);
    },
    clearBossBeat: () => {
      options.state.setBossBeat(null);
    },
    clearBanner: () => {
      options.setBannerSeconds(0);
      stage.resetBanner();
    },
  });

  createLiveRunStartHost({
    ...(options.runInstalled === undefined ? {} : { runInstalled: options.runInstalled }),
    ...(options.runStarted === undefined ? {} : { runStarted: options.runStarted }),
    ...(options.race === undefined ? {} : { race: options.race }),
    dependencies: d,
    world: options.world,
    width: options.width,
    combat: options.combat,
    hud: options.hud,
    cinematics: {
      preference: options.cinematicPreference,
      playedChapters: campaignRuntime.playedChapters,
    },
    applySettings: options.applySettings,
    ...(options.createRunSeed === undefined ? {} : { createRunSeed: options.createRunSeed }),
    ...(options.withOpeningCapture === undefined ? {} : { withOpeningCapture: options.withOpeningCapture }),
    ...(options.openingExposed === undefined ? {} : { openingExposed: options.openingExposed }),
    ...(options.discardOpeningCapture === undefined ? {} : { discardOpeningCapture: options.discardOpeningCapture }),
    loadStage: (index) => {
      loadRunStage(stageLoad, index, "new-run");
    },
    stage,
    story,
    install: (controller) => {
      options.controllers.installRunStart(controller);
    },
    setScreen: (screen, detail) => {
      options.setScreen(screen, detail);
    },
    selectedBoss: options.selectedBoss,
    content,
    training: {
      platforms: () => playgroundRuntime.homePlatforms(),
      playground: playgroundRuntime,
      tutorial,
    },
    ...(options.baselinePractice === undefined ? {} : { baselinePractice: options.baselinePractice }),
    startNextWave: options.controllers.api.startNextWave,
    achievementTracking: options.achievementTracking,
    achievementCheck: options.achievementCheck,
    ...(options.practiceSession === undefined ? {} : { clearPracticeSession: options.practiceSession.clear }),
    resetRewards: options.resetRewards,
    music: options.music,
    requestPointerLock: options.requestPointerLock,
    testMode: options.testMode,
    window,
  });

  const lobExplode = bindLiveHammerMeteor({
    blade: options.blade,
    enemies: options.enemies,
    tuning: () => d.CONFIG.weapons.hammer,
    maximumThrowSpeed: () => d.CONFIG.blade.throw.maxSpeed,
    redirect: () => options.run().mods.redirect,
    slamColor: () => d.CONFIG.colors.slam,
    bigShake: () => d.CONFIG.juice.shakeBig,
    bigZoom: () => d.CONFIG.juice.zoomBig,
    distance: d.len,
    clamp: d.clamp,
    explode: (...args) => {
      d.FX.explode(...args);
    },
    ribbon: (...args) => {
      d.FX.ribbon(...args);
    },
    shake: addShake,
    zoom: addZoom,
    boom: () => {
      d.SFX.boom();
    },
    areaDamage: dealArea,
    presentAttack: (cue) => {
      options.attackPresentation.emit(cue);
    },
  });

  createLiveWaveComposition({
    dependencies: d,
    lifecycle: options.lifecycle,
    controllers: options.controllers,
    stage,
    story,
    worldServices: options.worldServices,
    run: options.run,
    player: options.player,
    blade: options.blade,
    enemies: options.enemies,
    spawn: content.spawn,
    loreBusy: campaignRuntime.loreBusy,
    achievementTracking: options.achievementTracking,
    achievementCheck: options.achievementCheck,
    achievementTracker: options.achievementTracker,
    beginWipe: options.beginWipe,
    loadStage: loadTransitionStage,
    beginCampaignChapter: campaignRuntime.beginChapter,
    campaignChapterGatesWave: campaignRuntime.chapterGatesWave,
    setBannerSeconds: options.setBannerSeconds,
    startAdventureFinale: () => {
      campaignRuntime.startAdventureFinale(options.run().finalBossDeath);
    },
    winRun: () => {
      options.controllers.api.winRun();
    },
    openTier: options.openTier,
    openDraft: options.openDraft,
    canvas: options.canvas,
  });

  const executeVictory = createLiveVictoryProgressionExecutor(d, options.achievementCheck, (won) => {
    options.controllers.api.finishRecording(won);
  });
  createLiveOutcomeComposition({
    ...(options.observeTerminal === undefined ? {} : { observeTerminal: options.observeTerminal }),
    ...(options.replayRunEnded === undefined ? {} : { replayRunEnded: options.replayRunEnded }),
    dependencies: d,
    lifecycle: options.lifecycle,
    controllers: options.controllers,
    environment: options.environment,
    run: options.run,
    player: options.player,
    stageIndex: () => stage.index,
    loadStage: (index) => {
      // The outcome's restart loads the stage state alone: the stage controller's resets are its own.
      const load = (next: number): void => {
        stage.load(next);
      };
      loadRunStage({ ...stageLoad, load }, index, "stage-transition");
    },
    authoritativeResult: options.authoritativeResult,
    setLastRecording: options.setLastRecording,
    setLastVaultId: options.setLastVaultId,
    setOutcome: options.setOutcome,
    selectedWeapon: () => options.state.selectedWeapon(),
    selectWeapon: (weapon) => {
      options.state.setSelectedWeapon(weapon);
    },
    clearCombat: () => {
      options.setEnemies([]);
      options.setProjectiles([]);
    },
    resetWinSeconds: options.resetWinSeconds,
    setScreen: (screen) => {
      options.setScreen(screen);
    },
    saveBest: options.saveBest,
    getBest: options.getBest,
    awardCoins: options.awardCoins,
    economyTelemetry: options.economyTelemetry,
    achievementTracking: options.achievementTracking,
    achievementCheck: options.achievementCheck,
    ...(options.practiceSession === undefined ? {} : { practiceSession: options.practiceSession }),
    finishRecording: options.controllers.api.finishRecording,
    executeVictory,
    emitMusicOutcome: options.emitMusicOutcome,
    startRun: options.startRun,
    cleanupBossActors: () => {
      cleanupBossEncounterActors(options.enemies(), "retry");
    },
    startFinale: (witnessed) => {
      campaignRuntime.startAdventureFinale(witnessed);
    },
    cinema,
    width: options.width,
    height: options.height,
    ...(options.observeOutcomeChronology === undefined
      ? {}
      : { observeOutcomeChronology: options.observeOutcomeChronology }),
  });
  return Object.freeze({ ...content, lobExplode, loadTransitionStage });
}

export type LiveRunOrchestration = ReturnType<typeof createLiveRunOrchestration>;
