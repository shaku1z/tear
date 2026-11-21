import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  EARLIER_VERSION_MESSAGE,
  MALFORMED_MESSAGE,
  REPLAY_CHECKPOINT_TICKS,
  REPLAY_FORMAT,
  REPLAY_VERSION,
  readReplayRecord,
} from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";

const HASH = "0123456789abcdef";
/** A new player's saved progress and settings. */
const NEW_PLAYER = Object.freeze({
  metaRanks: {},
  variantDiscovery: [],
  achievementSnapshot: [],
  restoredTrail: false,
  cinematics: "full" as const,
  playedChapters: [],
});

function validRecord() {
  const recorder = createReplayRecorder({
    ruleset: "rules",
    build: { version: "0.1.0", revision: "abc", target: "test" },
    seed: 12345,
    start: { mode: "endless", difficulty: "easy", weapon: "sword", ...NEW_PLAYER },
    look: { playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21" },
  });
  for (let tick = 1; tick <= REPLAY_CHECKPOINT_TICKS * 2 + 5; tick += 1)
    recorder.step(
      tick,
      tick === 3 ? [{ kind: "command", id: 1, tick, command: { type: "jump", phase: "pressed" } }] : [],
      () => HASH,
    );
  recorder.observe({ kind: "death", tick: 40, actorId: "e1", cause: "combat" });
  recorder.observe({ kind: "wave", tick: 2, wave: 1, event: "start" });
  return recorder.finish({ tick: REPLAY_CHECKPOINT_TICKS * 2 + 5, hash: HASH, run: { score: 10, wave: 1, time: 2 } });
}

describe("the replay record", () => {
  it("round-trips a recorded run through JSON unchanged", () => {
    const record = validRecord();
    expect(record).toMatchObject({ format: REPLAY_FORMAT, version: REPLAY_VERSION });
    expect(record.run.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([120, 240]);
    expect(record.summary).toEqual({
      score: 10,
      wave: 1,
      time: 2,
      kills: 1,
      marks: [{ tick: 2, kind: "wave", value: 1 }],
    });
    expect(readReplayRecord(JSON.parse(JSON.stringify(record)))).toEqual({ ok: true, record });
  });

  it("refuses earlier formats as an earlier version, without throwing", () => {
    for (const old of [
      { format: "tearghost-capsule", schemaVersion: 2 },
      { format: "tearghost-linked-archive" },
      { format: REPLAY_FORMAT, schemaVersion: 2, run: {} },
      { format: REPLAY_FORMAT, version: 2 },
    ])
      expect(readReplayRecord(old)).toMatchObject({
        ok: false,
        reason: "earlier-version",
        message: EARLIER_VERSION_MESSAGE,
      });
  });

  it("refuses damaged data with one plain message, without throwing", () => {
    const record = validRecord();
    const damaged: unknown[] = [
      null,
      "tear-replay",
      [],
      {},
      { ...record, run: undefined },
      { ...record, run: { ...record.run, seed: "" } },
      { ...record, run: { ...record.run, seed: "12345" } },
      { ...record, run: { ...record.run, seed: 0 } },
      { ...record, run: { ...record.run, seed: 2 ** 32 } },
      { ...record, run: { ...record.run, seed: 1.5 } },
      { ...record, run: { ...record.run, start: { ...record.run.start, mode: "tutorial" } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, mode: "playground" } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, metaRanks: { tough: -1 } } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, variantDiscovery: [1] } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, restoredTrail: "yes" } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, cinematics: "loud" } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, playedChapters: [2, 1] } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, achievementSnapshot: undefined } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, weapon: "spoon" } } },
      { ...record, run: { ...record.run, start: { ...record.run.start, mode: "waves" } } },
      { ...record, run: { ...record.run, checkpoints: record.run.checkpoints.slice(1) } },
      { ...record, run: { ...record.run, result: { ...record.run.result, hash: "not-a-hash" } } },
      { ...record, run: { ...record.run, result: { ...record.run.result, outcome: "draw" } } },
      {
        ...record,
        run: {
          ...record.run,
          actions: [{ kind: "command", id: 1, tick: 9_999, command: { type: "jump", phase: "pressed" } }],
        },
      },
      {
        ...record,
        run: { ...record.run, actions: [{ kind: "command", id: 1, tick: 3, command: { type: "teleport" } }] },
      },
      {
        ...record,
        run: {
          ...record.run,
          actions: [
            { kind: "command", id: 2, tick: 3, command: { type: "jump", phase: "pressed" } },
            { kind: "command", id: 1, tick: 4, command: { type: "jump", phase: "released" } },
          ],
        },
      },
      { ...record, summary: { ...record.summary, kills: -1 } },
      { ...record, look: { ...record.look, playerName: "x".repeat(65) } },
    ];
    for (const [index, value] of damaged.entries())
      expect(readReplayRecord(value), `damaged case ${String(index)}`).toMatchObject({
        ok: false,
        reason: "malformed",
        message: MALFORMED_MESSAGE,
      });
  });

  it("admits a Boss Test run on a released boss and refuses one on an engineering-only boss", () => {
    const record = validRecord();
    const onBoss = (boss: string) => ({
      ...record,
      run: { ...record.run, start: { ...record.run.start, mode: "bossonly", boss } },
    });
    expect(readReplayRecord(onBoss("warden"))).toMatchObject({ ok: true });
    expect(readReplayRecord(onBoss("rootbound-rebuild"))).toMatchObject({
      ok: false,
      reason: "malformed",
      message: MALFORMED_MESSAGE,
    });
  });

  it("refuses to record actions out of tick or number order", () => {
    const recorder = createReplayRecorder({
      ruleset: "rules",
      build: { version: "0.1.0", revision: "abc", target: "test" },
      seed: 12345,
      start: { mode: "endless", difficulty: "easy", weapon: "sword", ...NEW_PLAYER },
      look: { playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21" },
    });
    expect(() => {
      recorder.step(2, [], () => HASH);
    }).toThrow(RangeError);
    recorder.step(1, [{ kind: "command", id: 4, tick: 1, command: { type: "jump", phase: "pressed" } }], () => HASH);
    expect(() => {
      recorder.step(2, [{ kind: "command", id: 4, tick: 2, command: { type: "jump", phase: "released" } }], () => HASH);
    }).toThrow(RangeError);
  });
});

