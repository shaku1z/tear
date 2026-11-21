/**
 * What move an entity is in, read the same way for every boss and enemy, so a renderer, the step and the
 * rule test (tests/unit/move-visual-lifetime.test.ts) agree on when a move is live.
 *
 * An entity's move state is its `state` when it has one and its `atk` otherwise. The states below are
 * rest: the entity is walking, keeping its distance or hovering, and no move is live.
 */
export const REST_MOVE_STATES: ReadonlySet<string> = new Set(["idle", "walk", "kite", "hover", "flank", "reposition"]);

/** Why a live move ends early. A stun does not end one: the move waits and resumes, and only its marks hide. */
export type MoveEndReason = "death" | "phase";

export interface MoveStateSource {
  readonly state?: unknown;
  readonly atk?: unknown;
}

export function moveStateOf(entity: MoveStateSource): string {
  if (typeof entity.state === "string") return entity.state;
  return typeof entity.atk === "string" ? entity.atk : "";
}

/** The live move's state, or null at rest. */
export function liveMoveOf(entity: MoveStateSource): string | null {
  const state = moveStateOf(entity);
  return state === "" || REST_MOVE_STATES.has(state) ? null : state;
}
