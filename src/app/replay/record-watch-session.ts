import type {
  GhostVerifiedProductionReplaySession,
  GhostVerifiedReplayRenderView,
} from "../../ghost/production-replay-session";
import type { GhostSeekResult } from "../../ghost/replay-world";
import type { ReplayRecord } from "../../replay/record";
import { createReplayInputCursor, type ReplayTickInputs } from "../../replay/verify";
import type { ProductionGhostReplayCompositionOptions } from "../world/detached/replay-composition";
import { createRecordSeekCache, type RecordSeekCache } from "./record-seek-cache";
import { startRecordWorld, type RecordWorld, type RecordWorldEngine } from "./record-world";

/** A replay-screen source over a kept record. It also says which stage the world shows now. */
export interface RecordWatchSession extends GhostVerifiedProductionReplaySession {
  readonly firstTick: number;
  readonly lastTick: number;
  /** The stage index of the re-simulated world at the tick last sought. */
  readonly stage: () => number;
}

/**
 * Watches a kept record by re-simulating it in the detached production world and drawing that world
 * through the game's own frame builder, so the stage, the weapon, projectiles and bosses at a tick are
 * the ones play had at that tick.
 *
 * The session keeps one world and steps it forward. A seek to a tick the world has passed starts a new
 * world from the nearest checkpoint at or before it (`RecordSeekCache`), or from the seed when there is
 * none. The engine is the one `replayEngine.ensure()` resolved to.
 */
export function createRecordWatchSession(
  record: ReplayRecord,
  key: string,
  engine: RecordWorldEngine,
  presentation: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> = {},
  cache: RecordSeekCache = createRecordSeekCache(),
): RecordWatchSession {
  const lastTick = record.run.result.tick;
  let world: RecordWorld | undefined;
  let next: () => ReplayTickInputs = createReplayInputCursor(record.run);
  let tick = 0;
  let hash = "";
  /** Why the cache was turned off for this run, if it was: watch then re-simulates from the seed. */
  let cacheOff: string | undefined;
  const turnCacheOff = (error: unknown) => {
    cacheOff = error instanceof Error ? error.message : String(error);
    console.warn(`replay seek cache off: ${cacheOff}`);
  };
  const nearest = (target: number) => (cacheOff === undefined ? cache.nearest(target) : undefined);
  /** A new world at the cache's nearest checkpoint at or before `target`, or at the seed. */
  const restart = (target: number): RecordWorld => {
    world?.dispose();
    let from = nearest(target);
    try {
      world = startRecordWorld(engine, record.run, () => undefined, presentation, from);
    } catch (error) {
      if (from === undefined) throw error;
      turnCacheOff(error);
      from = undefined;
      world = startRecordWorld(engine, record.run, () => undefined, presentation);
    }
    next = createReplayInputCursor(record.run, from?.tick ?? 0);
    tick = from?.tick ?? 0;
    hash = from?.semanticHash ?? "";
    return world;
  };
  const seek = (target: number): GhostSeekResult => {
    if (!Number.isSafeInteger(target) || target < 0 || target > lastTick)
      throw new RangeError("replay seek is outside the recorded run");
    const cached = nearest(target)?.tick ?? 0;
    const current = world === undefined || target < tick || cached > tick ? restart(target) : world;
    while (tick < target) {
      const { actions, frames } = next();
      const result = current.step(actions, frames);
      tick += 1;
      hash = result.stateHash;
      if (cacheOff === undefined && cache.wants(tick))
        try {
          cache.add(current.checkpoint());
        } catch (error) {
          turnCacheOff(error);
        }
    }
    return Object.freeze({ tick, semanticHash: hash, presentationFallback: false });
  };
  // The seek bar's chapters: the stages, waves and boss waves the run reached.
  const chapters = Object.freeze([...new Set(record.summary.marks.map((mark) => mark.tick))].sort((a, b) => a - b));
  return Object.freeze<RecordWatchSession>({
    firstTick: 0,
    lastTick,
    sourceId: key,
    sourceCapsuleRootIntegrity: key,
    sourceRootHash: record.run.result.hash,
    verifiedReceiptTicks: chapters,
    seek,
    stage: () => (world ?? restart(0)).stage(),
    ...(presentation.renderView === undefined
      ? {}
      : {
          renderFrame(target: number): GhostVerifiedReplayRenderView {
            const result = seek(target);
            const view = world?.renderView();
            if (view === undefined) throw new Error("replay presentation is unavailable");
            return Object.freeze({
              ...view,
              sourceId: key,
              sourceRootHash: record.run.result.hash,
              sourceCapsuleRootIntegrity: key,
              semanticHash: result.semanticHash,
            });
          },
        }),
    forkPractice(): never {
      throw new TypeError("practice from a kept run is not available yet");
    },
  });
}
