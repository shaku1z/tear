/**
 * Cosmetics: presentation-only items bought with shards or granted by play. Pure state and maths shared
 * by the catalog, the profile store and the screens. Nothing here reads or writes simulation state.
 *
 * Ownership is `owned: { itemId: shardsPaid }`. The balance is never stored: it is the shards earned (the
 * profile's existing `shards`) minus the shards paid for owned items, so it cannot drift from ownership
 * and merges (max / union / newest) converge on every device.
 */
import {
  COSMETIC_STATE_VERSION,
  DEFAULT_LOADOUT_ID,
  MAX_LOADOUT_NAME,
  MAX_OWNED,
  type CosmeticCatalog,
  type CosmeticItem,
  type CosmeticState,
  type EquippedEntry,
  type Loadout,
  type SavedLoadout,
} from "./cosmetic-types";
import { isRecord, ITEM_ID } from "./identifiers";
import { conditionMet, type ProgressFacts } from "./unlock-condition";

const wholeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const emptyCosmeticState = (): CosmeticState => ({
  v: COSMETIC_STATE_VERSION,
  owned: {},
  seen: {},
  counters: {},
  loadouts: {},
  active: { id: DEFAULT_LOADOUT_ID, at: 0 },
});

function numberMap(value: unknown): Record<string, number> {
  const output: Record<string, number> = {};
  if (isRecord(value))
    for (const [key, entry] of Object.entries(value)) if (ITEM_ID.test(key) && wholeNumber(entry)) output[key] = entry;
  return output;
}

function slotMap(value: unknown): Record<string, EquippedEntry> {
  const output: Record<string, EquippedEntry> = {};
  if (!isRecord(value)) return output;
  for (const [slot, entry] of Object.entries(value)) {
    if (!ITEM_ID.test(slot) || !isRecord(entry) || !wholeNumber(entry.at)) continue;
    if (entry.id === null || (typeof entry.id === "string" && ITEM_ID.test(entry.id)))
      output[slot] = { id: entry.id, at: entry.at };
  }
  return output;
}

/**
 * Any stored or remote value to a valid state. Malformed entries are dropped, never thrown on. Unknown
 * item, slot and loadout ids are kept (a newer client may know them) and nothing is dropped for being
 * too many, so a save never loses an item depending on key order.
 */
export function normalizeCosmeticState(value: unknown): CosmeticState {
  if (!isRecord(value) || value.v !== COSMETIC_STATE_VERSION) return emptyCosmeticState();
  const loadouts: Record<string, SavedLoadout> = {};
  if (isRecord(value.loadouts))
    for (const [id, entry] of Object.entries(value.loadouts)) {
      if (!ITEM_ID.test(id) || !isRecord(entry) || typeof entry.name !== "string") continue;
      loadouts[id] = {
        name: entry.name.slice(0, MAX_LOADOUT_NAME),
        nameAt: wholeNumber(entry.nameAt) ? entry.nameAt : 0,
        ...(wholeNumber(entry.deletedAt) ? { deletedAt: entry.deletedAt } : {}),
        slots: slotMap(entry.slots),
      };
    }
  const raw = value.active;
  const active =
    isRecord(raw) && typeof raw.id === "string" && ITEM_ID.test(raw.id) && wholeNumber(raw.at)
      ? { id: raw.id, at: raw.at }
      : { id: DEFAULT_LOADOUT_ID, at: 0 };
  return {
    v: COSMETIC_STATE_VERSION,
    owned: numberMap(value.owned),
    seen: numberMap(value.seen),
    counters: numberMap(value.counters),
    loadouts,
    active,
  };
}

const newer = (a: { at: number; id: string | null }, b: { at: number; id: string | null }): boolean =>
  a.at > b.at || (a.at === b.at && (a.id ?? "") > (b.id ?? ""));

