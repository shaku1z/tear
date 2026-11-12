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
 * a chapter the player has already sat through (a retry, or a stage this profile
 * entered in an earlier session) goes straight to the stage banner, exactly as
 * the "off" preference does, so a retry is back in the fight at once.
 */
export function chapterLaunchPolicy(value: unknown, seenBefore: boolean): CinematicLaunchPolicy {
  const policy = cinematicLaunchPolicy(value);
  return seenBefore ? Object.freeze({ play: false, brief: policy.brief }) : policy;
}
