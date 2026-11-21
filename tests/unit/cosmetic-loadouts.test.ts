import { describe, expect, it } from "vitest";

import {
  activeLoadout,
  createLoadout,
  deleteLoadout,
  LOADOUT_IDS,
  loadoutSummaries,
  renameLoadout,
  switchLoadout,
} from "../../src/domain/cosmetic-loadouts";
import {
  DEFAULT_LOADOUT_ID,
  MAX_DELETED_LOADOUTS,
  MAX_LOADOUT_NAME,
  MAX_LOADOUTS,
  type CosmeticState,
} from "../../src/domain/cosmetic-types";
import {
  emptyCosmeticState,
  equipCosmetic,
  grantItems,
  itemStatus,
  loadoutOf,
  mergeCosmeticStates,
  normalizeCosmeticState,
} from "../../src/domain/cosmetics";
import { progressFacts } from "../../src/domain/progress-facts";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";

const owned = grantItems(emptyCosmeticState(), ["trail_dusk", "trail_tidewater", "spark_orchid"]);
const must = (state: CosmeticState | null): CosmeticState => {
  if (state === null) throw new Error("the operation was refused");
  return state;
};
const equip = (state: CosmeticState, slot: string, id: string | null, now: number): CosmeticState =>
  must(equipCosmetic(COSMETIC_CATALOG, state, slot, id, now));
const names = (state: CosmeticState) =>
  loadoutSummaries(state).map((entry) => `${entry.name}${entry.active ? "*" : ""}`);
const merge = (a: CosmeticState, b: CosmeticState) => mergeCosmeticStates(a, b, COSMETIC_CATALOG);
const both = (a: CosmeticState, b: CosmeticState): CosmeticState[] => [merge(a, b), merge(b, a)];
const rename = (state: CosmeticState, id: string, name: string, now: number) =>
  must(renameLoadout(state, id, name, now));

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
    expect(changed.loadouts.main?.slots.trail?.id).toBe("trail_dusk");
  });

  it("refuses a loadout past the limit", () => {
    let state = owned;
    for (let index = 1; index < MAX_LOADOUTS; index += 1) state = must(createLoadout(state, index));
    expect(loadoutSummaries(state)).toHaveLength(MAX_LOADOUTS);
    expect(createLoadout(state, 100)).toBeNull();
  });

  it("switches only to a loadout the player has, and always to MAIN, and not to the one in use", () => {
    const second = must(createLoadout(owned, 10));
    const back = must(switchLoadout(second, DEFAULT_LOADOUT_ID, 20));
    expect(names(back)).toEqual(["MAIN*", "LOADOUT 2"]);
    expect(switchLoadout(back, DEFAULT_LOADOUT_ID, 30)).toBeNull();
    expect(switchLoadout(second, "loadout_2", 30)).toBeNull();
    expect(switchLoadout(second, "loadout_5", 20)).toBeNull();
    expect(switchLoadout(second, "anything", 20)).toBeNull();
  });

  it("renames with the shared name rules, trimmed, from 1 to the loadout limit", () => {
    const second = must(createLoadout(owned, 10));
    expect(names(rename(second, "loadout_2", "  Boss runs ", 20))).toEqual(["MAIN", "Boss runs*"]);
    expect(names(rename(second, DEFAULT_LOADOUT_ID, "Daily", 20))).toEqual(["Daily", "LOADOUT 2*"]);
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
    // A device that only saw the delete, or never saw it, does not take the new loadout back down.
    for (const merged of [...both(again, deleted), ...both(again, second)]) {
      expect(names(merged)).toEqual(["MAIN", "LOADOUT 2*"]);
      expect(merged.loadouts.loadout_2).toEqual(again.loadouts.loadout_2);
    }
  });

  it("keeps the record inside the fixed pool, and the newest deletes only, whatever is created and deleted", () => {
    let state = owned;
    for (let round = 0; round < 3; round += 1) {
      for (let index = 1; index < MAX_LOADOUTS; index += 1) state = must(createLoadout(state, round * 100 + index));
      for (const id of LOADOUT_IDS.slice(1)) state = must(deleteLoadout(state, id, round * 100 + 50));
    }
    expect(Object.keys(state.loadouts).every((id) => LOADOUT_IDS.includes(id))).toBe(true);
    expect(Object.keys(state.deletedLoadouts ?? {})).toHaveLength(MAX_DELETED_LOADOUTS);
    expect(names(state)).toEqual(["MAIN*"]);
  });

  it("wears and shows MAIN when the record names no loadout it holds", () => {
    const foreign: CosmeticState = {
      ...equip(owned, "trail", "trail_dusk", 1),
      active: { id: "loadout_4_99", at: 5 },
    };
    expect(names(foreign)).toEqual(["MAIN*"]);
    expect(activeLoadout(foreign)).toBe(foreign.loadouts.main);
    expect(loadoutOf(COSMETIC_CATALOG, foreign)).toEqual({ trail: "trail_dusk" });
  });

  it("reads a record from before loadouts had a creation time, and drops ids outside the pool", () => {
    const old = normalizeCosmeticState({
      v: 1,
      owned: { trail_dusk: 25 },
      loadouts: {
        main: { name: "MAIN", nameAt: 1, slots: {} },
        loadout_2: { name: "Boss", nameAt: 4, slots: { trail: { id: "trail_dusk", at: 4 } } },
        loadout_3: { name: "Gone", nameAt: 6, deletedAt: 9, slots: {} },
        elsewhere: { name: "X", nameAt: 5, slots: {} },
      },
      active: { id: "loadout_2", at: 7 },
    });
    expect(names(old)).toEqual(["MAIN", "Boss*"]);
    expect(Object.keys(old.loadouts)).toEqual(["main", "loadout_2"]);
    expect(old.deletedLoadouts).toEqual({ loadout_3_6: 9 });
    expect(loadoutOf(COSMETIC_CATALOG, old)).toEqual({ trail: "trail_dusk" });
  });
});

