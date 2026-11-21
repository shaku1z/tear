import type { LiveGameHostState } from "./game-host-state";
import type { StageRuntimeState } from "./stage-runtime-state";
import { LiveStageController, type LiveStageDefinition } from "./stage-controller";
import type { EnvironmentRuntimeState } from "../../gameplay/environment/environment-contracts";
import { activateStageEnvironment } from "../../gameplay/environment/stage-environment-activation";
import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import { resetStageRestrictions } from "../../gameplay/progression/achievement-runtime";
import type { TearGameplayEventPort } from "../../gameplay/runtime/gameplay-events";
import { stageIdAtRuntimeIndex } from "../../gameplay/stages";

/** What a stage load reaches in one world. Live play and a detached world pass their own. */
export interface RunStageControllerOptions<TStage extends LiveStageDefinition, TPlatforms> {
  readonly stage: StageRuntimeState<TStage, TPlatforms>;
  readonly state: LiveGameHostState;
  readonly cinema: Readonly<{ active: boolean; cancel(reason: "stage-change"): void }>;
  readonly gameplayEvents: Pick<TearGameplayEventPort, "emit">;
  /** The live game's saved biome progress; a detached world records none. */
  readonly progress?: Readonly<{ tracking(): boolean; rememberBiome(name: string): void }>;
}

/** The one stage controller of a run, for live play and for a detached world. */
export function createRunStageController<TStage extends LiveStageDefinition, TPlatforms>(
  options: RunStageControllerOptions<TStage, TPlatforms>,
) {
  const { state } = options;
  return new LiveStageController(options.stage, {
    cancelCinematic: () => {
      if (options.cinema.active) options.cinema.cancel("stage-change");
    },
    clearHazards: () => {
      state.setSlowZones([]);
      state.setTemporaryWalls([]);
    },
    run: () => state.run(),
    blade: () => state.blade() ?? null,
    achievementTracking: () => options.progress?.tracking() === true,
    rememberBiome: (name) => {
      options.progress?.rememberBiome(name);
    },
    resetStageAchievements: () => {
      resetStageRestrictions(state.run());
    },
    resetPlayerStagePassives: () => {
      state.player()?.resetStagePassives();
    },
    recordReplayStage: (index) => {
      const stageId = stageIdAtRuntimeIndex(index);
      options.gameplayEvents.emit({
        kind: "stage",
        stage: index,
        ...(stageId === null ? {} : { stageId }),
        transition: "entered",
      });
    },
  });
}

export interface RunStageLoadPort {
  /** The stage controller's load. */
  readonly load: (index: number) => void;
  readonly enemies: () => readonly unknown[];
  readonly environment: EnvironmentRuntimeState;
  /** The authoritative tick the stage's environment fields start at. */
  readonly tick: () => number;
}

/**
 * Loads a run's stage with its environment: at the run's start ("new-run") or when the wave planner moves
 * the run to the next stage ("stage-transition", which first removes the last stage's boss encounter).
 */
export function loadRunStage(port: RunStageLoadPort, index: number, reason: "new-run" | "stage-transition"): void {
  const stageId = stageIdAtRuntimeIndex(index);
  if (stageId === null) throw new RangeError(`environment stage index is invalid: ${String(index)}`);
  if (reason === "stage-transition") cleanupBossEncounterActors(port.enemies() as never, "stage-transition");
  port.load(index);
  activateStageEnvironment(port.environment, stageId, port.tick(), reason);
}
