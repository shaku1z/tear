/**
 * Named loadouts: several saved sets of equipped items, one in use. Pure state transitions over the saved
 * cosmetic record, and the one rule (`settleLoadouts`) that decides a record's loadouts after a load or a merge.
 *
 * Identity. A loadout is known by the pool id it was made under (`home`) and when (`createdAt`); MAIN is always
 * `main`. `active.id` and `deletedLoadouts` name loadouts by identity, so a loadout that moves stays in use, and
 * when the loadout in use no longer exists every reader wears and lists MAIN.
 *
 * Deletes. A delete records the identity, so a copy of that loadout on another device, and any rename or equip
 * made there before the devices met, stays deleted. Only a create makes a loadout, always under a new identity.
 * The newest MAX_DELETED_LOADOUTS deletes are kept.
 *
 * Places. Loadouts sit under a fixed pool of MAX_LOADOUTS ids, and where each one sits follows from the set of
 * loadouts alone: MAIN at `main`, then the earliest made, up to the limit, each at its home when it is the
 * earliest made there and otherwise at the lowest free id. So two devices that each make a loadout before they
 * meet keep both, and the merge is commutative, associative and idempotent while the devices together stay
 * inside the limits. Past them the newest loadouts, and the oldest deletes, are dropped, and which ones can
 * depend on the order the devices merge.
 */
import {
  type CosmeticState,
  DEFAULT_LOADOUT_ID,
  type EquippedEntry,
  MAX_DELETED_LOADOUTS,
  MAX_LOADOUT_NAME,
  MAX_LOADOUTS,
  type SavedLoadout,
} from "./cosmetic-types";
import { nameProblem } from "./display-names";
import { hasOwnKey, ownValue } from "./records";

/** The name of the loadout that exists before the player makes any other. */
export const DEFAULT_LOADOUT_NAME = "MAIN";
const LOADOUT_NAME_PREFIX = "LOADOUT";
/** Shortest name a player may give a loadout. */
export const MIN_LOADOUT_NAME = 1;
/**
 * MAIN's `createdAt`, and the stamp of a default name and of the slots a new loadout copies, so any deliberate
 * rename or equip of that loadout, on any device, is newer.
 */
const UNSTAMPED = 0;

/** Every id a loadout may have, MAIN first. */
export const LOADOUT_IDS: readonly string[] = Object.freeze([
  DEFAULT_LOADOUT_ID,
  ...Array.from({ length: MAX_LOADOUTS - 1 }, (_, index) => `loadout_${String(index + 2)}`),
]);
/** The ids a loadout other than MAIN may sit under. */
const PLACES = LOADOUT_IDS.filter((id) => id !== DEFAULT_LOADOUT_ID);
const WHOLE_NUMBER = /^(?:0|[1-9]\d*)$/u;

/** A time later than `now` and every time given, so the change it stamps wins the merge. */
export const stampAfter = (now: number, ...times: readonly number[]): number =>
  Math.max(Math.trunc(now), ...times.map((time) => time + 1));

const homeOf = (id: string, loadout: SavedLoadout): string => loadout.home ?? id;

/** How `active.id` and `deletedLoadouts` name the loadout saved under `id`: `main`, or `<home>_<createdAt>`. */
export const loadoutIdentity = (id: string, loadout: SavedLoadout): string =>
  id === DEFAULT_LOADOUT_ID ? DEFAULT_LOADOUT_ID : `${homeOf(id, loadout)}_${String(loadout.createdAt)}`;

/** Whether a saved string can name a loadout: `main`, or a pool id other than MAIN, `_` and a whole number. */
export const isLoadoutIdentity = (value: string): boolean =>
  value === DEFAULT_LOADOUT_ID ||
  PLACES.some((id) => value.startsWith(`${id}_`) && WHOLE_NUMBER.test(value.slice(id.length + 1)));

/** Whether a saved string can be the pool id a loadout other than MAIN was made under. */
export const isLoadoutPlace = (value: string): boolean => PLACES.includes(value);

/** The MAIN loadout as it stands before the player equips or renames anything. */
export const freshMainLoadout = (): SavedLoadout => ({
  name: DEFAULT_LOADOUT_NAME,
  nameAt: UNSTAMPED,
  createdAt: UNSTAMPED,
  slots: {},
});

/** Where the loadout in use sits: the one `active.id` names, or MAIN when it names none (deleted or dropped). */
export function activeLoadoutId(state: CosmeticState): string {
  const found = Object.entries(state.loadouts).find(
    ([id, loadout]) => loadoutIdentity(id, loadout) === state.active.id,
  );
  return found ? found[0] : DEFAULT_LOADOUT_ID;
}

