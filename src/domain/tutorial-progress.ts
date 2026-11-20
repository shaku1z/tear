import { asRecord, isSafeKey } from "./records";

/**
 * The tutorial course as the profile keeps it between sessions: the lessons the player has
 * finished, and whether they left the tutorial on purpose. It is an optional profile field
 * (`tutorialProgress`), so older builds carry it through unchanged and it needs no envelope
 * version. Lesson ids are the course's stable ids; which of them exist is the course's
 * business, so ids are kept as strings here and read against the course where they are used.
 */
export interface TutorialProgress {
  /** Finished lesson ids, sorted, each once. */
  readonly lessons: readonly string[];
  /** The player chose to leave the tutorial before finishing it, so PLAY no longer leads into it. */
  readonly skipped: boolean;
}

export const NO_TUTORIAL_PROGRESS: TutorialProgress = Object.freeze({
  lessons: Object.freeze([]),
  skipped: false,
});

const progress = (lessons: Iterable<string>, skipped: boolean): TutorialProgress =>
  Object.freeze({ lessons: Object.freeze([...new Set(lessons)].sort()), skipped });

/** Stored progress with malformed entries dropped; anything that is not an object reads as none. */
export function normalizeTutorialProgress(value: unknown): TutorialProgress {
  const record = asRecord(value);
  if (record === undefined) return NO_TUTORIAL_PROGRESS;
  const lessons = Object.entries(asRecord(record.lessons) ?? {})
    .filter(([id, done]) => done === true && isSafeKey(id))
    .map(([id]) => id);
  return progress(lessons, record.skipped === true);
}

/** The stored form: `{ lessons: { move: true, … }, skipped?: true }`. */
export function storedTutorialProgress(value: TutorialProgress): Readonly<Record<string, unknown>> {
  return {
    lessons: Object.fromEntries(value.lessons.map((id) => [id, true])),
    ...(value.skipped ? { skipped: true } : {}),
  };
}

/** Both devices' progress: every lesson either finished, skipped if either skipped. Order-independent and idempotent. */
export function mergeTutorialProgress(left: TutorialProgress, right: TutorialProgress): TutorialProgress {
  return progress([...left.lessons, ...right.lessons], left.skipped || right.skipped);
}

/** The progress with one more finished lesson. */
export function withTutorialLesson(value: TutorialProgress, lessonId: string): TutorialProgress {
  return isSafeKey(lessonId) ? progress([...value.lessons, lessonId], value.skipped) : value;
}
