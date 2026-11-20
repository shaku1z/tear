import type { TearLiveWorldAdapter } from "../../tearbench/live-state-snapshot";
import type { BrowserInput } from "../../input/browser-input-contracts";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { LiveWorldComposition } from "../world/world-composition";
import { launchGhostPracticeChild } from "./ghost-practice-launch";
import type { LiveGhostPracticeSessionState } from "./ghost-practice-session-state";
import type { LiveGhostCapture } from "./live-ghost-capture";

export interface LiveGhostPracticeOptions {
  readonly capture: Pick<LiveGhostCapture, "registry">;
  readonly stateSetup: TearLiveWorldAdapter<unknown>;
  readonly practice: LiveGhostPracticeSessionState;
  readonly world: Pick<LiveWorldComposition, "state">;
  readonly navigation: Pick<LiveScreenNavigation, "setScreen">;
  readonly ghost: Pick<GameRuntimeDependencies["GHOST"], "restoreRuntimeState">;
  readonly input: Pick<BrowserInput, "stopSemanticRecording">;
  /** The browser pointer-lock request, not the input-authority-owned one. */
  readonly requestPointerLock: () => void;
}

/** Launches an unranked practice run from a moment of a saved replay. */
export function createLiveGhostPractice(options: LiveGhostPracticeOptions) {
  const { capture, stateSetup, navigation, practice } = options;
  const hostState = options.world.state;
  const launch = (child: Parameters<typeof launchGhostPracticeChild>[0]): ReturnType<typeof launchGhostPracticeChild> =>
    launchGhostPracticeChild(child, {
      registry: capture.registry,
      stateSetup,
      hasLiveWorld: () => hostState.run() !== null,
      practice,
      clearRestoredRecording: () => {
        options.ghost.restoreRuntimeState({ recording: null });
        options.input.stopSemanticRecording();
      },
      setPlaying: () => {
        navigation.setScreen("playing", { practiceLaunch: true });
      },
      requestPointer: options.requestPointerLock,
    });
  return Object.freeze({ launch });
}

export type LiveGhostPractice = ReturnType<typeof createLiveGhostPractice>;
