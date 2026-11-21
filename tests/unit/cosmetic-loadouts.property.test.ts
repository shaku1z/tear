/**
 * Property tests for named loadouts (src/domain/cosmetic-loadouts.ts) under the device merge. Whatever each
 * device does: inside the limits the merge does not depend on order or repetition; every reader wears the
 * loadout the list marks in use; loadouts two devices make before they meet all survive, and past the limit
 * the newest are the ones dropped; a delete beats every edit made elsewhere; and a loadout made again in a
 * deleted one's place holds only what it was made with.
 */
import { describe, expect, it } from "vitest";

import {
  createLoadout,
  deleteLoadout,
  LOADOUT_IDS,
  loadoutSummaries,
  renameLoadout,
  switchLoadout,
} from "../../src/domain/cosmetic-loadouts";
import { MAX_LOADOUTS, type CosmeticItem, type CosmeticState } from "../../src/domain/cosmetic-types";
import {
  emptyCosmeticState,
  equipCosmetic,
  grantItems,
  itemStatus,
  loadoutOf,
  mergeCosmeticStates,
} from "../../src/domain/cosmetics";
import { progressFacts } from "../../src/domain/progress-facts";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { checkProperty, fc } from "./property-harness";

const items = COSMETIC_CATALOG.items.map((item) => item.id);
const base = grantItems(emptyCosmeticState(), items);
const merge = (a: CosmeticState, b: CosmeticState) => mergeCosmeticStates(a, b, COSMETIC_CATALOG);
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const noFacts = progressFacts({ stats: {}, ach: {} });
/** The devices the merge properties combine. */
const DEVICES = 3;
/** Loadouts each of those devices may make, so that together they stay inside MAX_LOADOUTS. */
const CREATES_INSIDE_LIMIT = Math.floor((MAX_LOADOUTS - 1) / DEVICES);

type Step = (state: CosmeticState, now: number) => CosmeticState | null;
const create: Step = (state, now) => createLoadout(state, now);
const loadoutId = fc.constantFrom(...LOADOUT_IDS);
const anyItem = fc.constantFrom(...COSMETIC_CATALOG.items);
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.constant(create),
  loadoutId.map<Step>((id) => (state, now) => switchLoadout(state, id, now)),
  loadoutId.map<Step>((id) => (state, now) => deleteLoadout(state, id, now)),
  fc.tuple(loadoutId, fc.stringMatching(/^[A-Za-z0-9 ]{1,24}$/u)).map<Step>(
    ([id, name]) =>
      (state, now) =>
        renameLoadout(state, id, name, now),
  ),
  anyItem.map<Step>((item) => (state, now) => equipCosmetic(COSMETIC_CATALOG, state, item.slot, item.id, now)),
);

/** One device's record: the shared start, then its own steps, each later than the last, with at most `creates`. */
const device = (start: number, creates = Number.POSITIVE_INFINITY) =>
  fc.array(fc.tuple(step, fc.integer({ min: 1, max: 50 })), { maxLength: 24 }).map((steps) => {
    let state = base,
      now = start,
      made = 0;
    for (const [apply, wait] of steps) {
      if (apply === create && made >= creates) continue;
      now += wait;
      const next = apply(state, now);
      if (next && apply === create) made += 1;
      state = next ?? state;
    }
    return state;
  });

const inUse = (state: CosmeticState) => loadoutSummaries(state).filter((entry) => entry.active);
const named = (state: CosmeticState, name: string) =>
  loadoutSummaries(state).find((entry) => entry.name === name)?.id ?? "";
const must = (state: CosmeticState | null): CosmeticState => {
  if (state === null) throw new Error("the operation was refused");
  return state;
};

