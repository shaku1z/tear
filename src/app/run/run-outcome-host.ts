import { LiveRecordingController, type LiveRecordingPort } from "../../gameplay/run/live-recording-controller";
import { LiveRunOutcomeController, type LiveOutcomeControllerPort } from "../../gameplay/run/live-outcome-controller";
import type { OutcomeChronologyEffect } from "../../gameplay/run/outcome-chronology-journal";
import type {
  OutcomeRunState,
  PreparedVictory,
  RunResultInfo,
  VictoryProgressionIntent,
} from "../../gameplay/run/outcome-planner";
import type { RunDifficulty } from "../../gameplay/run/session";
import type { LeaderboardRef } from "../../domain/leaderboards";
import {
  LivePendingFinaleController,
  type PendingFinalePlayer,
  type PendingFinaleRecord,
  type PendingFinaleResult,
  type PendingFinaleRun,
} from "../campaign/pending-finale-controller";

interface BestRecord {
  readonly wave: number;
  readonly score: number;
  readonly time: number;
}

export interface LiveRunOutcomeHostContext<TKept>
  extends Omit<LiveRecordingPort<TKept>, "snapshot">, Readonly<{ snapshot: () => OutcomeRunState }> {
  readonly observeTerminal?: (outcome: "defeat" | "victory") => void;
  readonly submitScore: (
    board: LeaderboardRef,
    score: Readonly<{ score: number; wave: number; time: number }>,
  ) => Promise<boolean>;
  readonly replaceWaveLog: (log: OutcomeRunState["waveLog"]) => void;
  readonly waveActive: () => boolean;
  readonly preparedVictory: () => PreparedVictory | null;
  readonly storePreparedVictory: (prepared: PreparedVictory) => void;
  readonly stopClipper: () => void;
  readonly terminate: (outcome: "defeat" | "victory") => void;
  readonly publishTerminal: (outcome: "defeat" | "victory", run: OutcomeRunState) => void;
  readonly saveBest: (run: OutcomeRunState) => boolean;
  readonly best: (run: OutcomeRunState) => BestRecord;
  readonly recordGauntletClear: NonNullable<LiveOutcomeControllerPort["recordGauntletClear"]>;
  readonly gauntletBest: NonNullable<LiveOutcomeControllerPort["gauntletBest"]>;
  readonly awardCoins: (score: number) => number;
  readonly coins: () => number;
  readonly achievementTracking: () => boolean;
  readonly economyTelemetry: (earned: number) => Readonly<Record<string, unknown>>;
  readonly recordDefeatProgress: (run: OutcomeRunState, earned: number) => void;
  readonly finishRecording: (won: boolean) => void;
  readonly executeVictoryIntents: (intents: readonly VictoryProgressionIntent[]) => void;
  readonly persistPendingFinale: (record: PendingFinaleRecord) => void;
  readonly saveProfile: () => void;
  readonly clearPendingFinale: () => void;
  readonly pushCloud: () => void;
  readonly present: (outcome: "defeat" | "victory", result: RunResultInfo) => void;
  readonly midgame: (callback: () => void) => void;
  readonly restartCurrentRun: () => void;
  readonly observeOutcomeChronology?: (effect: OutcomeChronologyEffect) => void;
  readonly pendingFinale: () => PendingFinaleRecord | null;
  readonly selectedWeapon: () => string;
  readonly selectWeapon: (weapon: string) => void;
  readonly startCampaign: (difficulty: RunDifficulty) => void;
  readonly cancelCinematic: (reason: string) => void;
  readonly pendingRun: () => PendingFinaleRun;
  readonly player: () => PendingFinalePlayer;
  readonly stageCount: () => number;
  readonly loadStage: (index: number) => void;
  readonly clearCombat: () => void;
  readonly groundY: () => number;
  readonly viewport: () => Readonly<{ width: number; height: number }>;
  readonly isRecording: () => boolean;
  readonly stopInterruptedRecording: (reason: "claimedFinale" | "resumedFinale") => void;
  readonly presentClaimed: (result: PendingFinaleResult) => void;
  readonly launchFinale: (death: Readonly<{ x: number; y: number }>, recovered: true) => void;
  readonly installRecording: (controller: LiveRecordingController<TKept>) => void;
  readonly installOutcome: (controller: LiveRunOutcomeController) => void;
  readonly installPendingFinale: (controller: LivePendingFinaleController) => void;
}

/** Composes recording, terminal outcomes, and pending-finale recovery as one run boundary. */
export function createLiveRunOutcomeHost<TKept>(context: LiveRunOutcomeHostContext<TKept>): void {
  const recording = new LiveRecordingController<TKept>({
    snapshot: context.snapshot,
    endRecord: context.endRecord,
    recordEnded: context.recordEnded,
    submitScore: context.submitScore,
    publishReplay: context.publishReplay,
    linkReplay: context.linkReplay,
    markShared: context.markShared,
  });
  context.installRecording(recording);

  const outcome = new LiveRunOutcomeController({
    snapshot: context.snapshot,
    replaceWaveLog: context.replaceWaveLog,
    waveActive: context.waveActive,
    preparedVictory: context.preparedVictory,
    storePreparedVictory: context.storePreparedVictory,
    stopClipper: context.stopClipper,
    terminate: context.terminate,
    ...(context.observeTerminal === undefined ? {} : { observeTerminal: context.observeTerminal }),
    publishTerminal: context.publishTerminal,
    saveBest: context.saveBest,
    best: context.best,
    recordGauntletClear: context.recordGauntletClear,
    gauntletBest: context.gauntletBest,
    awardCoins: context.awardCoins,
    coins: context.coins,
    achievementTracking: context.achievementTracking,
    economyTelemetry: context.economyTelemetry,
    recordDefeatProgress: context.recordDefeatProgress,
    finishRecording: context.finishRecording,
    executeVictoryIntents: context.executeVictoryIntents,
    persistPendingFinale: context.persistPendingFinale,
    saveProfile: context.saveProfile,
    clearPendingFinale: context.clearPendingFinale,
    pushCloud: context.pushCloud,
    present: context.present,
    midgame: context.midgame,
    restartCurrentRun: context.restartCurrentRun,
    ...(context.observeOutcomeChronology === undefined
      ? {}
      : { observeOutcomeChronology: context.observeOutcomeChronology }),
  });
  context.installOutcome(outcome);

  const pending = new LivePendingFinaleController({
    pending: context.pendingFinale,
    selectedWeapon: context.selectedWeapon,
    selectWeapon: context.selectWeapon,
    startCampaign: context.startCampaign,
    cancelCinematic: context.cancelCinematic,
    run: context.pendingRun,
    player: context.player,
    stageCount: context.stageCount,
    loadStage: context.loadStage,
    clearCombat: context.clearCombat,
    groundY: context.groundY,
    viewport: context.viewport,
    recording: context.isRecording,
    stopRecording: context.stopInterruptedRecording,
    coins: context.coins,
    clearPending: context.clearPendingFinale,
    achievementTracking: context.achievementTracking,
    pushCloud: context.pushCloud,
    terminateVictory: () => {
      context.terminate("victory");
    },
    presentClaimed: context.presentClaimed,
    launchFinale: context.launchFinale,
  });
  context.installPendingFinale(pending);
}
