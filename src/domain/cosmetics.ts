/**
 * Cosmetics: presentation-only items bought with shards or granted by play. Pure state and maths shared
 * by the catalog, the profile store and the screens. Nothing here reads or writes simulation state.
 *
 * Ownership is `owned: { itemId: shardsPaid }`. The balance is never stored: it is the shards earned (the
 * profile's existing `shards`) minus the shards paid for owned items, so it cannot drift from ownership
 * and merges (max / union / newest) converge on every device.
 */
import {
  type Acquisition,
  COSMETIC_STATE_VERSION,
  DEFAULT_LOADOUT_ID,
  MAX_LOADOUT_NAME,
  MAX_OWNED,
  type CosmeticCatalog,
  type CosmeticCollection,
  type CosmeticItem,
  type CosmeticState,
  type EquippedEntry,
  type Loadout,
  type SavedLoadout,
} from "./cosmetic-types";
import {
  activeLoadout,
  activeLoadoutId,
  freshMainLoadout,
  isLoadoutIdentity,
  isLoadoutPlace,
  LOADOUT_IDS,
  loadoutIdentity,
  mergeLoadoutRecords,
  settleLoadouts,
  stampAfter,
} from "./cosmetic-loadouts";
import { isItemId } from "./identifiers";
import { hasOwnKey, isRecord, ownValue } from "./records";
import { conditionMet, type ProgressFacts, type UnlockCondition } from "./unlock-condition";

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
    for (const [key, entry] of Object.entries(value)) if (isItemId(key) && wholeNumber(entry)) output[key] = entry;
  return output;
}

function slotMap(value: unknown): Record<string, EquippedEntry> {
  const output: Record<string, EquippedEntry> = {};
  if (!isRecord(value)) return output;
  for (const [slot, entry] of Object.entries(value)) {
    if (!isItemId(slot) || !isRecord(entry) || !wholeNumber(entry.at)) continue;
    if (entry.id === null || isItemId(entry.id)) output[slot] = { id: entry.id, at: entry.at };
  }
  return output;
}

/** The entries of `map` whose key passes `keep`. */
function keepKeys(map: Readonly<Record<string, number>>, keep: (id: string) => boolean): Record<string, number> {
  return Object.fromEntries(Object.entries(map).filter(([id]) => keep(id)));
}

/** A saved loadout under a pool id, or undefined when it is not one. A legacy `deletedAt` is reported apart. */
function savedLoadout(id: string, entry: unknown): { loadout: SavedLoadout; deletedAt?: number } | undefined {
  if (!LOADOUT_IDS.includes(id) || !isRecord(entry) || typeof entry.name !== "string") return undefined;
  const nameAt = wholeNumber(entry.nameAt) ? entry.nameAt : 0;
  const slots = slotMap(entry.slots);
  const name = entry.name.slice(0, MAX_LOADOUT_NAME);
  if (id === DEFAULT_LOADOUT_ID) return { loadout: { ...freshMainLoadout(), name, nameAt, slots } };
  // A record written before loadouts had a creation time is dated by its name.
  const createdAt = wholeNumber(entry.createdAt) ? entry.createdAt : nameAt;
  const home = typeof entry.home === "string" && isLoadoutPlace(entry.home) ? { home: entry.home } : {};
  const loadout: SavedLoadout = { name, nameAt, createdAt, ...home, slots };
  return { loadout, ...(wholeNumber(entry.deletedAt) ? { deletedAt: entry.deletedAt } : {}) };
}

/**
 * Any stored or remote value to a valid state. Malformed entries are dropped, never thrown on. Unknown item and
 * slot ids are kept (a newer client may know them) and no owned item is dropped for being too many, so a save
 * never loses an item depending on key order. Loadouts are settled by the rule the merge uses, so only pool ids
 * are kept, and an entry an earlier build marked deleted counts as a delete.
 */
