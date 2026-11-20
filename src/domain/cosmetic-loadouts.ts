/**
 * Named loadouts: several saved sets of equipped items, one in use. Pure state transitions over the saved
 * cosmetic record; the profile store commits them and the merge in cosmetics.ts reconciles devices.
 *
 * Loadouts live under a fixed pool of MAX_LOADOUTS ids. Creating one takes a free id from the pool, deleting
 * one leaves a tombstone (`deletedAt`) on its id, and creating again on that id is a newer edit that brings it
 * back. So tombstones never count against the limit and can never outnumber the pool, and the merge stays the
 * plain per-field "newest wins" that is commutative, associative and idempotent. Slot entries older than a
 * loadout's deletion belong to the deleted loadout and are never read. Two devices creating a loadout at once
 * may pick the same free id; the merge then keeps one loadout with the newer name and each slot's newer item.
 */
import {
  DEFAULT_LOADOUT_ID,
  MAX_LOADOUT_NAME,
  MAX_LOADOUTS,
  type CosmeticState,
  type SavedLoadout,
} from "./cosmetic-types";
import { nameProblem } from "./display-names";
import { ownValue } from "./records";

/** The name of the loadout that exists before the player makes any other. */
export const DEFAULT_LOADOUT_NAME = "MAIN";
const LOADOUT_NAME_PREFIX = "LOADOUT";
/** Shortest name a player may give a loadout. */
export const MIN_LOADOUT_NAME = 1;

/** Every id a loadout may have, MAIN first. */
export const LOADOUT_IDS: readonly string[] = Object.freeze([
  DEFAULT_LOADOUT_ID,
  ...Array.from({ length: MAX_LOADOUTS - 1 }, (_, index) => `loadout_${String(index + 2)}`),
]);

const latestChange = (loadout: SavedLoadout): number =>
  Math.max(loadout.nameAt, ...Object.values(loadout.slots).map((entry) => entry.at));
const isDeleted = (loadout: SavedLoadout): boolean =>
  loadout.deletedAt !== undefined && loadout.deletedAt >= latestChange(loadout);

/** A time later than `now` and every time given, so the change it stamps wins the merge. */
export const stampAfter = (now: number, ...times: readonly number[]): number =>
  Math.max(Math.trunc(now), ...times.map((time) => time + 1));

/** The loadout saved under `id` as it stands now, or undefined when there is none or it was deleted. */
export function liveLoadout(state: CosmeticState, id: string): SavedLoadout | undefined {
  const loadout = ownValue(state.loadouts, id);
  if (!loadout || isDeleted(loadout)) return undefined;
  const deletedAt = loadout.deletedAt;
  if (deletedAt === undefined) return loadout;
  const slots = Object.fromEntries(Object.entries(loadout.slots).filter(([, entry]) => entry.at > deletedAt));
  return { ...loadout, slots };
}

/** The loadout in use, or undefined while nothing has been equipped yet. */
export const activeLoadout = (state: CosmeticState): SavedLoadout | undefined => liveLoadout(state, state.active.id);

export interface LoadoutSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

/** The loadouts the player has, in pool order. MAIN is always listed, and in use when nothing else is. */
export function loadoutSummaries(state: CosmeticState): LoadoutSummary[] {
  const inUse = activeLoadout(state) ? state.active.id : DEFAULT_LOADOUT_ID;
  return LOADOUT_IDS.flatMap((id) => {
    const loadout = liveLoadout(state, id);
    if (!loadout && id !== DEFAULT_LOADOUT_ID) return [];
    return [{ id, name: loadout?.name ?? DEFAULT_LOADOUT_NAME, active: id === inUse }];
  });
}

const withLoadout = (state: CosmeticState, id: string, loadout: SavedLoadout): CosmeticState => ({
  ...state,
  loadouts: { ...state.loadouts, [id]: loadout },
});

/** A copy of the loadout in use under the first free id, named for its place, and put in use. Null when full. */
export function createLoadout(state: CosmeticState, now: number): CosmeticState | null {
  const index = LOADOUT_IDS.findIndex((id) => id !== DEFAULT_LOADOUT_ID && !liveLoadout(state, id));
  const id = LOADOUT_IDS[index];
  if (id === undefined) return null;
  const previous = ownValue(state.loadouts, id);
  const at = stampAfter(now, previous ? latestChange(previous) : -1, previous?.deletedAt ?? -1, state.active.at);
  const copied = Object.entries(activeLoadout(state)?.slots ?? {}).map(([slot, entry]) => [slot, { id: entry.id, at }]);
  const loadout: SavedLoadout = {
    name: `${LOADOUT_NAME_PREFIX} ${String(index + 1)}`,
    nameAt: at,
    ...(previous?.deletedAt !== undefined ? { deletedAt: previous.deletedAt } : {}),
    slots: Object.fromEntries(copied),
  };
  return { ...withLoadout(state, id, loadout), active: { id, at } };
}

/** Puts a loadout the player has in use. MAIN may always be chosen. */
export function switchLoadout(state: CosmeticState, id: string, now: number): CosmeticState | null {
  if (id !== DEFAULT_LOADOUT_ID && !liveLoadout(state, id)) return null;
  return { ...state, active: { id, at: stampAfter(now, state.active.at) } };
}

/** Renames a loadout the player has; null when the name breaks the shared name rules. */
export function renameLoadout(state: CosmeticState, id: string, name: string, now: number): CosmeticState | null {
  const trimmed = name.trim();
  if (nameProblem(trimmed, MIN_LOADOUT_NAME, MAX_LOADOUT_NAME) !== null) return null;
  const loadout = liveLoadout(state, id);
  if (!loadout && id !== DEFAULT_LOADOUT_ID) return null;
  const stored = ownValue(state.loadouts, id);
  const nameAt = stampAfter(now, stored ? latestChange(stored) : -1, stored?.deletedAt ?? -1);
  return withLoadout(state, id, { ...(stored ?? { slots: {} }), name: trimmed, nameAt });
}

/** Deletes a loadout other than MAIN. Deleting the one in use puts MAIN in use. */
export function deleteLoadout(state: CosmeticState, id: string, now: number): CosmeticState | null {
  const stored = ownValue(state.loadouts, id);
  if (id === DEFAULT_LOADOUT_ID || !stored || !liveLoadout(state, id)) return null;
  const deletedAt = stampAfter(now, latestChange(stored));
  const next = withLoadout(state, id, { ...stored, deletedAt });
  if (state.active.id !== id) return next;
  return { ...next, active: { id: DEFAULT_LOADOUT_ID, at: stampAfter(now, state.active.at) } };
}
