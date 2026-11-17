import type { BrowserGhostLiveRecorderOptions } from "../../ghost/live-recorder";
import {
  GHOST_REPLAY_CONTEXT_PROVENANCE_KEY,
  type GhostReplayRunContextInput,
  type GhostReplayRunContextV1,
} from "../../ghost/replay-admission";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameRun } from "../shell/game-runtime-state";
import { createBrowserGhostCareer } from "./browser-ghost-career";
import type { createLiveGhostFinaleCompanion } from "./ghost-finale-companion";
import { createLiveGhostFrameRecording, declareGhostApplicationFrames } from "./ghost-frame-recording";
import { createLiveGhostOpeningCapture } from "./ghost-opening-capture";
import { createLiveGhostRecordingSessionState } from "./ghost-recording-session-state";
import { createLiveGhostRunDnaRecording } from "./ghost-run-dna-recording";

type LiveGhostFinaleCompanion = ReturnType<typeof createLiveGhostFinaleCompanion>;

export interface LiveGhostRecordingOptions {
  readonly indexedDb: IDBFactory | undefined;
  readonly document: Document;
  readonly recorderOptions: BrowserGhostLiveRecorderOptions;
  /** Beat This Run is told when one of its recordings is finalized. */
  readonly beatFinalized: (manifestId: string) => void;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly screen: () => string;
  readonly tick: () => number;
  readonly enemies: () => GameEnemy[];
  readonly enemyId: (actor: object) => string;
  readonly practiceActive: () => boolean;
  readonly bossIntroActive: () => boolean;
  /** The finale companion is built with the authoritative capture, after this sidecar. */
  readonly finale: () => LiveGhostFinaleCompanion;
}

/**
 * The live Ghost V3 sidecar: recorder session, career metadata, Run DNA,
 * application frame clock and the recorded-opening capture. It observes the
 * run and never changes gameplay.
 */
export function createLiveGhostRecording(options: LiveGhostRecordingOptions) {
  const { indexedDb, recorderOptions } = options;
  const session = createLiveGhostRecordingSessionState(indexedDb, {
    ...recorderOptions,
    onFinalized: async (manifest, vault) => {
      await recorderOptions.onFinalized?.(manifest, vault);
      if (manifest.provenance?.beatThisRun !== undefined) options.beatFinalized(manifest.id);
    },
  });
  const recorder = session.recorder();
  const career = createBrowserGhostCareer(indexedDb, options.document, {
    session,
    run: options.run,
    tick: () => options.tick(),
    enemies: () => options.enemies(),
    actorId: (actor) => options.enemyId(actor),
  });
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
    closedFrame: () => {
      options.finale().frameEnded();
    },
    interceptFinish: (result) => options.finale().interceptFinish(result),
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
  return Object.freeze({ session, recorder, career, dna, frames, opening });
}

export type LiveGhostRecording = ReturnType<typeof createLiveGhostRecording>;

export interface LiveGhostRecordingBoundaryPorts {
  readonly ghost: Pick<GameRuntimeDependencies["GHOST"], "setRecordingObserver">;
  readonly run: () => GameRun;
  /** The State Forge projection of the live configuration component. */
  readonly configurationProjection: () => unknown;
  readonly randomSnapshot: () => GhostReplayRunContextInput["rng"];
  readonly chaseConfiguration: (configHash: string) => void;
  readonly beatDeclaration: () => unknown;
  readonly sessionNonce: () => string;
  readonly captureReceipt: (tick: number) => void;
  readonly finale: () => LiveGhostFinaleCompanion;
}

/** Starts and stops the sidecar at Ghost 2's recording boundaries. */
export function observeLiveGhostRecordingBoundaries(
  recording: LiveGhostRecording,
  ports: LiveGhostRecordingBoundaryPorts,
): void {
  const { session, recorder, career, dna, frames, opening } = recording;
  const { run } = ports;
  // Keyframes attest the immutable bootstrap identity saved at recording boundary; never rebuild a divergent fingerprint later in the live loop.
  ports.ghost.setRecordingObserver(
    recorder === null
      ? null
      : {
          started(context) {
            opening.discard();
            ports.finale().reset();
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
                ...(run().beatThisRun ? { beatThisRun: run().beatThisRun, beatCode: ports.beatDeclaration() } : {}),
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
              career.start();
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
