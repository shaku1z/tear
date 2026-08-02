import { describe, expect, it, vi } from "vitest";

import { createLiveOutcomeDefeatProgressPersistence } from "../../src/app/live-outcome-defeat-progress-persistence";

describe("live outcome defeat-progress persistence adapter", () => {
  it("records the defeat count before the floored longest-run stat", () => {
    const calls: string[] = [];
    const persistence = createLiveOutcomeDefeatProgressPersistence({
      addStat: vi.fn((key: string, value: number) => { calls.push(`add:${key}:${String(value)}`); }),
      maxStat: vi.fn((key: string, value: number) => { calls.push(`max:${key}:${String(value)}`); }),
    });

    persistence.record({ runTime: 19.8 });

    expect(calls).toEqual(["add:runs:1", "max:longestRun:19"]);
    expect(Object.isFrozen(persistence)).toBe(true);
  });
});
