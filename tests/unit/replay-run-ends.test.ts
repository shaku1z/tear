/**
 * Every way a live run ends leaves a replay record that verifies from its seed.
 *
 * A run ends either inside a tick (a death or a win, in that tick's combat) or between ticks (a quit, a
 * restart, a give-up on the continue screen). The live tap (src/app/replay/live-replay-tap.ts) is driven
 * here the way the live host drives it, over the detached production world: actions are sealed, the tick
 * is simulated, and a run that ends inside it is finished from inside that step, as the live outcome does,
 * before `stepped` reports the tick. Each record must verify, and a death must end on the tick the world
 * ends on, with the defeat.
 *
 * The rule below that lists every place the live game ends a run fails when a new one is added without
 * saying how its replay record ends.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDetachedReplayWorld } from "../../src/app/replay/detached-replay-world";
import { createLiveReplayTap } from "../../src/app/replay/live-replay-tap";
import type { RunStartChoices } from "../../src/gameplay/run/run-start-choices";
import type { TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { readReplayRecord, type ReplayRecord } from "../../src/replay/record";
import { createReplayInputCursor, verifyReplay } from "../../src/replay/verify";
import { SPECS, type StreamSpec } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

const HEADER = Object.freeze({
  build: { version: "0.1.0", revision: "run-ends", target: "test" },
  look: { playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-22T00:00:00Z" },
});

/** How the run in play ends: inside the tick it dies in, or between ticks after a given tick. */
type Ending = Readonly<{ kind: "inside" }> | Readonly<{ kind: "between"; after: number }>;

/** Plays `source`'s run in the detached world as the live host plays it, recording through the live tap. */
function recordLive(source: ReplayRecord, ending: Ending): ReplayRecord {
  const tap = createLiveReplayTap(HEADER);
  const { boss, ...start } = source.run.start;
  const choices: RunStartChoices = { ...start, boss: boss ?? "shuffle", runSeed: source.run.seed };
  tap.runStarted(choices);
  let record: ReplayRecord | null | undefined;
  const done = (finished: ReplayRecord | null) => {
    record = finished;
  };
  const run = { ended: false };
  const world = createDetachedReplayWorld().start(source.run, (event: TearGameplayEvent) => {
    tap.observe(event);
    // The live outcome ends the run from inside the step that kills the player.
    if (event.kind === "run" && (event.transition === "defeated" || event.transition === "completed")) {
      run.ended = true;
      if (ending.kind === "inside") tap.finish(world.run, done);
    }
  });
  const inputs = createReplayInputCursor(source.run);
  try {
    for (let tick = 1; tick <= source.run.result.tick && record === undefined; tick += 1) {
      const next = inputs();
      for (const frame of next.frames) tap.frame(frame.tick, frame.seconds, frame.confirm, true);
      tap.sealed(tick, next.actions);
      const step = world.step(next.actions, next.frames);
      tap.stepped(tick, step.hash);
      if (ending.kind === "between" && (tick === ending.after || run.ended)) tap.finish(world.run, done);
      if (step.terminated) break;
    }
  } finally {
    world.dispose();
  }
  if (record == null) throw new Error("the tap kept no record");
  const read = readReplayRecord(JSON.parse(JSON.stringify(record)));
  if (!read.ok) throw new Error(`${read.reason}: ${read.detail}`);
  return read.record;
}

const deathSpec = (): StreamSpec => {
  const spec = SPECS.find((candidate) => candidate.id === "sword/throw");
  if (spec === undefined) throw new Error("no sword/throw corpus stream");
  // One-Hit: the corpus player dies to the first touch, well inside the horizon.
  return { ...spec, difficulty: "onehit" as StreamSpec["difficulty"], ticks: 3_000 };
};

describe("every way a live run ends verifies", () => {
  const source = recordCorpusStream(deathSpec());
  const world = createDetachedReplayWorld();

  it("has a death to end on", () => {
    expect(source.run.result.outcome).toBe("defeat");
    expect(source.run.result.tick).toBeLessThan(3_000);
  });

  it("a death inside a tick ends on that tick, with the defeat", () => {
    const record = recordLive(source, { kind: "inside" });
    expect(record.run.result).toEqual(source.run.result);
    expect(verifyReplay(record, world)).toEqual({ status: "verified", tick: source.run.result.tick });
  }, 60_000);

  it("a give-up or a countdown that ends on the continue screen, after the death's tick", () => {
    const record = recordLive(source, { kind: "between", after: Number.POSITIVE_INFINITY });
    expect(record.run.result).toEqual(source.run.result);
    expect(verifyReplay(record, world)).toEqual({ status: "verified", tick: source.run.result.tick });
  }, 60_000);

  it("a quit or a restart between ticks ends on the last tick played", () => {
    const after = Math.floor(source.run.result.tick / 2);
    const record = recordLive(source, { kind: "between", after });
    expect(record.run.result).toMatchObject({ tick: after, outcome: "quit" });
    expect(verifyReplay(record, world)).toEqual({ status: "verified", tick: after });
  }, 60_000);
});

/**
 * Every place the live game ends a run, and how that run's replay record ends. `ends` is the call in
 * `file` that ends the record; a row without one says why no record is open there.
 */
const LIVE_RUN_ENDS: readonly Readonly<{ site: string; how: string; file?: string; ends?: string }>[] = [
  {
    site: "src/gameplay/run/live-outcome-controller.ts",
    how: "defeat (a death inside a tick; a give-up or countdown on the continue screen) and victory: the outcome's recording stop",
    file: "src/app/run/outcome-composition.ts",
    ends: "options.replays.runEnded(",
  },
  {
    site: "src/app/run/outcome-composition.ts",
    how: "the outcome controller's terminate port (the row above)",
    file: "src/app/run/outcome-composition.ts",
    ends: "options.replays.runEnded(",
  },
  {
    site: "src/app/run/live-run-abandonment.ts",
    how: "quit: leaving a run for a menu",
    file: "src/app/run/live-run-abandonment.ts",
    ends: "options.replayRunEnded?.(run)",
  },
  {
    site: "src/app/run/run-start-host.ts",
    how: "restart: a new run replaces the run in play",
    file: "src/app/run/run-start-host.ts",
    ends: "context.replayRunReplaced?.(replaced)",
  },
  {
    site: "src/app/run/run-outcome-host.ts",
    how: "a saved finale claimed or resumed: the run was played in an earlier page, so this page has no record open",
  },
  {
    site: "src/app/training/training-host-runtime.ts",
    how: "Tutorial and Playground: never recorded (tests/unit/live-replay-tap.test.ts)",
  },
  {
    site: "src/app/engineering/debug-harness.ts",
    how: "engineering-only forced outcome; not in release builds",
  },
];

const TERMINATES = /(?:lifecycle|#port|context)\.terminate\(/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path.replace(/\\/gu, "/")] : [];
  });
}

describe("the list of every way a live run ends", () => {
  it("names every live site that terminates a run", () => {
    const sites = ["src/app", "src/gameplay"]
      .flatMap(sourceFiles)
      // The detached world is the replay's own host, and the lifecycle is what they call.
      .filter((file) => !file.startsWith("src/app/world/detached/") && file !== "src/gameplay/run/lifecycle.ts")
      .filter((file) => TERMINATES.test(readFileSync(file, "utf8")));
    expect(sites.sort()).toEqual(LIVE_RUN_ENDS.map((row) => row.site).sort());
  });

  it.each(LIVE_RUN_ENDS.filter((row) => row.ends !== undefined))("$site ends its record", (row) => {
    expect(readFileSync(row.file ?? row.site, "utf8")).toContain(row.ends);
  });
});
