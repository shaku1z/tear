/**
 * The Drills tab ids, in tab order. A screen action names a tab with one of them, and the tab table
 * (`gameplay/training/practice-tabs.ts`) has one row per id, so a new tab starts here.
 */
export const PRACTICE_TAB_IDS = Object.freeze(["lessons", "weapons", "enemies", "bosses"] as const);

export type PracticeTab = (typeof PRACTICE_TAB_IDS)[number];
