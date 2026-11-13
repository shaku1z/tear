import { releasePointerLock } from "../../platform/browser-pointer-lock";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import type { LiveCanonicalCombatHost } from "../combat/live-canonical-state";
import type { LiveTestBuildJournals } from "../engineering/test-build-journals";
import type { LiveInterfaceComposition } from "../interface/interface-composition";
import type { LiveInterfaceInteractionState } from "../interface/interface-interaction-state";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveRunOrchestration } from "../run/run-orchestration-composition";
import type { LiveBrowserRuntime } from "../shell/browser-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../shell/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import { createLiveTrainingHandoff } from "../training/training-handoff";
import { trainingRunRequiresPreflight } from "../training/training-host";
import type { LiveTutorialPracticeStart } from "../training/tutorial-practice-start";
import { createLiveTutorialSessionActions } from "../training/tutorial-session-actions";
import type { LiveWorldComposition } from "../world/world-composition";
import {
  createLiveCampaignTrainingComposition,
  type LiveCampaignTrainingOptions,
} from "./campaign-training-composition";

export interface LiveCampaignTrainingAssemblyOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly world: LiveWorldComposition;
  readonly surface: Pick<LiveBrowserRuntime, "canvas" | "context" | "width" | "height">;
  readonly services: Pick<LiveSessionServices, "controllers" | "settings" | "settingsController">;
  readonly navigation: Pick<LiveScreenNavigation, "screen" | "setScreen" | "bind">;
  readonly interaction: Pick<LiveInterfaceInteractionState, "scroll" | "setScroll" | "setFocus">;
  readonly practiceStart: LiveTutorialPracticeStart;
  readonly journals: Pick<LiveTestBuildJournals, "observeFinaleIntents" | "observeFinaleOutwardCall">;
  readonly observeStyle: NonNullable<LiveCampaignTrainingOptions["observeStyle"]>;
  readonly persistentEffects: () => boolean;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly requestPointerLock: () => void;
  readonly browserWindow: Pick<Window, "addEventListener" | "queueMicrotask">;
  readonly browserDocument: Pick<Document, "exitPointerLock">;
  /** Collaborators constructed after this composition. */
  readonly orchestration: () => Pick<LiveRunOrchestration, "spawn">;
  readonly combat: () => Pick<LiveCanonicalCombatHost, "killRuntime" | "frameRuntime">;
  readonly presentation: () => Pick<LiveInterfaceComposition, "wipe" | "screens">;
}

/**
 * Builds the campaign, training, cinematic, weapon-feedback and style runtimes
 * for the live world, and the training entry points that wrap a run start.
 */
