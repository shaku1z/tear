import { GAUNTLET_TICKS_PER_SECOND } from "./gauntlet-records";

/**
 * The leaderboards, as data. Each kind says which way its score ranks and what the score
 * counts, and every adapter (Firebase, the shared-cloud bridge, CrazyGames) and the screen
 * read that one definition: sorting, "beats the stored entry" and the board id.
 */

/** Which score ranks first: the highest (points) or the lowest (a clear time). */
export type ScoreDirection = "higher" | "lower";

/** What a score counts: run points, or simulation ticks of a clear. */
export type ScoreUnit = "points" | "ticks";

export interface LeaderboardKind {
  readonly direction: ScoreDirection;
  readonly unit: ScoreUnit;
  /** What the entry's count column holds: the wave reached, or the trials cleared. */
  readonly countLabel: string;
  /** Set when the kind belongs to one mode; a kind without a mode has one board per mode. */
  readonly mode?: string;
  /** The picker label for a one-mode kind. */
  readonly label?: string;
}

export const LEADERBOARD_KINDS = Object.freeze({
  /** Run score, one board per mode and difficulty. */
  score: Object.freeze({ direction: "higher", unit: "points", countLabel: "WAVE" }),
  /** The fastest Gauntlet clear per difficulty, in simulation ticks. */
  "gauntlet-clear": Object.freeze({
    direction: "lower",
    unit: "ticks",
    countLabel: "TRIALS",
    mode: "gauntlet",
    label: "GAUNTLET · FASTEST",
  }),
} satisfies Readonly<Record<string, LeaderboardKind>>);

export type LeaderboardKindId = keyof typeof LEADERBOARD_KINDS;

/** One board: a kind, the mode it ranks and a difficulty. */
export interface LeaderboardRef {
  readonly kind: LeaderboardKindId;
  readonly mode: string;
  readonly difficulty: string;
}

export function leaderboardKind(ref: Pick<LeaderboardRef, "kind">): LeaderboardKind {
  return LEADERBOARD_KINDS[ref.kind];
}

/**
 * The board's storage id. Score boards keep the id they have always had (`endless_normal`), so
 * every stored entry stays on its board; a one-mode kind is named by its kind (`gauntletclear_normal`).
 */
export function leaderboardId(ref: LeaderboardRef): string {
  const prefix = ref.kind === "score" ? ref.mode : ref.kind.replaceAll("-", "");
  return `${prefix}_${ref.difficulty}`;
}

/** A ticks score in seconds (the simulation's fixed rate); a points score is returned as it is. */
export function scoreSeconds(kind: LeaderboardKind, score: number): number {
  return kind.unit === "ticks" ? score / GAUNTLET_TICKS_PER_SECOND : score;
}

/** True when `candidate` ranks above `stored`; a board with no stored entry takes any score. */
export function scoreBeats(direction: ScoreDirection, candidate: number, stored: number | null | undefined): boolean {
  if (stored === null || stored === undefined) return true;
  return direction === "higher" ? candidate > stored : candidate < stored;
}

/** Entries in rank order for the direction; ties keep their given order. */
export function rankEntries<T extends Readonly<{ score: number }>>(
  direction: ScoreDirection,
  entries: readonly T[],
): T[] {
  const sign = direction === "higher" ? -1 : 1;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => sign * (left.entry.score - right.entry.score) || left.index - right.index)
    .map(({ entry }) => entry);
}

/** A choice in the screen's board picker: a mode's score board, or a one-mode kind. */
export interface LeaderboardChoice {
  readonly id: string;
  readonly label: string;
  readonly kind: LeaderboardKindId;
  readonly mode: string;
}

/**
 * The board picker: each mode's score board, then each one-mode kind right after its mode.
 * A kind whose direction the provider cannot rank is left out (`ranks`), never shown faked.
 */
export function leaderboardChoices(
  modes: readonly Readonly<{ id: string; label: string }>[],
  ranks: (direction: ScoreDirection) => boolean,
): readonly LeaderboardChoice[] {
  const kinds = Object.entries(LEADERBOARD_KINDS) as [LeaderboardKindId, LeaderboardKind][];
  return modes.flatMap((mode) => [
    ...(ranks(LEADERBOARD_KINDS.score.direction)
      ? [{ id: mode.id, label: mode.label.toUpperCase(), kind: "score" as const, mode: mode.id }]
      : []),
    ...kinds
      .filter(([, kind]) => kind.mode === mode.id && ranks(kind.direction))
      .map(([id, kind]) => ({ id, label: kind.label ?? id.toUpperCase(), kind: id, mode: mode.id })),
  ]);
}
