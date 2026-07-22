import type { RunDifficulty, RunMode } from "../gameplay/run/session";

interface RunStartController<TRun> { start(mode: RunMode, difficulty: RunDifficulty): TRun }
interface WaveController { startNextWave(): void; activatePreparedWave(): void; update(dt: number): void }
interface RecordingController<TReplay> { finish(won: boolean): TReplay | null }
interface OutcomeController<TPrepared> {
  defeat(): unknown;
  prepareVictory(campaign: boolean, persistFinale: boolean): TPrepared;
  victory(campaign: boolean): unknown;
  retry(): void;
}
interface PendingFinaleController { claim(): boolean; resume(): boolean }
interface StageController { load(index: number): void }

export interface LiveRunControllerApi<TRun, TReplay, TPrepared> {
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => TRun;
  readonly startNextWave: () => void;
  readonly activatePreparedWave: () => void;
  readonly updateWave: (dt: number) => void;
  readonly finishRecording: (won: boolean) => TReplay | null;
  readonly endRun: () => void;
  readonly prepareVictoryRecord: (campaign: boolean, persistFinale: boolean) => TPrepared;
  readonly winRun: (campaign?: boolean) => void;
  readonly retryRun: () => void;
  readonly claimSavedFinale: () => void;
  readonly resumeSavedFinale: () => void;
  readonly loadStage: (index: number) => void;
}

/** Resolves controller cycles while exposing one stable, bound API during application composition. */
export class LiveRunControllerRegistry<TRun, TReplay, TPrepared> {
  #runStart: RunStartController<TRun> | null = null;
  #wave: WaveController | null = null;
  #recording: RecordingController<TReplay> | null = null;
  #outcome: OutcomeController<TPrepared> | null = null;
  #pendingFinale: PendingFinaleController | null = null;
  #stage: StageController | null = null;

  readonly api: LiveRunControllerApi<TRun, TReplay, TPrepared> = Object.freeze({
    startRun: (mode: RunMode, difficulty: RunDifficulty) => this.#required(this.#runStart, "run start").start(mode, difficulty),
    startNextWave: () => { this.#required(this.#wave, "wave").startNextWave(); },
    activatePreparedWave: () => { this.#required(this.#wave, "wave").activatePreparedWave(); },
    updateWave: (dt: number) => { this.#required(this.#wave, "wave").update(dt); },
    finishRecording: (won: boolean) => this.#required(this.#recording, "recording").finish(won),
    endRun: () => { this.#required(this.#outcome, "outcome").defeat(); },
    prepareVictoryRecord: (campaign: boolean, persistFinale: boolean) => this.#required(this.#outcome, "outcome")
      .prepareVictory(campaign, persistFinale),
    winRun: (campaign = false) => { this.#required(this.#outcome, "outcome").victory(campaign); },
    retryRun: () => { this.#required(this.#outcome, "outcome").retry(); },
    claimSavedFinale: () => { this.#required(this.#pendingFinale, "pending finale").claim(); },
    resumeSavedFinale: () => { this.#required(this.#pendingFinale, "pending finale").resume(); },
    loadStage: (index: number) => { this.#required(this.#stage, "stage").load(index); },
  });

  installRunStart(controller: RunStartController<TRun>): void { this.#runStart = controller; }
  installWave(controller: WaveController): void { this.#wave = controller; }
  installRecording(controller: RecordingController<TReplay>): void { this.#recording = controller; }
  installOutcome(controller: OutcomeController<TPrepared>): void { this.#outcome = controller; }
  installPendingFinale(controller: PendingFinaleController): void { this.#pendingFinale = controller; }
  installStage(controller: StageController): void { this.#stage = controller; }

  #required<T>(controller: T | null, name: string): T {
    if (controller === null) throw new Error(`${name} controller is not installed`);
    return controller;
  }
}