export function normalizeCosmeticState(value: unknown): CosmeticState {
  if (!isRecord(value) || value.v !== COSMETIC_STATE_VERSION) return emptyCosmeticState();
  const loadouts: Record<string, SavedLoadout> = {};
  const deletedLoadouts = numberMap(value.deletedLoadouts);
  if (isRecord(value.loadouts))
    for (const [id, entry] of Object.entries(value.loadouts)) {
      const saved = savedLoadout(id, entry);
      if (!saved) continue;
      if (saved.deletedAt === undefined) loadouts[id] = saved.loadout;
      else deletedLoadouts[loadoutIdentity(id, saved.loadout)] = saved.deletedAt;
    }
  const raw = value.active;
  const at = isRecord(raw) && wholeNumber(raw.at) ? raw.at : 0;
  const named = isRecord(raw) && typeof raw.id === "string" ? raw.id : DEFAULT_LOADOUT_ID;
  // An earlier build named the loadout in use by its pool id.
  const listed = ownValue(loadouts, named);
  const id = listed ? loadoutIdentity(named, listed) : named;
  return {
    v: COSMETIC_STATE_VERSION,
    owned: numberMap(value.owned),
    seen: numberMap(value.seen),
    counters: numberMap(value.counters),
    ...settleLoadouts([{ loadouts, deletedLoadouts }]),
    active: { id: isLoadoutIdentity(id) ? id : DEFAULT_LOADOUT_ID, at },
  };
}

function mergeNumbers(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
  pick: (x: number, y: number) => number,
): Record<string, number> {
  const output: Record<string, number> = { ...a };
  for (const [key, entry] of Object.entries(b)) {
    const current = ownValue(output, key);
    output[key] = current === undefined ? entry : pick(current, entry);
  }
  return output;
}

/**
 * Union of ownership (larger price on a clash), earliest seen, largest counters, and the loadouts settled by
 * `mergeLoadoutRecords` (src/domain/cosmetic-loadouts.ts). Order-independent: merge(a, b) equals merge(b, a).
 *
 * Owned items and counters are never dropped, whatever their id: dropping an owned item would refund its
 * shards with nobody seeing why, and a counter may be a newer client's progress toward an item this build does
 * not list yet, which an older device merging the profile must not erase. With the catalog, `seen` is kept
 * for its items only: a seen mark may name an item the player does not own (looking at a shelf clears its NEW
 * mark before buying), and losing one for an id this build does not list only shows NEW once more. Each entry
 * is judged alone, so the merge stays commutative, associative and idempotent (loadouts within their limits).
 */
export function mergeCosmeticStates(
  left: CosmeticState,
  right: CosmeticState,
  catalog?: CosmeticCatalog,
): CosmeticState {
  const seen = mergeNumbers(left.seen, right.seen, Math.min);
  return {
    v: COSMETIC_STATE_VERSION,
    owned: mergeNumbers(left.owned, right.owned, Math.max),
    seen: catalog ? keepKeys(seen, (id) => catalog.items.some((item) => item.id === id)) : seen,
    counters: mergeNumbers(left.counters, right.counters, Math.max),
    ...mergeLoadoutRecords(left, right),
  };
}

export const cosmeticsSpent = (state: CosmeticState): number =>
  Object.values(state.owned).reduce((sum, price) => sum + price, 0);

/** Shards earned as a usable count: a missing or broken saved value counts as none. */
export const shardsEarned = (earned: number): number => (Number.isFinite(earned) ? Math.max(0, earned) : 0);
/** Shards left to spend. Never negative: merging two devices' purchases can overspend, which only blocks buying. */
export const shardBalance = (earned: number, state: CosmeticState): number =>
  Math.max(0, shardsEarned(earned) - cosmeticsSpent(state));

export const priceOf = (catalog: CosmeticCatalog, item: CosmeticItem): number =>
  catalog.tiers.find((tier) => tier.id === item.tier)?.price ?? Number.POSITIVE_INFINITY;
const sellsForShards = (item: CosmeticItem): boolean => item.acquire.some((entry) => entry.how === "shards");

/** Whether the player owns the item (bought or granted). */
const owns = (state: CosmeticState, id: string): boolean => hasOwnKey(state.owned, id);

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
  if (owns(state, item.id)) {
    const slots = activeLoadout(state)?.slots;
    return slots && ownValue(slots, item.slot)?.id === item.id ? "equipped" : "owned";
  }
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
 * The profile fact an acquire entry grants on, in the shared condition language, or null when it is not one
 * (shards are a purchase, a collection is completed by ownership, the other kinds are not live yet). Grants and
 * the shipped-data reference check both read it, so an achievement or boss id is judged one way everywhere.
 */
