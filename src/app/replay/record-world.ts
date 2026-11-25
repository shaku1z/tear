import { TearGameplayEventBus } from "../../gameplay/runtime/gameplay-events";
import type { AuthoritativeStepResult } from "../../gameplay/runtime/authoritative-step";
import { canonicalReplayTotals, type CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { GhostReplayRenderView } from "../../ghost/replay-world";
import type { ReplayEngine } from "../../ghost/replay-engine";
import {
  replayStartChoices,
  type ReplayAction,
  type ReplayFrame,
  type ReplayRecord,
  type ReplayRun,
} from "../../replay/record";
import { createWatch, type Watch, type WatchOptions, type WatchWorld } from "../../replay/watch";
import type { ReplayWorld, ReplayWorldRun } from "../../replay/verify";
import type {
  ProductionGhostReplayCompositionOptions,
  ProductionReplayCheckpointCapture,
} from "../world/detached/replay-composition";
import { ownedLoadout } from "../../gameplay/progression/upgrade-loadout";
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
  /** The run's upgrades now, as the run-end screen lists them. */
  readonly loadout: () => ReturnType<typeof ownedLoadout>;
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
    loadout: () => {
      const current = session.replay.world.state.run();
      return current === null ? [] : ownedLoadout(current.mods);
    },
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

/**
 * The replay world port (verify, watch and race run through it) over the detached production world, with the
 * engine it is given: the engine the deferred loader fetched, or a bundle's own copy where that is static.
 */
export function recordReplayWorld(engine: RecordWorldEngine): ReplayWorld {
  return Object.freeze<ReplayWorld>({
    start(run, observe) {
      const world = startRecordWorld(engine, run, observe);
      // The last step's result; its state is captured only when asked for.
      let last: AuthoritativeStepResult<CanonicalGameplayState> | undefined;
      return Object.freeze<ReplayWorldRun>({
        step(actions, frames) {
          const result = world.step(actions, frames);
          last = result;
          return Object.freeze({ tick: result.tick, hash: () => result.stateHash, terminated: world.terminated() });
        },
        run: () => canonicalReplayTotals(last?.state.run),
        dispose: world.dispose,
      });
    },
  });
}
/** A recorded run's world as watch steps it: the record world, dressed in the record's look. */
export type RecordWatchWorld = WatchWorld<RecordCheckpoint, GhostReplayRenderView> &
  Pick<RecordWorld, "stage" | "loadout">;

/**
 * Watches a kept record: the run re-simulated in the detached production world and drawn through the game's
 * own frame builder, so the stage, weapon, projectiles and bosses at a tick are the ones play had at that
 * tick. Every world watch starts, from the seed or a checkpoint, wears the record's cosmetics: the look is
 * presentation, not checkpoint state. The chapters are the stages, waves and boss waves the run reached.
 */
export function watchRecord(
  record: ReplayRecord,
  engine: RecordWorldEngine,
  presentation: RecordWorldPresentation = {},
  cache?: WatchOptions<RecordCheckpoint, RecordWatchWorld>["cache"],
): Watch<RecordCheckpoint, RecordWatchWorld> {
  return createWatch<RecordCheckpoint, RecordWatchWorld>({
    run: record.run,
    chapters: record.summary.marks.map((mark) => mark.tick),
    ...(cache === undefined ? {} : { cache }),
    cacheOff: (reason) => {
      console.warn(`replay seek cache off: ${reason}`);
    },
    start: (from) => {
      const world = startRecordWorld(engine, record.run, () => undefined, presentation, from);
      world.dress(record.look.cosmetics);
      return Object.freeze<RecordWatchWorld>({
        step: ({ actions, frames }) => world.step(actions, frames).stateHash,
        checkpoint: world.checkpoint,
        frame: world.renderView,
        stage: world.stage,
        loadout: world.loadout,
        dispose: world.dispose,
      });
    },
  });
}
