import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  colourProblem,
  contrastRatio,
  isTellColor,
  READABILITY_BACKDROPS,
} from "../../src/domain/cosmetic-readability";
import {
  COSMETIC_SLOTS,
  emptyCosmeticState,
  equipCosmetic,
  itemStatus,
  loadoutOf,
  mergeCosmeticStates,
  normalizeCosmeticState,
  purchaseCosmetic,
  shardBalance,
  validateCosmeticCatalog,
  type CosmeticCatalog,
  type CosmeticItem,
} from "../../src/domain/cosmetics";
import { ACHIEVEMENT_CATALOG } from "../../src/gameplay/progression/achievement-catalog";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";

function firstItem(): CosmeticItem {
  const item = COSMETIC_CATALOG.items[0];
  if (!item) throw new Error("catalog has no items");
  return item;
}
const noBoss = (): boolean => false;
const rootbound = (boss: string): boolean => boss === "rootbound";
/** Shards a common achievement pays (the rarity table in achievements.ts). */
const COMMON_SHARDS = 5;

describe("cosmetic catalog", () => {
  it("passes the validator on every row", () => {
    expect(validateCosmeticCatalog(COSMETIC_CATALOG)).toEqual([]);
  });

  it("has items only in known slots, with looks that are colours, scales and text only", () => {
    const slots = new Set(COSMETIC_SLOTS.map((slot) => slot.id));
    for (const item of COSMETIC_CATALOG.items) {
      expect(slots.has(item.slot)).toBe(true);
      const allowed = COSMETIC_SLOTS.find((slot) => slot.id === item.slot)?.lookKeys ?? [];
      expect(Object.keys(item.look).every((key) => allowed.includes(key))).toBe(true);
    }
  });

  it("flags placeholders so the names still needed can be listed", () => {
    const placeholders = [...COSMETIC_CATALOG.items, ...COSMETIC_CATALOG.collections]
      .filter((entry) => entry.placeholder === true)
      .map((entry) => entry.id);
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("has a first purchase a new player can afford from the common achievements alone", () => {
    const commons = ACHIEVEMENT_CATALOG.filter((entry) => entry.rarity === "common").length;
    const cheapest = Math.min(...COSMETIC_CATALOG.items.map((item) => item.price));
    expect(commons * COMMON_SHARDS).toBeGreaterThanOrEqual(cheapest);
  });

  it("rejects bad rows with a reason", () => {
    const base = firstItem();
    const row = (patch: Partial<CosmeticItem>): string =>
      validateCosmeticCatalog({ collections: [], items: [{ ...base, ...patch }] }).join();
    const trail = (colors: string[], extra: Record<string, unknown> = {}) => ({
      look: { colors, widthScale: 1, glow: 0, fade: "linear", ...extra },
    });
    expect(row({ price: -1 })).toContain("price");
    expect(row({ price: 99_999 })).toContain("price");
    expect(row({ collection: "nope" })).toContain("unknown collection");
    expect(row(trail(["#e23b3b"]))).toContain("enemy-tell");
    expect(row(trail(["#a0d8be"]))).toContain("contrast");
    expect(row(trail(["#7a4ff0"], { widthScale: 3 }))).toContain("widthScale");
    expect(row(trail(["#7a4ff0"], { damage: 9 }))).toContain("not allowed");
    const duplicate: CosmeticCatalog = { collections: [], items: [base, base] };
    expect(validateCosmeticCatalog(duplicate).join()).toContain("duplicate id");
  });
});

describe("readability rules", () => {
  it("accept the game's own default swing trail colour", () => {
    expect(colourProblem(CONFIG.colors.bladeTrail)).toBeNull();
  });
  it("flag the enemy-tell colours the game uses", () => {
    for (const tell of [CONFIG.colors.enemyShot, CONFIG.colors.slam, CONFIG.colors.scarf])
      expect(isTellColor(tell)).toBe(true);
  });
  it("measure contrast against both reference backdrops", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(Object.keys(READABILITY_BACKDROPS)).toEqual(["verdant", "dark"]);
  });
});

describe("cosmetic state", () => {
  it("drops malformed entries, keeps unknown ids, never throws", () => {
    const state = normalizeCosmeticState({
      v: 1,
      owned: { good: 50, free: 0, bad_price: -3, frac: 1.5, str: "9", "Bad Id": 5, future_item: 400 },
      equipped: { trail: { id: "good", at: 5 }, spark: { id: null, at: 2 }, banner: { id: "x", at: -1 }, title: "no" },
    });
    expect(state.owned).toEqual({ good: 50, free: 0, future_item: 400 });
    expect(state.equipped).toEqual({ trail: { id: "good", at: 5 }, spark: { id: null, at: 2 } });
    for (const junk of [null, undefined, 7, "x", [], { v: 2 }, { v: 1, owned: [], equipped: 3 }])
      expect(normalizeCosmeticState(junk)).toEqual(emptyCosmeticState());
  });

  it("derives the balance from earned shards and owned prices, never below zero", () => {
    const state = normalizeCosmeticState({ v: 1, owned: { a: 60, b: 40 }, equipped: {} });
    expect(shardBalance(150, state)).toBe(50);
    expect(shardBalance(90, state)).toBe(0);
    expect(shardBalance(Number.NaN, state)).toBe(0);
  });

  it("buys, refuses, and unlocks a boss collection", () => {
    const empty = emptyCosmeticState();
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "nope", 999, noBoss)).toEqual({ ok: false, reason: "unknown" });
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "trail_1", 74, noBoss)).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "rootbound_trail", 999, noBoss)).toEqual({
      ok: false,
      reason: "locked",
    });
    const bought = purchaseCosmetic(COSMETIC_CATALOG, empty, "rootbound_trail", 999, rootbound);
    expect(bought).toMatchObject({ ok: true, paid: 250 });
    if (!bought.ok) return;
    expect(purchaseCosmetic(COSMETIC_CATALOG, bought.state, "rootbound_trail", 999, rootbound)).toEqual({
      ok: false,
      reason: "owned",
    });
    expect(shardBalance(300, bought.state)).toBe(50);
  });

  it("equips only owned items in their own slot, and clears with null", () => {
    const owned = normalizeCosmeticState({ v: 1, owned: { trail_1: 75 }, equipped: {} });
    expect(equipCosmetic(COSMETIC_CATALOG, owned, "trail", "trail_2", 10)).toBeNull();
    expect(equipCosmetic(COSMETIC_CATALOG, owned, "spark", "trail_1", 10)).toBeNull();
    const on = equipCosmetic(COSMETIC_CATALOG, owned, "trail", "trail_1", 10);
    expect(on?.equipped.trail).toEqual({ id: "trail_1", at: 10 });
    expect(loadoutOf(COSMETIC_CATALOG, on ?? owned)).toEqual({ trail: "trail_1" });
    const off = equipCosmetic(COSMETIC_CATALOG, on ?? owned, "trail", null, 5);
    expect(off?.equipped.trail?.id).toBeNull();
    expect(off?.equipped.trail?.at).toBe(11);
    const first = firstItem();
    expect(itemStatus(COSMETIC_CATALOG, on ?? owned, first, noBoss)).toBe("equipped");
  });

  it("falls back to the default look for an unknown or unowned equipped id", () => {
    const state = normalizeCosmeticState({
      v: 1,
      owned: { future_trail: 100 },
      equipped: { trail: { id: "future_trail", at: 3 }, spark: { id: "spark_1", at: 3 } },
    });
    expect(loadoutOf(COSMETIC_CATALOG, state)).toEqual({});
  });

  it("merges by union and newest equip, commutatively, associatively and idempotently", () => {
    const a = normalizeCosmeticState({ v: 1, owned: { x: 10, y: 20 }, equipped: { trail: { id: "x", at: 5 } } });
    const b = normalizeCosmeticState({ v: 1, owned: { y: 25, z: 30 }, equipped: { trail: { id: "z", at: 9 } } });
    const c = normalizeCosmeticState({ v: 1, owned: { w: 1 }, equipped: { spark: { id: "w", at: 9 } } });
    const ab = mergeCosmeticStates(a, b);
    expect(ab).toEqual(mergeCosmeticStates(b, a));
    expect(ab.owned).toEqual({ x: 10, y: 25, z: 30 });
    expect(ab.equipped.trail).toEqual({ id: "z", at: 9 });
    expect(mergeCosmeticStates(ab, ab)).toEqual(ab);
    expect(mergeCosmeticStates(mergeCosmeticStates(a, b), c)).toEqual(
      mergeCosmeticStates(a, mergeCosmeticStates(b, c)),
    );
    const tie = mergeCosmeticStates(
      normalizeCosmeticState({ v: 1, owned: {}, equipped: { trail: { id: "a", at: 4 } } }),
      normalizeCosmeticState({ v: 1, owned: {}, equipped: { trail: { id: "b", at: 4 } } }),
    );
    expect(tie.equipped.trail?.id).toBe("b");
  });
});
