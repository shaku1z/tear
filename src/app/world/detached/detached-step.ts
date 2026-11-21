import type { CommandEnvelope } from "../../../domain/envelopes";
import type { AuthoritativeStepResult } from "../../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../../gameplay/runtime/canonical-state";
import type { GameAction } from "../../../input/game-action";
import type { createProductionGhostReplayComposition } from "./replay-composition";

/** A running detached world, as `createProductionGhostReplayComposition(...).create(...)` builds it. */
export type DetachedWorldSession = ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]>;

/**
 * The one definition of a detached world's simulation tick; verify (src/app/replay/detached-replay-world.ts)
 * and the headless environment (src/playtest/headless/production-headless-environment.ts) both call it.
 *
 * It carries one frame-clock exception: a detached world has no recorded frame clock, so while a
 * cinematic holds the fight, one application frame of one tick's length runs first, with no confirm
 * press. Live play runs those scenes on its own frame seconds and confirm presses, which is one of the
 * gaps replay PR 5b closes. The boss arrival is off it: the simulation tick advances the arrival
 * (`advanceBossIntro` in the opening phase), so a detached tick plays it like a live one. Then the
 * reward and menu actions go to the screen router and the rest to the simulation.
 */
export function stepDetachedWorld(
  session: DetachedWorldSession,
  actions: readonly CommandEnvelope<GameAction>[],
): AuthoritativeStepResult<CanonicalGameplayState> {
  if (session.replay.world.context.cinema.active) session.advanceApplicationFrame(session.simulation.stepSeconds);
  return session.simulation.advanceOne(actions.filter((action) => !session.routeAction(action.command)));
}
