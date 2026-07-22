import type { StageRuntimeState } from "./stage-runtime-state";

export interface LiveStageDefinition {
  readonly name?: string;
  readonly dark?: boolean;
}

export interface LiveStageRunState {
  voidScroll?: unknown;
  bossAdds?: unknown;
  _preBossPlatforms?: unknown;
  _brokenPlats?: unknown;
}

export interface LiveStageBlade {
  stolenBy?: unknown;
  hostile?: boolean;
  state?: string;
}

export interface LiveStagePort<TRun extends LiveStageRunState, TBlade extends LiveStageBlade> {
  readonly cancelCinematic: () => void;
  readonly clearHazards: () => void;
  readonly run: () => TRun | null;
  readonly blade: () => TBlade | null;
  readonly achievementTracking: () => boolean;
  readonly rememberBiome: (name: string) => void;
  readonly resetStageAchievements: () => void;
  readonly resetPlayerStagePassives: () => void;
  readonly recordReplayStage: (index: number) => void;
}

/** Applies a biome transition atomically so no prior-stage hazard or boss state can leak forward. */
export class LiveStageController<
  TStage extends LiveStageDefinition,
  TPlatforms,
  TRun extends LiveStageRunState,
  TBlade extends LiveStageBlade,
> {
  readonly #state: StageRuntimeState<TStage, TPlatforms>;
  readonly #port: LiveStagePort<TRun, TBlade>;

  constructor(state: StageRuntimeState<TStage, TPlatforms>, port: LiveStagePort<TRun, TBlade>) {
    this.#state = state;
    this.#port = port;
  }

  load(index: number): void {
    this.#port.cancelCinematic();
    this.#state.load(index);
    this.#port.clearHazards();
    const run = this.#port.run();
    if (run !== null) {
      run.voidScroll = null;
      run.bossAdds = null;
      run._preBossPlatforms = null;
      run._brokenPlats = null;
    }
    const blade = this.#port.blade();
    if (blade?.stolenBy) {
      blade.stolenBy = null;
      blade.hostile = false;
      blade.state = "returning";
    }
    const stageName = this.#state.current.name;
    if (run !== null && this.#port.achievementTracking()
      && stageName !== undefined && stageName !== "" && this.#state.current.dark !== true) {
      this.#port.rememberBiome(stageName);
    }
    if (run !== null) this.#port.resetStageAchievements();
    this.#port.resetPlayerStagePassives();
    this.#port.recordReplayStage(index);
  }
}
