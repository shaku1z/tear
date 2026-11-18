/**
 * Types for the cosmetic data files (slots, families, tiers, collections, items) and the saved state.
 * Cosmetics are presentation-only: no look parameter is a gameplay number, and nothing here is read by
 * the simulation.
 */
import type { UnlockCondition } from "./unlock-condition";

export const COSMETIC_STATE_VERSION = 1;
export const MAX_PRICE = 2000;
/** Most items a player can own and most loadouts they can keep. Applied only when buying or creating. */
export const MAX_OWNED = 300;
export const MAX_LOADOUTS = 8;
/** Largest saved cosmetic record, in characters, so cloud and CrazyGames storage stay small. */
export const MAX_STATE_CHARS = 48_000;
export const DEFAULT_LOADOUT_ID = "main";
/** No more than this many full-screen flashes a second, for photosensitive players. */
export const MAX_FLASHES_PER_SECOND = 3;

export type SlotGroup = "combat" | "interface" | "profile" | "music";
/** "ready": the presentation hook that reads this slot exists. "not yet": the slot and its data exist, the hook does not. */
export type SlotHook = "ready" | "not yet";
export type Look = Readonly<Record<string, unknown>>;

export interface CosmeticSlot {
  readonly id: string;
  readonly label: string;
  readonly group: SlotGroup;
  readonly family: string;
  readonly hook: SlotHook;
  /** The game's own look for this slot, shown when nothing is equipped. */
  readonly default: Look;
}

/** One parameter of a look family. A new parameter is a deliberate edit of families.json. */
export type ParamSpec =
  | Readonly<{ type: "color"; readable?: boolean }>
  | Readonly<{ type: "colors"; min: number; max: number; readable?: boolean }>
  | Readonly<{ type: "number"; min: number; max: number }>
  | Readonly<{ type: "int"; min: number; max: number }>
  | Readonly<{ type: "enum"; values: readonly string[] }>
  | Readonly<{ type: "text"; min: number; max: number }>
  | Readonly<{ type: "id" }>;

export interface LookFamily {
  readonly id: string;
  readonly params: Readonly<Record<string, ParamSpec>>;
  /** The calm version used for reduced motion and low graphics: parameter overrides, validated like a look. */
  readonly calm: Look;
}

export interface PriceTier {
  readonly id: string;
  readonly price: number;
}

/** How an item can be had. Only "shards" is a purchase; the rest are free grants or reserved shapes. */
export type Acquisition =
  | Readonly<{ how: "shards" }>
  | Readonly<{ how: "achievement" | "boss" | "challenge" | "mastery" | "collection" | "bundle"; id: string }>
  | Readonly<{ how: "code"; campaign: string }>;

export interface CosmeticItem {
  readonly id: string;
  readonly slot: string;
  readonly name: string;
  readonly tier: string;
  readonly acquire: readonly Acquisition[];
  readonly collection?: string;
  /** Extra condition for buying or being granted the item, in the shared condition language. */
  readonly unlock?: UnlockCondition;
  readonly look: Look;
  /** Optional art asset (from the asset manifest); the parameter look is always the fallback. */
  readonly asset?: string;
  /** Later tiers of the same item: the look changes as a counter grows. Reserved for the evolution work. */
  readonly evolves?: readonly Readonly<{ counter: string; at: number; look: Look }>[];
}

export interface CosmeticCollection {
  readonly id: string;
  readonly name: string;
  readonly unlock: UnlockCondition;
  /** Item granted when every other item of the collection is owned. */
  readonly reward?: string;
}

export interface CosmeticCatalog {
  readonly slots: readonly CosmeticSlot[];
  readonly families: readonly LookFamily[];
  readonly tiers: readonly PriceTier[];
  readonly collections: readonly CosmeticCollection[];
  readonly items: readonly CosmeticItem[];
  /** Ids of art assets that exist; empty until the art session adds some. */
  readonly assets: readonly string[];
}

export interface EquippedEntry {
  readonly id: string | null;
  readonly at: number;
}
export interface SavedLoadout {
  readonly name: string;
  readonly nameAt: number;
  /** Set when deleted. The loadout stays as a tombstone so a delete wins over an older edit on another device. */
  readonly deletedAt?: number;
  readonly slots: Readonly<Record<string, EquippedEntry>>;
}
export interface CosmeticState {
  readonly v: typeof COSMETIC_STATE_VERSION;
  /** itemId to the shards paid (0 for a free grant). */
  readonly owned: Readonly<Record<string, number>>;
  /** itemId to the time the player first saw it (drives the "new" badge). */
  readonly seen: Readonly<Record<string, number>>;
  /** Evolution counters, merged by maximum. */
  readonly counters: Readonly<Record<string, number>>;
  readonly loadouts: Readonly<Record<string, SavedLoadout>>;
  readonly active: Readonly<{ id: string; at: number }>;
}

/** The plain object every consumer of a look takes (the dispatcher, a replay, a profile card, a co-op partner). */
export type Loadout = Readonly<Record<string, string>>;
