import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { colourProblem, contrastRatio, isTellColor, relativeLuminance } from "../../src/domain/cosmetic-readability";
import { MAX_OWNED, MAX_STATE_CHARS, type CosmeticCatalog, type CosmeticItem } from "../../src/domain/cosmetic-types";
import { validateCosmeticCatalog, worstCaseStateSize } from "../../src/domain/cosmetic-validation";
import {
  activeLoadout,
  claimableGrants,
  emptyCosmeticState,
  equipCosmetic,
  grantItems,
  itemStatus,
  loadoutOf,
  markSeen,
  mergeCosmeticStates,
  normalizeCosmeticState,
  priceOf,
  purchaseCosmetic,
  shardBalance,
} from "../../src/domain/cosmetics";
import { conditionMet, conditionProblems, type ProgressFacts } from "../../src/domain/unlock-condition";
import { ACHIEVEMENT_CATALOG } from "../../src/gameplay/progression/achievement-catalog";
import { COSMETIC_BACKDROPS, COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { stageDefinition } from "../../src/gameplay/stages";

const facts = (over: Partial<ProgressFacts> = {}): ProgressFacts => ({
  bossDefeated: () => false,
  biomeEntered: () => false,
  stat: () => 0,
  achievementUnlocked: () => false,
  ...over,
});
const rootbound = facts({ bossDefeated: (id) => id === "rootbound" });
const item = (id: string): CosmeticItem => {
  const found = COSMETIC_CATALOG.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};
const problems = (patch: Partial<CosmeticCatalog>): string =>
  validateCosmeticCatalog({ ...COSMETIC_CATALOG, ...patch }, COSMETIC_BACKDROPS).join("\n");
const withItem = (patch: Record<string, unknown>, base = "trail_dusk"): string =>
  problems({ items: [{ ...item(base), ...patch }] });

/** Shards a common achievement pays (the rarity table in achievements.ts), and the daily average (challenges.ts). */
const COMMON_SHARDS = 5;
const DAILY_SHARDS_PER_DAY = 45;

describe("cosmetic data files", () => {
  it("pass the validator on every row", () => {
    expect(validateCosmeticCatalog(COSMETIC_CATALOG, COSMETIC_BACKDROPS)).toEqual([]);
  });

  it("registers every planned slot, and lists the ones whose draw hook does not exist yet", () => {
    expect(COSMETIC_CATALOG.slots.map((slot) => slot.id)).toEqual([
      "blade",
      "trail",
      "tether",
      "dash",
      "parry",
      "slam",
      "updraft",
      "throw",
      "recall",
      "spark",
      "kill",
      "aura",
      "revive",
      "hud",
      "numbers",
      "title",
      "banner",
      "frame",
      "emblem",
      "menu_track",
      "stage_track",
      "stinger",
      "mix_preset",
    ]);
    const ready = COSMETIC_CATALOG.slots.filter((slot) => slot.hook === "ready").map((slot) => slot.id);
    expect(ready).toEqual(["blade", "trail", "spark", "title", "banner"]);
    const notYet = COSMETIC_CATALOG.slots.filter((slot) => slot.hook === "not yet").map((slot) => slot.id);
    expect(notYet).toHaveLength(COSMETIC_CATALOG.slots.length - ready.length);
  });

  it("gives every item a real name", () => {
    for (const entry of COSMETIC_CATALOG.items) expect(entry.name).not.toMatch(/\s\d+$/u);
    expect(new Set(COSMETIC_CATALOG.items.map((entry) => entry.slot)).size).toBeGreaterThan(3);
  });

  it("keeps first purchase, median and whole catalog within the stated times", () => {
    const prices = COSMETIC_CATALOG.items
      .filter((entry) => entry.acquire.some((way) => way.how === "shards"))
      .map((entry) => priceOf(COSMETIC_CATALOG, entry))
      .sort((a, b) => a - b);
    const commons = ACHIEVEMENT_CATALOG.filter((entry) => entry.rarity === "common").length;
    expect(commons * COMMON_SHARDS).toBeGreaterThanOrEqual(prices[0] ?? Infinity);
    const weeks = (shards: number, days: number): number => shards / (DAILY_SHARDS_PER_DAY * days);
    const median = prices[Math.floor(prices.length / 2)] ?? 0;
    const total = prices.reduce((sum, price) => sum + price, 0);
    expect(weeks(median, 3)).toBeLessThanOrEqual(3);
    expect(weeks(total, 3)).toBeLessThanOrEqual(26);
    expect(weeks(total, 7)).toBeLessThanOrEqual(12);
  });

  it("fits the saved-record size budget with every cap reached", () => {
    expect(worstCaseStateSize(COSMETIC_CATALOG)).toBeLessThanOrEqual(MAX_STATE_CHARS);
  });

  it("rejects bad rows with a reason", () => {
    const trail = (colors: string[], extra: Record<string, unknown> = {}) => ({
      look: { colors, widthScale: 1, glow: 0, fade: "linear", ...extra },
    });
    expect(withItem({ tier: "mythic" })).toContain("unknown tier");
    expect(withItem({ collection: "nope" })).toContain("unknown collection");
    expect(withItem({ name: "Trail 1" })).toContain("real name");
    expect(withItem({ acquire: [] })).toContain("acquire");
    expect(withItem({ acquire: [{ how: "achievement" }] })).toContain("needs an id");
    expect(withItem({ unlock: { type: "boss-defeat" } })).toContain("bossId");
    expect(withItem(trail(["#e23b3b"]))).toContain("enemy-tell");
    expect(withItem(trail(["#e0f4d8"]))).toContain("contrast");
    expect(withItem(trail(["#7a4ff0"], { widthScale: 3 }))).toContain("widthScale");
    expect(withItem(trail(["#7a4ff0"], { damage: 9 }))).toContain("not allowed");
    expect(withItem({ asset: "sheet_a" })).toContain("manifest");
    expect(withItem({ evolves: [{ counter: "kills", at: 5, look: { glow: 9 } }] })).toContain("glow");
    expect(problems({ items: [item("trail_dusk"), item("trail_dusk")] })).toContain("duplicate item id");
    expect(problems({ tiers: [{ id: "common", price: 99_999 }] })).toContain("price");
  });

  it("allows a tell colour on a profile banner", () => {
    const swapped = { ...item("banner_nightfall"), look: { colors: ["#e23b3b", "#1b2130"], pattern: "flat" } };
    const items = COSMETIC_CATALOG.items.map((entry) => (entry.id === swapped.id ? swapped : entry));
    expect(problems({ items })).toBe("");
  });

  it("rejects a family that allows a pulse above three a second", () => {
    const families = COSMETIC_CATALOG.families.map((family) =>
      family.id === "aura"
        ? { ...family, params: { ...family.params, pulseRate: { type: "number" as const, min: 0, max: 9 } } }
        : family,
    );
    expect(problems({ families })).toContain("per second");
  });

  it("rejects a reward that is not acquired by its collection", () => {
    const collections = COSMETIC_CATALOG.collections.map((entry) => ({ ...entry, reward: "title_wanderer" }));
    expect(problems({ collections })).toContain("reward");
  });
});

describe("readability rules", () => {
  it("accept the game's own default swing trail colour", () => {
    expect(colourProblem(CONFIG.colors.bladeTrail, COSMETIC_BACKDROPS)).toBeNull();
  });
  it("flag the enemy-tell colours the game uses", () => {
    for (const tell of [CONFIG.colors.enemyShot, CONFIG.colors.slam, CONFIG.colors.scarf])
      expect(isTellColor(tell)).toBe(true);
  });
  it("read their backdrops from the stage definitions", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(COSMETIC_BACKDROPS.verdant).toBe(stageDefinition("verdant-sanctum").bg);
    expect(relativeLuminance(COSMETIC_BACKDROPS.dark ?? "#fff")).toBeLessThan(0.02);
  });
});

