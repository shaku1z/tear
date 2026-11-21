import { describe, expect, it } from "vitest";

import { normalizeCosmeticState } from "../../src/domain/cosmetics";
import { conditionText, type ConditionNames, type ProgressFacts } from "../../src/domain/unlock-condition";
import { CONDITION_NAMES, statWords } from "../../src/gameplay/progression/condition-names";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { AUTHORED_STAGES } from "../../src/gameplay/stages";
import {
  buildShardShelves,
  lookSwatch,
  SHARD_CARD,
  SHARD_SHELF,
  shardCardLayout,
  shardShelvesHeight,
  type ShardShelvesInput,
} from "../../src/presentation/shard-shelves-snapshot";
import { TYPE_SCALE } from "../../src/presentation/ui-tokens";
import { buildShopSnapshot, shopVisibleHeight } from "../../src/presentation/shop-snapshot";
import { createLoadout } from "../../src/domain/cosmetic-loadouts";
import { grantItems } from "../../src/domain/cosmetics";
import { MAX_LOADOUTS } from "../../src/domain/cosmetic-types";
import type { ScreenRenderContext } from "../../src/presentation/screens/contracts";
import { createShardShelves } from "../../src/presentation/screens/shard-shelves";
import { createPageFrame, type PageFrame } from "../../src/presentation/screens/page-frame";

const nobody: ProgressFacts = {
  bossDefeated: () => false,
  biomeEntered: () => false,
  stat: () => 0,
  achievementUnlocked: () => false,
};
const names: ConditionNames = {
  boss: (id) => `boss ${id}`,
  biome: (biome) => `biome ${biome}`,
  achievement: (id) => `achievement ${id}`,
  stat: (key) => `stat ${key}`,
};
const input = (over: Partial<ShardShelvesInput> = {}): ShardShelvesInput => ({
  catalog: COSMETIC_CATALOG,
  state: normalizeCosmeticState(undefined),
  earned: 0,
  facts: nobody,
  names: CONDITION_NAMES,
  collectionName: (id) => id,
  newItems: new Set(),
  deleteArmed: null,
  ...over,
});
const card = (view: ReturnType<typeof buildShardShelves>, id: string | null, slot?: string) =>
  view.shelves
    .flatMap((shelf) => shelf.cards)
    .find((entry) => entry.id === id && (slot === undefined || entry.slot === slot));

describe("condition text", () => {
  it("says each kind of requirement in words and joins an all", () => {
    expect(conditionText({ type: "default" }, names)).toBe("");
    expect(conditionText({ type: "boss-defeat", bossId: "rootbound" }, names)).toBe("Defeat boss rootbound");
    expect(conditionText({ type: "biome-enter", biome: "The Grounds" }, names)).toBe("Reach biome The Grounds");
    expect(conditionText({ type: "stat-threshold", stat: "kills", goal: 1500 }, names)).toBe("Reach 1,500 stat kills");
    expect(conditionText({ type: "achievement", id: "first_boss" }, names)).toBe("Unlock achievement first_boss");
    expect(
      conditionText(
        {
          type: "all",
          of: [{ type: "default" }, { type: "boss-defeat", bossId: "a" }, { type: "achievement", id: "b" }],
        },
        names,
      ),
    ).toBe("Defeat boss a and Unlock achievement b");
  });

  it("names stats in words and bosses and achievements by their real names", () => {
    expect(statWords("bossKills")).toBe("boss kills");
    expect(statWords("encounterEnemy:charger")).toBe("encounter enemy charger");
    expect(CONDITION_NAMES.boss("not-a-boss")).toBe("not-a-boss");
    expect(CONDITION_NAMES.achievement("first_blood")).toBe("First Blood");
    // A biome reads as its stage's name, whether the reference is the stage id or its name.
    for (const stage of AUTHORED_STAGES) {
      expect(CONDITION_NAMES.biome(stage.id)).toBe(stage.name);
      expect(CONDITION_NAMES.biome(stage.name)).toBe(stage.name);
    }
    expect(CONDITION_NAMES.biome("not-a-stage")).toBe("not-a-stage");
  });
});