/** The loadout in use. Undefined only while MAIN has never been saved (nothing equipped or renamed yet). */
export const activeLoadout = (state: CosmeticState): SavedLoadout | undefined =>
  ownValue(state.loadouts, activeLoadoutId(state));

export interface LoadoutSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

/** The loadouts the player has, in pool order. MAIN is always listed. Exactly one is in use. */
export function loadoutSummaries(state: CosmeticState): LoadoutSummary[] {
  const inUse = activeLoadoutId(state);
  return LOADOUT_IDS.flatMap((id) => {
    const loadout = ownValue(state.loadouts, id);
    if (!loadout && id !== DEFAULT_LOADOUT_ID) return [];
    return [{ id, name: loadout?.name ?? DEFAULT_LOADOUT_NAME, active: id === inUse }];
  });
}

/** The part of a record `settleLoadouts` decides. */
export type LoadoutRecords = Pick<CosmeticState, "loadouts" | "deletedLoadouts">;

const newerEntry = (a: EquippedEntry, b: EquippedEntry): boolean =>
  a.at > b.at || (a.at === b.at && (a.id ?? "") > (b.id ?? ""));

/** Two copies of one loadout as one: the newer name and each slot's newer item. */
function combine(left: SavedLoadout, right: SavedLoadout): SavedLoadout {
  const slots: Record<string, EquippedEntry> = { ...left.slots };
  for (const [slot, entry] of Object.entries(right.slots)) {
    const current = ownValue(slots, slot);
    if (!current || newerEntry(entry, current)) slots[slot] = entry;
  }
  const rightName = right.nameAt > left.nameAt || (right.nameAt === left.nameAt && right.name > left.name);
  return { ...left, name: rightName ? right.name : left.name, nameAt: Math.max(left.nameAt, right.nameAt), slots };
}

/** The newest deletes of all the records, at most MAX_DELETED_LOADOUTS, each at its latest time. */
function newestDeletes(records: readonly LoadoutRecords[]): Record<string, number> {
  const all = new Map<string, number>();
  for (const record of records)
    for (const [identity, at] of Object.entries(record.deletedLoadouts ?? {}))
      if (identity !== DEFAULT_LOADOUT_ID && isLoadoutIdentity(identity))
        all.set(identity, Math.max(at, all.get(identity) ?? at));
  const newest = [...all].sort(([a, atA], [b, atB]) => atB - atA || (a < b ? 1 : -1));
  return Object.fromEntries(newest.slice(0, MAX_DELETED_LOADOUTS));
}

/** A loadout as it is saved under `id`: its home is written only when it sits elsewhere. */
function savedAt(id: string, loadout: SavedLoadout, home: string): SavedLoadout {
  const { name, nameAt, createdAt, slots } = loadout;
  return home === id ? { name, nameAt, createdAt, slots } : { name, nameAt, createdAt, home, slots };
}

/**
 * The loadouts and deletes of several records as one record holds them (the module comment has the rule). It
 * depends only on the set of loadouts and deletes, so settling a settled record changes nothing.
 */
export function settleLoadouts(records: readonly LoadoutRecords[]): LoadoutRecords {
  const deleted = newestDeletes(records);
  const byIdentity = new Map<string, { home: string; loadout: SavedLoadout }>();
  for (const record of records)
    for (const [id, loadout] of Object.entries(record.loadouts)) {
      const identity = loadoutIdentity(id, loadout);
      if (!LOADOUT_IDS.includes(id) || hasOwnKey(deleted, identity)) continue;
      const known = byIdentity.get(identity);
      const home = id === DEFAULT_LOADOUT_ID ? id : homeOf(id, loadout);
      byIdentity.set(identity, { home, loadout: known ? combine(known.loadout, loadout) : loadout });
    }
  const placed = new Map<string, SavedLoadout>();
  const main = byIdentity.get(DEFAULT_LOADOUT_ID);
  if (main) placed.set(DEFAULT_LOADOUT_ID, savedAt(DEFAULT_LOADOUT_ID, main.loadout, DEFAULT_LOADOUT_ID));
  const kept = [...byIdentity]
    .filter(([identity]) => identity !== DEFAULT_LOADOUT_ID)
    .map(([, entry]) => entry)
    .sort((a, b) => a.loadout.createdAt - b.loadout.createdAt || PLACES.indexOf(a.home) - PLACES.indexOf(b.home))
    .slice(0, PLACES.length);
  // Earliest first: each home goes to the earliest loadout made there, then the rest take the lowest free ids.
  const waiting = kept.filter(({ home, loadout }) => {
    if (placed.has(home)) return true;
    placed.set(home, savedAt(home, loadout, home));
    return false;
  });
  for (const { home, loadout } of waiting) {
    const id = PLACES.find((place) => !placed.has(place));
    if (id !== undefined) placed.set(id, savedAt(id, loadout, home));
  }
  const loadouts: Record<string, SavedLoadout> = {};
  for (const id of LOADOUT_IDS) {
    const loadout = placed.get(id);
    if (loadout) loadouts[id] = loadout;
  }
  return Object.keys(deleted).length > 0 ? { loadouts, deletedLoadouts: deleted } : { loadouts };
}

