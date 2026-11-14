import type { TearWorldConfiguration } from "../../gameplay/runtime/tear-world-configuration";
import { tracksAchievements } from "../../gameplay/progression/achievement-runtime";
import { dismissBootScreen } from "../../platform/browser-boot-screen";
import { assembleLiveCampaignTraining } from "../campaign/live-campaign-training-assembly";
import { createLiveBossPhasePractice } from "../campaign/boss-phase-practice";
import { createLiveAttackPresentation } from "../combat/attack-presentation";
import { createLiveCombatComposition } from "../combat/combat-composition";
import type { LiveCombatCoordinatorContext } from "../combat/combat-frame-context";
import { createLiveCanonicalStateCapture, type LiveCanonicalCombatHost } from "../combat/live-canonical-state";
import { createLiveCombatActionPorts } from "../combat/live-combat-action-ports";
import { createLiveCombatFramePorts } from "../combat/live-combat-frame-ports";
import { createGhostV3BrowserTestOptions } from "../engineering/ghost-v3-browser-test-options";
import { assembleLiveStateForge } from "../engineering/live-state-forge-assembly";
import { createLiveTestBuildJournals } from "../engineering/test-build-journals";
import {
  installLiveBossDebugWhenEnabled,
  installLiveTearBenchBridgeWhenRequested,
} from "../engineering/test-build-runtime-hooks";
import { createLiveHudFeedbackState } from "../interface/hud-feedback-state";
import { createLiveInterfaceFrameState } from "../interface/interface-frame-state";
import { createLiveInterfaceInteractionState } from "../interface/interface-interaction-state";
import { assembleLiveInterface } from "../interface/live-interface-assembly";
import { createLiveScreenNavigation } from "../interface/live-screen-navigation";
import { isAppScreen, isMenuScreen } from "../../domain/screen-catalog";
import { bindGhostArchiveFileLifecycle } from "../library/browser-ghost-archive-files";
import { createBrowserGhostVaultLibrary } from "../library/ghost-vault-library-controller";
import { createBrowserLiveGhostOwnerRecoveryController } from "../replay/ghost-owner-recovery-controller";
import { createLiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import { LiveGhostPublicationController } from "../replay/ghost-publication-controller";
import { LiveGhostSupportController } from "../replay/ghost-support-controller";
import { createLiveGhostCapture } from "../replay/live-ghost-capture";
import { createLiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import { createLiveGhostPracticeChallenge } from "../replay/live-ghost-practice-challenge";
import { createLiveGhostRecording, observeLiveGhostRecordingBoundaries } from "../replay/live-ghost-recording";
import { createTearRunScreenFactPublisher } from "../../gameplay/runtime/gameplay-event-publishers";
import { subscribeLiveGameplayEventFanOut } from "../run/live-gameplay-event-fanout";
import { createLiveRunAbandonment } from "../run/live-run-abandonment";
import { assembleLiveRunOrchestration } from "../run/live-run-orchestration-assembly";
import { createLiveReviveCountdownState } from "../run/revive-countdown-state";
import { liveTutorialCoachFrame } from "../training/tutorial-coach-frame";
import { createLiveTutorialPracticeStart } from "../training/tutorial-practice-start";
import { createLiveAuthoritativeInputAdapter } from "../world/authoritative-input-adapter";
import { bindLiveBiomeActors } from "../world/biomes/live-biome-actors";
import { countCanonicalStateCost } from "../world/canonical-state-cost";
import { createLiveInputAuthorityState } from "../world/input-authority-state";
import { createLiveBrowserRuntime } from "./browser-runtime";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "./game-runtime-state";
import { createLiveProductionWorld } from "./production-world";
import { RuntimeFrameDriver } from "./runtime-frame-driver";
import { createLiveSessionServices } from "./session-services-composition";

/**
 * Composes the live game: browser surface, Ghost V3 sidecar, session services,
 * the production world, campaign and training, run orchestration, the combat
 * host, State Forge, interface and the frame loop. Each owner is constructed
 * here in a fixed order; collaborators built later are reached through lazy
 * ports, so construction order and side effects stay exactly as listed.
 */
export function startLiveGame(
  dependencies: GameRuntimeDependencies,
  configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>,
): void {
  const {
    A11Y,
    APP,
    Attract,
    CG,
    CLOCK,
    CONFIG,
    Cloud,
    DIAG,
    FX,
    GAMEPLAY_EVENTS,
    GFX,
    GHOST,
    Input,
    PAD,
    SFX,
    THEME,
    UI,
    browserDocument,
    browserIndexedDb,
    browserNavigator,
    browserWindow,
    ghostPublication,
  } = dependencies;
  const browserRuntime = createLiveBrowserRuntime(dependencies);
  const { canvas, viewport, requestPointerLock: requestLock } = browserRuntime;
  const inputAuthority = createLiveInputAuthorityState(requestLock);
  const requestOwnedPointerLock = inputAuthority.requestPointerLock;
  const currentSignedInActor = (): string | undefined =>
    Cloud.loggedIn() && Cloud.user !== null && !Cloud.user.guest ? Cloud.user.id : undefined;
  const ghostV3Options =
    createGhostV3BrowserTestOptions(browserRuntime.testMode, dependencies.engineeringQuery.search) ?? {};
  const ghostVault = createBrowserGhostVaultLibrary(browserIndexedDb);
  bindGhostArchiveFileLifecycle(browserWindow, ghostVault);
  const ownerRecovery = createBrowserLiveGhostOwnerRecoveryController(
    browserIndexedDb,
    ghostPublication,
    currentSignedInActor,
    () => {
      ghostVault.refresh();
    },
    (input, init) => browserWindow.fetch(input, init),
  );
  Cloud.onChange(() => {
    ownerRecovery.accountChanged();
  });
  const ghostRecording = createLiveGhostRecording({
    indexedDb: browserIndexedDb,
    document: browserDocument,
    recorderOptions: ghostV3Options,
    beatFinalized: (manifestId) => {
      beat.finalized(manifestId);
    },
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    screen: () => navigation.screen(),
    tick: () => combatHost.simulationRuntime.scheduler.tick,
    enemies: () => hostState.enemies(),
    enemyId: (actor) => combatHost.combatEntityRuntime.id(actor, "enemy"),
    practiceActive: () => ghostPracticeSession.active() !== null,
    bossIntroActive: () => hostState.bossIntro() !== null,
    finale: () => ghostCapture.finale,
  });
  const { session: ghostV3Session, recorder: ghostV3, career, frames: ghostFrames } = ghostRecording;
  const ghostPublicationScreen = new LiveGhostPublicationController(
    browserIndexedDb,
    ghostPublication,
    currentSignedInActor,
  );
  const ghostSupportScreen = new LiveGhostSupportController(browserIndexedDb);
  observeLiveGhostRecordingBoundaries(ghostRecording, {
    ghost: GHOST,
    run: liveRun,
    configurationProjection: () => liveStateForge.capture().components.get("tear.configuration.v1"),
    randomSnapshot: () => worldContext.services.random.snapshot(),
    chaseConfiguration: (configHash) => {
      chase.configuration(configHash);
    },
    beatDeclaration: () => beat.declaration(),
    sessionNonce: () => browserWindow.crypto.randomUUID(),
    captureReceipt: (tick) => {
      ghostCapture.captureReceipt(tick);
    },
    finale: () => ghostCapture.finale,
  });
  const gameplayEvents = subscribeLiveGameplayEventFanOut({
    events: GAMEPLAY_EVENTS,
    career,
    recorder: ghostV3,
    nextEventSequence: ghostV3Session.nextEventSequence,
    recordsTelemetry: () => persistentEffects() && tracksAchievements(hostState.run()),
    profileStats: dependencies.profileStatsPersistence,
  });
  function liveRun(): GameRun {
    // Menu services intentionally ask before a run exists and treat the absent
    // value as the menu state. Keep that lazy contract while reading the world
    // state owner rather than reviving a host closure.
    return hostState.run() as GameRun;
  }
  const preserveLazyValue = <T>(value: T | undefined): T => value as T;
  function liveBlade(): GameBlade {
    return preserveLazyValue(hostState.blade());
  }
  function livePlayer(): GamePlayer {
    return preserveLazyValue(hostState.player());
  }
  const interfaceInteraction = createLiveInterfaceInteractionState();
  const sessionServices = createLiveSessionServices({
    beat: {
      screen: () => navigation.screen(),
      capture: () => liveStateForge.capture().components,
      tick: () => combatHost.simulationRuntime.scheduler.tick,
      recording: ghostV3Session,
      nativeStart: {
        session: () => session,
        prepare: () => {
          chase.stop();
          navigation.setScreen("setup");
        },
        start: (mode, difficulty) => {
          startRunImmediate(mode, difficulty);
        },
        refuse: () => {
          try {
            runAbandonment.abandon("beat-start-refused");
          } finally {
            navigation.setScreen("menu");
            navigation.setScreen("profile");
          }
        },
      },
    },
    dependencies,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    seedRace: {
      recording: {
        runId: () => ghostV3Session.replayContext()?.run.id,
        active: () => ghostV3?.active === true,
        nextSequence: ghostV3Session.nextEventSequence,
        tick: () => combatHost.simulationRuntime.scheduler.tick,
        record: (event) => {
          ghostV3?.record("events", event.tick, event);
        },
      },
      baseline: () => configuration.baseSnapshot(),
      capture: () => liveStateForge.capture().components,
      setup: () => ({
        mode: session.selectedMode() as "endless",
        difficulty: session.selectedDifficulty(),
        weapon: session.selectedWeapon(),
        boss: session.selectedMode() === "bossonly" ? session.selectedBoss() : "shuffle",
      }),
    },
    screen: () => navigation.screen(),
    setScreen: (screen) => {
      navigation.setScreen(screen);
    },
    achievementTracking: () => campaignTraining.style.tracks(),
    resetUi: (intent) => {
      if (intent.enter) interfaceFrame.setEnterSeconds(0);
      if (intent.focus) interfaceInteraction.setFocus(0);
      if (intent.scroll) interfaceInteraction.setScroll(0);
    },
    requestPointerLock: requestOwnedPointerLock,
    renamePrompted: () => interfaceComposition.screens.settings.renamePrompted(),
    renameActive: () => interfaceComposition.screens.settings.renameActive(),
    markRenamePrompted: () => {
      interfaceComposition.screens.settings.markRenamePrompted();
    },
    beginRename: (firstRun) => {
      interfaceComposition.screens.settings.beginRename(firstRun);
    },
  });
  const { settings, controllers: runControllers, seedRace, beat } = sessionServices;
  const { endRun, startRun: startRunImmediate } = runControllers.api;
  // Time dilation, camera framing (the void run pulls world zoom OUT), banner
  // and rank readouts, hit stop, slow motion, shake, the blade-throw cooldown,
  // dash ghosting, and the opening audio cadence are per-world transient
  // records owned by the world context below, not live-host closures.
  const navigation = createLiveScreenNavigation({
    app: APP,
    input: Input,
    beat,
    runScreenFact: createTearRunScreenFactPublisher(GAMEPLAY_EVENTS, () => RUN_LIFECYCLE.snapshot(), liveRun),
  });
  const interfaceFrame = createLiveInterfaceFrameState(navigation.screen());
  const currentOutcome = () => {
    const outcome = session.outcome();
    if (outcome === null) throw new Error("Outcome screen requires a completed run");
    return outcome;
  };
  const reviveCountdown = createLiveReviveCountdownState();
  const hudFeedback = createLiveHudFeedbackState();
  // One call builds this world: replaceable state, entity construction, run
  // lifecycle, services, and transient records. World state owns the active
  // player, blade, actors, and run while the session retains menu-time state.
  const productionWorld = createLiveProductionWorld({ dependencies, configuration, worldId: "live-production" });
  const { session, world } = productionWorld;
  const {
    state: hostState,
    context: worldContext,
    entities: worldEntities,
    lifecycle: RUN_LIFECYCLE,
    environment,
  } = world;
  browserWindow.addEventListener("pagehide", (event) => {
    if (!event.persisted) world.dispose();
  });
  bindLiveBiomeActors({
    environment,
    config: CONFIG,
    player: livePlayer,
    blade: liveBlade,
    enemies: () => hostState.enemies(),
    projectiles: () => hostState.projectiles(),
    entityId: (entity, prefix) => combatHost.combatEntityRuntime.id(entity, prefix),
  });
  const runAbandonment = createLiveRunAbandonment({
    world,
    events: GAMEPLAY_EVENTS,
    ghost: GHOST,
    input: Input,
    run: liveRun,
  });
  // One world owns the transient records read by combat, State Forge, and diagnostics.
  const { transient } = worldContext;
  const CINEMA = worldContext.cinema;
  const ghostPracticeSession = createLiveGhostPracticeSessionState();
  const persistentEffects = () => ghostPracticeSession.active() === null && !seedRace.active() && !beat.active();
  const journals = createLiveTestBuildJournals(SFX);
  const practiceStart = createLiveTutorialPracticeStart();
  const campaignTraining = assembleLiveCampaignTraining({
    dependencies,
    world,
    surface: browserRuntime,
    services: sessionServices,
    navigation,
    interaction: interfaceInteraction,
    practiceStart,
    journals,
    observeStyle: career.style,
    persistentEffects,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    requestPointerLock: requestOwnedPointerLock,
    browserWindow,
    browserDocument,
    orchestration: () => orchestration,
    combat: () => combatHost,
    presentation: () => interfaceComposition,
  });
  const { stage: stageRuntime, story } = campaignTraining.campaign;
  const TUT = campaignTraining.training.tutorial;
  const chase = createLiveGhostChaseRuntime({
    indexedDb: browserIndexedDb,
    ui: UI,
    browserWindow,
    world,
    stage: stageRuntime,
    session,
    services: sessionServices,
    navigation,
    gameplayEvents,
    run: liveRun,
    player: livePlayer,
  });
  const attackPresentation = createLiveAttackPresentation({
    scope: liveBlade,
    tick: () => Math.max(0, Math.round(CLOCK.sim * 120)),
    lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion,
    highContrast: () => A11Y.highContrast,
    contrastColor: () => THEME.ink,
    edgeTrace: (...args) => {
      FX.edgeTrace(...args);
    },
    contactMark: (...args) => {
      FX.contactMark(...args);
    },
    groundPulse: (...args) => {
      FX.groundPulse(...args);
    },
    muzzleWedge: (...args) => {
      FX.muzzleWedge(...args);
    },
    burst: (...args) => {
      FX.burst(...args);
    },
    shouldRecord: () => GHOST.recording(),
    recordEffect: (effect, x, y) => {
      GHOST.presentationEvent(effect, x, y);
    },
  });
  const orchestration = assembleLiveRunOrchestration({
    dependencies,
    world,
    session,
    services: sessionServices,
    campaignTraining,
    surface: browserRuntime,
    navigation,
    practiceStart,
    ghostRecording,
    ghostPractice: ghostPracticeSession,
    chase,
    attackPresentation,
    hudFeedback,
    journals,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    requestPointerLock: requestOwnedPointerLock,
    combat: () => combatHost,
    presentation: () => interfaceComposition,
  });
  TUT.bindBossPractice(
    createLiveBossPhasePractice({
      config: CONFIG,
      state: hostState,
      stage: {
        get index() {
          return stageRuntime.index;
        },
        set index(value) {
          stageRuntime.restoreIndex(value);
        },
        get platforms() {
          return stageRuntime.platforms;
        },
        set platforms(value) {
          stageRuntime.platforms = value;
        },
      },
      selectStage: (index) => {
        stageRuntime.load(index);
        environment.setStage(stageRuntime.current.id, "stage-transition");
      },
      resetEnvironment: () => {
        environment.clear("new-run");
      },
      createEnemy: (id, x, y, run) => worldEntities.createEnemy(id, x, y, run),
      cinematicActive: () => CINEMA.active,
      cancelCinema: () => {
        if (CINEMA.active) CINEMA.cancel("practice-reset");
      },
    }),
  );
  const frameDriver = new RuntimeFrameDriver(browserWindow);
  const combatAdapters = createLiveCombatActionPorts({
    dependencies,
    surface: browserRuntime,
    world,
    campaignTraining,
    orchestration,
    services: sessionServices,
    attackPresentation,
    navigation,
    reviveCountdown,
    browserDocument,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    combat: () => combatHost,
    input: () => liveInputAdapter,
  });
  const liveInputAdapter = createLiveAuthoritativeInputAdapter({
    player: livePlayer,
    blade: liveBlade,
    aimRadius: () => CONFIG.blade.aimRadius,
  });
  const frameContext = createLiveCombatFramePorts({
    dependencies,
    world,
    campaignTraining,
    orchestration,
    navigation,
    inputAuthority,
    input: liveInputAdapter,
    ghostRecording,
    ghostPractice: ghostPracticeSession,
    chase,
    surface: browserRuntime,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    challenge: () => ghostPracticeChallenge.challenge,
    ghostCapture: () => ghostCapture,
  });
  const coordinatorContext = {
    applicationFrameRecording: ghostFrames,
    now: () => performance.now(),
    state: () => navigation.screen(),
    setState: (screen) => {
      if (isAppScreen(screen)) navigation.setScreen(screen);
    },
    input: Input,
    pad: typeof PAD === "undefined" ? null : PAD,
    navigator: browserNavigator,
    document: browserDocument,
    canvas,
    cinema: CINEMA,
    clipper: dependencies.Clipper ?? null,
    autoPauseDisconnect: () => settings.autoPauseDisconnect,
    requestPointerLock: requestOwnedPointerLock,
    exitReplay: () => {
      interfaceComposition.screens.replay.exit();
    },
    advanceClocks: (dt, currentState) => {
      interfaceFrame.advance(dt);
      session.setWinSeconds(currentState === "win" ? session.winSeconds() + dt : 0);
    },
    advanceContinue: (dt) => {
      if (navigation.screen() === "continue" && reviveCountdown.seconds() > 0 && reviveCountdown.elapse(dt) <= 0)
        endRun();
    },
    updateAttract: (dt, menu) => {
      if (menu) {
        if (!Attract.ready) Attract.reset();
        Attract.update(dt);
      } else Attract.ready = false;
    },
    isMenuScreen,
    gameplayStart: () => {
      CG.gameplayStart();
    },
    gameplayStop: () => {
      CG.gameplayStop();
    },
    cssPerLogicalPixel: () => viewport.cssPerLogicalPixel,
    setUiDensity: (density) => {
      UI.setDensity(density);
    },
    render: () => {
      interfaceComposition.renderPresentationFrame(interfaceFrame.deltaSeconds());
    },
    handleUi: () => {
      interfaceComposition.frame.handleUi();
    },
    diagnostics: DIAG,
    entityCounts: () => ({
      enemies: hostState.enemies().length,
      projectiles: hostState.projectiles().length,
      effects: FX.list.length,
    }),
  } satisfies LiveCombatCoordinatorContext;
  const captureLiveCanonicalState = createLiveCanonicalStateCapture({
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
    enemies: () => hostState.enemies(),
    environment,
    tutorial: TUT,
  });
  const combatHost: LiveCanonicalCombatHost = createLiveCombatComposition({
    frameDriver,
    gameplayEvents: GAMEPLAY_EVENTS,
    environment,
    adapters: combatAdapters,
    lifecycle: {
      advanceClock: (dt) => {
        worldContext.services.clock.advance(dt);
      },
      captureProtection: () => {
        transient.assignProtection(story.protection());
      },
      applyProtection: () => {
        story.applyProtection(transient.protection);
      },
    },
    frame: frameContext,
    coordinator: coordinatorContext,
    authoritative: {
      actionPort: {
        apply(input, tick, actions) {
          TUT.captureCoachCommands(actions.map((entry) => entry.command));
          liveInputAdapter.actionPort.apply(input, tick, actions);
        },
      },
      afterWorldStep: (tick, input) => {
        TUT.afterWorldStep(
          liveTutorialCoachFrame(TUT, tick, hostState, combatHost.combatEntityRuntime, stageRuntime.index),
          input.snapshot(),
        );
      },
      snapshot: (tick, input) =>
        __TEAR_TEST_BUILD__
          ? countCanonicalStateCost(captureLiveCanonicalState(tick, input), DIAG)
          : captureLiveCanonicalState(tick, input),
    },
  });
  const { combatEntityRuntime: combatRuntime } = combatHost;
  GAMEPLAY_EVENTS.setTickSource(() => combatHost.simulationRuntime.scheduler.tick);
  environment.setAvailableActorIdsSource(() => {
    if (__TEAR_TEST_BUILD__) DIAG.count("environmentCleanupSets");
    return new Set([
      stageRuntime.current.id,
      "player",
      "blade",
      ...hostState.enemies().map((enemy) => combatRuntime.id(enemy, "enemy")),
      ...hostState.projectiles().map((projectile) => combatRuntime.id(projectile, "projectile")),
    ]);
  });
  const liveStateForge = assembleLiveStateForge({
    dependencies,
    world,
    campaignTraining,
    combat: combatHost,
    input: liveInputAdapter,
    navigation,
    interaction: interfaceInteraction,
    ghostPractice: ghostPracticeSession,
    reward: sessionServices.reward,
    hudFeedback,
    run: liveRun,
  });
  const ghostCapture = createLiveGhostCapture({
    recording: ghostRecording,
    stateForge: liveStateForge,
    world,
    combat: combatHost,
    canonicalState: captureLiveCanonicalState,
    campaign: campaignTraining.campaign,
    navigation,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
  });
  const ghostPracticeChallenge = createLiveGhostPracticeChallenge({
    indexedDb: browserIndexedDb,
    recording: ghostRecording,
    capture: ghostCapture,
    stateForge: liveStateForge,
    practice: ghostPracticeSession,
    world,
    combat: combatHost,
    canonicalState: captureLiveCanonicalState,
    navigation,
    gameplayEvents,
    abandonment: runAbandonment,
    ghost: GHOST,
    input: Input,
    requestPointerLock: requestLock,
    player: livePlayer,
    addFloater: campaignTraining.addFloater,
  });
  const interfaceComposition = assembleLiveInterface({
    dependencies,
    browser: browserRuntime,
    world,
    session,
    services: sessionServices,
    campaignTraining,
    orchestration,
    combat: combatHost,
    navigation,
    frame: interfaceFrame,
    interaction: interfaceInteraction,
    reviveCountdown,
    hudFeedback,
    chase,
    career,
    ghostLibrary: {
      vault: ghostVault,
      ownerRecovery,
      publication: ghostPublicationScreen,
      support: ghostSupportScreen,
    },
    launchGhostPractice: ghostPracticeChallenge.launch,
    abandonRun: (reason) => {
      runAbandonment.abandon(reason);
    },
    persistentEffects,
    currentOutcome,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
  });
  const testBuildHookSources = {
    dependencies,
    configuration,
    browser: browserRuntime,
    world,
    session,
    services: sessionServices,
    campaignTraining,
    orchestration,
    combat: combatHost,
    interface: interfaceComposition,
    navigation,
    interaction: interfaceInteraction,
    reviveCountdown,
    inputAuthority,
    recorder: ghostV3,
    ghostPractice: ghostPracticeSession,
    stateForge: liveStateForge,
    abandonment: runAbandonment,
    journals,
    canonicalState: captureLiveCanonicalState,
    frameDriver,
    run: liveRun,
    player: livePlayer,
    blade: liveBlade,
  };
  installLiveTearBenchBridgeWhenRequested(testBuildHookSources);
  installLiveBossDebugWhenEnabled(testBuildHookSources);
  let firstFrameDrawn = false;
  frameDriver.start(({ deltaSeconds, intervalSeconds }) => {
    combatHost.frameCoordinator.run(deltaSeconds, intervalSeconds);
    if (!firstFrameDrawn) {
      firstFrameDrawn = true;
      dismissBootScreen(browserDocument);
    }
  });
}
