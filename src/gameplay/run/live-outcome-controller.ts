import {
  appendDefeatWave,
  buildPendingFinale,
  buildRunResult,
  planVictoryProgression,
  type OutcomeRunState,
  type PreparedVictory,
  type RunResultInfo,
  type VictoryProgressionIntent,
} from "./outcome-planner";

type TerminalOutcome = "defeat" | "victory";
type BestRecord = Readonly<{ wave: number; score: number; time: number }>;

export interface LiveOutcomeControllerPort {
  snapshot(): OutcomeRunState;
  replaceWaveLog(log: OutcomeRunState["waveLog"]): void;
  waveActive(): boolean;
  preparedVictory(): PreparedVictory | null;
  storePreparedVictory(prepared: PreparedVictory): void;
  stopClipper(): void;
  terminate(outcome: TerminalOutcome): void;
  saveBest(run: OutcomeRunState): boolean;
  best(run: OutcomeRunState): BestRecord;
  awardCoins(score: number): number;
  coins(): number;
  achievementTracking(): boolean;
  economyTelemetry(earned: number): Readonly<Record<string, unknown>>;
  recordDefeatProgress(run: OutcomeRunState, earned: number): void;
  executeVictoryIntents(intents: readonly VictoryProgressionIntent[]): void;
  persistPendingFinale(record: ReturnType<typeof buildPendingFinale>): void;
  saveProfile(): void;
  clearPendingFinale(): void;
  pushCloud(): void;
  present(outcome: TerminalOutcome, result: RunResultInfo): void;
  midgame(callback: () => void): void;
  restartCurrentRun(): void;
}

/** Coordinates exactly-once terminal persistence before exposing a result screen. */
export class LiveRunOutcomeController {
  readonly #port: LiveOutcomeControllerPort;

  constructor(port: LiveOutcomeControllerPort) {
    this.#port = port;
  }

  defeat(): RunResultInfo {
    this.#port.stopClipper();
    let run = this.#port.snapshot();
    this.#port.replaceWaveLog(appendDefeatWave(run.waveLog, this.#port.waveActive(), run));
    run = this.#port.snapshot();
    this.#port.terminate("defeat");
    const prepared = this.#prepareResult(run);
    if (this.#port.achievementTracking()) this.#port.recordDefeatProgress(run, prepared.earned);
    const result = buildRunResult(run, { best: this.#port.best(run), prepared, victory: false });
    this.#port.present("defeat", result);
    return result;
  }

  prepareVictory(campaign: boolean, persistFinale: boolean): PreparedVictory {
    const existing = this.#port.preparedVictory();
    if (existing !== null) return existing;
    this.#port.stopClipper();
    const run = this.#port.snapshot();
    const prepared = this.#prepareResult(run);
    this.#port.executeVictoryIntents(planVictoryProgression({
      run,
      campaign,
      achievementTracking: this.#port.achievementTracking(),
      earned: prepared.earned,
      economy: this.#port.economyTelemetry(prepared.earned),
    }));
    this.#port.storePreparedVictory(prepared);
    if (campaign && persistFinale) {
      this.#port.persistPendingFinale(buildPendingFinale(run, this.#port.best(run), prepared));
    } else {
      this.#port.saveProfile();
    }
    if (this.#port.achievementTracking()) this.#port.pushCloud();
    return prepared;
  }

  victory(campaign: boolean): RunResultInfo {
    const prepared = this.prepareVictory(campaign, false);
    const run = this.#port.snapshot();
    const result = buildRunResult(run, {
      best: this.#port.best(run), prepared, victory: true, campaign,
    });
    if (campaign) {
      this.#port.clearPendingFinale();
      if (this.#port.achievementTracking()) this.#port.pushCloud();
    }
    this.#port.terminate("victory");
    this.#port.present("victory", result);
    return result;
  }

  retry(): void {
    this.#port.midgame(() => { this.#port.restartCurrentRun(); });
  }

  #prepareResult(run: OutcomeRunState): PreparedVictory {
    return Object.freeze({
      isNew: this.#port.saveBest(run),
      earned: this.#port.awardCoins(run.score),
      coins: this.#port.coins(),
    });
  }
}
