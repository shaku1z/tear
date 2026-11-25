import { describe, expect, it } from "vitest";

import { createLiveWorldSessionState } from "../../src/app/world/world-session-state";

describe("live world session state", () => {
  it("owns setup selection independently from individual worlds", () => {
    const first = createLiveWorldSessionState();
    const second = createLiveWorldSessionState();

    first.setSelectedMode("campaign");
    first.setSelectedDifficulty("hard");
    first.setSelectedWeapon("hammer");
    first.setSelectedBoss("source");

    expect(first.selection()).toEqual({ mode: "campaign", difficulty: "hard", weapon: "hammer", boss: "source" });
    expect(second.selection()).toEqual({ mode: "endless", difficulty: "normal", weapon: "sword", boss: "shuffle" });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selection())).toBe(true);
  });

  it("retains world-crossing outcome, kept replay and victory-clock state", () => {
    const session = createLiveWorldSessionState();
    const outcome = { score: 27 } as never;
    const replay = { key: "replay:27", record: {} } as never;

    session.setOutcome(outcome);
    session.setLastReplay(replay);
    session.setWinSeconds(4.5);

    expect(session.outcome()).toBe(outcome);
    expect(session.lastReplay()).toBe(replay);
    expect(session.winSeconds()).toBe(4.5);
  });

  it("consumes each TearBench requested run seed exactly once", () => {
    const session = createLiveWorldSessionState();

    session.setRunSeed(2701);

    expect(session.takeRunSeed()).toBe(2701);
    expect(session.takeRunSeed()).toBeNull();
  });
});
