import { TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import type { AuthoritativeStepResult } from "../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { GhostReplayRenderView } from "../../ghost/replay-world";
import type { ReplayEngine } from "../../ghost/replay-engine";
import { replayStartChoices, type ReplayAction, type ReplayFrame, type ReplayRun } from "../../replay/record";
import type { ReplayWorld } from "../../replay/verify";
import type {
  ProductionGhostReplayCompositionOptions,
  ProductionReplayCheckpointCapture,
} from "../world/detached/replay-composition";
import type { Loadout } from "../../domain/cosmetic-types";
import type { CosmeticWardrobe } from "../../presentation/cosmetic-styles";

/** The engine members a recorded run needs: the detached world, its one-tick step and its checkpoint. */
export type RecordWorldEngine = Pick<
  ReplayEngine,
  "createProductionGhostReplayComposition" | "stepDetachedWorld" | "captureProductionReplayCheckpoint"
>;

/** A recorded run's world at the end of one tick, which a new world can start from. */
export interface RecordCheckpoint extends ProductionReplayCheckpointCapture {
  readonly tick: number;
}

/**
 * How a recorded world is drawn: the game's frame builder, and the wardrobe the world draws cosmetics from.
 * Without a wardrobe the world draws the game's own look.
 */
export type RecordWorldPresentation = Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> & {
  readonly wardrobe?: CosmeticWardrobe;
};

/** A recorded run in the detached production world, one tick per `step`. */
export interface RecordWorld {
  readonly step: (
    actions: readonly ReplayAction[],
    frames: readonly ReplayFrame[],
  ) => AuthoritativeStepResult<CanonicalGameplayState>;
  /** The stage the world is in now: the stage a replay shows at this tick. */
  readonly stage: () => number;
  readonly terminated: () => boolean;
  /** The world drawn through the game's own frame builder; only when the world was given a renderer. */
  readonly renderView: () => GhostReplayRenderView | undefined;
  /** The world as it is now, for a later world to start from (watch's seek cache). */
  readonly checkpoint: () => RecordCheckpoint;
  /** Dresses the world's player blade in a recorded look; presentation only, so the run and its hashes are unchanged. */
  readonly dress: (loadout: Loadout) => void;
  readonly dispose: () => void;
}

/**
 * Starts a recorded run in the detached production world from its seed and start choices, or from a
 * checkpoint an earlier world of the same run took. Verify, watch and race all start a run here, so
 * they re-simulate the same world.
 */
export function startRecordWorld(
  engine: RecordWorldEngine,
  run: Pick<ReplayRun, "seed" | "start">,
  observe: Parameters<ReplayWorld["start"]>[1],
  { wardrobe, ...presentation }: RecordWorldPresentation = {},
  from?: RecordCheckpoint,
): RecordWorld {
  const events = new TearGameplayEventBus();
  const unsubscribe = events.subscribe(observe);
  const start = replayStartChoices(run);
  const session = engine
    .createProductionGhostReplayComposition({
      ...presentation,
      ...(wardrobe === undefined ? {} : { looks: wardrobe }),
      runSeed: start.runSeed,
      mode: start.mode,
      weaponId: start.weapon,
      difficulty: start.difficulty,
      firstBoss: start.boss,
      saved: start,
      gameplayEvents: events,
      ...(from === undefined ? {} : { inputSnapshots: new Map([[from.tick, from.input]]) }),
    })
    .create(from?.snapshot);
  events.setTickSource(() => session.simulation.scheduler.tick);
  return Object.freeze<RecordWorld>({
    step: (actions, frames) => engine.stepDetachedWorld(session, actions, frames),
    stage: () => session.replay.stage.index,
    terminated: () => session.replay.world.lifecycle.phase === "terminated",
    renderView: () => session.renderView?.(),
    checkpoint: () => {
      const tick = session.simulation.scheduler.tick;
      const capture = engine.captureProductionReplayCheckpoint(
        session.replay,
        session.combat,
        session.waveReward,
        `record-${String(run.seed)}-${String(tick)}`,
      );
      return Object.freeze({ ...capture, tick });
    },
    dress: (loadout) => {
      const blade = session.replay.world.state.blade();
      if (wardrobe !== undefined && blade !== undefined) wardrobe.wear(blade, loadout);
    },
    dispose: unsubscribe,
  });
}