describe("named loadouts across two devices", () => {
  const shared = equip(must(createLoadout(owned, 10)), "spark", "spark_orchid", 20);

  it("wears what it lists: a switch to a loadout another device deleted wears and marks MAIN", () => {
    const deleted = must(deleteLoadout(shared, "loadout_2", 200));
    const switched = must(switchLoadout(must(switchLoadout(shared, DEFAULT_LOADOUT_ID, 100)), "loadout_2", 250));
    const spark = COSMETIC_CATALOG.items.find((item) => item.id === "spark_orchid");
    if (!spark) throw new Error("catalog item missing");
    for (const merged of both(deleted, switched)) {
      expect(names(merged)).toEqual(["MAIN*"]);
      expect(loadoutOf(COSMETIC_CATALOG, merged)).toEqual({});
      expect(itemStatus(COSMETIC_CATALOG, merged, spark, progressFacts({ stats: {}, ach: {} }))).toBe("owned");
    }
  });

  it("names a loadout the player never named for the place it sits in, and keeps a name the player gave", () => {
    const boss = rename(must(createLoadout(owned, 100)), "loadout_2", "Boss", 101);
    const plain = must(createLoadout(owned, 105));
    const merged = merge(boss, plain);
    expect(names(merged)).toEqual(["MAIN", "Boss", "LOADOUT 3*"]);
    // Boss goes, the unnamed loadout moves home and reads LOADOUT 2 again; a moved, named one keeps its name.
    expect(names(merge(merged, must(deleteLoadout(boss, "loadout_2", 300))))).toEqual(["MAIN*", "LOADOUT 2"]);
    const daily = rename(plain, "loadout_2", "Daily", 106);
    expect(names(merge(boss, daily))).toEqual(["MAIN", "Boss", "Daily*"]);
  });

  it("keeps both loadouts two devices made at once, each with its own name and items", () => {
    const boss = equip(rename(must(createLoadout(owned, 100)), "loadout_2", "Boss", 101), "trail", "trail_dusk", 102);
    const daily = rename(must(createLoadout(owned, 105)), "loadout_2", "Daily", 106);
    for (const merged of both(boss, daily)) {
      // The earlier keeps its place; the later moves to the lowest free one and stays in use.
      expect(names(merged)).toEqual(["MAIN", "Boss", "Daily*"]);
      expect(merged.loadouts.loadout_2?.slots.trail?.id).toBe("trail_dusk");
      expect(merged.loadouts.loadout_3?.slots).toEqual({});
      expect(merged.loadouts.loadout_3?.home).toBe("loadout_2");
    }
    // A device that deletes its own new loadout before seeing the other's takes only its own down.
    const merged = merge(boss, daily);
    const dailyGone = must(deleteLoadout(daily, "loadout_2", 300));
    for (const later of both(merged, dailyGone)) expect(names(later)).toEqual(["MAIN*", "Boss"]);
    const bossGone = must(deleteLoadout(boss, "loadout_2", 300));
    for (const later of both(merged, bossGone)) expect(names(later)).toEqual(["MAIN*", "Daily"]);
  });

  it("drops the newest loadouts when the two devices together hold more than the limit", () => {
    let early = owned;
    for (let index = 1; index < MAX_LOADOUTS; index += 1) early = must(createLoadout(early, index));
    const late = rename(must(createLoadout(owned, 500)), "loadout_2", "Late", 501);
    for (const merged of both(early, late)) {
      expect(loadoutSummaries(merged)).toHaveLength(MAX_LOADOUTS);
      expect(names(merged)).not.toContain("Late");
      expect(names(merged).filter((name) => name.endsWith("*"))).toHaveLength(1);
    }
  });

  it("lets a delete win over a rename or equip made on another device before they met", () => {
    const deleted = must(deleteLoadout(shared, "loadout_2", 200));
    const edited = equip(rename(shared, "loadout_2", "Edited", 250), "trail", "trail_dusk", 260);
    for (const merged of both(deleted, edited)) {
      expect(names(merged)).toEqual(["MAIN*"]);
      expect(merged.loadouts.loadout_2).toBeUndefined();
    }
  });
});
