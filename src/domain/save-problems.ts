/**
 * What can go wrong with the player's saved progress that the player has to be told about. Each load or
 * write path reports into one reporter (the notice the player reads, see platform/browser-save-notice.ts),
 * so a new kind of failure is one more member here and one more sentence there, never a silent fallback.
 */
export type SaveProblem =
  /** The stored profile could not be read; the game started with a fresh one and will not overwrite it. */
  | "profile-unreadable"
  /** The stored profile was written by a newer build; this build keeps it and does not overwrite it. */
  | "profile-newer-version"
  /** The stored coins and upgrades could not be read; the game started with a fresh set. */
  | "meta-unreadable"
  /** The browser refused to keep data, so progress lasts only until the page closes. */
  | "storage-unavailable";

export type SaveProblemReporter = (problem: SaveProblem) => void;