/** Two devices' loadouts as one: settled together, with the newer choice of loadout in use. */
export function mergeLoadoutRecords(
  left: CosmeticState,
  right: CosmeticState,
): Pick<CosmeticState, "loadouts" | "deletedLoadouts" | "active"> {
  const { active: a } = left;
  const { active: b } = right;
  const rightActive = b.at > a.at || (b.at === a.at && b.id > a.id);
  return { ...settleLoadouts([left, right]), active: rightActive ? b : a };
}

/** `state` with these loadouts and deletes, settled. */
function withLoadouts(state: CosmeticState, records: LoadoutRecords): CosmeticState {
  const { loadouts, deletedLoadouts } = settleLoadouts([records]);
  return { ...state, loadouts, ...(deletedLoadouts ? { deletedLoadouts } : {}) };
}

/** The first time from `now` on that no loadout made under `home` has, live or deleted. */
function freshCreatedAt(state: CosmeticState, home: string, now: number): number {
  const known = new Set([
    ...Object.entries(state.loadouts).map(([id, loadout]) => loadoutIdentity(id, loadout)),
    ...Object.keys(state.deletedLoadouts ?? {}),
  ]);
  let at = Math.max(UNSTAMPED, Math.trunc(now));
  while (known.has(`${home}_${String(at)}`)) at += 1;
  return at;
}

/** A copy of the loadout in use under the first free id, named for its place, and put in use. Null when full. */
export function createLoadout(state: CosmeticState, now: number): CosmeticState | null {
  const id = PLACES.find((place) => !hasOwnKey(state.loadouts, place));
  if (id === undefined) return null;
  const copied = Object.entries(activeLoadout(state)?.slots ?? {}).map(([slot, entry]): [string, EquippedEntry] => [
    slot,
    { id: entry.id, at: UNSTAMPED },
  ]);
  const loadout: SavedLoadout = {
    name: `${LOADOUT_NAME_PREFIX} ${String(LOADOUT_IDS.indexOf(id) + 1)}`,
    nameAt: UNSTAMPED,
    createdAt: freshCreatedAt(state, id, now),
    slots: Object.fromEntries(copied),
  };
  const next = withLoadouts(state, { ...state, loadouts: { ...state.loadouts, [id]: loadout } });
  return { ...next, active: { id: loadoutIdentity(id, loadout), at: stampAfter(now, state.active.at) } };
}

/** Puts a loadout the player has in use. MAIN may always be chosen. Null when it is already in use. */
export function switchLoadout(state: CosmeticState, id: string, now: number): CosmeticState | null {
  const loadout = ownValue(state.loadouts, id);
  if ((!loadout && id !== DEFAULT_LOADOUT_ID) || id === activeLoadoutId(state)) return null;
  const identity = loadout ? loadoutIdentity(id, loadout) : DEFAULT_LOADOUT_ID;
  return { ...state, active: { id: identity, at: stampAfter(now, state.active.at) } };
}

/** Renames a loadout the player has; null when the name breaks the shared name rules. */
export function renameLoadout(state: CosmeticState, id: string, name: string, now: number): CosmeticState | null {
  const trimmed = name.trim();
  if (nameProblem(trimmed, MIN_LOADOUT_NAME, MAX_LOADOUT_NAME) !== null) return null;
  const stored = ownValue(state.loadouts, id) ?? (id === DEFAULT_LOADOUT_ID ? freshMainLoadout() : undefined);
  if (!stored) return null;
  const renamed: SavedLoadout = { ...stored, name: trimmed, nameAt: stampAfter(now, stored.nameAt) };
  return { ...state, loadouts: { ...state.loadouts, [id]: renamed } };
}

/** Deletes a loadout other than MAIN. Deleting the one in use puts MAIN in use. */
export function deleteLoadout(state: CosmeticState, id: string, now: number): CosmeticState | null {
  const stored = ownValue(state.loadouts, id);
  if (id === DEFAULT_LOADOUT_ID || !stored) return null;
  const identity = loadoutIdentity(id, stored);
  const next = withLoadouts(state, {
    loadouts: Object.fromEntries(Object.entries(state.loadouts).filter(([key]) => key !== id)),
    deletedLoadouts: { ...state.deletedLoadouts, [identity]: stampAfter(now, stored.createdAt) },
  });
  if (state.active.id !== identity) return next;
  return { ...next, active: { id: DEFAULT_LOADOUT_ID, at: stampAfter(now, state.active.at) } };
}
