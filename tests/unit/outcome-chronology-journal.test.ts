import { describe, expect, it } from "vitest";
import { createOutcomeChronologyJournal } from "../../src/gameplay/run/outcome-chronology-journal";

describe("outcome chronology journal", () => {
  it("publishes deeply immutable, monotonic data-only receipts", () => {
    const observed: unknown[] = [];
    const journal = createOutcomeChronologyJournal((entry) => { observed.push(entry); });
    const pattern = [18, 24, 34];

    journal.record({ type: "finale-outward", call: { type: "vibrate", pattern } });
    journal.record({ type: "outcome.stop-clipper" });
    pattern[0] = 99;

    const entries = journal.entries();
    expect(entries.map((entry) => entry.sequence)).toEqual([0, 1]);
    expect(entries[0]).toMatchObject({ effect: { type: "finale-outward", call: { pattern: [18, 24, 34] } } });
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
    expect(Object.isFrozen((entries[0]?.effect as { call: { pattern: readonly number[] } }).call.pattern)).toBe(true);
    expect(observed).toEqual(entries);
  });
});
