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