export function assembleLiveCampaignTraining(options: LiveCampaignTrainingAssemblyOptions) {
  const { dependencies, world, surface, navigation, interaction, practiceStart, journals, run: liveRun } = options;
  const { controllers: runControllers, settings, settingsController } = options.services;
  const { startRun: startRunImmediate, loadStage } = runControllers.api;
  const { state: hostState, entities: worldEntities, lifecycle: RUN_LIFECYCLE } = world;
  const { transient } = world.context;
  const { impact, feel } = transient;
  const trainingHandoff = createLiveTrainingHandoff({
    run: () => hostState.run(),
    phase: () => TUT.session().phase,
    pause: () => {
      navigation.setScreen("paused");
    },
    releasePointer: () => {
      releasePointerLock(options.browserDocument);
    },
    defer: (commit) => {
      options.browserWindow.queueMicrotask(commit);
    },
    startPractice: () => {
      practiceStart.start(true, () => {
        startRunImmediate("playground", "normal");
      });
    },
  });
  const campaignTraining = createLiveCampaignTrainingComposition({
    dependencies,
    entities: worldEntities,
    state: hostState,
    lifecycle: RUN_LIFECYCLE,
    observeStyle: options.observeStyle,
    persistentEffects: options.persistentEffects,
    cinema: world.context.cinema,
    controllers: runControllers,
    width: surface.width,
    height: surface.height,
    canvas: surface.canvas,
    context: surface.context,
    run: liveRun,
    player: options.player,
    blade: options.blade,
    enemies: () => hostState.enemies(),
    projectiles: () => hostState.projectiles(),
    spawn: (kind, hpScale) => {
      options.orchestration().spawn({ type: kind, hpScale });
      const spawned = hostState.enemies();
      return spawned[spawned.length - 1];
    },
    resolveKill: (enemy, cause) => {
      options.combat().killRuntime.resolve(enemy, cause);
    },
    setScreen: (screen) => {
      navigation.setScreen(screen);
    },
    resetScroll: () => {
      interaction.setScroll(0);
    },
    scroll: interaction.scroll,
    setScroll: interaction.setScroll,
    requestPointerLock: options.requestPointerLock,
    selectStage: loadStage,
    beginWipe: () => {
      options.presentation().wipe.begin();
    },
    resetRun: (difficulty) => {
      startRunWithPreflight("playground", difficulty);
    },
    startPractice: (origin) => {
      trainingHandoff.request(origin);
    },
    resetTrainingCarry: () => {
      transient.resetOpening();
      impact.hitStop = 0;
    },
    applySettingsCinematicPreference: () => settings.cinematics,
    shakeScale: () => settingsController.shakeScale,
    getShake: () => impact.shake,
    setShake: (value) => {
      impact.shake = value;
    },
    getZoom: () => feel.zoom,
    setZoom: (value) => {
      feel.zoom = value;
    },
    getFlash: () => feel.flash,
    setFlash: (value) => {
      feel.flash = value;
    },
    setSlowMotion: (value) => {
      impact.slowMotion = value;
    },
    setHitStop: (value) => {
      impact.hitStop = value;
    },
    setWorldZoom: (value, immediate) => {
      const before = Object.freeze({ current: feel.worldZoom, target: feel.worldZoomTarget });
      feel.worldZoomTarget = value;
      if (immediate) feel.worldZoom = value;
      return Object.freeze({
        requested: value,
        immediate,
        before,
        after: Object.freeze({ current: feel.worldZoom, target: feel.worldZoomTarget }),
      });
    },
    renderMenu: (model) => {
      options.presentation().screens.modelRenderers.pgmenu(model);
    },
    renderLab: (model) => {
      options.presentation().screens.modelRenderers.pglab(model);
    },
    abilityColors: () => options.presentation().screens.library.categories,
    emitMusicEvent: (name, detail) => {
      options.combat().frameRuntime.emitMusicEvent(name, detail);
    },
    ...(__TEAR_TEST_BUILD__
      ? {
          observeFinaleIntents: journals.observeFinaleIntents,
          observeFinaleOutwardCall: journals.observeFinaleOutwardCall,
        }
      : {}),
    showRank: (rank) => {
      feel.rankPopupSeconds = 1;
      feel.rankPopupText = rank;
    },
  });
  const { training: trainingHost, cinematic: cinematicHost } = campaignTraining;
  const startRunWithPreflight = (mode: RunMode, difficulty: RunDifficulty): void => {
    if (mode === "tutorial") {
      void trainingHost
        .startTutorial(() => {
          startRunImmediate(mode, difficulty);
        })
        .catch((error: unknown) => {
          console.warn("Tear training runtime failed to load", error);
        });
      return;
    }
    if (!trainingRunRequiresPreflight(mode)) {
      startRunImmediate(mode, difficulty);
      return;
    }
    void trainingHost
      .ensureLoaded()
      .then(() => {
        startRunImmediate(mode, difficulty);
      })
      .catch((error: unknown) => {
        console.warn("Tear training runtime failed to load", error);
      });
  };
  const { tutorial: TUT, runtime: playgroundRuntime } = trainingHost;
  const interruptTutorialCoaching = () => {
    TUT.interruptCoaching();
  };
  navigation.bind({ interruptTutorialCoaching });
  options.browserWindow.addEventListener("blur", interruptTutorialCoaching);
  const { sourceRuntime: sourceVoidRuntime } = cinematicHost;
  const tutorialSessionActions = createLiveTutorialSessionActions({
    training: trainingHost,
    tutorial: TUT,
    screen: () => navigation.screen(),
    mode: () => liveRun().mode,
    selectPracticeWeapon: (id) => {
      hostState.setSelectedWeapon(id);
    },
    startLessonRun: () => {
      practiceStart.start(TUT.session().practiceOnly === true || TUT.session().unfinished === true, () => {
        startRunImmediate("tutorial", "normal");
      });
    },
    resetFocus: () => {
      interaction.setFocus(0);
    },
    resume: () => {
      navigation.setScreen("playing");
      options.requestPointerLock();
    },
  });
  // A defeated boss-practice Source no longer supports the player or scrolls the void.
  const syncVoidPlayerSupport = (...args: Parameters<typeof sourceVoidRuntime.syncPlayer>) =>
    TUT.session().bossPractice?.defeated ? undefined : sourceVoidRuntime.syncPlayer(...args);
  const updateVoidScroll = (...args: Parameters<typeof sourceVoidRuntime.update>) => {
    if (!TUT.session().bossPractice?.defeated) sourceVoidRuntime.update(...args);
  };
  const dispatchPlaygroundAction = (...args: Parameters<typeof playgroundRuntime.dispatchAction>) => {
    playgroundRuntime.dispatchAction(...args);
  };
  const stepPlayground = (...args: Parameters<typeof playgroundRuntime.step>) => {
    playgroundRuntime.step(...args);
  };
  return Object.freeze({
    ...campaignTraining,
    startRunWithPreflight,
    tutorialSessionActions,
    syncVoidPlayerSupport,
    updateVoidScroll,
    dispatchPlaygroundAction,
    stepPlayground,
  });
}

export type LiveCampaignTrainingAssembly = ReturnType<typeof assembleLiveCampaignTraining>;
