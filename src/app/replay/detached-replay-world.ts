import type { AuthoritativeStepResult } from "../../gameplay/runtime/authoritative-step";
import { canonicalReplayTotals, type CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { ReplayRun } from "../../replay/record";
import type { ReplayWorld, ReplayWorldRun } from "../../replay/verify";
import { stepDetachedWorld } from "../world/detached/detached-step";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../world/detached/replay-composition";
import { startRecordWorld, type RecordWorldEngine } from "./record-world";

const STATIC_ENGINE: RecordWorldEngine = Object.freeze({
  createProductionGhostReplayComposition,
  stepDetachedWorld,
  captureProductionReplayCheckpoint,
});

function startDetachedReplay(
  run: Pick<ReplayRun, "seed" | "start">,
  observe: Parameters<ReplayWorld["start"]>[1],
): ReplayWorldRun {
  const world = startRecordWorld(STATIC_ENGINE, run, observe);
  // The last step's result; its state is captured only when asked for.
  let last: AuthoritativeStepResult<CanonicalGameplayState> | undefined;
  return Object.freeze<ReplayWorldRun>({
    step(actions, frames) {
      const result = world.step(actions, frames);
      last = result;
      return Object.freeze({ tick: result.tick, hash: () => result.stateHash, terminated: world.terminated() });
    },
    run: () => canonicalReplayTotals(last?.state.run),
    dispose: world.dispose,
  });
}

/** The replay world port over the detached production world, for verify, watch and race. */
export function createDetachedReplayWorld(): ReplayWorld {
  return Object.freeze({ start: startDetachedReplay });
}
