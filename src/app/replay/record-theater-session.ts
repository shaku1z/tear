import { replayEngine } from "../../ghost/replay-engine";
import type {
  GhostVerifiedProductionReplaySession,
  GhostVerifiedReplayRenderView,
} from "../../ghost/production-replay-session";
import type { GhostSeekResult } from "../../ghost/replay-world";
import type { ReplayRecord } from "../../replay/record";
import { createReplayInputCursor, type ReplayTickInputs } from "../../replay/verify";
import type { ProductionGhostReplayCompositionOptions } from "../world/detached/replay-composition";
import { startRecordWorld, type RecordWorld } from "./record-world";

/** A Theater source over a kept record. It also says which stage the world shows now. */
export interface RecordTheaterSession extends GhostVerifiedProductionReplaySession {
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
 * A record has no keyframes, so the session keeps one world and steps it forward. A seek backwards
 * starts the run again from its seed. Callers await `replayEngine.ensure()` before opening one.
 */
export function createRecordTheaterSession(
  record: ReplayRecord,
  key: string,
  presentation: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> = {},
): RecordTheaterSession {
  const lastTick = record.run.result.tick;
  let world: RecordWorld | undefined;
  let next: () => ReplayTickInputs = createReplayInputCursor(record.run);
  let tick = 0;
  let hash = "";
  const restart = (): RecordWorld => {
    world?.dispose();
    world = startRecordWorld(replayEngine.loaded(), record.run, () => undefined, presentation);
    next = createReplayInputCursor(record.run);
    tick = 0;
    hash = "";
    return world;
  };
  const seek = (target: number): GhostSeekResult => {
    if (!Number.isSafeInteger(target) || target < 0 || target > lastTick)
      throw new RangeError("replay seek is outside the recorded run");
    const current = world === undefined || target < tick ? restart() : world;
    while (tick < target) {
      const { actions, frames } = next();
      const result = current.step(actions, frames);
      tick += 1;
      hash = result.stateHash;
    }
    return Object.freeze({ tick, semanticHash: hash, presentationFallback: false });
  };
  // The seek bar's chapters: the stages, waves and boss waves the run reached.
  const chapters = Object.freeze([...new Set(record.summary.marks.map((mark) => mark.tick))].sort((a, b) => a - b));
  return Object.freeze<RecordTheaterSession>({
    firstTick: 0,
    lastTick,
    sourceId: key,
    sourceCapsuleRootIntegrity: key,
    sourceRootHash: record.run.result.hash,
    verifiedReceiptTicks: chapters,
    seek,
    stage: () => (world ?? restart()).stage(),
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
      throw new TypeError("practice from a kept run arrives with the new Theater");
    },
  });
}
