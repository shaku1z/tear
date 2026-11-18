/**
 * Property tests for the one rule over maps keyed by saved or authored ids (src/domain/records.ts): any key,
 * including the names every plain object inherits, must not create a NaN, break the merge, or meet a
 * condition on an empty profile.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mergeCosmeticStates, normalizeCosmeticState, shardBalance } from "../../src/domain/cosmetics";
import { progressFacts, snapshotProgress } from "../../src/domain/progress-facts";
import { conditionFrom, conditionMet } from "../../src/domain/unlock-condition";
import { createProfileStore } from "../../src/persistence/profile-store";

/** Every member a plain object inherits: `__proto__`, `constructor`, `toString`, `hasOwnProperty`... */
const INHERITED = Object.getOwnPropertyNames(Object.prototype);

/** Keys a save could hold: inherited names, real-looking ids and anything else. */
const key = fc.oneof(
  fc.constantFrom(...INHERITED),
  fc.constantFrom("main", "alt", "trail", "trail_dusk", "spark_ember"),
  fc.string({ maxLength: 10 }),
);
const loose = fc.oneof(fc.nat({ max: 2_000 }), fc.double(), fc.constant(null), fc.string({ maxLength: 4 }));

/**
 * JSON text for an object with these entries, parsed the way a save is. `JSON.parse` keeps a `__proto__`
 * key as an own property, which an object literal or `fc.dictionary` would not.
 */
const asSaved = (entries: readonly (readonly [string, unknown])[]): Record<string, unknown> =>
  JSON.parse(
    `{${entries.map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`).join(",")}}`,
  ) as Record<string, unknown>;
const savedMap = <T>(value: fc.Arbitrary<T>) =>
  fc.array(fc.tuple(key, value), { maxLength: 6 }).map((entries) => asSaved(entries));

const savedLoadout = fc.record({
  name: fc.string({ maxLength: 8 }),
  nameAt: fc.nat({ max: 50 }),
  deletedAt: fc.option(fc.nat({ max: 50 }), { nil: undefined }),
  slots: savedMap(fc.record({ id: fc.oneof(key, fc.constant(null)), at: fc.nat({ max: 50 }) })),
});
/** A cosmetics record as a device or the cloud could hand it over: valid, partial or hostile. */
const savedState = fc
  .record({
    owned: savedMap(loose),
    seen: savedMap(loose),
    counters: savedMap(loose),
    loadouts: savedMap(savedLoadout),
    active: fc.record({ id: key, at: fc.nat({ max: 50 }) }),
  })
  .map((parts) => normalizeCosmeticState({ v: 1, ...parts }));

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("any saved key, inherited names included", () => {
  it("never puts a NaN or a negative number into a merged balance", () => {
    fc.assert(
      fc.property(savedState, savedState, fc.nat({ max: 100_000 }), (left, right, earned) => {
        const merged = mergeCosmeticStates(left, right);
        for (const paid of Object.values(merged.owned)) expect(Number.isFinite(paid)).toBe(true);
        const balance = shardBalance(earned, merged);
        expect(Number.isFinite(balance)).toBe(true);
        expect(balance).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("merges the same way in either order, and merging a state with itself changes nothing", () => {
    fc.assert(
      fc.property(savedState, savedState, (left, right) => {
        expect(plain(mergeCosmeticStates(left, right))).toEqual(plain(mergeCosmeticStates(right, left)));
        expect(plain(mergeCosmeticStates(left, left))).toEqual(plain(left));
      }),
    );
  });

  it("keeps an inherited name out of a normalized state", () => {
    fc.assert(
      fc.property(savedState, (state) => {
        const keys = [
          ...Object.keys(state.owned),
          ...Object.keys(state.seen),
          ...Object.keys(state.counters),
          ...Object.keys(state.loadouts),
          ...Object.values(state.loadouts).flatMap((loadout) => Object.keys(loadout.slots)),
        ];
        expect(keys.filter((name) => INHERITED.includes(name))).toEqual([]);
      }),
    );
  });

  it("meets no condition on an empty profile, whatever it names", () => {
    const empty = progressFacts({ stats: {}, ach: {} });
    fc.assert(
      fc.property(key, (name) => {
        expect(empty.achievementUnlocked(name)).toBe(false);
        expect(empty.bossDefeated(name)).toBe(false);
        expect(empty.biomeEntered(name)).toBe(false);
        expect(empty.stat(name)).toBe(0);
        for (const value of [
          { type: "achievement", id: name },
          { type: "boss-defeat", bossId: name },
          { type: "biome-enter", biome: name },
          { type: "stat-threshold", stat: name, goal: 1 },
        ]) {
          const condition = conditionFrom(value);
          if (condition) expect(conditionMet(condition, empty)).toBe(false);
        }
      }),
    );
  });

  it("answers only what a saved profile itself holds", () => {
    fc.assert(
      fc.property(savedMap(loose), savedMap(fc.nat()), key, (stats, ach, name) => {
        for (const source of [{ stats, ach }, snapshotProgress({ stats, ach })]) {
          const facts = progressFacts(source);
          expect(facts.achievementUnlocked(name)).toBe(Object.hasOwn(source.ach, name));
          expect(Number.isFinite(facts.stat(name))).toBe(true);
        }
      }),
    );
  });
});

describe("a remote profile with an inherited name", () => {
  it("cannot replace the prototype of the stats or meet an achievement it does not hold", () => {
    const values = new Map<string, string>();
    const profile = createProfileStore({
      store: { get: (name) => values.get(name) ?? null, set: (name, value) => void values.set(name, value) },
      now: () => 1_000,
      writerId: () => "unit",
      getAchievements: () => undefined,
      getMeta: () => undefined,
    });
    profile.load();
    profile.merge(JSON.parse('{"stats":{"__proto__":{"bossKills":9},"constructor":4},"ach":{"__proto__":5}}'));
    expect(Object.getPrototypeOf(profile.data.stats)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(profile.data.ach)).toBe(Object.prototype);
    expect(profile.stat("bossKills")).toBe(0);
    expect(profile.facts().achievementUnlocked("toString")).toBe(false);
    expect(profile.facts().stat("constructor")).toBe(0);
  });
});
