import type { CommandEnvelope } from "../../domain/envelopes";
import type { TearWorldConfiguration } from "../../gameplay/runtime/tear-world-configuration";
import {
  forkBrowserGhostCapsulePractice,
  listBrowserGhostCapsuleManifests,
  readBrowserGhostCapsule,
  readBrowserGhostCapsuleReplay,
  readBrowserGhostCapsuleReplayAdmission,
  seekBrowserGhostCapsuleProductionReplay,
  verifyBrowserGhostCapsuleProductionReplay,
} from "../../ghost/browser-capsule-vault";
import type { GhostLiveRecorder } from "../../ghost/live-recorder";
import { verifyGhostCapsuleOpeningContinuation } from "../../ghost/production-replay-verification";
import type { GameAction } from "../../input/game-action";
import { emitLiveTearBenchPhysicalInput } from "../../tearbench/browser/live-physical-input";
import { liveRewardChoiceIds, routeLiveTearBenchAction } from "../../tearbench/live-runtime-action-routing";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type { LiveCanonicalCombatHost, LiveCanonicalStateCapture } from "../combat/live-canonical-state";
import type { LiveInterfaceComposition } from "../interface/interface-composition";
import type { LiveInterfaceInteractionState } from "../interface/interface-interaction-state";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { LiveReviveCountdownState } from "../run/revive-countdown-state";
import type { LiveRunAbandonment } from "../run/live-run-abandonment";
import type { LiveRunOrchestration } from "../run/run-orchestration-composition";
import type { LiveBrowserRuntime } from "../shell/browser-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { RuntimeFrameDriver } from "../shell/runtime-frame-driver";
import type { LiveSessionServices } from "../shell/session-services-composition";
import type { LiveInputAuthorityState } from "../world/input-authority-state";
import { createLiveCanonicalWatchComposition } from "../world/canonical-watch-composition";
import type { LiveWorldComposition } from "../world/world-composition";
import type { LiveWorldSessionState } from "../world/world-session-state";
import { createLiveStateForgeCinematicAdvance } from "./state-forge-cinematic-advance";
import type { LiveStateForge } from "./live-state-forge-assembly";
import { replayLiveStateForgeProgression } from "./state-forge-progression";
import type { LiveTestBuildJournals } from "./test-build-journals";
import type * as LiveRuntimeBridge from "../../tearbench/browser/live-runtime-bridge";
import type { installLiveGameDebug as LiveGameDebugInstaller } from "./debug-composition";

/** The runtime owners that test-build inspection hooks observe and drive. */
export interface LiveTestBuildHookSources {
  readonly dependencies: GameRuntimeDependencies;
  readonly configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>;
  readonly browser: LiveBrowserRuntime;
  readonly world: LiveWorldComposition;
  readonly session: LiveWorldSessionState;
  readonly services: LiveSessionServices;
  readonly campaignTraining: LiveCampaignTrainingAssembly;
  readonly orchestration: LiveRunOrchestration;
  readonly combat: LiveCanonicalCombatHost;
  readonly interface: LiveInterfaceComposition;
  readonly navigation: LiveScreenNavigation;
  readonly interaction: LiveInterfaceInteractionState;
  readonly reviveCountdown: LiveReviveCountdownState;
  readonly inputAuthority: LiveInputAuthorityState;
  readonly recorder: GhostLiveRecorder | null;
  readonly ghostPractice: LiveGhostPracticeSessionState;
  readonly stateForge: LiveStateForge;
  readonly abandonment: LiveRunAbandonment;
  readonly journals: LiveTestBuildJournals;
  readonly canonicalState: LiveCanonicalStateCapture;
  readonly frameDriver: RuntimeFrameDriver;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
}

/**
 * Test builds only, when `?test=1` or `?watchagent=1` is admitted: loads the
 * TearBench runtime bridge and Ghost V3 inspectors. Release builds drop the branch.
 */
export function installLiveTearBenchBridgeWhenRequested(sources: LiveTestBuildHookSources): void {
  const { dependencies, browser } = sources;
  if (__TEAR_TEST_BUILD__ && (browser.testMode || dependencies.engineeringQuery.get("watchagent") === "1")) {
    void import("../../tearbench/browser/live-runtime-bridge").then((bridge) => {
      installTearBenchBridge(sources, bridge);
    });
  }
}

