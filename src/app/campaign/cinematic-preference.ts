export type CinematicPreference = "full" | "brief" | "off";

export interface CinematicLaunchPolicy {
  readonly play: boolean;
  readonly brief: boolean;
}

export function sanitizeCinematicPreference(value: unknown): CinematicPreference {
  return value === "brief" || value === "off" ? value : "full";
}

export function cinematicLaunchPolicy(value: unknown): CinematicLaunchPolicy {
  const preference = sanitizeCinematicPreference(value);
  return Object.freeze({ play: preference !== "off", brief: preference === "brief" });
}

/**
 * Adventure chapter launch. The first viewing follows the preference unchanged;
 * a chapter already played in this session (a retry) is skipped exactly as the
 * "off" preference skips it, so a retry is back in the fight at once. Biome
 * memory is not "seen": entering a stage in Endless, Gauntlet or the tutorial
 * never showed its chapter.
 */
export function chapterLaunchPolicy(value: unknown, seenBefore: boolean): CinematicLaunchPolicy {
  const policy = cinematicLaunchPolicy(value);
  return seenBefore ? Object.freeze({ play: false, brief: policy.brief }) : policy;
}
