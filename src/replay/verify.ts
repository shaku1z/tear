/**
 * Re-simulates a record and compares every checkpoint, the result and the summary. It names the first
 * tick that differs.
 *
 * What a "verified" verdict proves: the detached world, started from the record's seed and start
 * choices and given its actions at their ticks, reaches the same state hashes again.
 *
 * Live play and the detached world start a run through one run start, so a record's seed and start
 * choices give the same opening world; reward picks are actions, and the scene frames the record holds
 * (ReplayFrame, its one frame clock) are played before the tick after them. Verify plays only what the
 * record holds: it never makes up a frame.
 *
 * The world is a port: the app builds the detached production world behind it
 * (src/app/replay/detached-replay-world.ts), and verify sees only `ReplayRecord["run"]` through it, so
 * names, cosmetics and music cannot reach the simulation.
 */
import { stableVerificationHash } from "../domain/hash";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import {
  REPLAY_CHECKPOINT_TICKS,
  createReplaySummaryCounter,
  replayPlaybackRefusal,
  type ReplayAction,
  type ReplayFrame,
  type ReplayRecord,
  type ReplayRun,
  type ReplaySummary,
} from "./record";

export interface ReplayWorldTick {
  readonly tick: number;
  readonly hash: () => string;
  readonly terminated: boolean;
}

/** A run being re-simulated, one tick per `step`. */
export interface ReplayWorldRun {
  /** One tick: the scene frames recorded before it, in order, then the tick with its actions. */
  readonly step: (actions: readonly ReplayAction[], frames: readonly ReplayFrame[]) => ReplayWorldTick;
  /** The run's score, wave and clock now. */
  readonly run: () => Readonly<{ score: number; wave: number; time: number }>;
  readonly dispose: () => void;
}

export interface ReplayWorld {
  /** Starts the recorded run from its seed and start choices; `observe` receives its gameplay events. */
  readonly start: (
    run: Pick<ReplayRun, "seed" | "start">,
    observe: (event: TearGameplayEvent) => void,
  ) => ReplayWorldRun;
}

export type ReplayVerdict =
  | Readonly<{ status: "verified"; tick: number }>
  | Readonly<{ status: "refused"; message: string }>
  | Readonly<{
      status: "differs";
      /** The first tick whose state differs from the recording. */
      tick: number;
      what: "checkpoint" | "result" | "summary" | "ended-early";
      expected: string;
      actual: string;
    }>;

function differs(
  tick: number,
  what: "checkpoint" | "result" | "summary" | "ended-early",
  expected: string,
  actual: string,
): ReplayVerdict {
  return Object.freeze({ status: "differs", tick, what, expected, actual });
}

function summaryText(summary: ReplaySummary): string {
  return stableVerificationHash(summary);
}

/** One tick's inputs: the scene frames recorded before it, in order, then the tick's actions. */
export interface ReplayTickInputs {
  readonly tick: number;
  readonly actions: readonly ReplayAction[];
  readonly frames: readonly ReplayFrame[];
}

/**
 * The record's inputs tick by tick from tick `after + 1` (tick 1 by default), in the order verify and
 * watch both play them: the frames sampled after tick N - 1 go before tick N. Watch starts one after a
 * checkpoint it restored.
 */
export function createReplayInputCursor(run: Pick<ReplayRun, "actions" | "frames">, after = 0): () => ReplayTickInputs {
  const { actions, frames } = run;
  let tick = after;
  let next = 0;
  let nextFrame = 0;
  while (next < actions.length && (actions[next]?.tick ?? 0) <= after) next += 1;
  while (nextFrame < frames.length && (frames[nextFrame]?.tick ?? 0) < after) nextFrame += 1;
  return () => {
    tick += 1;
    const start = next;
    while (next < actions.length && actions[next]?.tick === tick) next += 1;
    const firstFrame = nextFrame;
    while (nextFrame < frames.length && frames[nextFrame]?.tick === tick - 1) nextFrame += 1;
    return Object.freeze({ tick, actions: actions.slice(start, next), frames: frames.slice(firstFrame, nextFrame) });
  };
}

export function verifyReplay(record: ReplayRecord, world: ReplayWorld): ReplayVerdict {
  const refusal = replayPlaybackRefusal(record.run);
  if (refusal !== null) return Object.freeze({ status: "refused", message: refusal });
  const { checkpoints, result } = record.run;
  const counter = createReplaySummaryCounter();
  const run = world.start(record.run, counter.observe);
  const inputs = createReplayInputCursor(record.run);
  try {
    let last: ReplayWorldTick | undefined;
    for (let tick = 1; tick <= result.tick; tick += 1) {
      const { actions, frames } = inputs();
      last = run.step(actions, frames);
      if (last.tick !== tick) return differs(tick, "ended-early", String(tick), String(last.tick));
      if (tick % REPLAY_CHECKPOINT_TICKS === 0) {
        const expected = checkpoints[tick / REPLAY_CHECKPOINT_TICKS - 1]?.hash ?? "";
        const actual = last.hash();
        if (actual !== expected) return differs(tick, "checkpoint", expected, actual);
      }
      if (last.terminated && tick < result.tick)
        return differs(tick, "ended-early", `run ends at ${String(result.tick)}`, `run ended at ${String(tick)}`);
    }
    const actual = last?.hash() ?? "";
    if (actual !== result.hash) return differs(result.tick, "result", result.hash, actual);
    if (counter.outcome() !== result.outcome) return differs(result.tick, "result", result.outcome, counter.outcome());
    const derived = counter.summary(run.run());
    if (summaryText(derived) !== summaryText(record.summary))
      return differs(result.tick, "summary", JSON.stringify(record.summary), JSON.stringify(derived));
    return Object.freeze({ status: "verified", tick: result.tick });
  } finally {
    run.dispose();
  }
}
