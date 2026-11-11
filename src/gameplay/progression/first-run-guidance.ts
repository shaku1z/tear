import type { RunMode } from "../run/session";

/**
 * Existing durable profile facts the first-run guidance is derived from. No new
 * saved field: the nudge ends permanently once the profile finishes the tutorial,
 * records a run, or starts any other mode (the profile's `modes` set).
 */
export interface FirstRunProfileFacts {
  /** Completed tutorial courses (`stats.tutorialDone`). */
  readonly tutorialDone: number;
  /** Finished runs (`stats.runs`). */
  readonly runs: number;
  /** Modes this profile has started (`modes`). */
  readonly modesPlayed: readonly string[];
}

export interface FirstRunProfilePort {
  stat(key: string): number;
  readonly data: Readonly<{ modes: Readonly<Record<string, boolean>> }>;
}

export function firstRunProfileFacts(profile: FirstRunProfilePort): FirstRunProfileFacts {
  return Object.freeze({
    tutorialDone: profile.stat("tutorialDone"),
    runs: profile.stat("runs"),
    modesPlayed: Object.freeze(Object.keys(profile.data.modes).filter((mode) => profile.data.modes[mode] === true)),
  });
}

const count = (value: number): number => Number.isFinite(value) && value > 0 ? value : 0;
const playedOtherThanTutorial = (facts: FirstRunProfileFacts): boolean =>
  facts.modesPlayed.some((mode) => mode !== "tutorial");

/** A profile that has never finished the tutorial and has no other play history. */
export function isFirstRunProfile(facts: FirstRunProfileFacts): boolean {
  return count(facts.tutorialDone) === 0 && count(facts.runs) === 0 && !playedOtherThanTutorial(facts);
}

/**
 * The setup selection a profile starts with before the player picks one:
 * Tutorial for a brand-new profile, Adventure straight after the tutorial when
 * nothing else has been played, and the established Endless default otherwise.
 */
export function defaultRunModeFor(facts: FirstRunProfileFacts): RunMode {
  if (isFirstRunProfile(facts)) return "tutorial";
  if (count(facts.tutorialDone) > 0 && !playedOtherThanTutorial(facts)) return "campaign";
  return "endless";
}

export const FIRST_RUN_PLAY_LABEL = "START HERE · TUTORIAL";
export const FIRST_RUN_SETUP_GUIDANCE = "New here? The tutorial takes about three minutes.";
