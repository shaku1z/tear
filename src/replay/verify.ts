/**
 * Re-simulates a record and compares every checkpoint, the result and the summary. It names the first
 * tick that differs.
 *
 * What a "verified" verdict proves: the detached world, started from the record's seed and start
 * choices and given its actions at their ticks, reaches the same state hashes again.
 *
 * Live play and the detached world start a run through one run start, so a record's seed and start
 * choices give the same opening world. Until the rest of replay PR 5b, a record from live play is still
 * not guaranteed to verify: its reward picks are UI calls, not actions, and the cinema frame clock
 * differs. The detached world also carries one frame-clock exception (src/app/world/detached/
 * detached-step.ts): while a boss intro or a cinematic holds the fight, each tick first runs one
 * application frame of one tick's length with no confirm press.
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
  readonly step: (actions: readonly ReplayAction[]) => ReplayWorldTick;
  /** The run's score, wave and clock now. */
  readonly run: () => Readonly<{ score: number; wave: number; time: number }>;
  readonly dispose: () => void;
}

export interface ReplayWorld {
  /** Starts the recorded run from its seed and start choices; `observe` receives its gameplay events. */
  readonly start: (run: ReplayRun, observe: (event: TearGameplayEvent) => void) => ReplayWorldRun;
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

export function verifyReplay(record: ReplayRecord, world: ReplayWorld): ReplayVerdict {
  const refusal = replayPlaybackRefusal(record.run);
  if (refusal !== null) return Object.freeze({ status: "refused", message: refusal });
  const { actions, checkpoints, result } = record.run;
  const counter = createReplaySummaryCounter();
  const run = world.start(record.run, counter.observe);
  try {
    let next = 0;
    let last: ReplayWorldTick | undefined;
    for (let tick = 1; tick <= result.tick; tick += 1) {
      const start = next;
      while (next < actions.length && actions[next]?.tick === tick) next += 1;
      last = run.step(actions.slice(start, next));
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
