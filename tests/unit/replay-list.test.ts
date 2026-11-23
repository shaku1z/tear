/**
 * The one REPLAYS list (src/app/replay/replay-list.ts): kept records and older recordings make one row
 * per run, newest first; BESTS is the best playable run of each mode and difficulty; PINNED is the pinned
 * rows. The property test holds those rules over generated lists.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { replayList, type OlderRecording } from "../../src/app/replay/replay-list";
import type { ReplayRecordEntry } from "../../src/replay/record-store";

const playable = (ruleset: string) => ruleset === "today";
const record = (
  key: string,
  seed: number,
  recordedAt: number,
  score: number,
  extra: Partial<ReplayRecordEntry> = {},
): ReplayRecordEntry & Required<Pick<ReplayRecordEntry, "row">> => ({
  key,
  bytes: 1,
  recordedAt: new Date(recordedAt).toISOString(),
  pinned: false,
  row: {
    seed,
    ruleset: "today",
    mode: "endless",
    difficulty: "normal",
    weapon: "sword",
    stage: 0,
    score,
    wave: 1,
    time: 10,
    outcome: "defeat",
  },
  ...extra,
});
const older = (id: string, recordedAt: number, extra: Partial<OlderRecording> = {}): OlderRecording => ({
  id,
  recordedAt,
  pinned: false,
  shared: false,
  mode: "endless",
  difficulty: "normal",
  score: 1,
  ...extra,
});

describe("the REPLAYS list", () => {
  it("lists a run once: a record with an older copy keeps the copy's id, share state and thumbnail", () => {
    const items = replayList(
      [record("kept", 7, 2_000, 50)],
      [older("copy", 1_000, { seed: 7, shared: true, thumb: "t" }), older("alone", 500, { seed: 9 })],
      "all",
      playable,
    );
    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ["kept", "record"],
      ["alone", "older"],
    ]);
    expect(items[0]).toMatchObject({ olderId: "copy", shared: true, thumb: "t", playable: true });
  });

  it("does not play a record whose ruleset is retired or whose row could not be read, and leaves it out of BESTS", () => {
    const retired = record("retired", 1, 3_000, 999);
    const items = replayList(
      [
        { ...retired, row: { ...retired.row, ruleset: "old" } },
        { key: "unread", bytes: 1, recordedAt: new Date(2_000).toISOString(), pinned: false },
        record("fine", 2, 1_000, 5),
      ],
      [],
      "all",
      playable,
    );
    expect(items.map((item) => [item.id, item.playable, item.best])).toEqual([
      ["retired", false, false],
      ["unread", false, false],
      ["fine", true, true],
    ]);
  });

  const generated = fc.record({
    records: fc.uniqueArray(
      fc.record({
        seed: fc.integer({ min: 0, max: 12 }),
        at: fc.integer({ min: 0, max: 1_000_000 }),
        score: fc.integer({ min: 0, max: 100 }),
        mode: fc.constantFrom("endless", "campaign"),
        pinned: fc.boolean(),
        retired: fc.boolean(),
      }),
      { selector: (entry) => entry.seed, maxLength: 8 },
    ),
    older: fc.array(
      fc.record({
        seed: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }),
        at: fc.integer({ min: 0, max: 1_000_000 }),
        score: fc.integer({ min: 0, max: 100 }),
        mode: fc.constantFrom("endless", "campaign"),
        pinned: fc.boolean(),
      }),
      { maxLength: 8 },
    ),
  });

  it("holds its rules for any mix of records and older recordings", () => {
    fc.assert(
      fc.property(generated, ({ records, older: olderRuns }) => {
        const entries = records.map((entry, index) => {
          const base = record(`r${String(index)}`, entry.seed, entry.at, entry.score, { pinned: entry.pinned });
          return { ...base, row: { ...base.row, mode: entry.mode, ruleset: entry.retired ? "old" : "today" } };
        });
        const olderList = olderRuns.map((entry, index) =>
          older(`o${String(index)}`, entry.at, {
            ...(entry.seed === undefined ? {} : { seed: entry.seed }),
            score: entry.score,
            mode: entry.mode,
            pinned: entry.pinned,
          }),
        );
        const all = replayList(entries, olderList, "all", playable);
        // One row per record, plus every older recording whose seed no record has.
        const recordSeeds = new Set(records.map((entry) => entry.seed));
        const kept = olderRuns.filter((entry) => entry.seed === undefined || !recordSeeds.has(entry.seed));
        expect(all.length).toBe(records.length + kept.length);
        expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
        // Newest first.
        all.slice(1).forEach((item, index) => {
          expect(all[index]?.recordedAt ?? 0).toBeGreaterThanOrEqual(item.recordedAt);
        });
        // BESTS: at most one per mode and difficulty, playable, and no playable row in its group scores higher.
        const bests = replayList(entries, olderList, "bests", playable);
        const groups = bests.map((item) => `${item.mode ?? ""}:${item.difficulty ?? ""}`);
        expect(new Set(groups).size).toBe(groups.length);
        for (const best of bests) {
          expect(best.playable).toBe(true);
          for (const item of all)
            if (item.playable && item.mode === best.mode && item.difficulty === best.difficulty)
              expect(item.score ?? 0).toBeLessThanOrEqual(best.score ?? 0);
        }
        // PINNED: exactly the pinned rows.
        expect(replayList(entries, olderList, "pinned", playable).map((item) => item.id)).toEqual(
          all.filter((item) => item.pinned).map((item) => item.id),
        );
      }),
      { seed: 2026_11_23, numRuns: 300 },
    );
  });
});
