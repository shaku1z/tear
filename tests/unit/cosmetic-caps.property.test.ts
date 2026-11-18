/**
 * Property tests for the cosmetic record's bounds (src/domain/cosmetics.ts): merging two devices' records
 * never drops an owned item, keeps `seen` and `counters` for catalog items, does not depend on order, and
 * stays inside the catalog's worst case, which fits the saved-record budget.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOADOUT_ID,
  MAX_LOADOUTS,
  MAX_PRICE,
  MAX_STATE_CHARS,
  type CosmeticState,
} from "../../src/domain/cosmetic-types";
import { worstCaseStateSize } from "../../src/domain/cosmetic-validation";
import { mergeCosmeticStates, normalizeCosmeticState } from "../../src/domain/cosmetics";
import { MAX_ID_LENGTH } from "../../src/domain/identifiers";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { checkProperty, fc } from "./property-harness";

const catalogIds = COSMETIC_CATALOG.items.map((item) => item.id);
const slotIds = COSMETIC_CATALOG.slots.map((slot) => slot.id);
/** An id from a newer client's catalog: valid, but not one this build lists. */
const unknownId = fc
  .stringMatching(new RegExp(`^[a-z0-9_]{1,${String(MAX_ID_LENGTH)}}$`, "u"))
  .filter((id) => !catalogIds.includes(id));
/** Loadout ids from a fixed pool, so two records together never hold more than MAX_LOADOUTS loadouts. */
const loadoutId = fc.constantFrom(
  DEFAULT_LOADOUT_ID,
  ...Array.from({ length: MAX_LOADOUTS - 1 }, (_, index) => `loadout_${String(index)}`),
);
const time = fc.nat({ max: 9_999_999_999_999 });

/** A record as a save holds it, built from these item ids and passed through `normalizeCosmeticState`. */
function savedRecord(itemId: fc.Arbitrary<string>) {
  const loadout = fc.record(
    {
      name: fc.string({ maxLength: 30 }),
      nameAt: time,
      deletedAt: time,
      slots: fc.dictionary(fc.constantFrom(...slotIds), fc.record({ id: fc.option(itemId, { nil: null }), at: time })),
    },
    { requiredKeys: ["name", "nameAt", "slots"] },
  );
  return fc
    .record({
      owned: fc.dictionary(itemId, fc.nat({ max: MAX_PRICE })),
      seen: fc.dictionary(itemId, time),
      counters: fc.dictionary(itemId, fc.nat()),
      loadouts: fc.dictionary(loadoutId, loadout),
      active: fc.record({ id: loadoutId, at: time }),
    })
    .map((raw) => normalizeCosmeticState({ v: 1, ...raw }));
}

const anyItem = fc.oneof(fc.constantFrom(...catalogIds), unknownId);
const anyRecord = savedRecord(anyItem);
const catalogRecord = savedRecord(fc.constantFrom(...catalogIds));
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("cosmetic record bounds", () => {
  it("keeps every owned item from both sides, and seen and counters for catalog items only", () => {
    checkProperty(
      fc.property(anyRecord, anyRecord, (left, right) => {
        const merged = mergeCosmeticStates(left, right, COSMETIC_CATALOG);
        for (const id of [...Object.keys(left.owned), ...Object.keys(right.owned)])
          expect(Object.hasOwn(merged.owned, id)).toBe(true);
        for (const id of Object.keys(merged.seen)) expect(catalogIds).toContain(id);
        for (const id of Object.keys(merged.counters)) expect(catalogIds).toContain(id);
      }),
    );
  });

  it("is commutative, associative and idempotent, and a merged record is already normal", () => {
    const merge = (a: CosmeticState, b: CosmeticState) => mergeCosmeticStates(a, b, COSMETIC_CATALOG);
    checkProperty(
      fc.property(anyRecord, anyRecord, anyRecord, (a, b, c) => {
        const merged = merge(a, b);
        expect(plain(merged)).toEqual(plain(merge(b, a)));
        expect(plain(merge(merge(a, b), c))).toEqual(plain(merge(a, merge(b, c))));
        expect(plain(merge(merged, merged))).toEqual(plain(merged));
        expect(plain(normalizeCosmeticState(merged))).toEqual(plain(merged));
      }),
    );
  });

  it("normalizes a record once: normalizing again changes nothing", () => {
    checkProperty(
      fc.property(anyRecord, (state) => {
        expect(plain(normalizeCosmeticState(plain(state)))).toEqual(plain(state));
      }),
    );
  });

  it("fits the catalog's worst case, and the worst case fits the saved-record budget", () => {
    const worst = worstCaseStateSize(COSMETIC_CATALOG);
    expect(worst).toBeLessThanOrEqual(MAX_STATE_CHARS);
    // Pinned for today's catalog (12 items, 23 slots): a change to the catalog or the record format updates
    // this number in the same pull request, so its size cost is reviewed rather than discovered.
    expect(worst).toBe(13_751);
    checkProperty(
      fc.property(catalogRecord, catalogRecord, (left, right) => {
        const merged = mergeCosmeticStates(left, right, COSMETIC_CATALOG);
        expect(JSON.stringify(merged).length).toBeLessThanOrEqual(worst);
      }),
    );
  });
});
