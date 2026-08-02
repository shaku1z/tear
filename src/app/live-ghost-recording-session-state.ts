import {
  createBrowserGhostLiveRecorder,
  type BrowserGhostLiveRecorderOptions,
  type GhostLiveRecorder,
} from "../ghost/live-recorder";
import type { GhostReplayRunContextV1 } from "../ghost/replay-admission";

/** Owns the live Ghost V3 sidecar's recorder-session identity and sequencing. */
export interface LiveGhostRecordingSessionState {
  readonly recorder: () => GhostLiveRecorder | null;
  readonly reset: () => void;
  readonly nextEventSequence: () => number;
  readonly replayContext: () => GhostReplayRunContextV1 | undefined;
  readonly setReplayContext: (value: GhostReplayRunContextV1 | undefined) => void;
}

export function createLiveGhostRecordingSessionState(
  factory: IDBFactory | undefined,
  options: BrowserGhostLiveRecorderOptions = {},
): LiveGhostRecordingSessionState {
  const recorder = createBrowserGhostLiveRecorder(factory, options);
  let eventSequence = 0;
  let replayContext: GhostReplayRunContextV1 | undefined;
  return Object.freeze({
    recorder: () => recorder,
    reset: () => { eventSequence = 0; replayContext = undefined; },
    nextEventSequence: () => ++eventSequence,
    replayContext: () => replayContext,
    setReplayContext: (value) => { replayContext = value; },
  } satisfies LiveGhostRecordingSessionState);
}
