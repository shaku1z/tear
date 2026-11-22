/**
 * The replay round trip over the determinism corpus: play each stream headless, record it, write it as
 * JSON, read it back and verify it in the detached world from its seed. Every checkpoint must equal the
 * pinned determinism hash at that tick, and the verdict must be "verified". A record changed in one
 * action, one summary field or its ruleset must not verify; one changed only in its look must.
 *
 * This proves the record and verify on headless runs. A live run starts the same way (PR 5b-1,
 * tests/unit/run-start-parity.test.ts); its reward picks and frame clock are PRs 5b-2 and 5b-3 in
 * plans/active/REPLAY_OVERHAUL_PLAN.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RULESET_STEPS } from "../../src/gameplay/run/ruleset-version";
import { REPLAY_CHECKPOINT_TICKS, readReplayRecord, type ReplayRecord } from "../../src/replay/record";
import { verifyReplay } from "../../src/replay/verify";
import { createDetachedReplayWorld } from "../../src/app/replay/detached-replay-world";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

const DETERMINISM = JSON.parse(readFileSync("tests/fixtures/canonical-hash-stream.json", "utf8")) as {
  readonly sampleEvery: number;
  readonly streams: readonly { readonly id: string; readonly hashes: readonly string[] }[];
};
function readBack(record: ReplayRecord): ReplayRecord {
  const read = readReplayRecord(JSON.parse(JSON.stringify(record)));
  if (!read.ok) throw new Error(`${read.reason}: ${read.detail}`);
  return read.record;
}

const recorded = new Map<string, ReplayRecord>();
const world = createDetachedReplayWorld();

describe("replay round trip over the determinism corpus", () => {
  it.each(SPECS)(
    "$id records, reads back and verifies from its seed",
    (spec) => {
      const record = recordCorpusStream(spec);
      recorded.set(spec.id, record);
      const pinned = DETERMINISM.streams.find((stream) => stream.id === spec.id)?.hashes ?? [];
      const perCheckpoint = REPLAY_CHECKPOINT_TICKS / DETERMINISM.sampleEvery;
      expect(record.run.checkpoints.map((checkpoint) => checkpoint.hash)).toEqual(
        record.run.checkpoints.map((_, index) => pinned[(index + 1) * perCheckpoint - 1]),
      );
      const read = readBack(record);
      expect(read).toEqual(record);
      expect(verifyReplay(read, world)).toEqual({ status: "verified", tick: record.run.result.tick });
    },
    120_000,
  );

  const sample = (): ReplayRecord => {
    const record = recorded.get(SPECS[0]?.id ?? "");
    if (record === undefined) throw new Error("the first corpus stream was not recorded");
    return record;
  };

  it("names the first checkpoint after one changed action", () => {
    const record = sample();
    const index = record.run.actions.findIndex((action) => action.tick > 300 && action.command.type === "move");
    const changed = record.run.actions.map((action, at) =>
      at === index && action.command.type === "move"
        ? { ...action, command: { ...action.command, x: action.command.x === 0 ? 1_000 : -action.command.x } }
        : action,
    );
    const tick = record.run.actions[index]?.tick ?? 0;
    const verdict = verifyReplay(readBack({ ...record, run: { ...record.run, actions: changed } }), world);
    expect(verdict.status).toBe("differs");
    if (verdict.status === "differs") expect(verdict.tick).toBeGreaterThanOrEqual(tick);
  });

  it("refuses a record whose summary was changed", () => {
    const record = sample();
    const verdict = verifyReplay(
      readBack({ ...record, summary: { ...record.summary, score: record.summary.score + 1 } }),
      world,
    );
    expect(verdict).toMatchObject({ status: "differs", what: "summary" });
  });

  it("verifies a record whose look was changed, because the look never reaches the simulation", () => {
    const record = sample();
    const look = {
      playerName: "Someone Else",
      cosmetics: { blade: "ember" },
      music: "night-drive",
      recordedAt: "2030-01-01",
    };
    expect(verifyReplay(readBack({ ...record, look }), world)).toEqual({
      status: "verified",
      tick: record.run.result.tick,
    });
  });

  it("refuses a record from a retired ruleset with the change it missed", () => {
    const record = sample();
    const retired = RULESET_STEPS[0]?.version ?? "";
    const verdict = verifyReplay(readBack({ ...record, run: { ...record.run, ruleset: retired } }), world);
    expect(verdict).toEqual({
      status: "refused",
      message: `This replay was recorded before ${RULESET_STEPS[1]?.change ?? ""}.`,
    });
  });
});
