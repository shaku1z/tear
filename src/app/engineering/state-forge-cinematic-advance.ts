export interface LiveStateForgeCinematicDirectorPort {
  readonly active: boolean;
  readonly beat: unknown;
  advance(): void;
}

/**
 * Test-build bridge for State Forge only.  It performs a single authored
 * director transition; simulation remains owned by the normal frame path.
 */
export function createLiveStateForgeCinematicAdvance(
  cinema: LiveStateForgeCinematicDirectorPort,
): () => boolean {
  return () => {
    if (!cinema.active || cinema.beat === null || cinema.beat === undefined) return false;
    cinema.advance();
    return true;
  };
}