/**
 * One record format: only src/replay/record.ts names the `tear-replay` format. The Ghost V3 files below
 * still name their own `tearghost-*` formats; each leaves with its module (PRs 6 to 9), and this list
 * only shrinks. A new file that names a replay format fails here.
 */
const GHOST_V3_FORMAT_FILES = Object.freeze([
  "src/app/replay/browser-ghost-career.ts",
  "src/app/replay/browser-replay-clip-export.ts",
  "src/app/replay/ghost-frame-recording.ts",
  "src/ghost/application-frame-events.ts",
  "src/ghost/authoritative-receipt.ts",
  "src/ghost/capsule-contract.ts",
  "src/ghost/capsule-paired-archive.ts",
  "src/ghost/career-archive.ts",
  "src/ghost/fork-origin.ts",
  "src/ghost/production-replay-verification.ts",
  "src/ghost/run-dna-theater.ts",
]);

describe("one replay format", () => {
  /** The tracked src TypeScript files other than record.ts that hold `pattern`, by one native git grep. */
  const naming = (pattern: string): string[] => {
    try {
      return execFileSync("git", ["grep", "-l", "-E", pattern, "--", ":(glob)src/**/*.ts"], { encoding: "utf8" })
        .split("\n")
        .filter((path) => path !== "" && path !== "src/replay/record.ts");
    } catch (error) {
      // git grep exits 1 when nothing matches; anything else is a real failure.
      if ((error as { status?: number }).status === 1) return [];
      throw error;
    }
  };

  it("is named only by src/replay/record.ts", () => {
    expect(naming("[\"'`]tear-replay[\"'`]")).toEqual([]);
  });

  it("leaves the Ghost V3 format names only in modules that are still to be replaced", () => {
    expect(naming("[\"'`]tearghost-[a-z-]+[\"'`]").sort()).toEqual([...GHOST_V3_FORMAT_FILES]);
  });
});
