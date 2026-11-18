/**
 * Cosmetics: presentation-only items bought with shards. Pure data and maths shared by the catalog,
 * the profile store and the screens. Nothing here reads or writes simulation state, and no look
 * parameter is a gameplay number.
 *
 * Ownership is `owned: { itemId: pricePaid }`. The balance is never stored: it is the shards earned
 * (the profile's existing `shards`) minus the prices paid for owned items, so it cannot drift from
 * ownership and merges (max / union) converge on every device.
 */
import { colourProblem, isHexColor, type ReadabilityBackdrops } from "./cosmetic-readability";

export const COSMETIC_STATE_VERSION = 1;
export const MAX_PRICE = 2000;
/** Most items a player can own. Applied only when buying: loading and merging never drop an entry. */
export const MAX_OWNED = 500;
const ID = /^[a-z0-9_]{1,64}$/u;

export type CosmeticSlotId = "trail" | "spark" | "blade" | "title" | "banner";
export interface CosmeticSlot {
  readonly id: CosmeticSlotId;
  readonly label: string;
  readonly group: "combat" | "profile";
  /** The look keys this slot accepts. A new look parameter is a deliberate change here. */
  readonly lookKeys: readonly string[];
}
/** Slots in shelf order. Adding a slot is one row here. */
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = Object.freeze([
  { id: "trail", label: "TRAIL", group: "combat", lookKeys: ["colors", "widthScale", "glow", "fade"] },
  { id: "spark", label: "SPARK", group: "combat", lookKeys: ["colors", "countScale"] },
  { id: "blade", label: "BLADE", group: "combat", lookKeys: ["edge", "glow", "guard"] },
  { id: "title", label: "TITLE", group: "profile", lookKeys: ["text"] },
  { id: "banner", label: "BANNER", group: "profile", lookKeys: ["colors", "pattern"] },
]);

export type CosmeticLook = Readonly<Record<string, unknown>>;
export interface CosmeticItem {
  readonly id: string;
  readonly slot: CosmeticSlotId;
  readonly name: string;
  readonly price: number;
  readonly collection?: string;
  /** True while the name and look are stand-ins the owner has not yet chosen. */
  readonly placeholder?: boolean;
  readonly look: CosmeticLook;
}
export interface CosmeticCollection {
  readonly id: string;
  readonly name: string;
  /** Defeating this boss unlocks the collection's items for purchase. */
  readonly unlockBoss: string;
  readonly placeholder?: boolean;
}
export interface CosmeticCatalog {
  readonly items: readonly CosmeticItem[];
  readonly collections: readonly CosmeticCollection[];
}

export interface EquippedEntry {
  readonly id: string | null;
  readonly at: number;
}
export interface CosmeticState {
  readonly v: typeof COSMETIC_STATE_VERSION;
  readonly owned: Readonly<Record<string, number>>;
  readonly equipped: Readonly<Record<string, EquippedEntry>>;
}
/** The plain object the renderer-side resolver takes; replays can later pass their own. */
export type Loadout = Readonly<Partial<Record<CosmeticSlotId, string>>>;

export const emptyCosmeticState = (): CosmeticState => ({ v: COSMETIC_STATE_VERSION, owned: {}, equipped: {} });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * Any stored or remote value to a valid state. Malformed entries are dropped, never thrown on:
 * unknown item and slot ids are kept (a newer client may know them) so nothing a player paid for is lost.
 */
export function normalizeCosmeticState(value: unknown): CosmeticState {
  if (!isRecord(value) || value.v !== COSMETIC_STATE_VERSION) return emptyCosmeticState();
  const owned: Record<string, number> = {};
  if (isRecord(value.owned))
    for (const [id, price] of Object.entries(value.owned)) if (ID.test(id) && isPrice(price)) owned[id] = price;
  const equipped: Record<string, EquippedEntry> = {};
  if (isRecord(value.equipped))
    for (const [slot, entry] of Object.entries(value.equipped)) {
      if (!ID.test(slot) || !isRecord(entry)) continue;
      const at = entry.at;
      if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) continue;
      if (entry.id === null || (typeof entry.id === "string" && ID.test(entry.id)))
        equipped[slot] = { id: entry.id, at };
    }
  return { v: COSMETIC_STATE_VERSION, owned, equipped };
}

