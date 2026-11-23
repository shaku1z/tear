// Built URL of the ghost worker: the same hashed file `new Worker(new URL(...))` loads
// (one chunk), so the cache warm-up can fetch it without starting a worker.
import liveGhostReference from "./live-ghost-reference-worker.ts?worker&url";

export const GHOST_WORKER_URLS: readonly string[] = [liveGhostReference];
