import { PRACTICE_TAB_IDS, type PracticeTab } from "../../domain/practice-tab";
import { drillMovesLine, TUTORIAL_WEAPON_ANNEXES } from "./tutorial-weapon-annexes";

/**
 * The Drills tabs, one row each: what the tab is called, the line under the title, the help under
 * its list (LESSONS shows the lesson's own copy; `compactHelp` replaces it on the phone where the
 * phone needs different words), the command a list entry sends and how many
 * columns the list uses. One tab is open at a time; the tutorial controller keeps it. A new tab is
 * an id in `domain/practice-tab.ts` plus its row here (the compiler asks for the row) and its
 * list in the Drills renderer.
 */
const TAB_ROWS = {
  lessons: {
    label: "LESSONS",
    subtitle: "Practice any technique · no rewards",
    help: undefined,
    compactHelp: undefined,
    select: "select",
    columns: 2,
  },
  weapons: {
    label: "WEAPONS",
    subtitle: "Try each weapon's own moves · no rewards",
    // Each weapon and the moves its drill trains, named by the weapon's own definition.
    help: `${TUTORIAL_WEAPON_ANNEXES.map((annex) => drillMovesLine(annex, "list")).join(" ")} Choose a weapon to try its moves.`,
    compactHelp: undefined,
    select: "select-annex",
    columns: 2,
  },
  enemies: {
    label: "ENEMIES",
    subtitle: "Fight an opponent you have met · no rewards",
    help: "Opponents you have met in a run are listed here. Each drill is a real fight; pause to restart it. No rewards.",
    compactHelp: undefined,
    select: "select-enemy",
    columns: 2,
  },
  bosses: {
    label: "BOSSES",
    subtitle: "Replay a boss phase you have reached · no rewards",
    help: "Phase 1 opens once you have beaten or met a boss; a later phase once you have reached it in a run. Each drill starts where that phase really begins. No rewards.",
    compactHelp:
      "Phase 1 opens once you have beaten or met a boss; a later phase once you have reached it. No rewards.",
    select: "select-boss",
    columns: 3,
  },
} as const satisfies Record<PracticeTab, unknown>;

/** The tabs in order, each its id plus its row. */
export const PRACTICE_TABS = Object.freeze(PRACTICE_TAB_IDS.map((id) => ({ id, ...TAB_ROWS[id] })));

export type PracticeTabDefinition = (typeof PRACTICE_TABS)[number];
export type { PracticeTab };

export function practiceTabDefinition(tab: PracticeTab): PracticeTabDefinition {
  return { id: tab, ...TAB_ROWS[tab] };
}

/**
 * The saved form of the open tab in a TearBench session checkpoint: three flags, at most one set.
 * The checkpoint format predates the tabs; these two functions are its only readers and writers.
 */
export interface PracticeTabFlags {
  readonly annexSelector?: boolean;
  readonly catalogSelector?: boolean;
  readonly bossSelector?: boolean;
}

export function practiceTabFlags(tab: PracticeTab): PracticeTabFlags {
  return tab === "weapons"
    ? { annexSelector: true }
    : tab === "enemies"
      ? { catalogSelector: true }
      : tab === "bosses"
        ? { bossSelector: true }
        : {};
}

export function practiceTabFromFlags(flags: PracticeTabFlags | undefined): PracticeTab {
  return flags?.bossSelector === true
    ? "bosses"
    : flags?.catalogSelector === true
      ? "enemies"
      : flags?.annexSelector === true
        ? "weapons"
        : "lessons";
}
