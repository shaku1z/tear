import { TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import type { AuthoritativeStepResult } from "../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { ReplayRun } from "../../replay/record";
import type { ReplayWorld, ReplayWorldRun } from "../../replay/verify";
import { stepDetachedWorld } from "../world/detached/detached-step";
import { createProductionGhostReplayComposition } from "../world/detached/replay-composition";

const NO_RUN = Object.freeze({ score: 0, wave: 0, time: 0 });

/** Starts a recorded run in the detached production world from its seed and start choices. */
function startDetachedReplay(run: ReplayRun, observe: Parameters<ReplayWorld["start"]>[1]): ReplayWorldRun {
  const events = new TearGameplayEventBus();
  const unsubscribe = events.subscribe(observe);
  const session = createProductionGhostReplayComposition({
    seed: run.seed,
    mode: run.start.mode,
    weaponId: run.start.weapon,
    difficulty: run.start.difficulty,
    ...(run.start.boss === undefined ? {} : { firstBoss: run.start.boss }),
    gameplayEvents: events,
  }).create(undefined);
  events.setTickSource(() => session.simulation.scheduler.tick);
  // The last step's result; its state is captured only when asked for.
  let last: AuthoritativeStepResult<CanonicalGameplayState> | undefined;
  return Object.freeze<ReplayWorldRun>({
    step(actions) {
      const result = stepDetachedWorld(session, actions);
      last = result;
      return Object.freeze({
        tick: result.tick,
        hash: () => result.stateHash,
        terminated: session.replay.world.lifecycle.phase === "terminated",
      });
    },
    run() {
      const current = last?.state.run;
      return current == null ? NO_RUN : Object.freeze({ score: current.score, wave: current.wave, time: current.time });
    },
    dispose: unsubscribe,
  });
}

/** The replay world port over the detached production world, for verify, watch and race. */
export function createDetachedReplayWorld(): ReplayWorld {
  return Object.freeze({ start: startDetachedReplay });
}
