import type { ProgressSource } from "../../domain/progress-facts";

/**
 * Saved progress reaches the music only in runs that also record it: not in seed races (every
 * racer must hear the same song) and not in practice. Replays have no music director.
 *
 * The progress is a `snapshotProgress` taken before the run's first stage loads, so the biome a run
 * starts in still counts as new and nothing unlocks mid-run.
 */
export function admittedMusicProgress(
  progress: ProgressSource | null,
  run: { readonly tracksProgress: boolean; readonly seedRace: boolean; readonly practice: boolean },
): ProgressSource | null {
  return progress !== null && run.tracksProgress && !run.seedRace && !run.practice ? progress : null;
}