/** Union of ownership (larger price on a clash), newest equip per slot (ties broken by id so merge commutes). */
export function mergeCosmeticStates(left: CosmeticState, right: CosmeticState): CosmeticState {
  const owned: Record<string, number> = { ...left.owned };
  for (const [id, price] of Object.entries(right.owned)) owned[id] = Math.max(owned[id] ?? 0, price);
  const equipped: Record<string, EquippedEntry> = { ...left.equipped };
  for (const [slot, entry] of Object.entries(right.equipped)) {
    const current = equipped[slot];
    if (!current || entry.at > current.at || (entry.at === current.at && (entry.id ?? "") > (current.id ?? "")))
      equipped[slot] = entry;
  }
  return { v: COSMETIC_STATE_VERSION, owned, equipped };
}

export const cosmeticsSpent = (state: CosmeticState): number =>
  Object.values(state.owned).reduce((sum, price) => sum + price, 0);

/** Shards left to spend. Never negative: a cloud merge of two devices' purchases can overspend, which only blocks buying. */
export const shardBalance = (earned: number, state: CosmeticState): number =>
  Math.max(0, (Number.isFinite(earned) ? earned : 0) - cosmeticsSpent(state));

export type ItemStatus = "equipped" | "owned" | "available" | "locked";
/** `bossKilled` answers from the profile stats; the catalog stays free of stat names. */
export function itemStatus(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  item: CosmeticItem,
  bossKilled: (boss: string) => boolean,
): ItemStatus {
  if (state.owned[item.id] !== undefined) return state.equipped[item.slot]?.id === item.id ? "equipped" : "owned";
  const collection = catalog.collections.find((entry) => entry.id === item.collection);
  if (item.collection !== undefined && (!collection || !bossKilled(collection.unlockBoss))) return "locked";
  return "available";
}

export type PurchaseRefusal = "unknown" | "owned" | "locked" | "insufficient" | "full";
export type PurchaseResult =
  Readonly<{ ok: true; state: CosmeticState; paid: number }> | Readonly<{ ok: false; reason: PurchaseRefusal }>;

export function purchaseCosmetic(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  itemId: string,
  earned: number,
  bossKilled: (boss: string) => boolean,
): PurchaseResult {
  const item = catalog.items.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: "unknown" };
  const status = itemStatus(catalog, state, item, bossKilled);
  if (status === "owned" || status === "equipped") return { ok: false, reason: "owned" };
  if (status === "locked") return { ok: false, reason: "locked" };
  if (Object.keys(state.owned).length >= MAX_OWNED) return { ok: false, reason: "full" };
  if (shardBalance(earned, state) < item.price) return { ok: false, reason: "insufficient" };
  return { ok: true, paid: item.price, state: { ...state, owned: { ...state.owned, [item.id]: item.price } } };
}

/** Equip an owned known item, or clear the slot with `null` (default look). Anything else changes nothing. */
export function equipCosmetic(
  catalog: CosmeticCatalog,
  state: CosmeticState,
  slot: CosmeticSlotId,
  itemId: string | null,
  now: number,
): CosmeticState | null {
  if (itemId !== null) {
    const item = catalog.items.find((entry) => entry.id === itemId);
    if (item?.slot !== slot || state.owned[item.id] === undefined) return null;
  }
  const at = Math.max(Math.trunc(now), (state.equipped[slot]?.at ?? 0) + 1);
  return { ...state, equipped: { ...state.equipped, [slot]: { id: itemId, at } } };
}

/** What is on right now: owned, known and in the right slot. Unknown or unowned entries fall back to the default look. */
export function loadoutOf(catalog: CosmeticCatalog, state: CosmeticState): Loadout {
  const loadout: Partial<Record<CosmeticSlotId, string>> = {};
  for (const slot of COSMETIC_SLOTS) {
    const id = state.equipped[slot.id]?.id;
    const item = id ? catalog.items.find((entry) => entry.id === id) : undefined;
    if (item?.slot === slot.id && state.owned[item.id] !== undefined) loadout[slot.id] = item.id;
  }
  return loadout;
}

