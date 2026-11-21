/**
 * The view contracts of the Shop's SHARDS tab: loadouts, collections and the shelves of cosmetic cards.
 * Kept apart from the other screen contracts so the tab's shape has one home.
 */

/** The colours and text a cosmetic look is made of, for the small preview on its card. */
export interface ShardSwatchView {
  readonly colors: readonly string[];
  readonly text?: string;
}
/** One card on a shelf. `id` is null for the game own look in that slot. */
export interface ShardCardView {
  readonly id: string | null;
  readonly slot: string;
  readonly label: string;
  readonly tier: string;
  readonly state: "equipped" | "owned" | "available" | "locked" | "elsewhere";
  /** Shown while the item is for sale. */
  readonly price?: number;
  readonly affordable: boolean;
  /** What to do to get it, for a locked or earned-elsewhere item; empty otherwise. */
  readonly note: string;
  readonly isNew: boolean;
  readonly swatch: ShardSwatchView;
  /** The name of the collection the item belongs to, if any. */
  readonly collection?: string;
}
/** One saved loadout on the SHARDS tab's loadout row. */
export interface ShardLoadoutView {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}
/** Where the player stands on one collection, for its strip above the shelves. */
export interface ShardCollectionView {
  readonly id: string;
  readonly name: string;
  readonly owned: number;
  readonly total: number;
  readonly complete: boolean;
  /** The reward item's name, if the collection has one. */
  readonly reward?: string;
  /** What unlocks it, while it is locked; empty otherwise. */
  readonly note: string;
}
export interface ShardShelfView {
  readonly slot: string;
  readonly label: string;
  /** False when nothing draws this slot in a run yet. */
  readonly hookReady: boolean;
  readonly cards: readonly ShardCardView[];
}
export interface ShardsView {
  /** Shards left to spend. */
  readonly balance: number;
  /** Shards earned in total. */
  readonly earned: number;
  readonly shelves: readonly ShardShelfView[];
  /** The saved loadouts, in pool order; exactly one is active. */
  readonly loadouts: readonly ShardLoadoutView[];
  readonly canAddLoadout: boolean;
  /** The active loadout's DELETE is waiting for its confirming press. */
  readonly deleteArmed: boolean;
  readonly collections: readonly ShardCollectionView[];
}
