/**
 * Quitting a run (src/app/run/live-run-abandonment.ts) is one of a run's real ends: it ends the run's
 * replay record once, and a run that has already ended is not ended again.
 */
import { describe, expect, it } from "vitest";

import { createLiveRunAbandonment } from "../../src/app/run/live-run-abandonment";

function harness(phase: "playing" | "terminated") {
  const ended: unknown[] = [];
  const order: string[] = [];
  const run = { mode: "campaign", diff: "easy", weaponId: "sword", wave: 4, score: 900, runTime: 75 };
  const abandonment = createLiveRunAbandonment({
    world: {
      state: { enemies: () => [] },
      lifecycle: {
        snapshot: () => ({ sessionId: "run-1", phase }),
        terminate: () => {
          order.push("terminated");
        },
      },
      environment: { clear: () => undefined },
    },
    events: { emit: () => undefined },
    ghost: {
      recording: () => true,
      stopRec: () => {
        order.push("ghost2-closed");
        return null;
      },
    },
    input: { stopSemanticRecording: () => undefined },
    run: () => run,
    replayRunEnded: (value: unknown) => {
      order.push("replay-ended");
      ended.push(value);
    },
  } as never);
  return { abandonment, ended, order, run };
}

describe("quitting a run", () => {
  it("ends the run's replay record once, after the lifecycle ends", () => {
    const { abandonment, ended, order, run } = harness("playing");
    abandonment.abandon("menu");
    expect(ended).toEqual([run]);
    expect(order).toEqual(["terminated", "replay-ended", "ghost2-closed"]);
  });

  it("does not end the record of a run that has already ended", () => {
    const { abandonment, ended } = harness("terminated");
    abandonment.abandon("menu");
    expect(ended).toEqual([]);
  });
});
