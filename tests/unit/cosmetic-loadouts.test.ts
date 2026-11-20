import { describe, expect, it } from "vitest";

import {
  activeLoadout,
  createLoadout,
  deleteLoadout,
  LOADOUT_IDS,
  liveLoadout,
  loadoutSummaries,
  renameLoadout,
  switchLoadout,
} from "../../src/domain/cosmetic-loadouts";
import {
  DEFAULT_LOADOUT_ID,
  MAX_LOADOUT_NAME,
  MAX_LOADOUTS,
  type CosmeticState,
} from "../../src/domain/cosmetic-types";
import { emptyCosmeticState, equipCosmetic, grantItems, mergeCosmeticStates } from "../../src/domain/cosmetics";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";

const owned = grantItems(emptyCosmeticState(), ["trail_dusk", "spark_orchid"]);
const must = (state: CosmeticState | null): CosmeticState => {
  if (state === null) throw new Error("the operation was refused");
  return state;
};
const equip = (state: CosmeticState, slot: string, id: string | null, now: number): CosmeticState =>
  must(equipCosmetic(COSMETIC_CATALOG, state, slot, id, now));
const names = (state: CosmeticState) =>
  loadoutSummaries(state).map((entry) => `${entry.name}${entry.active ? "*" : ""}`);
const merge = (a: CosmeticState, b: CosmeticState) => mergeCosmeticStates(a, b, COSMETIC_CATALOG);

describe("named loadouts", () => {
  it("lists MAIN, in use, before anything is equipped", () => {
    expect(names(owned)).toEqual(["MAIN*"]);
  });

  it("makes a new loadout as a copy of the one in use, named for its place, and puts it in use", () => {
    const main = equip(owned, "trail", "trail_dusk", 10);
    const second = must(createLoadout(main, 20));
    expect(names(second)).toEqual(["MAIN", "LOADOUT 2*"]);
    expect(activeLoadout(second)?.slots.trail?.id).toBe("trail_dusk");
    // Equipping in the copy leaves MAIN as it was.
    const changed = equip(second, "trail", null, 30);
    expect(activeLoadout(changed)?.slots.trail?.id).toBeNull();
    expect(liveLoadout(changed, DEFAULT_LOADOUT_ID)?.slots.trail?.id).toBe("trail_dusk");
  });

  it("refuses a loadout past the limit", () => {
    let state = owned;
    for (let index = 1; index < MAX_LOADOUTS; index += 1) state = must(createLoadout(state, index));
    expect(loadoutSummaries(state)).toHaveLength(MAX_LOADOUTS);
    expect(createLoadout(state, 100)).toBeNull();
  });

  it("switches only to a loadout the player has, and always to MAIN", () => {
    const second = must(createLoadout(owned, 10));
    expect(names(must(switchLoadout(second, DEFAULT_LOADOUT_ID, 20)))).toEqual(["MAIN*", "LOADOUT 2"]);
    expect(switchLoadout(second, "loadout_5", 20)).toBeNull();
    expect(switchLoadout(second, "anything", 20)).toBeNull();
  });

  it("renames with the shared name rules, trimmed, from 1 to the loadout limit", () => {
    const second = must(createLoadout(owned, 10));
    expect(names(must(renameLoadout(second, "loadout_2", "  Boss runs ", 20)))).toEqual(["MAIN", "Boss runs*"]);
    expect(names(must(renameLoadout(second, DEFAULT_LOADOUT_ID, "Daily", 20)))).toEqual(["Daily", "LOADOUT 2*"]);
    expect(renameLoadout(second, "loadout_2", "   ", 20)).toBeNull();
    expect(renameLoadout(second, "loadout_2", "x".repeat(MAX_LOADOUT_NAME + 1), 20)).toBeNull();
    expect(renameLoadout(second, "loadout_2", "no/slashes", 20)).toBeNull();
    expect(renameLoadout(second, "loadout_2", "shithead", 20)).toBeNull();
    expect(renameLoadout(second, "loadout_7", "Nobody", 20)).toBeNull();
  });

  it("never deletes MAIN, and deleting the loadout in use puts MAIN in use", () => {
    const second = must(createLoadout(equip(owned, "trail", "trail_dusk", 5), 10));
    expect(deleteLoadout(second, DEFAULT_LOADOUT_ID, 20)).toBeNull();
    expect(deleteLoadout(second, "loadout_3", 20)).toBeNull();
    const deleted = must(deleteLoadout(second, "loadout_2", 20));
    expect(names(deleted)).toEqual(["MAIN*"]);
    expect(activeLoadout(deleted)?.slots.trail?.id).toBe("trail_dusk");
    expect(deleteLoadout(deleted, "loadout_2", 30)).toBeNull();
  });

  it("makes a deleted loadout's place free again, with none of the deleted loadout's items", () => {
    const second = equip(must(createLoadout(owned, 10)), "spark", "spark_orchid", 20);
    const deleted = must(deleteLoadout(second, "loadout_2", 30));
    const again = must(createLoadout(deleted, 40));
    expect(names(again)).toEqual(["MAIN", "LOADOUT 2*"]);
    expect(activeLoadout(again)?.slots.spark).toBeUndefined();
    // A device that only saw the delete does not take the new loadout back down.
    expect(names(merge(again, deleted))).toEqual(["MAIN", "LOADOUT 2*"]);
    expect(names(merge(deleted, again))).toEqual(["MAIN", "LOADOUT 2*"]);
  });

  it("keeps the record's ids inside the fixed pool whatever is created and deleted", () => {
    let state = owned;
    for (let round = 0; round < 3; round += 1) {
      for (let index = 1; index < MAX_LOADOUTS; index += 1) state = must(createLoadout(state, round * 100 + index));
      for (const id of LOADOUT_IDS.slice(1)) state = must(deleteLoadout(state, id, round * 100 + 50));
    }
    expect(Object.keys(state.loadouts).every((id) => LOADOUT_IDS.includes(id))).toBe(true);
    expect(names(state)).toEqual(["MAIN*"]);
  });

  it("wears and shows MAIN when the record names a loadout outside the pool", () => {
    const foreign: CosmeticState = {
      ...owned,
      loadouts: { elsewhere: { name: "X", nameAt: 5, slots: { trail: { id: "trail_dusk", at: 5 } } } },
      active: { id: "elsewhere", at: 5 },
    };
    expect(activeLoadout(foreign)).toBeUndefined();
    expect(names(foreign)).toEqual(["MAIN*"]);
  });
});
