/**
 * Property tests for named loadouts (src/domain/cosmetic-loadouts.ts) under the device merge: whatever each
 * device does to its loadouts, merging the devices' records does not depend on order or repetition, never
 * holds an id outside the fixed pool (so tombstones are bounded and never count against the limit), always
 * has exactly one loadout in use, and a delete beats an older edit on another device from either side.
 */
import { describe, expect, it } from "vitest";

import {
  createLoadout,
  deleteLoadout,
  LOADOUT_IDS,
  liveLoadout,
  loadoutSummaries,
  renameLoadout,
  switchLoadout,
} from "../../src/domain/cosmetic-loadouts";
import { MAX_LOADOUTS, type CosmeticState } from "../../src/domain/cosmetic-types";
import { emptyCosmeticState, equipCosmetic, grantItems, mergeCosmeticStates } from "../../src/domain/cosmetics";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { checkProperty, fc } from "./property-harness";

const items = COSMETIC_CATALOG.items.map((item) => item.id);
const base = grantItems(emptyCosmeticState(), items);
const merge = (a: CosmeticState, b: CosmeticState) => mergeCosmeticStates(a, b, COSMETIC_CATALOG);
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

type Step = (state: CosmeticState, now: number) => CosmeticState | null;
const loadoutId = fc.constantFrom(...LOADOUT_IDS);
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.constant<Step>((state, now) => createLoadout(state, now)),
  loadoutId.map<Step>((id) => (state, now) => switchLoadout(state, id, now)),
  loadoutId.map<Step>((id) => (state, now) => deleteLoadout(state, id, now)),
  fc.tuple(loadoutId, fc.stringMatching(/^[A-Za-z0-9 ]{1,24}$/u)).map<Step>(
    ([id, name]) =>
      (state, now) =>
        renameLoadout(state, id, name, now),
  ),
  fc
    .constantFrom(...COSMETIC_CATALOG.items)
    .map<Step>((item) => (state, now) => equipCosmetic(COSMETIC_CATALOG, state, item.slot, item.id, now)),
);

/** One device's record: the shared start, then its own steps, each at a later time than the last. */
const device = (start: number) =>
  fc.array(fc.tuple(step, fc.integer({ min: 1, max: 50 })), { maxLength: 24 }).map((steps) => {
    let state = base,
      now = start;
    for (const [apply, wait] of steps) {
      now += wait;
      state = apply(state, now) ?? state;
    }
    return state;
  });

const inPool = (state: CosmeticState): boolean => Object.keys(state.loadouts).every((id) => LOADOUT_IDS.includes(id));
const inUse = (state: CosmeticState): number => loadoutSummaries(state).filter((entry) => entry.active).length;

describe("named loadouts across devices", () => {
  it("merge commutatively, associatively and idempotently after any loadout steps", () => {
    checkProperty(
      fc.property(device(0), device(5), device(10), (a, b, c) => {
        expect(plain(merge(a, b))).toEqual(plain(merge(b, a)));
        expect(plain(merge(merge(a, b), c))).toEqual(plain(merge(a, merge(b, c))));
        expect(plain(merge(merge(a, b), merge(a, b)))).toEqual(plain(merge(a, b)));
      }),
    );
  });

  it("stay inside the fixed id pool and the limit, with exactly one loadout in use", () => {
    checkProperty(
      fc.property(device(0), device(3), (a, b) => {
        for (const state of [a, b, merge(a, b)]) {
          expect(inPool(state)).toBe(true);
          expect(Object.keys(state.loadouts).length).toBeLessThanOrEqual(MAX_LOADOUTS);
          expect(loadoutSummaries(state).length).toBeLessThanOrEqual(MAX_LOADOUTS);
          expect(inUse(state)).toBe(1);
        }
      }),
    );
  });

  it("let a delete beat an older edit on the other device, merged from either side, and lose to a newer one", () => {
    checkProperty(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.boolean(),
        (gap, later, editAfter) => {
          const shared = must(createLoadout(base, 100));
          const deleted = must(deleteLoadout(shared, "loadout_2", 100 + gap));
          const editAt = editAfter ? 100 + gap + later : 100 + Math.max(1, gap - later);
          const edited = must(renameLoadout(shared, "loadout_2", "Edited", editAt));
          for (const merged of [merge(deleted, edited), merge(edited, deleted)]) {
            const survives = editAt > 100 + gap;
            expect(liveLoadout(merged, "loadout_2") !== undefined).toBe(survives);
            expect(inUse(merged)).toBe(1);
          }
        },
      ),
    );
  });

  it("re-create a deleted loadout in its old place, which a device that only saw the delete never takes down", () => {
    checkProperty(
      fc.property(fc.constantFrom(...COSMETIC_CATALOG.items), fc.integer({ min: 1, max: 1000 }), (item, gap) => {
        const first = must(equipCosmetic(COSMETIC_CATALOG, must(createLoadout(base, 10)), item.slot, item.id, 20));
        const deleted = must(deleteLoadout(first, "loadout_2", 30));
        const again = must(createLoadout(deleted, 30 + gap));
        for (const merged of [merge(again, deleted), merge(deleted, again), merge(merge(again, first), deleted)]) {
          const live = liveLoadout(merged, "loadout_2");
          expect(live).toBeDefined();
          // The first loadout's item was deleted with it and does not come back.
          expect(live?.slots[item.slot]).toBeUndefined();
        }
      }),
    );
  });
});

function must(state: CosmeticState | null): CosmeticState {
  if (state === null) throw new Error("the operation was refused");
  return state;
}
