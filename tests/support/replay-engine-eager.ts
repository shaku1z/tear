// Unit tests run in Node with the replay engine linked in, so replay code stays synchronous there.
// The game fetches the same module on first use (src/app/shell/deferred-modules.ts); vitest.config.ts aliases this file in.
import * as engine from "../../src/tearbench/production-replay-composition";
import "../../src/app/replay/replay-engine-shape";
import type { LazyModuleSlot } from "../../src/domain/lazy-module";

export type ReplayEngine = typeof engine;
export const replayEngine: LazyModuleSlot<ReplayEngine> = {
  install: () => undefined,
  ensure: () => Promise.resolve(engine),
  loaded: () => engine,
  status: () => "ready",
};
