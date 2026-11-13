import { modeSurface } from "../../gameplay/run/mode-catalog";
import type { LiveCampaignTrainingAssembly } from "../campaign/live-campaign-training-assembly";
import type {
  LiveAcademySurface,
  LiveBotEvidenceSurface,
  LiveFoundrySurface,
  LivePlayerWatchSurface,
} from "../engineering/engineering-surfaces-contract";
import type { GhostVaultLibraryPort } from "../library/ghost-vault-library-controller";
import type { LiveGhostOwnerRecoveryController } from "../replay/ghost-owner-recovery-controller";
import type { LiveGhostPublicationController } from "../replay/ghost-publication-controller";
import type { LiveGhostSupportController } from "../replay/ghost-support-controller";
import type { LiveGhostChaseRuntime } from "../replay/live-ghost-chase";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun } from "../shell/game-runtime-state";
import type { LiveSessionServices } from "../shell/session-services-composition";
import { trainingRunRequiresPreflight } from "../training/training-host";
import type { LiveWorldSessionState } from "../world/world-session-state";
import {
  isRunDifficultySelection,
  isRunModeSelection,
  type LiveInterfaceComposition,
  type LiveInterfaceCompositionOptions,
} from "./interface-composition";
import type { LiveInterfaceInteractionState } from "./interface-interaction-state";
import type { LiveScreenNavigation } from "./live-screen-navigation";

/** Ghost Vault, owner recovery, publication and support controllers behind the Profile screens. */
export interface LiveGhostLibraryScreens {
  readonly vault: GhostVaultLibraryPort;
  readonly ownerRecovery: LiveGhostOwnerRecoveryController;
  readonly publication: LiveGhostPublicationController;
  readonly support: LiveGhostSupportController;
}

/** Engineering-surface controllers; release builds supply inert stand-ins. */
export interface LiveEngineeringScreens {
  readonly academy: LiveAcademySurface;
  readonly foundry: LiveFoundrySurface;
  readonly playerWatch: LivePlayerWatchSurface;
  readonly botEvidence: LiveBotEvidenceSurface;
}

export interface LiveScreenActionsOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly session: LiveWorldSessionState;
  readonly services: Pick<LiveSessionServices, "controllers" | "seedRace" | "settingsController">;
  readonly campaignTraining: Pick<
    LiveCampaignTrainingAssembly,
    "training" | "startRunWithPreflight" | "dispatchPlaygroundAction" | "tutorialSessionActions"
  >;
  readonly navigation: Pick<LiveScreenNavigation, "screen" | "setScreen">;
  readonly interaction: Pick<LiveInterfaceInteractionState, "setScroll">;
  readonly chase: Pick<LiveGhostChaseRuntime, "toggle" | "stop">;
  readonly ghostLibrary: LiveGhostLibraryScreens;
  readonly engineeringScreens: LiveEngineeringScreens;
  readonly run: () => GameRun;
  /** The browser pointer-lock request, not the input-authority-owned one. */
  readonly requestPointerLock: () => void;
  /** The interface composition these actions belong to. */
  readonly presentation: () => Pick<LiveInterfaceComposition, "frame" | "screens">;
}

/** The semantic action table that menu, setup, profile and engineering screens dispatch into. */
export function createLiveScreenActions(
  options: LiveScreenActionsOptions,
): LiveInterfaceCompositionOptions["screens"]["actions"] {
  const { dependencies, session, navigation, chase, run: liveRun, requestPointerLock: requestLock } = options;
  const { Cloud, VAULT } = dependencies;
  const { setScreen } = navigation;
  const {
    vault: ghostVault,
    ownerRecovery,
    publication: ghostPublicationScreen,
    support: ghostSupportScreen,
  } = options.ghostLibrary;
  const { academy: academyScreen, foundry: foundryScreen, playerWatch, botEvidence } = options.engineeringScreens;
  const { seedRace, settingsController } = options.services;
  const { resumeSavedFinale, claimSavedFinale, endRun, retryRun } = options.services.controllers.api;
  const {
    training: trainingHost,
    startRunWithPreflight,
    dispatchPlaygroundAction,
    tutorialSessionActions,
  } = options.campaignTraining;
  const render = () => {
    options.presentation().frame.render();
  };
  return {
    controlChase: (command) => {
      if (command === "toggle") chase.toggle();
      else chase.stop();
    },
    ghostFiles: ghostVault,
    loadOwnGhostCapsules: () => {
      void ownerRecovery.loadOwn().then(render);
    },
    recoverOwnGhostCapsule: (id) => {
      void ownerRecovery.recover(id).then(render);
    },
    closeOwnGhostCatalog: () => {
      ownerRecovery.close();
    },
    setScreen: (screen) => {
      if (screen !== "profile") ownerRecovery.close();
      if (screen === "academy") academyScreen.refresh();
      if (screen === "foundry") foundryScreen.refresh();
      if (screen === "ghostlab") void playerWatch.refresh();
      setScreen(screen);
    },
    openGhostPublication: (id) => {
      void ghostPublicationScreen.open(id).then(() => {
        setScreen("ghostpublication");
        render();
      });
    },
    grantGhostPublication: () => {
      void ghostPublicationScreen.grant().then(render);
    },
    runGhostPublicationOnce: () => {
      void ghostPublicationScreen.runOnce().then(render);
    },
    cancelGhostPublication: () => {
      void ghostPublicationScreen.cancel().then(render);
    },
    openGhostSupport: (id) => {
      void ghostSupportScreen.open(id).then(() => {
        setScreen("ghostsupport");
        render();
      });
    },
    createGhostSupport: () => {
      void ghostSupportScreen.create().then(render);
    },
    openGhostLab: (destination) => {
      if (destination === "academy" || destination === "training-archive") {
        academyScreen.refresh();
        setScreen("academy");
      } else if (destination === "foundry" || destination === "training-operations") {
        foundryScreen.refresh();
        setScreen("foundry");
      } else if (destination === "watch") {
        void playerWatch.refresh();
        setScreen("ghostlab");
      } else if (destination === "botevidence") {
        void botEvidence.refresh().then(render);
        setScreen("botevidence");
      } else {
        setScreen("profile");
        options.presentation().screens.library.selectProfileTab(destination === "career" ? "career" : "vault");
      }
    },
    controlGhostLabWatch: (command) => {
      void playerWatch[command]();
      if (command === "resume" && navigation.screen() === "paused") {
        setScreen("playing");
        requestLock();
      }
      render();
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
    refreshAcademy: academyScreen.refresh,
    advanceAcademyDagger: academyScreen.advance,
    reviewAcademyDagger: academyScreen.review,
    withdrawAcademyModelTraining: academyScreen.withdrawModelTraining,
    optInHumanCalibration: (consent) => {
      academyScreen.setHumanCalibrationConsent(consent);
    },
    revokeHumanCalibration: () => {
      academyScreen.setHumanCalibrationConsent("revoked");
    },
    refreshFoundry: foundryScreen.refresh,
    promoteFoundry: foundryScreen.promote,
    restoreFoundryBaseline: foundryScreen.restoreBaseline,
    bootstrapFoundry: foundryScreen.bootstrap,
    setFoundryScheduleEnabled: foundryScreen.setScheduleEnabled,
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
    tutorialAction: (command, lessonId) => {
      tutorialSessionActions.dispatch(command, lessonId);
    },
  };
}