describe("look swatch", () => {
  it("collects colours and text from the family's parameter list, in order", () => {
    const params = {
      a: { type: "color" },
      b: { type: "colors", min: 1, max: 3 },
      label: { type: "text", min: 1, max: 20 },
      width: { type: "number", min: 0, max: 4 },
    } as const;
    expect(lookSwatch({ a: "#112233", b: ["#445566", 7, "#778899"], label: "DUSK", width: 2 }, params)).toEqual({
      colors: ["#112233", "#445566", "#778899"],
      text: "DUSK",
    });
    expect(lookSwatch({ width: 2 }, params)).toEqual({ colors: [] });
  });
});

describe("shard shelves", () => {
  it("gives one shelf per slot that has items, the game look first and worn", () => {
    const view = buildShardShelves(input());
    const withItems = new Set(COSMETIC_CATALOG.items.map((entry) => entry.slot));
    expect(view.shelves.map((shelf) => shelf.slot)).toEqual(
      COSMETIC_CATALOG.slots.filter((slot) => withItems.has(slot.id)).map((slot) => slot.id),
    );
    for (const shelf of view.shelves) expect(shelf.cards[0]).toMatchObject({ id: null, state: "equipped" });
  });

  it("prices what is for sale, says what earns the rest, and dims nothing it can sell", () => {
    const view = buildShardShelves(input({ earned: 60 }));
    expect(view.balance).toBe(60);
    const forSale = view.shelves.flatMap((shelf) => shelf.cards).filter((entry) => entry.state === "available");
    expect(forSale.length).toBeGreaterThan(0);
    for (const entry of forSale) {
      expect(entry.price).toBeGreaterThanOrEqual(0);
      expect(entry.affordable).toBe((entry.price ?? 0) <= 60);
      expect(entry.note).toBe("");
    }
    for (const entry of view.shelves.flatMap((shelf) => shelf.cards))
      if (entry.state === "locked" || entry.state === "elsewhere") expect(entry.note).not.toBe("");
  });

  it("shows only the unmet part of a requirement", () => {
    const locked = COSMETIC_CATALOG.items.find((entry) => {
      const collection = COSMETIC_CATALOG.collections.find((row) => row.id === entry.collection);
      return collection?.unlock.type === "boss-defeat";
    });
    if (!locked) throw new Error("the catalog has no collection gated by a boss");
    const view = buildShardShelves(input());
    expect(card(view, locked.id)?.state).toBe("locked");
    expect(card(view, locked.id)?.note).toMatch(/^Defeat /u);
    const met = buildShardShelves(input({ facts: { ...nobody, bossDefeated: () => true } }));
    expect(card(met, locked.id)?.note).toBe("");
  });

  it("lights an owned item that is worn, takes the light off the game look, and badges only this visit's new items", () => {
    const owned = COSMETIC_CATALOG.items.find((entry) => entry.acquire.some((way) => way.how === "shards"));
    if (!owned) throw new Error("the catalog sells nothing for shards");
    const state = normalizeCosmeticState({
      v: 1,
      owned: { [owned.id]: 0 },
      loadouts: { main: { name: "MAIN", nameAt: 1, slots: { [owned.slot]: { id: owned.id, at: 2 } } } },
      active: { id: "main", at: 2 },
    });
    const view = buildShardShelves(input({ state, newItems: new Set([owned.id]) }));
    expect(card(view, owned.id)).toMatchObject({ state: "equipped", isNew: true });
    expect(card(view, owned.id)?.price).toBeUndefined();
    expect(card(view, null, owned.slot)?.state).toBe("owned");
    expect(card(buildShardShelves(input({ state })), owned.id)?.isNew).toBe(false);
  });

  it("lays card rows out from the type sizes so larger touch type never collides", () => {
    for (const type of [TYPE_SCALE, { body: 19, micro: 16 }, { body: 24, micro: 20 }]) {
      const layout = shardCardLayout(type, 48);
      // Each row starts a full line under the one before, and the note ends above the button.
      expect(layout.nameY - (SHARD_CARD.pad + SHARD_CARD.swatch)).toBeGreaterThanOrEqual(type.body);
      expect(layout.tierY - layout.nameY).toBeGreaterThanOrEqual(type.micro);
      expect(layout.noteY - layout.tierY).toBeGreaterThanOrEqual(type.micro);
      const noteBottom = layout.noteY + (SHARD_CARD.noteLines - 1) * layout.noteLine;
      expect(layout.height - SHARD_CARD.pad - layout.button - noteBottom).toBeGreaterThanOrEqual(SHARD_CARD.pad);
      expect(layout.button).toBe(48);
    }
    expect(shardCardLayout({ body: 24, micro: 20 }).height).toBeGreaterThan(shardCardLayout(TYPE_SCALE).height);
  });

  it("reads a broken earned total as no shards", () => {
    expect(buildShardShelves(input({ earned: Number.NaN }))).toMatchObject({ earned: 0, balance: 0 });
  });

  it("scrolls the SHARDS tab by the height of its shelves", () => {
    const shards = buildShardShelves(input());
    const base = {
      items: [],
      realCoins: 0,
      displayedCoins: 0,
      lifetimeEarned: 0,
      height: 400,
      scroll: 10_000,
      now: 0,
      level: () => 0,
      cost: () => 0,
      canBuy: () => false,
    };
    const result = buildShopSnapshot({ ...base, tab: "shards", shards });
    expect(result.view).toMatchObject({ tab: "shards", shards });
    expect(result.view.tabs.map((tab) => [tab.id, tab.selected])).toEqual([
      ["upgrades", false],
      ["shards", true],
    ]);
    const height = shardShelvesHeight(shards, SHARD_SHELF.columns.desktop);
    expect(result.maximumScroll).toBe(Math.max(0, height - shopVisibleHeight(400)));
  });

  it("leads with the loadout row: MAIN in use, room for more, nothing armed", () => {
    expect(buildShardShelves(input())).toMatchObject({
      loadouts: [{ id: "main", name: "MAIN", active: true }],
      canAddLoadout: true,
      deleteArmed: false,
    });
  });

  it("arms DELETE only for the loadout in use, and offers no + NEW when every place is taken", () => {
    let state = normalizeCosmeticState(undefined);
    for (let index = 1; index < MAX_LOADOUTS; index += 1) state = createLoadout(state, index) ?? state;
    const full = buildShardShelves(input({ state, deleteArmed: "loadout_8" }));
    expect(full.loadouts.map((entry) => entry.active)).toEqual([...Array<boolean>(MAX_LOADOUTS - 1).fill(false), true]);
    expect(full).toMatchObject({ canAddLoadout: false, deleteArmed: true });
    expect(buildShardShelves(input({ state, deleteArmed: "loadout_2" })).deleteArmed).toBe(false);
  });

  it("shows each collection's count, reward and unlock, and tags its items", () => {
    const view = buildShardShelves(input({ collectionName: (id) => `${id} set` }));
    const rootbound = COSMETIC_CATALOG.collections.find((entry) => entry.id === "rootbound");
    expect(view.collections).toEqual([
      {
        id: "rootbound",
        name: rootbound?.name,
        owned: 0,
        total: 2,
        complete: false,
        reward: COSMETIC_CATALOG.items.find((item) => item.id === rootbound?.reward)?.name,
        note: rootbound ? conditionText(rootbound.unlock, CONDITION_NAMES) : "",
      },
    ]);
    const tagged = view.shelves.flatMap((shelf) => shelf.cards).filter((card) => card.collection !== undefined);
    expect(tagged.map((card) => [card.id, card.collection])).toEqual([
      ["trail_heartwood", "rootbound set"],
      ["title_rootcutter", "rootbound set"],
      ["banner_canopy", "rootbound set"],
    ]);
    const complete = buildShardShelves(
      input({ state: grantItems(normalizeCosmeticState(undefined), ["trail_heartwood", "banner_canopy"]) }),
    );
    expect(complete.collections[0]).toMatchObject({ owned: 2, total: 2, complete: true, note: "" });
  });

  it("gives the renderer exactly the height the scroll extent counts", () => {
    const context = {
      ui: { t: { type: TYPE_SCALE, metric: { minTarget: 0 }, space: { md: 16 } } },
    } as unknown as ScreenRenderContext;
    const frame = { left: 240, width: 1120, compact: false } as unknown as PageFrame;
    for (const state of [normalizeCosmeticState(undefined), createLoadout(normalizeCosmeticState(undefined), 1)]) {
      const view = buildShardShelves(input(state ? { state } : {}));
      const blocks = createShardShelves(context, createPageFrame(context)).shelves(frame, view);
      const drawn = blocks.reduce((sum, block) => sum + block.height, 0);
      expect(drawn).toBe(shardShelvesHeight(view, SHARD_SHELF.columns.desktop));
    }
  });
});