export function acquireCondition(entry: Acquisition): UnlockCondition | null {
  if (entry.how === "achievement") return { type: "achievement", id: entry.id };
  if (entry.how === "boss") return { type: "boss-defeat", bossId: entry.id };
  return null;
}

/**
 * Items the player has earned without paying: an achievement, a defeated boss, or a finished collection
 * (its reward). Challenge, mastery, code and bundle grants arrive through their own receipts later.
 */
export function claimableGrants(catalog: CosmeticCatalog, state: CosmeticState, facts: ProgressFacts): string[] {
  const complete = new Set(
    collectionProgress(catalog, state, facts)
      .filter((progress) => progress.complete)
      .map((progress) => progress.collection.id),
  );
  return catalog.items
    .filter((item) => !owns(state, item.id) && !(item.unlock && !conditionMet(item.unlock, facts)))
    .filter((item) =>
      item.acquire.some((entry) => {
        const condition = acquireCondition(entry);
        if (condition) return conditionMet(condition, facts);
        return entry.how === "collection" && complete.has(entry.id);
      }),
    )
    .map((item) => item.id);
}

export interface CollectionProgress {
  readonly collection: CosmeticCollection;
  /** The items that complete it: every item of the collection except its reward. */
  readonly members: readonly CosmeticItem[];
  readonly owned: number;
  /** Its unlock condition is met, so its items may be bought. */
  readonly unlocked: boolean;
  /** Every member is owned, which grants the reward. */
  readonly complete: boolean;
  readonly reward?: CosmeticItem;
}

/** Where the player stands on each collection. The one place membership and completion are decided. */
export function collectionProgress(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  facts: ProgressFacts,
): CollectionProgress[] {
  return catalog.collections.map((collection) => {
    const reward = catalog.items.find((item) => item.id === collection.reward);
    const members = catalog.items.filter((item) => item.collection === collection.id && item.id !== collection.reward);
    const owned = members.filter((item) => owns(state, item.id)).length;
    return {
      collection,
      members,
      owned,
      unlocked: conditionMet(collection.unlock, facts),
      complete: members.length > 0 && owned === members.length,
      ...(reward ? { reward } : {}),
    };
  });
}

export const grantItems = (state: CosmeticState, ids: readonly string[]): CosmeticState => {
  const fresh = ids.filter((id) => !owns(state, id));
  return fresh.length === 0
    ? state
    : { ...state, owned: { ...state.owned, ...Object.fromEntries(fresh.map((id) => [id, 0])) } };
};

/**
 * Equip an owned, known item in the loadout in use (MAIN, saved on first use, when no other is), or clear the
 * slot with `null`. Anything else changes nothing.
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
    if (item?.slot !== slot || !owns(state, item.id)) return null;
  } else if (!catalog.slots.some((entry) => entry.id === slot)) return null;
  const id = activeLoadoutId(state);
  const base = ownValue(state.loadouts, id) ?? freshMainLoadout();
  const at = stampAfter(now, ownValue(base.slots, slot)?.at ?? 0);
  const loadout: SavedLoadout = { ...base, slots: { ...base.slots, [slot]: { id: itemId, at } } };
  return { ...state, loadouts: { ...state.loadouts, [id]: loadout } };
}

/** What is on right now: owned, known and in the right slot. Anything else falls back to the slot's default look. */
export function loadoutOf(catalog: CosmeticCatalog, state: CosmeticState): Loadout {
  const output: Record<string, string> = {};
  const loadout = activeLoadout(state);
  if (!loadout) return output;
  for (const [slot, entry] of Object.entries(loadout.slots)) {
    const item = entry.id ? catalog.items.find((candidate) => candidate.id === entry.id) : undefined;
    if (item?.slot === slot && owns(state, item.id)) output[slot] = item.id;
  }
  return output;
}

export const markSeen = (state: CosmeticState, ids: readonly string[], now: number): CosmeticState => ({
  ...state,
  seen: {
    ...state.seen,
    ...Object.fromEntries(
      ids.filter((id) => !hasOwnKey(state.seen, id)).map((id) => [id, Math.max(0, Math.trunc(now))]),
    ),
  },
});
