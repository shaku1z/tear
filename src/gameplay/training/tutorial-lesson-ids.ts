/** The tutorial course's lessons in order, and where a course starts after the ones a profile kept. */
export const TUTORIAL_LESSON_IDS = [
  "move",
  "jump",
  "dash",
  "cut",
  "launch",
  "juggle",
  "slam",
  "power-slam",
  "updraft",
  "throw",
  "parry",
  "read-the-charge",
  "field-test",
  "ready",
] as const;
export type TutorialLessonId = (typeof TUTORIAL_LESSON_IDS)[number];

/** The lessons a course counts; the closing hand-off ("ready") is not one. */
export const COUNTED_TUTORIAL_LESSON_IDS: readonly TutorialLessonId[] = TUTORIAL_LESSON_IDS.filter(
  (id) => id !== "ready",
);

/**
 * How a course starts after the lessons a profile kept from earlier courses: those lessons count
 * as done, and it opens at the first lesson that is not. With none kept it opens at the first
 * lesson, as a course always did; with all kept it opens at the closing hand-off.
 */
export function resumedTutorialCourse(
  finished: readonly string[],
): Readonly<{ done: readonly TutorialLessonId[]; opening: number }> {
  const done = COUNTED_TUTORIAL_LESSON_IDS.filter((id) => finished.includes(id));
  return { done, opening: TUTORIAL_LESSON_IDS.findIndex((id) => !done.includes(id)) };
}

/**
 * Where PLAY continues after these finished lessons, as "lesson `next` of `count`" over the
 * counted lessons; `next` is `count + 1` when only the closing hand-off is left.
 */
export function nextTutorialLesson(finished: readonly string[]): Readonly<{ next: number; count: number }> {
  const index = COUNTED_TUTORIAL_LESSON_IDS.findIndex((id) => !finished.includes(id));
  const count = COUNTED_TUTORIAL_LESSON_IDS.length;
  return { next: index < 0 ? count + 1 : index + 1, count };
}
