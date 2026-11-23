import { TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import type { AuthoritativeStepResult } from "../../gameplay/runtime/authoritative-step";
import type { CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { GhostReplayRenderView } from "../../ghost/replay-world";
import type { ReplayEngine } from "../../ghost/replay-engine";
import { replayStartChoices, type ReplayAction, type ReplayFrame, type ReplayRun } from "../../replay/record";
import type { ReplayWorld } from "../../replay/verify";
import type { ProductionGhostReplayCompositionOptions } from "../world/detached/replay-composition";
import type { Loadout } from "../../domain/cosmetic-types";
import type { CosmeticWardrobe } from "../../presentation/cosmetic-styles";

/** The engine members a recorded run needs: the detached world and its one-tick step. */
export type RecordWorldEngine = Pick<ReplayEngine, "createProductionGhostReplayComposition" | "stepDetachedWorld">;

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
  /** Dresses the world's player blade in a recorded look; presentation only, so the run and its hashes are unchanged. */
  readonly dress: (loadout: Loadout) => void;
  readonly dispose: () => void;
}

/**
 * Starts a recorded run in the detached production world from its seed and start choices. Verify,
 * watch and race all start a run here, so they re-simulate the same world.
 */
export function startRecordWorld(
  engine: RecordWorldEngine,
  run: Pick<ReplayRun, "seed" | "start">,
  observe: Parameters<ReplayWorld["start"]>[1],
  { wardrobe, ...presentation }: RecordWorldPresentation = {},
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
    })
    .create(undefined);
  events.setTickSource(() => session.simulation.scheduler.tick);
  return Object.freeze<RecordWorld>({
    step: (actions, frames) => engine.stepDetachedWorld(session, actions, frames),
    stage: () => session.replay.stage.index,
    terminated: () => session.replay.world.lifecycle.phase === "terminated",
    renderView: () => session.renderView?.(),
    dress: (loadout) => {
      const blade = session.replay.world.state.blade();
      if (wardrobe !== undefined && blade !== undefined) wardrobe.wear(blade, loadout);
    },
    dispose: unsubscribe,
  });
}
