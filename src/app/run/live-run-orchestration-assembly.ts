import type { LiveReplayTapSeams } from "../replay/live-replay-tap";
import type { AttackPresentationCueSink } from "../../gameplay/combat/attack-presentation-cue";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type { LiveCanonicalCombatHost } from "../combat/live-canonical-state";
import type { LiveTestBuildJournals } from "../engineering/test-build-journals";
import type { LiveHudFeedbackState } from "../interface/hud-feedback-state";
import type { LiveInterfaceComposition } from "../interface/interface-composition";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { LiveGhostRecording } from "../replay/live-ghost-recording";
import type { LiveBrowserRuntime } from "../shell/browser-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveTutorialPracticeStart } from "../training/tutorial-practice-start";
import type { LiveWorldComposition } from "../world/world-composition";
import type { LiveWorldSessionState } from "../world/world-session-state";
import { createLiveRunOrchestration } from "./run-orchestration-composition";

export interface LiveRunOrchestrationAssemblyOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly world: LiveWorldComposition;
  readonly session: LiveWorldSessionState;
  readonly services: LiveSessionServices;
  readonly campaignTraining: LiveCampaignTrainingAssembly;
  readonly surface: Pick<LiveBrowserRuntime, "canvas" | "width" | "height" | "testMode">;
  readonly navigation: Pick<LiveScreenNavigation, "setScreen">;
  readonly practiceStart: LiveTutorialPracticeStart;
  readonly ghostRecording: Pick<LiveGhostRecording, "career" | "frames" | "opening">;
  readonly ghostPractice: LiveGhostPracticeSessionState;
  readonly chase: Pick<LiveGhostChaseRuntime, "installed">;
  readonly replayTap: Pick<LiveReplayTapSeams, "runStarted">;
  readonly attackPresentation: AttackPresentationCueSink;
  readonly hudFeedback: Pick<LiveHudFeedbackState, "restore">;
  readonly journals: Pick<LiveTestBuildJournals, "outcomeChronology">;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly requestPointerLock: () => void;
  /** Collaborators constructed after the run orchestration. */
  readonly combat: () => Pick<
    LiveCanonicalCombatHost,
    "combatEntityRuntime" | "simulationRuntime" | "authoritativeStep" | "frameRuntime"
  >;
  readonly presentation: () => Pick<LiveInterfaceComposition, "wipe">;
}

/** Connects the run transaction, content, wave, terminal and victory controllers to the live runtime. */
export function assembleLiveRunOrchestration(options: LiveRunOrchestrationAssemblyOptions) {
  const { dependencies, world, session, services, campaignTraining, surface, navigation, ghostRecording } = options;
  const {
    state: hostState,
    entities: worldEntities,
    lifecycle: RUN_LIFECYCLE,
    music: musicDirector,
    environment,
  } = world;
  const { transient } = world.context;
  const { feel } = transient;
  const { campaign: campaignHost, training: trainingHost, weapon: weaponRuntime } = campaignTraining;
  const { achievements: AT, tracks: achTracks, check: achCheck } = campaignTraining.style;
  const { controllers: runControllers, applySettings, seedRace } = services;
  const { awardCoins, telemetry: economyTelemetry } = services.economy;
  const { openDraft: openRewardDraft, openTier: openRewardTier } = services.reward;
  const { read: getBest, record: saveBest } = services.bestScores.api;
  const { opening: openingCapture } = ghostRecording;
  const { outcomeChronology } = options.journals;
  return createLiveRunOrchestration({
    dependencies,
    entities: worldEntities,
    state: hostState,
    lifecycle: RUN_LIFECYCLE,
    controllers: runControllers,
    campaign: campaignHost,
    training: trainingHost,
    baselinePractice: () => options.practiceStart.active(),
    weapon: weaponRuntime,
    music: musicDirector,
    width: surface.width,
    height: surface.height,
    canvas: surface.canvas,
    testMode: surface.testMode,
    run: options.run,
    player: options.player,
    blade: options.blade,
    enemies: () => hostState.enemies(),
    actorId: (enemy) => options.combat().combatEntityRuntime.id(enemy, "enemy"),
    observeTerminal: ghostRecording.career.terminal,
    observeBossIntro: (actorId, duration, delay) => {
      ghostRecording.frames.installed(actorId, duration, delay);
    },
    setEnemies: (value) => {
      hostState.setEnemies(value);
    },
    setProjectiles: (value) => {
      hostState.setProjectiles(value);
    },
    runInstalled: (run) => {
      options.chase.installed(run);
    },
    runStarted: options.replayTap.runStarted,
    selectedBoss: () => session.selectedBoss(),
    worldServices: world.context.services,
    applySettings,
    attackPresentation: options.attackPresentation,
    environment,
    world,
    combat: {
      resetClock: () => {
        options.combat().simulationRuntime.reset(0);
      },
      resetIdentity: () => {
        options.combat().combatEntityRuntime.resetIdentity();
      },
    },
    hud: options.hudFeedback,
    cinematicPreference: () => services.settings.cinematics,
    race: seedRace,
    createRunSeed: () => seedRace.seed() ?? session.takeRunSeed() ?? dependencies.createRunSeed(),
    withOpeningCapture: openingCapture.withCapture,
    openingExposed: openingCapture.exposed,
    discardOpeningCapture: openingCapture.discard,
    authoritativeResult: () => options.combat().authoritativeStep.lastResult,
    setScreen: (screen, detail) => {
      navigation.setScreen(screen, detail);
    },
    requestPointerLock: options.requestPointerLock,
    beginWipe: () => {
      options.presentation().wipe.begin();
    },
    wipeRemainingSeconds: () => options.presentation().wipe.remainingSeconds,
    setBannerSeconds: (value) => {
      feel.bannerSeconds = value;
    },
    openTier: openRewardTier,
    openDraft: openRewardDraft,
    resetRewards: () => {
      services.reward.reset();
    },
    saveBest,
    getBest,
    awardCoins,
    economyTelemetry,
    setLastRecording: (value) => {
      session.setLastRecording(value);
    },
    setLastVaultId: (value) => {
      session.setLastVaultId(value);
    },
    setOutcome: (value) => {
      session.setOutcome(value);
    },
    resetWinSeconds: () => {
      session.setWinSeconds(0);
    },
    achievementTracking: () => achTracks(),
    achievementCheck: achCheck,
    achievementTracker: AT,
    practiceSession: options.ghostPractice,
    emitMusicOutcome: (outcome) => {
      options.combat().frameRuntime.emitMusicEvent(outcome);
    },
    startRun: (mode, difficulty) => {
      campaignTraining.startRunWithPreflight(mode, difficulty);
    },
    ...(outcomeChronology === null ? {} : { observeOutcomeChronology: outcomeChronology.record }),
  });
}