const TRAIL_FADES = ["linear", "hold"];
const BANNER_PATTERNS = ["flat", "split", "stripe"];
const inRange = (value: unknown, low: number, high: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

function lookProblems(item: CosmeticItem, backdrops: ReadabilityBackdrops): string[] {
  const slot = COSMETIC_SLOTS.find((entry) => entry.id === item.slot);
  if (!slot || !isRecord(item.look)) return [`${item.id}: unknown slot or missing look`];
  const problems: string[] = [];
  for (const key of Object.keys(item.look))
    if (!slot.lookKeys.includes(key)) problems.push(`${item.id}: look key "${key}" is not allowed on ${slot.id}`);
  const look = item.look;
  const colours = (key: string, min: number, max: number): void => {
    const value = look[key];
    if (!Array.isArray(value) || value.length < min || value.length > max)
      return void problems.push(`${item.id}: ${key} must list ${String(min)} to ${String(max)} colours`);
    for (const colour of value) {
      const problem = colourProblem(colour as string, backdrops);
      if (problem) problems.push(`${item.id}: ${problem}`);
    }
  };
  const single = (key: string): void => {
    const problem = colourProblem(look[key] as string, backdrops);
    if (problem) problems.push(`${item.id}: ${key} ${problem}`);
  };
  if (item.slot === "trail") {
    colours("colors", 1, 3);
    if (!inRange(look.widthScale, 0.8, 1.4)) problems.push(`${item.id}: widthScale must be 0.8 to 1.4`);
    if (!inRange(look.glow, 0, 1)) problems.push(`${item.id}: glow must be 0 to 1`);
    if (!TRAIL_FADES.includes(look.fade as string)) problems.push(`${item.id}: fade must be linear or hold`);
  } else if (item.slot === "spark") {
    colours("colors", 1, 3);
    if (!inRange(look.countScale, 0.8, 1.5)) problems.push(`${item.id}: countScale must be 0.8 to 1.5`);
  } else if (item.slot === "blade") {
    for (const key of ["edge", "glow", "guard"]) single(key);
  } else if (item.slot === "title") {
    const text = look.text;
    if (typeof text !== "string" || text.length < 2 || text.length > 24 || !/^[A-Za-z0-9 '&.-]+$/u.test(text))
      problems.push(`${item.id}: title text must be 2 to 24 plain characters`);
  } else {
    // Banners are drawn behind profile text, never over combat: colours only need to be valid hex.
    const value = look.colors;
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isHexColor))
      problems.push(`${item.id}: banner needs exactly two #rrggbb colours`);
    if (!BANNER_PATTERNS.includes(look.pattern as string)) problems.push(`${item.id}: banner pattern is unknown`);
  }
  return problems;
}

/** Every reason the catalog is invalid, over every row. Empty means valid. */
export function validateCosmeticCatalog(catalog: CosmeticCatalog, backdrops: ReadabilityBackdrops): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const collections = new Set(catalog.collections.map((entry) => entry.id));
  if (collections.size !== catalog.collections.length) problems.push("duplicate collection id");
  for (const collection of catalog.collections) {
    if (!ID.test(collection.id) || !ID.test(collection.unlockBoss) || collection.name.trim() === "")
      problems.push(`collection ${collection.id}: invalid id, boss or name`);
  }
  for (const item of catalog.items) {
    if (!ID.test(item.id)) problems.push(`${item.id}: id must be lowercase letters, digits and underscores`);
    if (seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
    seen.add(item.id);
    if (item.name.trim() === "") problems.push(`${item.id}: empty name`);
    if (!isPrice(item.price) || item.price > MAX_PRICE)
      problems.push(`${item.id}: price must be a whole number 0 to ${String(MAX_PRICE)}`);
    if (item.collection !== undefined && !collections.has(item.collection))
      problems.push(`${item.id}: unknown collection ${item.collection}`);
    problems.push(...lookProblems(item, backdrops));
  }
  return problems;
}
