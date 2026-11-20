import type { RunMode } from "../run/session";

/** Durable profile facts the first-run guidance and tutorial-first PLAY are derived from. */
export interface FirstRunProfileFacts {
  /** Completed tutorial courses (`stats.tutorialDone`). */
  readonly tutorialDone: number;
  /** Finished runs (`stats.runs`). */
  readonly runs: number;
  /** Modes this profile has started (`modes`). */
  readonly modesPlayed: readonly string[];
  /** Tutorial lessons the profile kept from earlier courses (`tutorialProgress`). */
  readonly lessonsDone: number;
  /** The player left the tutorial on purpose (`tutorialProgress`). */
  readonly tutorialSkipped: boolean;
}

export interface FirstRunProfilePort {
  stat(key: string): number;
  readonly data: Readonly<{ modes: Readonly<Record<string, boolean>> }>;
  tutorialProgress(): Readonly<{ lessons: readonly string[]; skipped: boolean }>;
}

export function firstRunProfileFacts(profile: FirstRunProfilePort): FirstRunProfileFacts {
  const tutorial = profile.tutorialProgress();
  return Object.freeze({
    tutorialDone: profile.stat("tutorialDone"),
    runs: profile.stat("runs"),
    modesPlayed: Object.freeze(Object.keys(profile.data.modes).filter((mode) => profile.data.modes[mode] === true)),
    lessonsDone: tutorial.lessons.length,
    tutorialSkipped: tutorial.skipped,
  });
}

const count = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);
const playedOtherThanTutorial = (facts: FirstRunProfileFacts): boolean =>
  facts.modesPlayed.some((mode) => mode !== "tutorial");

/** A profile that has never finished the tutorial and has no other play history. */
export function isFirstRunProfile(facts: FirstRunProfileFacts): boolean {
  return count(facts.tutorialDone) === 0 && count(facts.runs) === 0 && !playedOtherThanTutorial(facts);
}

/**
 * Tutorial-first: PLAY leads straight into the tutorial, at its next unfinished lesson, until
 * the tutorial is finished or the player skips it on purpose. Playing another mode in between
 * does not end it. A profile that never started the tutorial but already has other history is
 * not led into it.
 */
export function isTutorialFirst(facts: FirstRunProfileFacts): boolean {
  if (count(facts.tutorialDone) > 0 || facts.tutorialSkipped) return false;
  return facts.lessonsDone > 0 || isFirstRunProfile(facts);
}

/**
 * The setup selection a profile starts with before the player picks one:
 * Tutorial while tutorial-first, Adventure straight after the tutorial (finished or
 * skipped) when nothing else has been played, and the established Endless default otherwise.
 */
export function defaultRunModeFor(facts: FirstRunProfileFacts): RunMode {
  if (isTutorialFirst(facts)) return "tutorial";
  if ((count(facts.tutorialDone) > 0 || facts.tutorialSkipped) && !playedOtherThanTutorial(facts)) return "campaign";
  return "endless";
}

export const FIRST_RUN_PLAY_LABEL = "START HERE · TUTORIAL";

/**
 * The line under PLAY while tutorial-first: where PLAY continues. `next` is the 1-based number of
 * the next unfinished lesson of `count`; past the last lesson only the closing step is left.
 */
export function tutorialPlayLabel(next: number, count: number): string {
  if (next <= 1) return FIRST_RUN_PLAY_LABEL;
  return next > count ? "TUTORIAL · LAST STEP" : `TUTORIAL · LESSON ${String(next)} OF ${String(count)}`;
}
export const FIRST_RUN_SETUP_GUIDANCE = "New here? The tutorial takes about three minutes.";