function installTearBenchBridge(sources: LiveTestBuildHookSources, bridge: typeof LiveRuntimeBridge): void {
  const {
    dependencies,
    configuration,
    browser,
    world,
    session,
    services,
    campaignTraining,
    orchestration,
    navigation,
  } = sources;
  const { installGhostV3BrowserInspector, installGhostVaultConditionalCommitInspector, installLiveTearRuntimeBridge } =
    bridge;
  const { CONFIG, GAMEPLAY_EVENTS, Input, browserIndexedDb, browserWindow } = dependencies;
  const { canvas, width: W, height: H } = browser;
  const { state: hostState, lifecycle: RUN_LIFECYCLE, environment } = world;
  const { impact, feel } = world.context.transient;
  const CINEMA = world.context.cinema;
  const { screen, setScreen } = navigation;
  const interfaceInteraction = sources.interaction;
  const interfaceComposition = sources.interface;
  const { frame: presentationHost, screens: screenComposition } = interfaceComposition;
  const { reward: rewardRuntime, controllers: runControllers } = services;
  const { startRun: startRunImmediate } = runControllers.api;
  const { stage: stageRuntime } = campaignTraining.campaign;
  const { dispatchPlaygroundAction } = campaignTraining;
  const combatHost = sources.combat;
  const {
    simulationRuntime,
    combatEntityRuntime: combatRuntime,
    frameRuntime: liveFrameRuntime,
    authoritativeStep,
  } = combatHost;
  const {
    recorder: ghostV3,
    ghostPractice: ghostPracticeSession,
    frameDriver,
    journals,
    canonicalState,
    run: liveRun,
  } = sources;
  installGhostV3BrowserInspector(browserWindow, {
    manifest: () => ghostV3?.lastManifest ?? null,
    manifests: () => listBrowserGhostCapsuleManifests(browserIndexedDb),
    read: (id: string) => readBrowserGhostCapsule(browserIndexedDb, id),
    replay: (id: string) => readBrowserGhostCapsuleReplay(browserIndexedDb, id),
    admission: (id: string) => readBrowserGhostCapsuleReplayAdmission(browserIndexedDb, id),
    // Test-only observation seam; an unknown mode must never fall back to weaker verification.
    verify: (id: string, mode?: string) => {
      if (mode !== undefined && mode !== "opening-continuation")
        return Promise.reject(new RangeError("unsupported Ghost verification mode"));
      return mode === "opening-continuation"
        ? readBrowserGhostCapsule(browserIndexedDb, id).then((capsule) =>
            capsule === undefined ? undefined : verifyGhostCapsuleOpeningContinuation(capsule),
          )
        : verifyBrowserGhostCapsuleProductionReplay(browserIndexedDb, id);
    },
    seek: (id: string, tick: number) => seekBrowserGhostCapsuleProductionReplay(browserIndexedDb, id, tick),
    practice: (id: string, tick: number, mode) => forkBrowserGhostCapsulePractice(browserIndexedDb, id, tick, mode),
    active: () => ghostV3?.active === true,
    activePractice: ghostPracticeSession.active,
    failure: () => ghostV3?.failure ?? null,
  });
  installGhostVaultConditionalCommitInspector(browserWindow);
  const consumedActions: CommandEnvelope<GameAction>[] = [];
  Input.semantic.subscribe((entry) => {
    consumedActions.push(entry);
  });
  const actionRouting = {
    screen,
    setScreen: (next: "playing" | "paused") => {
      setScreen(next);
    },
    runMode: () => liveRun().mode,
    reward: rewardRuntime.snapshot,
    chooseUpgrade: screenComposition.chooseUpgrade,
    chooseReserve: screenComposition.chooseReserve,
    chooseTier: screenComposition.chooseTier,
    dispatchPlayground: dispatchPlaygroundAction,
    renderControls: () => {
      presentationHost.render();
    },
    controls: interfaceInteraction.buttons,
    focus: interfaceInteraction.focus,
  };
  installLiveTearRuntimeBridge(
    {
      width: W,
      height: H,
      state: hostState,
      actorId: (enemy) => combatRuntime.id(enemy, "enemy"),
      environment: () => environment,
      resetEntityIdentities: () => {
        combatRuntime.restoreIdentityState({
          nextEntityId: 1,
          nextWallSequence: 1,
          nextSlowZoneSequence: 1,
          claimedIds: [],
        });
      },
      platforms: () => stageRuntime.platforms,
      platformsForStage: (index) => dependencies.stagePlatforms(index, CONFIG),
      stage: () => ({ ...stageRuntime.current, index: stageRuntime.index }),
      lifecycle: () => RUN_LIFECYCLE.snapshot(),
      bossIntroActive: () => hostState.bossIntro() !== null,
      choiceIds: () => liveRewardChoiceIds(actionRouting),
      focusedControlId: () => liveRewardChoiceIds(actionRouting)[interfaceInteraction.focus()],
      progression: () => ({
        wallet: dependencies.META.coins(),
        lifetimeEarned: dependencies.META.data.lifetimeEarned,
        levels: Object.fromEntries(dependencies.SHOP.map((item) => [item.id, dependencies.META.level(item.id)])),
        shop: dependencies.SHOP.map((item) => ({
          id: item.id,
          level: dependencies.META.level(item.id),
          maxLevel: item.maxLevel,
          cost: dependencies.META.cost(item),
          enabled: dependencies.META.canBuy(item),
        })),
      }),
      outcome: () => session.outcome(),
      screen,
      setScreen: (next) => {
        setScreen(next);
      },
      selectBoss: (bossId) => {
        session.setSelectedBoss(bossId);
      },
      selectWeapon: (weaponId) => {
        hostState.setSelectedWeapon(weaponId);
      },
      setRunSeed: (seed) => {
        session.setRunSeed(seed);
      },
      startRun: (mode, difficulty) => {
        startRunImmediate(mode, difficulty);
      },
      drainRecording: () => ghostV3?.drain() ?? Promise.resolve(),
      stopFrameLoop: () => {
        frameDriver.stop();
      },
      startFrameLoop: () => {
        frameDriver.start(({ deltaSeconds, intervalSeconds }) => {
          combatHost.frameCoordinator.run(deltaSeconds, intervalSeconds);
        });
      },
      pushAction: (action) => {
        Input.semantic.push(action);
      },
      setSemanticInputAuthority: sources.inputAuthority.setSemanticInputAuthority,
      routeAction: (action) => routeLiveTearBenchAction(actionRouting, action),
      skipCinematic: () => {
        CINEMA.requestSkip();
      },
      activateControl: (action) => {
        presentationHost.render();
        const encoded = JSON.stringify(action);
        const control = interfaceInteraction
          .buttons()
          .find((entry) => entry.enabled !== false && JSON.stringify(entry.semanticAction) === encoded);
        if (control === undefined) return false;
        screenComposition.dispatch(action);
        return true;
      },
      terminateRun: () => {
        sources.abandonment.abandon("tearbench-terminated", { tearBenchTerminated: true });
        setScreen("paused");
      },
      resetSemanticInput: () => {
        Input.startSemanticRecording();
      },
      advanceFixedTick: () => liveFrameRuntime.advanceExactSimulation(),
      advanceRenderFrame: (deltaSeconds) => liveFrameRuntime.advanceSimulation(deltaSeconds),
      advanceApplicationFrame: (deltaSeconds) => {
        combatHost.frameCoordinator.run(deltaSeconds);
      },
      advanceStateForgeCinematicBeat: createLiveStateForgeCinematicAdvance(CINEMA),
      authoritative: () => authoritativeStep.lastResult,
      ...createLiveCanonicalWatchComposition({
        state: hostState,
        screen,
        canonicalGameplayState: () => authoritativeStep.lastResult?.state ?? null,
      }),
      canonicalOriginState: () =>
        simulationRuntime.scheduler.tick === 0 && screen() === "playing"
          ? canonicalState(0, simulationRuntime.input).state
          : null,
      random: () => world.context.services.random.snapshot(),
      ...interfaceComposition.capture.ports(
        () => {
          presentationHost.render();
        },
        () => canvas.toDataURL("image/png"),
      ),
      setCameraEffectsForTest: (effects) => {
        feel.zoom = effects.zoom;
        impact.shake = effects.shake;
      },
      subscribeEngineEvent: (listener) => GAMEPLAY_EVENTS.subscribe(listener),
      drainConsumedActions: () => consumedActions.splice(0, consumedActions.length),
      emitPhysicalInput: (input) => {
        emitLiveTearBenchPhysicalInput(input, { window: browserWindow, canvas, width: W, height: H });
      },
      setTimeEffectsForTest: (effects) => {
        if (effects.hitStop !== undefined) impact.hitStop = effects.hitStop;
        if (effects.slowMotion !== undefined) impact.slowMotion = effects.slowMotion;
        if (effects.timeScale !== undefined) feel.timeScale = effects.timeScale;
      },
      stateForge: sources.stateForge,
      replayProgression: (ledger) =>
        replayLiveStateForgeProgression({ dependencies, state: hostState, configuration }, ledger),
      loadStage: orchestration.loadTransitionStage,
      startNextWave: runControllers.api.startNextWave,
      applyBossFinisher: (bossId, remainingHp) => {
        const matches = hostState
          .enemies()
          .filter((enemy) => enemy.isBoss && enemy.bossId === bossId && !enemy.dead && !enemy.dying);
        if (matches.length !== 1 || matches[0] === undefined)
          throw new Error(`boss-finisher requires exactly one live ${bossId}`);
        matches[0].hp = remainingHp;
        matches[0].hpDisplay = remainingHp;
      },
      captureProgressionRuntime: () => liveRun().mods,
      restoreProgressionRuntime: (runtime) => {
        const run = liveRun();
        run.mods = runtime as typeof run.mods;
      },
      finaleIntents: () => journals.finaleIntentBatches,
      finaleOutwardCalls: () => journals.finaleOutwardCalls,
      audioDispatchReceipts: () => journals.audioDispatchReceipts,
      outcomeChronology: () => journals.outcomeChronology?.entries() ?? [],
    },
    browserWindow,
  );
}

