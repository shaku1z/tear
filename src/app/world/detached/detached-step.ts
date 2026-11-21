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
 *
 * Live play advances the simulation only on the playing screen (RuntimeFrameCoordinator), so a held
 * screen (paused, a draft, a reserve or a tier-up) holds a detached world too: the step returns the last
 * tick's result, and the actions the screen did not take are dropped, as live input is. A recorded pick
 * or resume therefore carries the tick that follows the hold.
 */
export function stepDetachedWorld(
  session: DetachedWorldSession,
  actions: readonly CommandEnvelope<GameAction>[],
): AuthoritativeStepResult<CanonicalGameplayState> {
  if (session.replay.world.context.cinema.active) session.advanceApplicationFrame(session.simulation.stepSeconds);
  const simulated = actions.filter((action) => !session.routeAction(action.command));
  const held = session.simulation.lastResult;
  if (held !== null && !session.replayLifecycle.shouldStep()) return held;
  return session.simulation.advanceOne(simulated);
}
