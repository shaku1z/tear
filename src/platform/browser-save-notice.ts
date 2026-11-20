import type { SaveProblem, SaveProblemReporter } from "../domain/save-problems";
import { openNotice, type OpenNotice } from "./browser-notice";

export const SAVE_NOTICE_ID = "tear-save-notice";

const RESET_WAY = "Settings > General > RESET PROGRESS";

/**
 * What the player is told for each problem, in plain words: what happened, what the game did about it and
 * what they can do. A new `SaveProblem` is a compile error here until it has its sentence.
 */
export const SAVE_PROBLEM_TEXT: Readonly<Record<SaveProblem, string>> = Object.freeze({
  "profile-unreadable": `Your saved progress could not be read, so the game started without it. The unreadable save is kept and not overwritten, so progress from this session will not be saved. To start over and save again, use ${RESET_WAY}.`,
  "profile-newer-version": `Your progress was saved by a newer version of the game. This version cannot read it and will not overwrite it, so progress from this session will not be saved. Reload the page to get the newest version, or use ${RESET_WAY} to start over.`,
  "meta-unreadable": `Your coins and upgrades could not be read, so the game started them from zero. Coins and upgrades from this session may not be saved. ${RESET_WAY} clears the unreadable data.`,
  "storage-unavailable":
    "This browser is not keeping the game's data (private browsing, or storage is blocked or full). You can play, but your progress is lost when the page closes.",
});

export interface SaveNotice {
  /** Tells the player about a problem, once per kind for the life of the page. */
  readonly report: SaveProblemReporter;
}

/** The page's notice for save problems: one panel listing the problems not yet acknowledged, each told once. */
export function createSaveNotice(document: Document): SaveNotice {
  const told = new Set<SaveProblem>();
  /** Told but not yet acknowledged; the dialog lists these. */
  let unread: SaveProblem[] = [];
  let open: OpenNotice | null = null;
  const show = (): void => {
    open?.close();
    open = openNotice(document, {
      id: SAVE_NOTICE_ID,
      title: "About your save",
      paragraphs: unread.map((problem) => SAVE_PROBLEM_TEXT[problem]),
      buttons: [
        {
          label: "OK",
          onPress: () => {
            open = null;
            unread = [];
          },
        },
      ],
    });
  };
  return {
    report(problem) {
      if (told.has(problem)) return;
      told.add(problem);
      unread.push(problem);
      show();
    },
  };
}
