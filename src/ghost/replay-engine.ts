/**
 * The one way to reach the headless production replay engine.
 *
 * Re-running a ghost (verifying a capsule, opening the Vault, Theater, a linked
 * replay or an import) needs the production world, combat phases and codecs,
 * about a quarter of the game's startup code. Nothing on the way to the first
 * frame uses it, so it is requested here on first use instead of at startup.
 *
 * Callers that start such work are asynchronous: they `await ensureReplayEngine()`
 * once, then the synchronous replay code below them calls `replayEngine()`. A
 * caller that reaches the engine without having awaited gets a plain error
 * instead of a hang. A failed fetch (offline) is reported once, as
 * `ReplayEngineUnavailable`, and the next call tries again.
 */
import { loadOnce, type LazyModule, type LazyStatus } from "../platform/lazy-module";

export type ReplayEngine = typeof import("../tearbench/production-replay-composition");

const engine: LazyModule<ReplayEngine> = loadOnce(
  () => import("../tearbench/production-replay-composition"),
  "Replay needs one online visit to download its code. Check the connection and try again.",
);

/** Requests the engine; resolves when it is ready, rejects with a plain message when the fetch fails. */
export function ensureReplayEngine(): Promise<void> {
  return engine.ensure().then(() => undefined);
}

/** The engine, for synchronous replay code that an awaiting caller started. */
export function replayEngine(): ReplayEngine {
  return engine.loaded();
}

/** For a wait state: "idle", "loading", "ready" or "failed". */
export function replayEngineStatus(): LazyStatus {
  return engine.status();
}