describe("named loadouts across devices", () => {
  it("merge commutatively, associatively and idempotently while the devices stay inside the limits", () => {
    checkProperty(
      fc.property(
        device(0, CREATES_INSIDE_LIMIT),
        device(5, CREATES_INSIDE_LIMIT),
        device(10, CREATES_INSIDE_LIMIT),
        (a, b, c) => {
          expect(plain(merge(a, b))).toEqual(plain(merge(b, a)));
          expect(plain(merge(merge(a, b), c))).toEqual(plain(merge(a, merge(b, c))));
          expect(plain(merge(merge(a, b), merge(a, b)))).toEqual(plain(merge(a, b)));
        },
      ),
    );
  });

  it("wear the one loadout they mark in use after any merge, inside the pool and the limit", () => {
    checkProperty(
      fc.property(device(0), device(3), device(7), (a, b, c) => {
        for (const state of [a, merge(a, b), merge(merge(a, b), c)]) {
          expect(Object.keys(state.loadouts).every((id) => LOADOUT_IDS.includes(id))).toBe(true);
          expect(loadoutSummaries(state).length).toBeLessThanOrEqual(MAX_LOADOUTS);
          const marked = inUse(state);
          expect(marked).toHaveLength(1);
          const slots = Object.entries(state.loadouts[marked[0]?.id ?? ""]?.slots ?? {});
          const worn = Object.fromEntries(slots.flatMap(([slot, entry]) => (entry.id ? [[slot, entry.id]] : [])));
          expect(loadoutOf(COSMETIC_CATALOG, state)).toEqual(worn);
          for (const item of COSMETIC_CATALOG.items)
            expect(itemStatus(COSMETIC_CATALOG, state, item, noFacts) === "equipped").toBe(worn[item.slot] === item.id);
        }
      }),
    );
  });

  it("keep every loadout two devices make before they meet, and past the limit drop the newest", () => {
    const made = fc.array(anyItem, { minLength: 1, maxLength: 4 });
    checkProperty(
      fc.property(fc.nat({ max: 3 }), made, made, fc.nat({ max: 200 }), fc.nat({ max: 200 }), (k, ofA, ofB, a0, b0) => {
        // Each new loadout is renamed for who made it and wears one item. A's times are even and B's odd.
        const build = (start: CosmeticState, who: string, list: readonly CosmeticItem[], at: (i: number) => number) => {
          let state = start;
          const out: { name: string; item: CosmeticItem; at: number }[] = [];
          list.forEach((item, index) => {
            const next = createLoadout(state, at(index));
            if (!next) return;
            const id = loadoutSummaries(next).find((entry) => entry.active)?.id ?? "";
            const name = `${who}${String(index)}`;
            state = must(renameLoadout(next, id, name, at(index) + 1));
            state = must(equipCosmetic(COSMETIC_CATALOG, state, item.slot, item.id, at(index) + 1));
            out.push({ name, item, at: at(index) });
          });
          return { state, out };
        };
        const shared = build(base, "S", COSMETIC_CATALOG.items.slice(0, k), (i) => 1 + i);
        const first = build(shared.state, "A", ofA, (i) => 1000 + 2 * (a0 + 10 * i));
        const second = build(shared.state, "B", ofB, (i) => 1001 + 2 * (b0 + 10 * i));
        const all = [...shared.out, ...first.out, ...second.out].sort((x, y) => x.at - y.at);
        const kept = all.slice(0, MAX_LOADOUTS - 1);
        for (const merged of [merge(first.state, second.state), merge(second.state, first.state)]) {
          const listed = loadoutSummaries(merged)
            .map((entry) => entry.name)
            .filter((name) => name !== "MAIN");
          const byName = (x: string, y: string) => x.localeCompare(y);
          expect([...listed].sort(byName)).toEqual(kept.map((entry) => entry.name).sort(byName));
          for (const { name, item } of kept)
            expect(merged.loadouts[named(merged, name)]?.slots[item.slot]?.id).toBe(item.id);
          expect(inUse(merged)).toHaveLength(1);
        }
      }),
    );
  });

  it("let a delete beat every rename and equip made on another device before they met", () => {
    checkProperty(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: -900, max: 1000 }), anyItem, (gap, by, item) => {
        const shared = must(createLoadout(base, 100));
        const deleted = must(deleteLoadout(shared, "loadout_2", 100 + gap));
        const editAt = Math.max(101, 100 + gap + by);
        const renamed = must(renameLoadout(shared, "loadout_2", "Edited", editAt));
        const edited = must(equipCosmetic(COSMETIC_CATALOG, renamed, item.slot, item.id, editAt));
        for (const merged of [merge(deleted, edited), merge(edited, deleted)]) {
          expect(loadoutSummaries(merged).map((entry) => entry.id)).toEqual(["main"]);
          expect(inUse(merged)).toHaveLength(1);
        }
      }),
    );
  });

  it("make a loadout again in a deleted one's place holding only what it was made with", () => {
    checkProperty(
      fc.property(anyItem, anyItem, fc.integer({ min: 1, max: 1000 }), fc.nat({ max: 1000 }), (old, stale, gap, by) => {
        const first = must(equipCosmetic(COSMETIC_CATALOG, must(createLoadout(base, 10)), old.slot, old.id, 20));
        const again = must(createLoadout(must(deleteLoadout(first, "loadout_2", 30)), 30 + gap));
        // Another device that never saw the delete keeps editing the first loadout, even after the new one.
        const late = 30 + gap + by;
        const edited = must(renameLoadout(first, "loadout_2", "Stale", late));
        const elsewhere = equipCosmetic(COSMETIC_CATALOG, edited, stale.slot, stale.id, late) ?? edited;
        for (const merged of [
          merge(again, elsewhere),
          merge(elsewhere, again),
          merge(merge(again, first), elsewhere),
        ]) {
          expect(merged.loadouts.loadout_2).toEqual(again.loadouts.loadout_2);
          expect(loadoutSummaries(merged).map((entry) => entry.name)).toEqual(["MAIN", "LOADOUT 2"]);
        }
      }),
    );
  });
});
