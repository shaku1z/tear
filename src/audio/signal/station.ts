/**
 * THE SIGNAL — station engine (R3).
 *
 * Turns a station manifest into a play queue: weighted shuffle with repeat
 * protection, favourites weighting, history, and skip. Deterministic given a
 * seed, so a station's programming can be reproduced (and later replayed as part
 * of a Run Mix).
 */
import { findStation, selectVersion, stationWorks, type MusicContext, type SignalCatalog } from "./catalog";

export interface QueueEntry {
  readonly workId: string;
  readonly versionId: string;
}

export interface StationState {
  /** Most-recent-first; used for repeat protection and the history view. */
  readonly history: readonly string[];
  readonly favourites: ReadonlySet<string>;
}

export function createStationState(favourites: Iterable<string> = []): StationState {
  return { history: [], favourites: new Set(favourites) };
}

/** Deterministic PRNG so a station's programming is reproducible from a seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Favourited works are twice as likely; everything else is even. */
function weightOf(workId: string, state: StationState): number {
  return state.favourites.has(workId) ? 2 : 1;
}

/**
 * Pick the next entry for a station.
 *
 * Repeat protection excludes the N most recent works; if that would leave
 * nothing, the window is relaxed rather than returning silence — a station must
 * always be able to play something.
 */
export function pickNext(
  catalog: SignalCatalog,
  stationId: string,
  context: MusicContext,
  state: StationState,
  seed: number,
): QueueEntry | null {
  const station = findStation(catalog, stationId);
  if (!station) return null;
  const eligible = stationWorks(catalog, station, context);
  if (eligible.length === 0) return null;

  const order = station.contextRules[context] ?? [];
  const protect = station.selection.repeatProtection;

  for (let window = Math.min(protect, Math.max(0, eligible.length - 1)); window >= 0; window--) {
    const recent = new Set(state.history.slice(0, window));
    const pool = eligible.filter((w) => !recent.has(w.id));
    if (pool.length === 0) continue;

    if (station.selection.mode === "sequential") {
      const last = state.history[0];
      const index = last ? (pool.findIndex((w) => w.id === last) + 1) % pool.length : 0;
      const work = pool[index] ?? pool[0];
      if (!work) continue;
      const picked = selectVersion(work, context, order);
      if (picked) return { workId: work.id, versionId: picked.versionId };
      continue;
    }

    const random = mulberry32(seed);
    const total = pool.reduce((sum, w) => sum + weightOf(w.id, state), 0);
    let roll = random() * total;
    for (const work of pool) {
      roll -= weightOf(work.id, state);
      if (roll <= 0) {
        const picked = selectVersion(work, context, order);
        if (picked) return { workId: work.id, versionId: picked.versionId };
        break;
      }
    }
  }
  return null;
}

/** Record a play; history is capped so it cannot grow without bound. */
export function remember(state: StationState, workId: string, cap = 32): StationState {
  return { ...state, history: [workId, ...state.history.filter((id) => id !== workId)].slice(0, cap) };
}

export function toggleFavourite(state: StationState, workId: string): StationState {
  const favourites = new Set(state.favourites);
  if (favourites.has(workId)) favourites.delete(workId);
  else favourites.add(workId);
  return { ...state, favourites };
}
