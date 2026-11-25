/**
 * The one REPLAYS list (src/app/replay/replay-list.ts): one row per kept record, newest first; BESTS is the
 * best playable run of each mode and difficulty; PINNED is the pinned rows. The property test holds those
 * rules over generated lists.
 */
import { describe, expect, it } from "vitest";

import { replayList } from "../../src/app/replay/replay-list";
import type { ReplayRecordEntry } from "../../src/replay/record-store";
import { checkProperty, fc } from "./property-harness";

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

describe("the REPLAYS list", () => {
  it("lists each kept record once and marks a shared one", () => {
    const items = replayList(
      [record("kept", 7, 2_000, 50, { shareId: "share-1" }), record("alone", 9, 500, 1)],
      "all",
      playable,
    );
    expect(items.map((item) => [item.id, item.shared, item.playable])).toEqual([
      ["kept", true, true],
      ["alone", false, true],
    ]);
  });

  it("does not play a record whose ruleset is retired or whose row could not be read, and leaves it out of BESTS", () => {
    const retired = record("retired", 1, 3_000, 999);
    const items = replayList(
      [
        { ...retired, row: { ...retired.row, ruleset: "old" } },
        { key: "unread", bytes: 1, recordedAt: new Date(2_000).toISOString(), pinned: false },
        record("fine", 2, 1_000, 5),
      ],
      "all",
      playable,
    );
    expect(items.map((item) => [item.id, item.playable, item.best])).toEqual([
      ["retired", false, false],
      ["unread", false, false],
      ["fine", true, true],
    ]);
  });

  const generated = fc.uniqueArray(
    fc.record({
      seed: fc.integer({ min: 0, max: 12 }),
      at: fc.integer({ min: 0, max: 1_000_000 }),
      score: fc.integer({ min: 0, max: 100 }),
      mode: fc.constantFrom("endless", "campaign"),
      pinned: fc.boolean(),
      retired: fc.boolean(),
    }),
    { selector: (entry) => entry.seed, maxLength: 8 },
  );

  it("holds its rules for any list of kept records", () => {
    checkProperty(
      fc.property(generated, (records) => {
        const entries = records.map((entry, index) => {
          const base = record(`r${String(index)}`, entry.seed, entry.at, entry.score, { pinned: entry.pinned });
          return { ...base, row: { ...base.row, mode: entry.mode, ruleset: entry.retired ? "old" : "today" } };
        });
        const all = replayList(entries, "all", playable);
        // One row per record.
        expect(all.length).toBe(records.length);
        expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
        // Newest first.
        all.slice(1).forEach((item, index) => {
          expect(all[index]?.recordedAt ?? 0).toBeGreaterThanOrEqual(item.recordedAt);
        });
        // BESTS: at most one per mode and difficulty, playable, and no playable row in its group scores higher.
        const bests = replayList(entries, "bests", playable);
        const groups = bests.map((item) => `${item.mode ?? ""}:${item.difficulty ?? ""}`);
        expect(new Set(groups).size).toBe(groups.length);
        for (const best of bests) {
          expect(best.playable).toBe(true);
          for (const item of all)
            if (item.playable && item.mode === best.mode && item.difficulty === best.difficulty)
              expect(item.score ?? 0).toBeLessThanOrEqual(best.score ?? 0);
        }
        // PINNED: exactly the pinned rows.
        expect(replayList(entries, "pinned", playable).map((item) => item.id)).toEqual(
          all.filter((item) => item.pinned).map((item) => item.id),
        );
      }),
    );
  });
});
