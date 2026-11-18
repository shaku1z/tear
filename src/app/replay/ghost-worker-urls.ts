// Built URLs of the two ghost workers: the same hashed files `new Worker(new URL(...))` loads
// (one chunk each), so the cache warm-up can fetch them without starting a worker.
import careerArchive from "../../ghost/career-archive-worker.ts?worker&url";
import liveGhostReference from "../../ghost/live-ghost-reference-worker.ts?worker&url";

export const GHOST_WORKER_URLS: readonly string[] = [careerArchive, liveGhostReference];
