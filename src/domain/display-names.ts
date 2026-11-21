/**
 * The rules every name a player types must meet: the player name and a loadout's name. One rule set, so a
 * name the game accepts in one place is accepted, or refused for the same reason, everywhere.
 */
const RESTRICTED_WORDS = Object.freeze(["fuck", "shit", "bitch", "nigg", "asshole", "cunt", "faggot", "dick"]);
const NAME_CHARACTERS = /^[a-zA-Z0-9 _-]+$/;

/** Why `name` (already trimmed) is refused, or null when it is accepted. */
export function nameProblem(name: string, minLength: number, maxLength: number): string | null {
  if (name.length < minLength || name.length > maxLength)
    return `Must be ${String(minLength)}-${String(maxLength)} characters`;
  if (!NAME_CHARACTERS.test(name)) return "Letters, numbers, spaces, _, - only";
  const lower = name.toLowerCase();
  if (RESTRICTED_WORDS.some((word) => lower.includes(word))) return "Name contains restricted words";
  return null;
}

/** The player name's length limits (it shows on leaderboards and replays). */
export const MIN_PLAYER_NAME = 3;
export const MAX_PLAYER_NAME = 16;

/** Whose name a name entry sets: the screen's title and copy follow it. */
export type NameSubject = "player" | "loadout";

/** One thing the name-entry screen can name, with its limits and what saving does. */
export interface NameTarget {
  readonly subject: NameSubject;
  readonly initial: string;
  readonly minLength: number;
  readonly maxLength: number;
  /** A reason beyond the shared rules why no name can be saved now (the weekly player-name limit), or null. */
  readonly refuse?: () => string | null;
  readonly commit: (name: string) => void;
}
