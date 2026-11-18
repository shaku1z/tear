/**
 * The one way to reach the headless production replay engine.
 *
 * Re-running a ghost (verifying a capsule, opening the Vault, Theater, a linked
 * replay or an import) needs the production world, combat phases and codecs,
 * about a fifth of the game's startup code. Nothing on the way to the first
 * frame uses it, so the application composition installs a loader that fetches
 * it on first use (`installReplayEngine`). A worker bundle installs the module it
 * already contains instead, so no second copy is split off.
 *
 * Callers that start such work are asynchronous: they `await ensureReplayEngine()`
 * once, then the synchronous replay code below them calls `replayEngine()`. A
 * caller that reaches the engine without having awaited gets a plain error
 * instead of a hang. A failed fetch (offline) is reported once, as
 * `LazyModuleUnavailable`, and the next call tries again.
 */
import { LazyModuleUnavailable, loadOnce, type LazyModule, type LazyStatus } from "../platform/lazy-module";

export type ReplayEngine = typeof import("../tearbench/production-replay-composition");

const OFFLINE_MESSAGE = "Replay needs one online visit to download its code. Check the connection and try again.";
let engine: LazyModule<ReplayEngine> | undefined;

/** Names where the engine comes from. Called once by the code that owns the bundle. */
export function installReplayEngine(load: () => Promise<ReplayEngine>): void {
  engine = loadOnce(load, OFFLINE_MESSAGE);
}

const installed = (): LazyModule<ReplayEngine> => {
  if (engine === undefined) throw new LazyModuleUnavailable("The replay engine has not been set up.");
  return engine;
};

/** Requests the engine; resolves when it is ready, rejects with a plain message when the fetch fails. */
export function ensureReplayEngine(): Promise<void> {
  return installed()
    .ensure()
    .then(() => undefined);
}

/** The engine, for synchronous replay code that an awaiting caller started. */
export function replayEngine(): ReplayEngine {
  return installed().loaded();
}

/** For a wait state: "idle", "loading", "ready" or "failed". */
export function replayEngineStatus(): LazyStatus {
  return engine === undefined ? "idle" : engine.status();
}
