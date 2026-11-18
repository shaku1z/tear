/**
 * The Drills tabs: LESSONS (the baseline exercises), WEAPONS, ENEMIES and BOSSES. One tab is open
 * at a time; the controller keeps it as which list shows.
 */
export const PRACTICE_TABS = Object.freeze([
  ["lessons", "LESSONS"],
  ["weapons", "WEAPONS"],
  ["enemies", "ENEMIES"],
  ["bosses", "BOSSES"],
] as const);

export type PracticeTab = (typeof PRACTICE_TABS)[number][0];

export function isPracticeTab(value: unknown): value is PracticeTab {
  return PRACTICE_TABS.some(([id]) => id === value);
}

/** The open tab, from the session's list flags. */
export function practiceTabOf(
  session: Readonly<{ annexSelector?: boolean; catalogSelector?: boolean; bossSelector?: boolean }>,
): PracticeTab {
  return session.bossSelector === true
    ? "bosses"
    : session.catalogSelector === true
      ? "enemies"
      : session.annexSelector === true
        ? "weapons"
        : "lessons";
}
