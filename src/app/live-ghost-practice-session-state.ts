import type { GhostPracticeChild } from "../ghost/replay-world";

/**
 * Owns the short-lived disposition of a player-launched Ghost practice run.
 * The immutable child stays separate from the restored production world so
 * terminal policy can reliably reject profile, ranking, and recording writes.
 */
export interface LiveGhostPracticeSessionState {
  readonly active: () => GhostPracticeChild | null;
  readonly activate: (child: GhostPracticeChild) => void;
  readonly clear: () => void;
}

export function createLiveGhostPracticeSessionState(): LiveGhostPracticeSessionState {
  let child: GhostPracticeChild | null = null;
  return Object.freeze({
    active: () => child,
    activate: (value) => { child = value; },
    clear: () => { child = null; },
  } satisfies LiveGhostPracticeSessionState);
}
