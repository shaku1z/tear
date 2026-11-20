import { stableVerificationHash } from "../../domain/hash";
import type { TearLiveWorldAdapter } from "../../tearbench/live-state-snapshot";
import type { BrowserInput } from "../../input/browser-input-contracts";
import type { LiveCanonicalCombatHost, LiveCanonicalStateCapture } from "../combat/live-canonical-state";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { LiveGameplayEventFanOut } from "../run/live-gameplay-event-fanout";
import type { LiveRunAbandonment } from "../run/live-run-abandonment";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GamePlayer } from "../../gameplay/runtime/game-runtime-state";
import type { LiveWorldComposition } from "../world/world-composition";
import { createLiveGhostChallengeComposition } from "./ghost-challenge-composition";
import { launchGhostPracticeChild } from "./ghost-practice-launch";
import type { LiveGhostPracticeSessionState } from "./ghost-practice-session-state";
import type { LiveGhostCapture } from "./live-ghost-capture";
import type { LiveGhostRecording } from "./live-ghost-recording";

export interface LiveGhostPracticeChallengeOptions {
  readonly indexedDb: IDBFactory | undefined;
  readonly recording: Pick<LiveGhostRecording, "session" | "frames">;
  readonly capture: Pick<LiveGhostCapture, "registry" | "captureReceipt">;
  readonly stateSetup: TearLiveWorldAdapter<unknown>;
  readonly practice: LiveGhostPracticeSessionState;
  readonly world: Pick<LiveWorldComposition, "state" | "context">;
  readonly combat: Pick<LiveCanonicalCombatHost, "simulationRuntime">;
  readonly canonicalState: LiveCanonicalStateCapture;
  readonly navigation: Pick<LiveScreenNavigation, "screen" | "setScreen">;
  readonly gameplayEvents: LiveGameplayEventFanOut;
  readonly abandonment: LiveRunAbandonment;
  readonly ghost: Pick<GameRuntimeDependencies["GHOST"], "restoreRuntimeState">;
  readonly input: Pick<BrowserInput, "startSemanticRecording" | "stopSemanticRecording">;
  /** The browser pointer-lock request, not the input-authority-owned one. */
  readonly requestPointerLock: () => void;
  readonly player: () => GamePlayer;
  readonly addFloater: (x: number, y: number, text: string, big?: boolean, color?: string) => void;
}

/** Launches unranked practice children from a Ghost capsule and runs their recorded challenge. */
export function createLiveGhostPracticeChallenge(options: LiveGhostPracticeChallengeOptions) {
  const {
    recording,
    capture,
    stateSetup,
    navigation,
    canonicalState,
    input: Input,
    requestPointerLock: requestLock,
    player: livePlayer,
  } = options;
  const { simulationRuntime } = options.combat;
  const { services } = options.world.context;
  const hostState = options.world.state;
  const ghostPracticeSession = options.practice;
  const restoreGhostPractice = (child: Parameters<typeof launchGhostPracticeChild>[0]) =>
    launchGhostPracticeChild(child, {
      registry: capture.registry,
      stateSetup,
      hasLiveWorld: () => hostState.run() !== null,
      practice: ghostPracticeSession,
      clearRestoredRecording: () => {
        options.ghost.restoreRuntimeState({ recording: null });
        Input.stopSemanticRecording();
      },
      setPlaying: () => {
        navigation.setScreen("playing", { practiceLaunch: true });
      },
      requestPointer: requestLock,
    });
  const launch = (child: Parameters<typeof launchGhostPracticeChild>[0]): ReturnType<typeof launchGhostPracticeChild> =>
    challenge.request(child);
  const challenge = createLiveGhostChallengeComposition({
    factory: options.indexedDb,
    recording: recording.session,
    frames: recording.frames,
    stateSetup,
    registry: capture.registry,
    launch: restoreGhostPractice,
    rng: () => services.random.snapshot(),
    input: () => simulationRuntime.input.snapshot(),
    releaseInput: (tick) => {
      simulationRuntime.input.restore({
        ...simulationRuntime.input.snapshot(),
        tick,
        moveX: 0,
        moveY: 0,
        primaryHeld: false,
      });
    },
    startInput: () => {
      Input.startSemanticRecording();
      navigation.setScreen("playing", { practiceLaunch: true });
      requestLock();
    },
    stopInput: () => {
      Input.stopSemanticRecording();
    },
    stateHash: () =>
      stableVerificationHash(canonicalState(simulationRuntime.scheduler.tick, simulationRuntime.input).state),
    tick: () => simulationRuntime.scheduler.tick,
    pause: () => {
      if (navigation.screen() === "playing") navigation.setScreen("paused");
    },
    abandon: options.abandonment.abandon,
    notice: (message) => {
      options.addFloater(livePlayer().x, livePlayer().y - 70, message, true, "#13c4d6");
    },
    captureReceipt: capture.captureReceipt,
  });
  options.gameplayEvents.bind({ challenge: challenge.observe });
  options.abandonment.bindChallengeStop(challenge.stop);
  ghostPracticeSession.beforeClear?.(challenge.reset);
  return Object.freeze({ challenge, launch });
}

export type LiveGhostPracticeChallenge = ReturnType<typeof createLiveGhostPracticeChallenge>;
