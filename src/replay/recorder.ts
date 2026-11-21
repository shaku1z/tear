/**
 * Builds a replay record while a run plays. The host calls `step` once per simulation tick with the
 * actions applied at that tick, `frame` for each application frame that starts while a scene is active
 * (the record's named frame-clock exception, ReplayFrame), `observe` with each gameplay event, and
 * `finish` when the run ends.
 * The state hash is asked for only at checkpoint ticks, so recording costs one hash per second.
 */
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import {
  REPLAY_CHECKPOINT_TICKS,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  createReplaySummaryCounter,
  type ReplayAction,
  type ReplayCheckpoint,
  type ReplayFrame,
  type ReplayFrameConfirm,
  type ReplayLook,
  type ReplayRecord,
  type ReplayRun,
} from "./record";

export type ReplayRecorderHeader = Pick<ReplayRun, "ruleset" | "build" | "seed" | "start"> &
  Readonly<{ look: ReplayLook }>;

export interface ReplayRunEnd {
  readonly tick: number;
  readonly hash: string;
  readonly run: Readonly<{ score: number; wave: number; time: number }>;
}

export interface ReplayRecorder {
  /** One simulation tick: the actions applied at `tick`, and its state hash on demand. */
  readonly step: (tick: number, actions: readonly ReplayAction[], hash: () => string) => void;
  /** An application frame that started during a scene, after `tick` (the last stepped tick, 0 before any). */
  readonly frame: (tick: number, seconds: number, confirm: ReplayFrameConfirm) => void;
  readonly observe: (event: TearGameplayEvent) => void;
  readonly finish: (end: ReplayRunEnd) => ReplayRecord;
}

export function createReplayRecorder(header: ReplayRecorderHeader): ReplayRecorder {
  const actions: ReplayAction[] = [];
  const checkpoints: ReplayCheckpoint[] = [];
  const frames: ReplayFrame[] = [];
  const counter = createReplaySummaryCounter();
  let lastTick = 0;
  let lastId = 0;
  let finished = false;
  return Object.freeze({
    step(tick: number, applied: readonly ReplayAction[], hash: () => string): void {
      if (finished) throw new Error("replay recorder already finished");
      if (tick !== lastTick + 1) throw new RangeError(`replay recorder expected tick ${String(lastTick + 1)}`);
      for (const action of applied) {
        if (action.tick !== tick || action.id <= lastId)
          throw new RangeError("replay actions must belong to their tick and be numbered in order");
        lastId = action.id;
        actions.push(action);
      }
      lastTick = tick;
      if (tick % REPLAY_CHECKPOINT_TICKS === 0) checkpoints.push(Object.freeze({ tick, hash: hash() }));
    },
    frame(tick: number, seconds: number, confirm: ReplayFrameConfirm): void {
      if (finished) throw new Error("replay recorder already finished");
      if (tick !== lastTick) throw new RangeError(`replay frame expected after tick ${String(lastTick)}`);
      frames.push(Object.freeze({ tick, seconds, confirm: Object.freeze({ ...confirm }) }));
    },
    observe: counter.observe,
    finish(end: ReplayRunEnd): ReplayRecord {
      if (finished) throw new Error("replay recorder already finished");
      if (end.tick !== lastTick) throw new RangeError("a replay ends at the last recorded tick");
      finished = true;
      return Object.freeze({
        format: REPLAY_FORMAT,
        version: REPLAY_VERSION,
        run: Object.freeze({
          ruleset: header.ruleset,
          build: header.build,
          seed: header.seed,
          start: header.start,
          actions: Object.freeze(actions),
          // A frame after the last tick cannot change the result.
          frames: Object.freeze(frames.filter((frame) => frame.tick < end.tick)),
          checkpoints: Object.freeze(checkpoints),
          result: Object.freeze({ tick: end.tick, hash: end.hash, outcome: counter.outcome() }),
        }),
        summary: counter.summary(end.run),
        look: header.look,
      });
    },
  });
}
