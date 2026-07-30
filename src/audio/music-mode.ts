import type { Tier } from "./stems/types";

/**
 * How the recorded soundtrack reacts to play. Set from user settings and read by
 * the stem engine, so settings never has to know about the audio backend.
 */
export type MusicMode = "adaptive" | "full" | "calm" | "dynamic";

let current: MusicMode = "adaptive";
const listeners = new Set<(mode: MusicMode) => void>();

export function setMusicMode(mode: MusicMode): void {
  if (mode === current) return;
  current = mode;
  for (const listener of listeners) listener(mode);
}

export function getMusicMode(): MusicMode {
  return current;
}

export function onMusicModeChange(listener: (mode: MusicMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Re-map the intensity tier the director asked for according to the user's mode.
 * `adaptive` passes through; `full` pins the complete arrangement; `calm` keeps a
 * relaxed bed; `dynamic` widens the swing so lulls are barer and peaks bigger.
 */
export function applyMusicMode(tier: Tier, mode: MusicMode = current): Tier {
  switch (mode) {
    case "full":
      return 4;
    case "calm":
      return Math.min(tier, 1) as Tier;
    case "dynamic":
      return tier <= 1 ? 0 : tier >= 3 ? 4 : tier;
    default:
      return tier;
  }
}
