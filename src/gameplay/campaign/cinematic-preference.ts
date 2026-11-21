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

/** Which Adventure chapters a session has played, and the launch policy that follows from it. */
export interface ChapterLaunchMemory {
  /** The launch policy for the chapter at a stage index. */
  readonly policy: (index: number) => CinematicLaunchPolicy;
  /** Records a chapter launch; only a chapter that plays counts as played. */
  readonly launched: (index: number, policy: CinematicLaunchPolicy) => void;
  /** The stage indices of the chapters played, in ascending order. */
  readonly played: () => readonly number[];
}

/**
 * The one chapter launch rule, for the live campaign and a detached world: `preference` is read at
 * each launch and `played` seeds the chapters already played (a replay gets them from its record).
 */
export function createChapterLaunchMemory(
  preference: () => unknown,
  played: readonly number[] = [],
): ChapterLaunchMemory {
  const seen = new Set(played);
  return Object.freeze({
    policy: (index: number) => chapterLaunchPolicy(preference(), seen.has(index)),
    launched: (index: number, policy: CinematicLaunchPolicy) => {
      if (policy.play) seen.add(index);
    },
    played: () => Object.freeze([...seen].sort((a, b) => a - b)),
  });
}
