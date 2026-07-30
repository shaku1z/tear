/**
 * THE SIGNAL — Now Playing state.
 *
 * The audio backend publishes what is actually sounding; UI reads it. Kept as a
 * tiny store so the presentation layer never imports the audio engine.
 */

export interface NowPlaying {
  readonly workId: string;
  readonly title: string;
  /** Station that programmed it, or null when routing is canonical. */
  readonly stationId: string | null;
  readonly stationName: string | null;
  /** 0..4 arrangement tier currently sounding. */
  readonly tier: number;
}

const EMPTY: NowPlaying = { workId: "", title: "—", stationId: null, stationName: null, tier: 0 };

let current: NowPlaying = EMPTY;
const listeners = new Set<() => void>();

export function setNowPlaying(next: Partial<NowPlaying>): void {
  const merged = { ...current, ...next };
  if (
    merged.workId === current.workId &&
    merged.title === current.title &&
    merged.stationId === current.stationId &&
    merged.tier === current.tier
  ) return;
  current = merged;
  for (const listener of listeners) listener();
}

export function getNowPlaying(): NowPlaying {
  return current;
}

export function onNowPlayingChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Compact label for the menu card, e.g. `BESERKER · CUTLINE`. */
export function nowPlayingLabel(state: NowPlaying = current): string {
  if (!state.workId) return "SIGNAL — NO TRACK";
  const station = state.stationName ? ` · ${state.stationName}` : "";
  return `${state.title.toUpperCase()}${station}`;
}

/** Tier read-out for the card's sub-line. */
export function nowPlayingDetail(state: NowPlaying = current): string {
  const names = ["BREATH", "PREPARED", "COMBAT", "PRESSURE", "APEX"];
  return `◈ ${names[state.tier] ?? "—"}  ·  THE SIGNAL ›`;
}
