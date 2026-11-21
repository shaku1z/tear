// Gives `ReplayEngine` (src/ghost/replay-engine.ts) its members: the engine module's own exports.
import type * as Engine from "../world/detached/replay-composition";

declare module "../../ghost/replay-engine" {
  interface ReplayEngine {
    readonly createProductionGhostReplayComposition: typeof Engine.createProductionGhostReplayComposition;
    readonly captureProductionReplayCheckpoint: typeof Engine.captureProductionReplayCheckpoint;
    readonly projectProductionReplayCanonicalState: typeof Engine.projectProductionReplayCanonicalState;
  }
}
