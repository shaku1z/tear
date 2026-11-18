import { describe, expect, it } from "vitest";
import { progressFacts, snapshotProgress, type ProgressSource } from "../../src/domain/progress-facts";
import {
  conditionFrom,
  conditionMet,
  conditionProblems,
  conditionProgress,
  type UnlockCondition,
} from "../../src/domain/unlock-condition";

const profile = (stats: Record<string, unknown>, ach: Record<string, unknown> = {}): ProgressSource => ({ stats, ach });
const parsed = (value: unknown): UnlockCondition => {
  const condition = conditionFrom(value);
  if (condition === null) throw new Error("expected a valid condition");
  return condition;
};

describe("reading a condition", () => {
  it("accepts every kind, including profile names with spaces and colons", () => {
    for (const value of [
      { type: "default" },
      { type: "boss-defeat", bossId: "rootbound" },
      { type: "biome-enter", biome: "The Verdant Sanctum" },
      { type: "stat-threshold", stat: "encounterEnemy:charger", goal: 3 },
      { type: "achievement", id: "first_boss" },
      { type: "all", of: [{ type: "default" }, { type: "boss-defeat", bossId: "echo" }] },
    ]) {
      expect(conditionProblems(value, "x")).toEqual([]);
      expect(conditionFrom(value)).toEqual(value);
    }
  });

  it("rejects what it cannot read, with a reason, and never yields a condition", () => {
    const bad: unknown[] = [
      null,
      "default",
      {},
      { type: "nope" },
      { type: "boss-defeat" },
      { type: "boss-defeat", bossId: "<script>" },
      { type: "stat-threshold", stat: "kills", goal: 0 },
      { type: "stat-threshold", stat: "kills", goal: Number.NaN },
      { type: "all", of: [] },
      { type: "all", of: [{ type: "nope" }] },
      { type: "all", of: [{ type: "all", of: [{ type: "all", of: [{ type: "all", of: [{ type: "default" }] }] }] }] },
    ];
    for (const value of bad) {
      expect(conditionProblems(value, "x"), JSON.stringify(value)).not.toEqual([]);
      expect(conditionFrom(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("builds a fresh object, so extra fields on the input never travel with it", () => {
    expect(parsed({ type: "boss-defeat", bossId: "echo", extra: "x" })).toEqual({
      type: "boss-defeat",
      bossId: "echo",
    });
  });
});

describe("what the profile answers", () => {
  const facts = progressFacts(
    profile(
      { killRootbound: 2, kills: 40, _biomes: { "The Grounds": 1 }, odd: "x", nan: Number.NaN },
      { first_boss: 5 },
    ),
  );

  it("counts a boss as defeated by its kill stat", () => {
    expect(facts.bossDefeated("rootbound")).toBe(true);
    expect(facts.bossDefeated("echo")).toBe(false);
  });
  it("reads biomes, stats and achievements, and treats junk as zero", () => {
    expect(facts.biomeEntered("The Grounds")).toBe(true);
    expect(facts.biomeEntered("The Undercroft")).toBe(false);
    expect(facts.stat("kills")).toBe(40);
    expect(facts.stat("odd")).toBe(0);
    expect(facts.stat("nan")).toBe(0);
    expect(facts.stat("missing")).toBe(0);
    expect(facts.achievementUnlocked("first_boss")).toBe(true);
    expect(facts.achievementUnlocked("other")).toBe(false);
  });
  it("answers from a profile with no biome record or a malformed one", () => {
    expect(progressFacts(profile({})).biomeEntered("The Grounds")).toBe(false);
    expect(progressFacts(profile({ _biomes: "yes" })).biomeEntered("The Grounds")).toBe(false);
  });
  it("follows later changes to the live profile", () => {
    const stats: Record<string, unknown> = {};
    const liveFacts = progressFacts({ stats, ach: {} });
    expect(liveFacts.stat("kills")).toBe(0);
    stats.kills = 7;
    expect(liveFacts.stat("kills")).toBe(7);
  });
});

describe("meeting a condition", () => {
  const facts = progressFacts(
    profile({ killRootbound: 1, kills: 40, _biomes: { "The Grounds": 1 } }, { first_boss: 1 }),
  );
  it("evaluates each kind against the facts", () => {
    expect(conditionMet(parsed({ type: "default" }), facts)).toBe(true);
    expect(conditionMet(parsed({ type: "boss-defeat", bossId: "rootbound" }), facts)).toBe(true);
    expect(conditionMet(parsed({ type: "boss-defeat", bossId: "echo" }), facts)).toBe(false);
    expect(conditionMet(parsed({ type: "biome-enter", biome: "The Grounds" }), facts)).toBe(true);
    expect(conditionMet(parsed({ type: "stat-threshold", stat: "kills", goal: 40 }), facts)).toBe(true);
    expect(conditionMet(parsed({ type: "stat-threshold", stat: "kills", goal: 41 }), facts)).toBe(false);
    expect(conditionMet(parsed({ type: "achievement", id: "first_boss" }), facts)).toBe(true);
  });
  it("needs every part of an all", () => {
    const both = parsed({
      type: "all",
      of: [
        { type: "boss-defeat", bossId: "rootbound" },
        { type: "stat-threshold", stat: "kills", goal: 41 },
      ],
    });
    expect(conditionMet(both, facts)).toBe(false);
    expect(conditionMet(both, progressFacts(profile({ killRootbound: 1, kills: 41 })))).toBe(true);
  });
});

describe("how far along a condition is", () => {
  const facts = progressFacts(profile({ killRootbound: 1, kills: 12 }));
  it("counts a stat against its goal, the parts of an all, and otherwise 0 or 1", () => {
    expect(conditionProgress(parsed({ type: "stat-threshold", stat: "kills", goal: 40 }), facts)).toEqual({
      current: 12,
      goal: 40,
    });
    const parts = parsed({
      type: "all",
      of: [
        { type: "boss-defeat", bossId: "rootbound" },
        { type: "boss-defeat", bossId: "echo" },
      ],
    });
    expect(conditionProgress(parts, facts)).toEqual({ current: 1, goal: 2 });
    expect(conditionProgress(parsed({ type: "boss-defeat", bossId: "rootbound" }), facts)).toEqual({
      current: 1,
      goal: 1,
    });
    expect(conditionProgress(parsed({ type: "boss-defeat", bossId: "echo" }), facts)).toEqual({ current: 0, goal: 1 });
  });
});

describe("a snapshot of progress", () => {
  it("keeps what the conditions read, is frozen, and does not follow the profile", () => {
    const stats: Record<string, unknown> = {
      _biomes: { "The Grounds": 1, "The Undercroft": 3 },
      killRootbound: 2,
      text: "x",
    };
    const snapshot = snapshotProgress({ stats, ach: { a: 99 } });
    expect(snapshot).toEqual({
      stats: { _biomes: { "The Grounds": 1, "The Undercroft": 1 }, killRootbound: 2 },
      ach: { a: 1 },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    stats.killEcho = 1;
    expect(progressFacts(snapshot).bossDefeated("echo")).toBe(false);
    expect(progressFacts(snapshot).achievementUnlocked("a")).toBe(true);
  });
});