describe("unlock conditions", () => {
  it("validate and evaluate in the language music and achievements already use", () => {
    expect(conditionProblems({ type: "boss-defeat", bossId: "rootbound" }, "x")).toEqual([]);
    expect(conditionProblems({ type: "default" }, "x")).toEqual([]);
    expect(conditionProblems({ type: "stat-threshold", stat: "kills", goal: 0 }, "x")).not.toEqual([]);
    expect(conditionProblems({ type: "nope" }, "x")).not.toEqual([]);
    expect(conditionProblems({ type: "all", of: [] }, "x")).not.toEqual([]);
    const all = {
      type: "all",
      of: [
        { type: "boss-defeat", bossId: "rootbound" },
        { type: "stat-threshold", stat: "kills", goal: 5 },
      ],
    } as const;
    expect(conditionMet(all, rootbound)).toBe(false);
    expect(conditionMet(all, facts({ bossDefeated: () => true, stat: () => 5 }))).toBe(true);
  });
});

describe("cosmetic state", () => {
  it("drops malformed entries, keeps unknown ids, never throws", () => {
    const state = normalizeCosmeticState({
      v: 1,
      owned: { good: 50, free: 0, bad_price: -3, frac: 1.5, str: "9", "Bad Id": 5, future_item: 400 },
      seen: { good: 3, bad: "x" },
      counters: { kills_trail_dusk: 40 },
      loadouts: {
        main: {
          name: "Main",
          nameAt: 2,
          slots: { trail: { id: "good", at: 5 }, spark: { id: null, at: 2 }, banner: { id: "x", at: -1 } },
        },
        broken: "no",
      },
      active: { id: "main", at: 4 },
    });
    expect(state.owned).toEqual({ good: 50, free: 0, future_item: 400 });
    expect(state.seen).toEqual({ good: 3 });
    expect(state.loadouts.main?.slots).toEqual({ trail: { id: "good", at: 5 }, spark: { id: null, at: 2 } });
    expect(state.loadouts.broken).toBeUndefined();
    for (const junk of [null, undefined, 7, "x", [], { v: 2 }, { v: 1, owned: [], loadouts: 3 }])
      expect(normalizeCosmeticState(junk)).toEqual(emptyCosmeticState());
  });

  it("derives the balance from earned shards and owned prices, never below zero", () => {
    const state = normalizeCosmeticState({ v: 1, owned: { a: 60, b: 40, gift: 0 } });
    expect(shardBalance(150, state)).toBe(50);
    expect(shardBalance(90, state)).toBe(0);
    expect(shardBalance(Number.NaN, state)).toBe(0);
  });

  it("buys at the tier price, and refuses locked, elsewhere, unaffordable and unknown", () => {
    const empty = emptyCosmeticState();
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "nope", 999, facts())).toEqual({ ok: false, reason: "unknown" });
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "trail_dusk", 24, facts())).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "trail_heartwood", 999, facts())).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(purchaseCosmetic(COSMETIC_CATALOG, empty, "title_giant_slayer", 999, facts())).toEqual({
      ok: false,
      reason: "elsewhere",
    });
    const bought = purchaseCosmetic(COSMETIC_CATALOG, empty, "trail_heartwood", 999, rootbound);
    expect(bought).toMatchObject({ ok: true, paid: 400 });
    if (!bought.ok) return;
    expect(purchaseCosmetic(COSMETIC_CATALOG, bought.state, "trail_heartwood", 999, rootbound)).toEqual({
      ok: false,
      reason: "owned",
    });
    expect(shardBalance(500, bought.state)).toBe(100);
    expect(itemStatus(COSMETIC_CATALOG, empty, item("trail_dusk"), facts())).toBe("available");
  });

  it("never drops entries on load, and caps ownership only when buying", () => {
    const owned = Object.fromEntries(Array.from({ length: MAX_OWNED + 5 }, (_, index) => [`item_${String(index)}`, 1]));
    const state = normalizeCosmeticState({ v: 1, owned });
    expect(Object.keys(state.owned)).toHaveLength(MAX_OWNED + 5);
    expect(purchaseCosmetic(COSMETIC_CATALOG, state, "title_wanderer", 999, facts())).toEqual({
      ok: false,
      reason: "full",
    });
  });

  it("equips owned items in their own slot in the active loadout, and clears with null", () => {
    const owned = normalizeCosmeticState({ v: 1, owned: { trail_dusk: 25 } });
    expect(equipCosmetic(COSMETIC_CATALOG, owned, "trail", "trail_tidewater", 10)).toBeNull();
    expect(equipCosmetic(COSMETIC_CATALOG, owned, "spark", "trail_dusk", 10)).toBeNull();
    expect(equipCosmetic(COSMETIC_CATALOG, owned, "no_such_slot", null, 10)).toBeNull();
    const on = equipCosmetic(COSMETIC_CATALOG, owned, "trail", "trail_dusk", 10);
    expect(on?.loadouts.main?.slots.trail).toEqual({ id: "trail_dusk", at: 10 });
    expect(on && loadoutOf(COSMETIC_CATALOG, on)).toEqual({ trail: "trail_dusk" });
    expect(on && itemStatus(COSMETIC_CATALOG, on, item("trail_dusk"), facts())).toBe("equipped");
    const off = on && equipCosmetic(COSMETIC_CATALOG, on, "trail", null, 5);
    expect(off?.loadouts.main?.slots.trail).toEqual({ id: null, at: 11 });
    expect(off && loadoutOf(COSMETIC_CATALOG, off)).toEqual({});
  });

  it("falls back to the default look for an unknown or unowned equipped id", () => {
    const state = normalizeCosmeticState({
      v: 1,
      owned: { future_trail: 100 },
      loadouts: {
        main: {
          name: "MAIN",
          nameAt: 1,
          slots: { trail: { id: "future_trail", at: 3 }, spark: { id: "spark_orchid", at: 3 } },
        },
      },
    });
    expect(loadoutOf(COSMETIC_CATALOG, state)).toEqual({});
  });

  it("grants earned items: an achievement, a boss, and a finished collection's reward", () => {
    const empty = emptyCosmeticState();
    expect(claimableGrants(COSMETIC_CATALOG, empty, facts())).toEqual([]);
    const earned = facts({ achievementUnlocked: (id) => id === "first_boss" });
    expect(claimableGrants(COSMETIC_CATALOG, empty, earned)).toEqual(["title_giant_slayer"]);
    const both = normalizeCosmeticState({ v: 1, owned: { trail_heartwood: 400, banner_canopy: 400 } });
    expect(claimableGrants(COSMETIC_CATALOG, both, rootbound)).toEqual(["title_rootcutter"]);
    const granted = grantItems(both, ["title_rootcutter"]);
    expect(granted.owned.title_rootcutter).toBe(0);
    expect(claimableGrants(COSMETIC_CATALOG, granted, rootbound)).toEqual([]);
  });

  it("marks items seen once", () => {
    const first = markSeen(emptyCosmeticState(), ["trail_dusk"], 100);
    expect(markSeen(first, ["trail_dusk"], 200).seen).toEqual({ trail_dusk: 100 });
  });

  it("merges commutatively, associatively and idempotently", () => {
    const a = normalizeCosmeticState({
      v: 1,
      owned: { x: 10, y: 20 },
      seen: { x: 9 },
      counters: { k: 4 },
      loadouts: { main: { name: "A", nameAt: 1, slots: { trail: { id: "x", at: 5 } } } },
      active: { id: "main", at: 1 },
    });
    const b = normalizeCosmeticState({
      v: 1,
      owned: { y: 25, z: 30 },
      seen: { x: 3 },
      counters: { k: 7 },
      loadouts: {
        main: { name: "B", nameAt: 4, slots: { trail: { id: "z", at: 9 } } },
        alt: { name: "ALT", nameAt: 2, slots: {} },
      },
      active: { id: "alt", at: 6 },
    });
    const c = normalizeCosmeticState({
      v: 1,
      owned: { w: 1 },
      loadouts: { main: { name: "A", nameAt: 1, slots: { spark: { id: "w", at: 9 } } } },
    });
    const ab = mergeCosmeticStates(a, b);
    expect(ab).toEqual(mergeCosmeticStates(b, a));
    expect(ab.owned).toEqual({ x: 10, y: 25, z: 30 });
    expect(ab.seen).toEqual({ x: 3 });
    expect(ab.counters).toEqual({ k: 7 });
    expect(ab.loadouts.main?.slots.trail).toEqual({ id: "z", at: 9 });
    expect(ab.loadouts.main?.name).toBe("B");
    expect(ab.active).toEqual({ id: "alt", at: 6 });
    expect(mergeCosmeticStates(ab, ab)).toEqual(ab);
    expect(mergeCosmeticStates(mergeCosmeticStates(a, b), c)).toEqual(
      mergeCosmeticStates(a, mergeCosmeticStates(b, c)),
    );
  });

  it("lets a delete win over an older edit and lose to a newer one", () => {
    const base = { name: "ALT", nameAt: 1, slots: { trail: { id: "x", at: 5 } } };
    const deleted = normalizeCosmeticState({ v: 1, loadouts: { alt: { ...base, deletedAt: 8 } } });
    const older = normalizeCosmeticState({ v: 1, loadouts: { alt: base } });
    const newerEdit = normalizeCosmeticState({
      v: 1,
      loadouts: { alt: { ...base, slots: { trail: { id: "y", at: 12 } } } },
    });
    const pointAtAlt = (state: ReturnType<typeof mergeCosmeticStates>) => ({ ...state, active: { id: "alt", at: 1 } });
    expect(activeLoadout(pointAtAlt(mergeCosmeticStates(deleted, older)))).toBeUndefined();
    expect(activeLoadout(pointAtAlt(mergeCosmeticStates(deleted, newerEdit)))?.slots.trail?.id).toBe("y");
  });
});
