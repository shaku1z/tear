import type { CommandEnvelope } from "../../../domain/envelopes";
import type { AuthoritativeStepResult } from "../../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../../gameplay/runtime/canonical-state";
import type { SceneConfirm } from "../../../gameplay/runtime/cinematic-director";
import type { GameAction } from "../../../input/game-action";
import type { createProductionGhostReplayComposition } from "./replay-composition";

/** A running detached world, as `createProductionGhostReplayComposition(...).create(...)` builds it. */
export type DetachedWorldSession = ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]>;

/** An application frame a detached world plays before a tick: a scene's frame seconds and confirm presses. */
export type DetachedSceneFrame = Readonly<{ seconds: number; confirm: SceneConfirm }>;

const NO_CONFIRM: SceneConfirm = Object.freeze({
  key: false,
  touch: false,
  pad: false,
  click: false,
});

/**
 * The scene frames a detached world with no frame clock of its own plays before its next tick: while a
 * scene (a cinematic, a chapter page or a boss ritual) holds the fight, one frame of one tick's length,
 * with no confirm press. Headless worlds and the determinism corpus step with these and record them, so
 * a replay of a headless run plays the same frames.
 */
export function detachedSceneFrames(session: DetachedWorldSession): readonly DetachedSceneFrame[] {
  return session.replay.world.context.cinema.active
    ? Object.freeze([Object.freeze({ seconds: session.simulation.stepSeconds, confirm: NO_CONFIRM })])
    : Object.freeze([]);
}

/**
 * The one definition of a detached world's simulation tick; verify (src/app/replay/detached-replay-world.ts)
 * and the headless environment (src/playtest/headless/production-headless-environment.ts) both call it.
 *
 * It carries the replay record's one frame-clock exception (ReplayFrame in src/replay/record.ts): a
 * scene plays on application frames, not ticks, so the step first plays the scene frames it is given, in
 * order. Verify gives the frames a record holds (live play's own frame seconds and confirm presses);
 * a world with no frame clock gives `detachedSceneFrames`. The boss arrival is off it: the simulation
 * tick advances the arrival (`advanceBossIntro` in the opening phase). Then the reward and menu actions
 * go to the screen router and the rest to the simulation. Before a tick it steps, the world's frame clock
 * (./frame-clock.ts) plays the frames play would have drawn since the last tick, so what a replay shows
 * at a tick is what play showed there.
 *
 * Live play advances the simulation only on the playing screen (RuntimeFrameCoordinator), so a held
 * screen (paused, a draft, a reserve or a tier-up) holds a detached world too: the step returns the last
 * tick's result, and the actions the screen did not take are dropped, as live input is. A recorded pick
 * or resume therefore carries the tick that follows the hold.
 */
export function stepDetachedWorld(
  session: DetachedWorldSession,
  actions: readonly CommandEnvelope<GameAction>[],
  frames: readonly DetachedSceneFrame[],
): AuthoritativeStepResult<CanonicalGameplayState> {
  for (const frame of frames) session.advanceApplicationFrame(frame.seconds, frame.confirm);
  const simulated = actions.filter((action) => !session.routeAction(action.command));
  const held = session.simulation.lastResult;
  if (held !== null && !session.replayLifecycle.shouldStep()) return held;
  session.playFramesBeforeTick();
  return session.simulation.advanceOne(simulated);
}
