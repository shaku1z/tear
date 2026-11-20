/**
 * The one way to reach the headless production replay engine.
 *
 * Re-running a ghost (verifying a capsule, opening the Vault, Theater, a linked
 * replay or an import) needs the production world, combat phases and codecs,
 * about a fifth of the game's startup code. Nothing on the way to the first
 * frame uses it, so the application composition installs a loader that fetches
 * it on first use (the table in `src/app/shell/deferred-modules.ts`). A worker
 * bundle installs the module it already contains instead, so no second copy is
 * split off.
 *
 * Callers that start such work are asynchronous: they `await replayEngine.ensure()`
 * once, then the synchronous replay code below them calls `replayEngine.loaded()`.
 * A caller that reaches the engine without having awaited gets a plain error
 * instead of a hang. Every capsule comes from `GhostCapsuleReader.read`, which waits
 * for the engine first, so replay code that works on a capsule never depends on timing. A failed fetch (offline) is reported once, as
 * `LazyModuleUnavailable`, and the next call tries again.
 */
import { lazySlot } from "../domain/lazy-module";

/**
 * What the engine offers. The members are declared in `src/app/replay/replay-engine-shape.ts`
 * (module augmentation), because their types belong to the layer that holds the engine and the
 * ghost layer may not import that layer.
 */
export interface ReplayEngine {
  readonly membersDeclaredByApplication?: never;
}

export const replayEngine = lazySlot<ReplayEngine>(
  "Replay needs one online visit to download its code. Check the connection and try again.",
);