/** Test builds only, with `?bossdebug=1`: loads the boss debug harness. */
export function installLiveBossDebugWhenEnabled(sources: LiveTestBuildHookSources): void {
  if (__TEAR_TEST_BUILD__) {
    // The click targets of the latest drawn frame, as a pointer click is matched against them.
    Object.defineProperty(sources.dependencies.browserWindow, "__TEAR_UI_TARGETS__", {
      configurable: true,
      value: () =>
        sources.interaction.buttons().map((button) => ({
          label: button.label,
          x: button.x,
          y: button.y,
          w: button.w,
          h: button.h,
          enabled: button.enabled !== false,
        })),
    });
  }
  if (__TEAR_TEST_BUILD__ && sources.browser.pantheonDebug) {
    void import("./debug-composition").then(({ installLiveGameDebug }) => {
      installBossDebug(sources, installLiveGameDebug);
    });
  }
}

function installBossDebug(
  sources: LiveTestBuildHookSources,
  installLiveGameDebug: typeof LiveGameDebugInstaller,
): void {
  const { dependencies, browser, world, session, services, campaignTraining, navigation, run: liveRun } = sources;
  const { state: hostState, entities: worldEntities, lifecycle: RUN_LIFECYCLE, environment } = world;
  const CINEMA = world.context.cinema;
  const { stage: stageRuntime, story, runtime: campaignRuntime } = campaignTraining.campaign;
  const { severFinaleAnchor, startAdventureFinale } = campaignRuntime;
  const TUT = campaignTraining.training.tutorial;
  const { settings, applySettings, reward: rewardRuntime } = services;
  const { openDraft: openRewardDraft, openTier: openRewardTier } = rewardRuntime;
  const { replay: replayAdapters, settings: settingsRenameAdapters } = sources.interface.screens;
  const { authoritativeStep } = sources.combat;
  installLiveGameDebug({
    enabled: browser.pantheonDebug,
    dependencies,
    entities: worldEntities,
    state: hostState,
    lifecycle: RUN_LIFECYCLE,
    cinema: CINEMA,
    stage: stageRuntime,
    environment,
    width: browser.width,
    height: browser.height,
    spawnExplicitVariant: (kind, variantId) => {
      sources.orchestration.spawn({ type: kind, variantId });
    },
    startRun: (mode, difficulty) => {
      campaignTraining.startRunWithPreflight(mode, difficulty);
    },
    startNextWave: services.controllers.api.startNextWave,
    setScreen: navigation.setScreen,
    screen: navigation.screen,
    setContinueSeconds: sources.reviveCountdown.setSeconds,
    openDraft: openRewardDraft,
    openTier: openRewardTier,
    run: liveRun,
    player: sources.player,
    blade: sources.blade,
    applyUpgrade: dependencies.applyUpgrade,
    enterReplay: (record, from) => {
      replayAdapters.enter(record, from);
    },
    beginRename: () => {
      settingsRenameAdapters.beginRename(false, true);
    },
    renameSnapshot: settingsRenameAdapters.renameSnapshot,
    selectSettingsTab: settingsRenameAdapters.selectSettingsTab,
    replayStatus: replayAdapters.status,
    applyOptions: (options) => {
      Object.assign(settings, options);
      applySettings();
    },
    settings,
    selected: () => session.selection(),
    tutorialSnapshot: () => ({
      session: TUT.session(),
      active: TUT.active,
      lessonIndex: TUT.idx,
      lessonCount: TUT.steps.length,
      lesson: TUT.step().t,
      description: TUT.step().d,
      arena: TUT.step().arena,
      arenaLabel: TUT.step().arenaLabel,
      teachingFocus: TUT.step().teachingFocus,
      completionDelay: TUT.doneT,
      endingTime: TUT.endT,
      counters: { ...TUT.n },
    }),
    selectBoss: (boss) => {
      session.setSelectedBoss(boss);
    },
    chapterBrief: () => Boolean(story.chapterFlow?.brief),
    finale: () => story.finale,
    rewardSnapshot: rewardRuntime.snapshot,
    authoritative: () => authoritativeStep.lastResult,
    startFinale: startAdventureFinale,
    severFinale: () => severFinaleAnchor(false),
  });
}