function mergeLoadout(left: SavedLoadout, right: SavedLoadout): SavedLoadout {
  const slots: Record<string, EquippedEntry> = { ...left.slots };
  for (const [slot, entry] of Object.entries(right.slots)) {
    const current = slots[slot];
    if (!current || newer(entry, current)) slots[slot] = entry;
  }
  const rightName = right.nameAt > left.nameAt || (right.nameAt === left.nameAt && right.name > left.name);
  const deletedAt = Math.max(left.deletedAt ?? -1, right.deletedAt ?? -1);
  return {
    name: rightName ? right.name : left.name,
    nameAt: Math.max(left.nameAt, right.nameAt),
    ...(deletedAt >= 0 ? { deletedAt } : {}),
    slots,
  };
}

function mergeNumbers(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
  pick: (x: number, y: number) => number,
): Record<string, number> {
  const output: Record<string, number> = { ...a };
  for (const [key, entry] of Object.entries(b)) output[key] = key in output ? pick(output[key] ?? 0, entry) : entry;
  return output;
}

/** Union of ownership (larger price on a clash), earliest seen, largest counters, per-slot newest equip, newest active loadout. */
export function mergeCosmeticStates(left: CosmeticState, right: CosmeticState): CosmeticState {
  const loadouts: Record<string, SavedLoadout> = { ...left.loadouts };
  for (const [id, entry] of Object.entries(right.loadouts)) {
    const current = loadouts[id];
    loadouts[id] = current ? mergeLoadout(current, entry) : entry;
  }
  return {
    v: COSMETIC_STATE_VERSION,
    owned: mergeNumbers(left.owned, right.owned, Math.max),
    seen: mergeNumbers(left.seen, right.seen, Math.min),
    counters: mergeNumbers(left.counters, right.counters, Math.max),
    loadouts,
    active: newer(right.active, left.active) ? right.active : left.active,
  };
}

export const cosmeticsSpent = (state: CosmeticState): number =>
  Object.values(state.owned).reduce((sum, price) => sum + price, 0);

/** Shards left to spend. Never negative: merging two devices' purchases can overspend, which only blocks buying. */
export const shardBalance = (earned: number, state: CosmeticState): number =>
  Math.max(0, (Number.isFinite(earned) ? earned : 0) - cosmeticsSpent(state));

export const priceOf = (catalog: CosmeticCatalog, item: CosmeticItem): number =>
  catalog.tiers.find((tier) => tier.id === item.tier)?.price ?? Number.POSITIVE_INFINITY;
const sellsForShards = (item: CosmeticItem): boolean => item.acquire.some((entry) => entry.how === "shards");

const latestChange = (loadout: SavedLoadout): number =>
  Math.max(loadout.nameAt, ...Object.values(loadout.slots).map((entry) => entry.at));
const isDeletedLoadout = (loadout: SavedLoadout): boolean =>
  loadout.deletedAt !== undefined && loadout.deletedAt >= latestChange(loadout);

/** The loadout in use, or undefined while nothing has been equipped yet. */
export function activeLoadout(state: CosmeticState): SavedLoadout | undefined {
  const loadout = state.loadouts[state.active.id];
  return loadout && !isDeletedLoadout(loadout) ? loadout : undefined;
}

export type ItemStatus = "equipped" | "owned" | "available" | "locked" | "elsewhere";
/**
 * "available": can be bought now. "locked": its collection or own condition is unmet. "elsewhere": not sold
 * for shards (earned by an achievement, a boss, a collection, a code...) and not yet owned.
 */
export function itemStatus(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  item: CosmeticItem,
  facts: ProgressFacts,
): ItemStatus {
  if (state.owned[item.id] !== undefined)
    return activeLoadout(state)?.slots[item.slot]?.id === item.id ? "equipped" : "owned";
  const collection = catalog.collections.find((entry) => entry.id === item.collection);
  if ((collection && !conditionMet(collection.unlock, facts)) || (item.unlock && !conditionMet(item.unlock, facts)))
    return "locked";
  return sellsForShards(item) ? "available" : "elsewhere";
}

export type PurchaseRefusal = "unknown" | "owned" | "locked" | "elsewhere" | "insufficient" | "full";
export type PurchaseResult =
  Readonly<{ ok: true; state: CosmeticState; paid: number }> | Readonly<{ ok: false; reason: PurchaseRefusal }>;

