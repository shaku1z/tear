import { bindLiveHammerMeteor } from "../gameplay/combat/live-hammer-meteor";
import type { PreparedVictory, RunResultInfo } from "../gameplay/run/outcome-planner";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { MusicDirector } from "../audio/music-director";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameProjectile, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveWorldEntityConstructionPort } from "./live-world-entity-factory";
import type { LiveWorldServices } from "./live-world-context";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";
import type { LiveRunControllerRegistry } from "./live-run-controller-api";
import type { createLiveCampaignHost } from "./live-campaign-host";
import type { LiveTrainingHost } from "./live-training-host";
import type { createLiveWeaponRuntime } from "../gameplay/combat/live-weapon-runtime";
import { createLiveContentComposition } from "./live-content-composition";
import { createLiveOutcomeComposition } from "./live-outcome-composition";
import { createLiveRunStartHost } from "./live-run-start-host";
import { createLiveVictoryProgressionExecutor } from "./live-victory-progression-host";
import { createLiveWaveComposition } from "./live-wave-composition";
import type { OutcomeChronologyEffect } from "../gameplay/run/outcome-chronology-journal";
import type { LiveGhostPracticeSessionState } from "./live-ghost-practice-session-state";
import type { EnvironmentRuntimeState } from "../gameplay/environment/environment-contracts";
import { activateStageEnvironment } from "../gameplay/environment/stage-environment-activation";
import { cleanupBossEncounterActors } from "../gameplay/run/boss-encounter";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;
type Controllers = LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;
type CampaignHost = ReturnType<typeof createLiveCampaignHost>;
type TrainingHost = LiveTrainingHost;
type WeaponRuntime = ReturnType<typeof createLiveWeaponRuntime<GameEnemy>>;

