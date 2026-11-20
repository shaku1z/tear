/** The moves a tutorial lesson counts toward its goal, as the live hosts report them. */
export type TutorialMark =
  | "airHit"
  | "dash"
  | "deflect"
  | "jump"
  | "launch"
  | "moveL"
  | "moveR"
  | "evade"
  | "parry"
  | "punish"
  | "recall"
  | "slam"
  | "strike"
  | "superslam"
  | "throwHit"
  | "updraft";

/** Style events accepted by the live tutorial host; encounter marks have their own controller owner. */
export const TUTORIAL_MARKS: ReadonlySet<string> = new Set([
  "airHit",
  "dash",
  "deflect",
  "jump",
  "launch",
  "moveL",
  "moveR",
  "parry",
  "recall",
  "slam",
  "strike",
  "superslam",
  "throwHit",
  "updraft",
]);
export function isTutorialMark(value: string): value is TutorialMark {
  return TUTORIAL_MARKS.has(value);
}
