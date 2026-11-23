import type { BrowserGhostLiveRecorderOptions } from "../../ghost/live-recorder";
import {
  GHOST_REPLAY_CONTEXT_PROVENANCE_KEY,
  type GhostReplayRunContextInput,
  type GhostReplayRunContextV1,
} from "../../ghost/replay-admission";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import { createLiveGhostFrameRecording, declareGhostApplicationFrames } from "./ghost-frame-recording";
import { createLiveGhostOpeningCapture } from "./ghost-opening-capture";
import { createLiveGhostRecordingSessionState } from "./ghost-recording-session-state";
import { createLiveGhostRunDnaRecording } from "./ghost-run-dna-recording";

export interface LiveGhostRecordingOptions {
  readonly indexedDb: IDBFactory | undefined;
  readonly recorderOptions: BrowserGhostLiveRecorderOptions;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly screen: () => string;
  readonly tick: () => number;
  readonly practiceActive: () => boolean;
  readonly bossIntroActive: () => boolean;
}

/**
 * The live Ghost V3 sidecar: recorder session, Run DNA,
 * application frame clock and the recorded-opening capture. It observes the
 * run and never changes gameplay.
 */
export function createLiveGhostRecording(options: LiveGhostRecordingOptions) {
  const { indexedDb, recorderOptions } = options;
  const session = createLiveGhostRecordingSessionState(indexedDb, recorderOptions);
  const recorder = session.recorder();
  const dna = createLiveGhostRunDnaRecording({
    session,
    player: options.player,
    blade: options.blade,
    run: options.run,
    tick: () => options.tick(),
    practice: () => options.practiceActive(),
  });
  const frames = createLiveGhostFrameRecording({
    session,
    tick: () => options.tick(),
    introActive: () => options.bossIntroActive(),
    afterFrame: () => {
      dna.frameEnded();
    },
  });
  const opening = createLiveGhostOpeningCapture({
    screen: () => options.screen(),
    tick: () => options.tick(),
    replayRunId: () => session.replayContext()?.run.id,
    nextSequence: session.nextEventSequence,
    record: (event) => {
      recorder?.record("events", event.tick, event);
    },
    failed: (error) => {
      console.warn("Ghost opening completion capture failed; live play continues", error);
    },
  });
  return Object.freeze({ session, recorder, dna, frames, opening });
}

export type LiveGhostRecording = ReturnType<typeof createLiveGhostRecording>;

export interface LiveGhostRecordingBoundaryPorts {
  readonly ghost: Pick<GameRuntimeDependencies["GHOST"], "setRecordingObserver">;
  readonly run: () => GameRun;
  /** The State Setup projection of the live configuration component. */
  readonly configurationProjection: () => unknown;
  readonly randomSnapshot: () => GhostReplayRunContextInput["rng"];
  readonly chaseConfiguration: (configHash: string) => void;
  readonly sessionNonce: () => string;
  readonly captureReceipt: (tick: number) => void;
}

/** Starts and stops the sidecar at Ghost 2's recording boundaries. */
export function observeLiveGhostRecordingBoundaries(
  recording: LiveGhostRecording,
  ports: LiveGhostRecordingBoundaryPorts,
): void {
  const { session, recorder, dna, frames, opening } = recording;
  const { run } = ports;
  // Keyframes attest the immutable bootstrap identity saved at recording boundary; never rebuild a divergent fingerprint later in the live loop.
  ports.ghost.setRecordingObserver(
    recorder === null
      ? null
      : {
          started(context) {
            opening.discard();
            frames.reset();
            session.reset();
            let provenance: Readonly<Record<string, unknown>>;
            let replayContext: GhostReplayRunContextV1 | undefined;
            try {
              // Context and tick-zero keyframe share the settled opening-initialized boundary.
              replayContext = declareGhostApplicationFrames(
                opening.createContext(context, run(), ports.configurationProjection(), ports.randomSnapshot()),
              );
              ports.chaseConfiguration(replayContext.build.configHash);
              provenance = Object.freeze({
                ...context,
                ...(run().ghostAssistance ? { ghostAssistance: run().ghostAssistance } : {}),
                ...(run().seedRace ? { seedRace: run().seedRace } : {}),
                [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: replayContext,
              });
            } catch (error) {
              // Ghost V3 is an observational sidecar. A malformed optional replay
              // bootstrap must leave both Ghost 2 and the active live run untouched;
              // admission will reject this explicitly incomplete provenance later.
              provenance = Object.freeze({
                ...context,
                replayContextFailure: error instanceof Error ? error.message : String(error),
              });
            }
            try {
              recorder.start({
                sessionId: `ghost-v3-${context.runId}-${ports.sessionNonce()}`,
                createdAt: new Date().toISOString(),
                provenance,
              });
              session.setReplayContext(replayContext);
              dna.start(replayContext);
              if (replayContext !== undefined) {
                // The sealed bootstrap event is queued first by GhostLiveRecorder.
                // Capture its matching state/RNG anchor before any opening-content
                // randomness or legal upgrade can mutate the live configuration.
                recorder.record("rng", 0, ports.randomSnapshot());
                ports.captureReceipt(0);
                opening.captured(context.runId);
              }
            } catch (error) {
              console.warn("Ghost V3 recorder failed to start; live play continues", error);
            }
          },
          // Run lifecycle owns canonical recording; an open intro frame closes before finalization.
          stopped(meta) {
            opening.discard();
            dna.finish(() => {
              frames.finish(meta);
            });
          },
        },
  );
}
