import type { BrowserGhostLiveRecorderOptions } from "../../ghost/live-recorder";
import {
  GHOST_REPLAY_CONTEXT_PROVENANCE_KEY,
  type GhostReplayRunContextInput,
  type GhostReplayRunContextV1,
} from "../../ghost/replay-admission";
import type { BuildIdentity } from "../../platform/build-identity";
import type { TearScoreReplayMetadata } from "../../domain/tear-score-replay";
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

/** A recorded run's start as the old recorder's sidecar keeps it in its provenance. */
export interface LiveGhostRecordingStart {
  readonly runId: string;
  readonly seed: string;
  readonly ticksPerSecond: number;
  readonly build: BuildIdentity;
  readonly rulesetVersion: string;
  readonly weaponId: string;
  readonly weaponSchemaVersion: string;
  readonly tearScore: TearScoreReplayMetadata;
}

export interface LiveGhostRecordingBoundaryPorts {
  readonly run: () => GameRun;
  /** The State Setup projection of the live configuration component. */
  readonly configurationProjection: () => unknown;
  readonly randomSnapshot: () => GhostReplayRunContextInput["rng"];
  readonly chaseConfiguration: (configHash: string) => void;
  readonly sessionNonce: () => string;
  readonly captureReceipt: (tick: number) => void;
}

/**
 * Starts and stops the old recorder's sidecar at a recorded run's start and end: the run start host calls `start`
 * inside the opening boundary, and each run end (outcome, quit, replacement, a claimed finale) calls
 * `stop`. Replay PR 8b removes it with that recorder.
 */
export function createLiveGhostRecordingBoundary(
  recording: LiveGhostRecording,
  ports: LiveGhostRecordingBoundaryPorts,
) {
  const { session, recorder, dna, frames, opening } = recording;
  const { run } = ports;
  let active = false;
  return Object.freeze({
    start(context: LiveGhostRecordingStart): void {
      active = true;
      if (recorder === null) return;
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
        // The sidecar observes; a malformed optional bootstrap leaves the live run untouched, and
        // admission later rejects this explicitly incomplete provenance.
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
          // The sealed bootstrap event is queued first by GhostLiveRecorder. Capture its matching
          // state and RNG anchor before any opening randomness or legal upgrade changes the run.
          recorder.record("rng", 0, ports.randomSnapshot());
          ports.captureReceipt(0);
          opening.captured(context.runId);
        }
      } catch (error) {
        console.warn("The old recorder's sidecar failed to start; live play continues", error);
      }
    },
    /** Ends the sidecar's session with the run's end; an open intro frame closes before it finalizes. */
    stop(meta: Readonly<Record<string, unknown>>): void {
      if (!active) return;
      active = false;
      if (recorder === null) return;
      opening.discard();
      dna.finish(() => {
        frames.finish(meta);
      });
    },
  });
}

export type LiveGhostRecordingBoundary = ReturnType<typeof createLiveGhostRecordingBoundary>;