export function purchaseCosmetic(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  itemId: string,
  earned: number,
  facts: ProgressFacts,
): PurchaseResult {
  const item = catalog.items.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: "unknown" };
  const status = itemStatus(catalog, state, item, facts);
  if (status === "owned" || status === "equipped") return { ok: false, reason: "owned" };
  if (status === "locked" || status === "elsewhere") return { ok: false, reason: status };
  if (Object.keys(state.owned).length >= MAX_OWNED) return { ok: false, reason: "full" };
  const price = priceOf(catalog, item);
  if (shardBalance(earned, state) < price) return { ok: false, reason: "insufficient" };
  return { ok: true, paid: price, state: { ...state, owned: { ...state.owned, [item.id]: price } } };
}

/**
 * Items the player has earned without paying: an achievement, a defeated boss, or a finished collection
 * (its reward). Challenge, mastery, code and bundle grants arrive through their own receipts later.
 */
export function claimableGrants(catalog: CosmeticCatalog, state: CosmeticState, facts: ProgressFacts): string[] {
  const owned = (id: string): boolean => state.owned[id] !== undefined;
  const complete = (collectionId: string): boolean => {
    const reward = catalog.collections.find((entry) => entry.id === collectionId)?.reward;
    const members = catalog.items.filter((item) => item.collection === collectionId && item.id !== reward);
    return members.length > 0 && members.every((item) => owned(item.id));
  };
  return catalog.items
    .filter((item) => !owned(item.id) && !(item.unlock && !conditionMet(item.unlock, facts)))
    .filter((item) =>
      item.acquire.some((entry) => {
        if (entry.how === "achievement") return facts.achievementUnlocked(entry.id);
        if (entry.how === "boss") return facts.bossDefeated(entry.id);
        if (entry.how === "collection") return complete(entry.id);
        return false;
      }),
    )
    .map((item) => item.id);
}

export const grantItems = (state: CosmeticState, ids: readonly string[]): CosmeticState => {
  const fresh = ids.filter((id) => state.owned[id] === undefined);
  return fresh.length === 0
    ? state
    : { ...state, owned: { ...state.owned, ...Object.fromEntries(fresh.map((id) => [id, 0])) } };
};

/**
 * Equip an owned, known item in the active loadout (created as "main" on first use), or clear the slot with
 * `null`. Anything else changes nothing.
 */
export function equipCosmetic(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  slot: string,
  itemId: string | null,
  now: number,
): CosmeticState | null {
  if (itemId !== null) {
    const item = catalog.items.find((entry) => entry.id === itemId);
    if (item?.slot !== slot || state.owned[item.id] === undefined) return null;
  } else if (!catalog.slots.some((entry) => entry.id === slot)) return null;
  const live = activeLoadout(state);
  const id = live ? state.active.id : DEFAULT_LOADOUT_ID;
  const base: SavedLoadout = live ?? { name: "MAIN", nameAt: now, slots: {} };
  const at = Math.max(Math.trunc(now), (base.slots[slot]?.at ?? 0) + 1, (state.loadouts[id]?.deletedAt ?? -1) + 1);
  const loadout: SavedLoadout = { ...base, slots: { ...base.slots, [slot]: { id: itemId, at } } };
  return { ...state, loadouts: { ...state.loadouts, [id]: loadout }, active: live ? state.active : { id, at } };
}

/** What is on right now: owned, known and in the right slot. Anything else falls back to the slot's default look. */
export function loadoutOf(catalog: CosmeticCatalog, state: CosmeticState): Loadout {
  const output: Record<string, string> = {};
  const loadout = activeLoadout(state);
  if (!loadout) return output;
  for (const [slot, entry] of Object.entries(loadout.slots)) {
    const item = entry.id ? catalog.items.find((candidate) => candidate.id === entry.id) : undefined;
    if (item?.slot === slot && state.owned[item.id] !== undefined) output[slot] = item.id;
  }
  return output;
}

export const markSeen = (state: CosmeticState, ids: readonly string[], now: number): CosmeticState => ({
  ...state,
  seen: {
    ...state.seen,
    ...Object.fromEntries(
      ids.filter((id) => state.seen[id] === undefined).map((id) => [id, Math.max(0, Math.trunc(now))]),
    ),
  },
});
