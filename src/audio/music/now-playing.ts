/**
 * Music Now Playing state.
 *
 * The audio backend publishes what is actually sounding; UI reads it. Kept as a
 * tiny store so the presentation layer never imports the audio engine.
 */
import { MUSIC_SCREEN_TITLE } from "./settings";

export interface NowPlaying {
  readonly workId: string;
  readonly title: string;
  /** The Radio channel playing it, or null when it is not playing on the Radio. */
  readonly channelId: string | null;
  readonly channelName: string | null;
  /** 0..4 arrangement tier currently sounding. */
  readonly tier: number;
  /** `performance.now()` when this work started sounding (for the loop position). */
  readonly since?: number;
}

const EMPTY: NowPlaying = { workId: "", title: "—", channelId: null, channelName: null, tier: 0, since: 0 };

let current: NowPlaying = EMPTY;
const listeners = new Set<() => void>();

export function setNowPlaying(next: Partial<NowPlaying>): void {
  const merged = { ...current, ...next };
  if (
    merged.workId === current.workId &&
    merged.title === current.title &&
    merged.channelId === current.channelId &&
    merged.tier === current.tier
  )
    return;
  current = merged.workId === current.workId ? merged : { ...merged, since: globalThis.performance.now() };
  for (const listener of listeners) listener();
}

export function getNowPlaying(): NowPlaying {
  return current;
}

export function onNowPlayingChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Compact label for the menu card, e.g. `BESERKER · CALM`. */
export function nowPlayingLabel(state: NowPlaying = current): string {
  if (!state.workId) return "MUSIC — NO TRACK";
  const channel = state.channelName ? ` · ${state.channelName.toUpperCase()}` : "";
  return `${state.title.toUpperCase()}${channel}`;
}

/** Tier read-out for the card's sub-line. */
export function nowPlayingDetail(state: NowPlaying = current): string {
  const names = ["BREATH", "PREPARED", "COMBAT", "PRESSURE", "APEX"];
  return `◈ ${names[state.tier] ?? "—"}  ·  ${MUSIC_SCREEN_TITLE} ›`;
}
