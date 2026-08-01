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
import type { OutcomeChronologyEffect } from "./outcome-chronology-journal";

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
  publishTerminal(outcome: TerminalOutcome, run: OutcomeRunState): void;
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
  /** Test-only in-memory receipt sink; it never participates in persistence. */
  observeOutcomeChronology?: (effect: OutcomeChronologyEffect) => void;
}

/** Coordinates exactly-once terminal persistence before exposing a result screen. */
export class LiveRunOutcomeController {
  readonly #port: LiveOutcomeControllerPort;

  constructor(port: LiveOutcomeControllerPort) {
    this.#port = port;
  }

  defeat(): RunResultInfo {
    this.#port.stopClipper();
    this.#record({ type: "outcome.stop-clipper" });
    let run = this.#port.snapshot();
    this.#port.replaceWaveLog(appendDefeatWave(run.waveLog, this.#port.waveActive(), run));
    run = this.#port.snapshot();
    this.#port.terminate("defeat");
    this.#record({ type: "outcome.lifecycle-terminated", outcome: "defeat" });
    this.#port.publishTerminal("defeat", run);
    this.#record({ type: "outcome.terminal-published", outcome: "defeat", run });
    const prepared = this.#prepareResult(run);
    if (this.#achievementTracking()) {
      this.#port.recordDefeatProgress(run, prepared.earned);
      this.#record({ type: "outcome.defeat-progression-dispatched", run, earned: prepared.earned });
    }
    const result = buildRunResult(run, { best: this.#best(run), prepared, victory: false });
    this.#port.present("defeat", result);
    this.#record({ type: "outcome.presentation-dispatched", outcome: "defeat", result });
    return result;
  }

  prepareVictory(campaign: boolean, persistFinale: boolean): PreparedVictory {
    const existing = this.#port.preparedVictory();
    if (existing !== null) {
      this.#record({ type: "outcome.prepared-cache-hit", prepared: existing });
      return existing;
    }
    this.#port.stopClipper();
    this.#record({ type: "outcome.stop-clipper" });
    const run = this.#port.snapshot();
    const prepared = this.#prepareResult(run);
    // Completion is established at the scored/progression boundary. This must
    // precede the victory recording intent, which closes the V3 sidecar.
    this.#port.publishTerminal("victory", run);
    this.#record({ type: "outcome.terminal-published", outcome: "victory", run });
    const achievementTracking = this.#achievementTracking();
    const economy = this.#port.economyTelemetry(prepared.earned);
    this.#record({ type: "outcome.economy-telemetry-read", earned: prepared.earned, telemetry: economy });
    const intents = planVictoryProgression({
      run,
      campaign,
      achievementTracking,
      earned: prepared.earned,
      economy,
    });
    this.#port.executeVictoryIntents(intents);
    this.#record({ type: "outcome.victory-intents-dispatched", intents });
    this.#port.storePreparedVictory(prepared);
    this.#record({ type: "outcome.prepared-stored", prepared });
    if (campaign && persistFinale) {
      const record = buildPendingFinale(run, this.#best(run), prepared);
      this.#port.persistPendingFinale(record);
      this.#record({ type: "outcome.pending-finale-write-requested", record });
    } else {
      this.#port.saveProfile();
      this.#record({ type: "outcome.profile-save-requested" });
    }
    if (this.#achievementTracking()) {
      this.#port.pushCloud();
      this.#record({ type: "outcome.cloud-push-requested" });
    }
    return prepared;
  }

  victory(campaign: boolean): RunResultInfo {
    const prepared = this.prepareVictory(campaign, false);
    const run = this.#port.snapshot();
    const result = buildRunResult(run, {
      best: this.#best(run), prepared, victory: true, campaign,
    });
    if (campaign) {
      this.#port.clearPendingFinale();
      this.#record({ type: "outcome.pending-finale-clear-requested" });
      if (this.#achievementTracking()) {
        this.#port.pushCloud();
        this.#record({ type: "outcome.cloud-push-requested" });
      }
    }
    this.#port.terminate("victory");
    this.#record({ type: "outcome.lifecycle-terminated", outcome: "victory" });
    this.#port.present("victory", result);
    this.#record({ type: "outcome.presentation-dispatched", outcome: "victory", result });
    return result;
  }

  retry(): void {
    this.#port.midgame(() => { this.#port.restartCurrentRun(); });
  }

  #prepareResult(run: OutcomeRunState): PreparedVictory {
    const isNew = this.#port.saveBest(run);
    this.#record({ type: "outcome.score-newness-decided", run, isNew });
    const earned = this.#port.awardCoins(run.score);
    this.#record({ type: "outcome.coins-awarded", score: run.score, earned });
    const coins = this.#port.coins();
    this.#record({ type: "outcome.wallet-read", coins });
    return Object.freeze({
      isNew,
      earned,
      coins,
    });
  }

  #achievementTracking(): boolean {
    const enabled = this.#port.achievementTracking();
    this.#record({ type: "outcome.achievement-policy-read", enabled });
    return enabled;
  }

  #best(run: OutcomeRunState): BestRecord {
    const best = this.#port.best(run);
    this.#record({ type: "outcome.best-read", run, best });
    return best;
  }

  #record(effect: OutcomeChronologyEffect): void {
    this.#port.observeOutcomeChronology?.(effect);
  }
}
