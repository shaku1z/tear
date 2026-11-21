import type { CommandEnvelope } from "../../../domain/envelopes";
import type { AuthoritativeStepResult } from "../../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../../gameplay/runtime/canonical-state";
import type { GameAction } from "../../../input/game-action";
import type { createProductionGhostReplayComposition } from "./replay-composition";

/** A running detached world, as `createProductionGhostReplayComposition(...).create(...)` builds it. */
export type DetachedWorldSession = ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]>;

/**
 * One simulation tick of a detached world that has no recorded frame clock. While a boss intro or a
 * cinematic holds the fight, one application frame of one tick's length runs first, with no confirm
 * press. Then the reward and menu actions go to the screen router and the rest to the simulation.
 * The headless environment steps the same way (src/playtest/headless/production-headless-environment.ts).
 */
export function stepDetachedWorld(
  session: DetachedWorldSession,
  actions: readonly CommandEnvelope<GameAction>[],
): AuthoritativeStepResult<CanonicalGameplayState> {
  if (session.replay.world.state.bossIntro() !== null || session.replay.world.context.cinema.active)
    session.advanceApplicationFrame(session.simulation.stepSeconds);
  return session.simulation.advanceOne(actions.filter((action) => !session.routeAction(action.command)));
}
