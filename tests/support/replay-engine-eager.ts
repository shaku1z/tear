// Unit tests run in Node with the replay engine linked in, so replay code stays synchronous there.
// The game fetches the same module on first use (src/ghost/replay-engine.ts); vitest.config.ts aliases this file in.
import * as engine from "../../src/tearbench/production-replay-composition";
import type { LazyStatus } from "../../src/domain/lazy-module";

export type ReplayEngine = typeof engine;
export const installReplayEngine = (): void => undefined;
export const ensureReplayEngine = (): Promise<void> => Promise.resolve();
export const replayEngine = (): ReplayEngine => engine;
export const replayEngineStatus = (): LazyStatus => "ready";
