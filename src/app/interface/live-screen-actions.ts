import { modeSurface } from "../../gameplay/run/mode-catalog";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type { GhostVaultLibraryPort } from "../library/ghost-vault-library-controller";
import type { LiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import { trainingRunRequiresPreflight } from "../training/training-host";
import type { LiveWorldSessionState } from "../world/world-session-state";
import {
  isRunDifficultySelection,
  isRunModeSelection,
  type LiveInterfaceCompositionOptions,
} from "./interface-composition";
import type { LiveInterfaceInteractionState } from "./interface-interaction-state";
import type { LiveScreenNavigation } from "./live-screen-navigation";

/** The Ghost Vault controller behind the Profile screens. */
export interface LiveGhostLibraryScreens {
  readonly vault: GhostVaultLibraryPort;
}

export interface LiveScreenActionsOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly session: LiveWorldSessionState;
  readonly services: Pick<LiveSessionServices, "controllers" | "seedRace" | "settingsController">;
  readonly campaignTraining: Pick<
    LiveCampaignTrainingAssembly,
    "training" | "startRunWithPreflight" | "dispatchPlaygroundAction" | "tutorialSessionActions"
  >;
  readonly navigation: Pick<LiveScreenNavigation, "screen" | "setScreen" | "back">;
  readonly interaction: Pick<LiveInterfaceInteractionState, "setScroll">;
  readonly chase: Pick<LiveGhostChaseRuntime, "toggle" | "stop">;
  readonly ghostLibrary: LiveGhostLibraryScreens;
  readonly run: () => GameRun;
  /** The browser pointer-lock request, not the input-authority-owned one. */
  readonly requestPointerLock: () => void;
}

/** The semantic action table that menu, setup, profile and replay screens dispatch into. */
export function createLiveScreenActions(
  options: LiveScreenActionsOptions,
): LiveInterfaceCompositionOptions["screens"]["actions"] {
  const { dependencies, session, navigation, chase, run: liveRun, requestPointerLock: requestLock } = options;
  const { Cloud, VAULT } = dependencies;
  const { setScreen } = navigation;
  const { vault: ghostVault } = options.ghostLibrary;
  const { seedRace, settingsController } = options.services;
  const { resumeSavedFinale, claimSavedFinale, endRun, retryRun } = options.services.controllers.api;
  const {
    training: trainingHost,
    startRunWithPreflight,
    dispatchPlaygroundAction,
    tutorialSessionActions,
  } = options.campaignTraining;
  return {
    controlChase: (command) => {
      if (command === "toggle") chase.toggle();
      else chase.stop();
    },
    ghostFiles: ghostVault,
    setScreen,
    back: () => {
      navigation.back();
    },
    resetScroll: () => {
      options.interaction.setScroll(0);
    },
    setSetupSelection: (kind, id) => {
      if (kind === "mode" && isRunModeSelection(id) && dependencies.surfaces.admits(modeSurface(id))) {
        session.setSelectedMode(id);
        if (trainingRunRequiresPreflight(id)) void trainingHost.ensureLoaded();
      } else if (kind === "difficulty" && isRunDifficultySelection(id)) session.setSelectedDifficulty(id);
      else if (kind === "weapon") session.setSelectedWeapon(id);
      else if (kind === "boss") session.setSelectedBoss(id);
    },
    startSelectedRun: () => {
      startRunWithPreflight(session.selectedMode(), session.selectedDifficulty());
    },
    startSelectedRace: () => {
      seedRace.reference(() => {
        startRunWithPreflight(session.selectedMode(), session.selectedDifficulty());
      });
    },
    startRun: (mode, difficulty) => {
      if (isRunModeSelection(mode) && isRunDifficultySelection(difficulty)) startRunWithPreflight(mode, difficulty);
    },
    currentRun: liveRun,
    resumeFinale: resumeSavedFinale,
    claimFinale: claimSavedFinale,
    requestPointer: requestLock,
    endRun,
    retryRun,
    lastReplay: () => session.lastRecording(),
    campaignDifficulty: () => session.outcome()?.diff ?? "normal",
    resetSettings: () => {
      settingsController.reset();
    },
    signIn: () => {
      void Cloud.signIn();
    },
    signOut: () => {
      void Cloud.signOut();
    },
    pinReplay: (id, pinned) => VAULT.pin(id, pinned),
    deleteReplay: (id) => {
      VAULT.remove(id);
    },
    dispatchPlayground: dispatchPlaygroundAction,
    tutorialAction: (action) => {
      tutorialSessionActions.dispatch(action);
    },
  };
}