export interface LiveRunOrchestrationOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly state: LiveGameHostState;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: Controllers;
  readonly campaign: CampaignHost;
  readonly training: TrainingHost;
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
  readonly setEnemies: (value: GameEnemy[]) => void;
  readonly setProjectiles: (value: GameProjectile[]) => void;
  readonly selectedBoss: () => string;
  readonly worldServices: Pick<LiveWorldServices, "configuration" | "random" | "clock" | "effects" | "mirror" | "bossFeedback">;
  readonly environment: EnvironmentRuntimeState;
  readonly applySettings: () => void;
  readonly prepareWorld: () => void;
  readonly resetTransientWorld: () => void;
  readonly finishWorldReset: () => void;
  readonly resetAuthoritativeClocks: () => void;
  readonly resetCombatIdentity: () => void;
  readonly createRunSeed?: () => number;
  readonly authoritativeResult: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly setScreen: (screen: LegacyAppScreen, context?: LegacyTransitionContext) => void;
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
  const addShake = (amount: number): void => { options.weapon.addShake(amount); };
  const addZoom = (amount: number): void => { options.weapon.addZoom(amount); };
  const dealArea: LiveRunOrchestrationOptions["weapon"]["dealArea"] = (...args) => options.weapon.dealArea(...args);
  const setEnvironmentStage = (index: number, reason: "new-run" | "stage-transition"): void => {
    const stageId = d.STAGES[index]?.id;
    if (stageId === undefined) throw new RangeError(`environment stage index is invalid: ${String(index)}`);
    activateStageEnvironment(options.environment, stageId, options.authoritativeResult()?.tick ?? 0, reason);
  };
  const loadTransitionStage = (index: number): void => {
    cleanupBossEncounterActors(options.enemies(), "stage-transition");
    options.controllers.api.loadStage(index);
    setEnvironmentStage(index, "stage-transition");
  };
  const content = createLiveContentComposition({
    dependencies: d, entities: options.entities, state: options.state, worldServices: options.worldServices, stage, width: options.width, height: options.height,
    run: options.run, player: options.player, enemies: options.enemies, actorId: options.actorId,
    wipeRemainingSeconds: options.wipeRemainingSeconds,
    setBossIntro: (enemy, duration, delay) => { options.state.setBossIntro({ boss: enemy, t: 0, dur: duration, delay }); },
    clearBossBeat: () => { options.state.setBossBeat(null); },
    clearBanner: () => { options.setBannerSeconds(0); stage.resetBanner(); },
  });

  createLiveRunStartHost({
    dependencies: d, state: options.state, width: options.width, services: options.worldServices,
    prepareWorld: options.prepareWorld, applySettings: options.applySettings,
    configureBlade: (blade, weaponId) => {
      const weapon = d.applyWeapon(d.CONFIG, weaponId); blade.weapon = weapon; blade.model = weapon.model;
    },
    createPlayer: (x, y) => options.entities.createPlayer(x, y), createBlade: () => options.entities.createBlade(),
    installRun: (session) => { options.state.setRun(session); },
    world: { resetTransient: options.resetTransientWorld, finishReset: options.finishWorldReset },
    resetAuthoritativeClocks: options.resetAuthoritativeClocks, environment: options.environment,
    resetCombatIdentity: options.resetCombatIdentity,
    ...(options.createRunSeed === undefined ? {} : { createRunSeed: options.createRunSeed }),
    loadStage: (index) => { options.controllers.api.loadStage(index); setEnvironmentStage(index, "new-run"); }, stage, story, lifecycle: options.lifecycle,
    install: (controller) => { options.controllers.installRunStart(controller); },
    setScreen: (screen, detail) => { options.setScreen(screen, detail); },
    selectedBoss: options.selectedBoss, shuffledRoster: content.shuffledRoster, bossBiome: content.bossBiome,
    trainingPlatforms: () => playgroundRuntime.homePlatforms(), playground: playgroundRuntime, tutorial,
    startNextWave: options.controllers.api.startNextWave,
    achievementTracking: options.achievementTracking, achievementCheck: options.achievementCheck,
    ...(options.practiceSession === undefined ? {} : { clearPracticeSession: options.practiceSession.clear }),
    resetRewards: options.resetRewards, music: options.music,
    requestPointerLock: options.requestPointerLock, testMode: options.testMode, window,
  });

  const lobExplode = bindLiveHammerMeteor({
    blade: options.blade, enemies: options.enemies, tuning: () => d.CONFIG.weapons.hammer,
    maximumThrowSpeed: () => d.CONFIG.blade.throw.maxSpeed, redirect: () => options.run().mods.redirect,
    slamColor: () => d.CONFIG.colors.slam, bigShake: () => d.CONFIG.juice.shakeBig,
    bigZoom: () => d.CONFIG.juice.zoomBig, distance: d.len, clamp: d.clamp,
    explode: (...args) => { d.FX.explode(...args); }, ribbon: (...args) => { d.FX.ribbon(...args); },
    shake: addShake, zoom: addZoom, boom: () => { d.SFX.boom(); }, areaDamage: dealArea,
  });

  createLiveWaveComposition({
    dependencies: d, lifecycle: options.lifecycle, controllers: options.controllers,
    stage, story, worldServices: options.worldServices, run: options.run, player: options.player, blade: options.blade, enemies: options.enemies, spawn: content.spawn,
    loreBusy: campaignRuntime.loreBusy, achievementTracking: options.achievementTracking,
    achievementCheck: options.achievementCheck, achievementTracker: options.achievementTracker,
    beginWipe: options.beginWipe, loadStage: loadTransitionStage,
    beginCampaignChapter: campaignRuntime.beginChapter, setBannerSeconds: options.setBannerSeconds,
    startAdventureFinale: () => { campaignRuntime.startAdventureFinale(options.run().finalBossDeath); },
    winRun: () => { options.controllers.api.winRun(); }, openTier: options.openTier,
    openDraft: options.openDraft, canvas: options.canvas,
  });

  const executeVictory = createLiveVictoryProgressionExecutor(
    d, options.achievementCheck, (won) => { options.controllers.api.finishRecording(won); },
  );
  createLiveOutcomeComposition({
    dependencies: d, lifecycle: options.lifecycle, controllers: options.controllers,
    environment: options.environment,
    run: options.run, player: options.player, stageIndex: () => stage.index,
    loadStage: (index) => { cleanupBossEncounterActors(options.enemies(), "stage-transition"); stage.load(index); setEnvironmentStage(index, "stage-transition"); }, authoritativeResult: options.authoritativeResult,
    setLastRecording: options.setLastRecording, setLastVaultId: options.setLastVaultId,
    setOutcome: options.setOutcome, selectedWeapon: () => options.state.selectedWeapon(),
    selectWeapon: (weapon) => { options.state.setSelectedWeapon(weapon); },
    clearCombat: () => { options.setEnemies([]); options.setProjectiles([]); },
    resetWinSeconds: options.resetWinSeconds,
    setScreen: (screen) => { options.setScreen(screen); }, saveBest: options.saveBest, getBest: options.getBest,
    awardCoins: options.awardCoins, economyTelemetry: options.economyTelemetry,
    achievementTracking: options.achievementTracking, achievementCheck: options.achievementCheck,
    ...(options.practiceSession === undefined ? {} : { practiceSession: options.practiceSession }),
    finishRecording: options.controllers.api.finishRecording,
    executeVictory, emitMusicOutcome: options.emitMusicOutcome,
    startRun: options.startRun,
    cleanupBossActors: () => { cleanupBossEncounterActors(options.enemies(), "retry"); },
    startFinale: (witnessed) => { campaignRuntime.startAdventureFinale(witnessed); }, cinema,
    width: options.width, height: options.height,
    ...(options.observeOutcomeChronology === undefined
      ? {}
      : { observeOutcomeChronology: options.observeOutcomeChronology }),
  });
  return Object.freeze({ ...content, lobExplode, loadTransitionStage });
}
