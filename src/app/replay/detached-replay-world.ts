import { stepDetachedWorld } from "../world/detached/detached-step";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../world/detached/replay-composition";
import type { ReplayWorld } from "../../replay/verify";
import { recordReplayWorld, type RecordWorldEngine } from "./record-world";

/**
 * The engine imported statically, for code that already holds the detached world in its own bundle (the
 * headless playtest and the tests). Game code that opens a replay gets the engine from the deferred loader
 * (`replayEngine.ensure()`) and calls `recordReplayWorld` with it, so the engine stays one on-demand chunk.
 */
const STATIC_ENGINE: RecordWorldEngine = Object.freeze({
  createProductionGhostReplayComposition,
  stepDetachedWorld,
  captureProductionReplayCheckpoint,
});

/** The replay world port over the detached production world, for verify, watch and race. */
export function createDetachedReplayWorld(): ReplayWorld {
  return recordReplayWorld(STATIC_ENGINE);
}
