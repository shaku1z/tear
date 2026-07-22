import { LiveRecordingController, type RecordedReplay, type StoredRecordingSummary } from "../gameplay/run/live-recording-controller";
import { LiveRunOutcomeController } from "../gameplay/run/live-outcome-controller";
import type { OutcomeRunState, PreparedVictory, RecordingSummary, RunResultInfo, VictoryProgressionIntent } from "../gameplay/run/outcome-planner";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import { LivePendingFinaleController, type PendingFinalePlayer, type PendingFinaleRecord,
  type PendingFinaleResult, type PendingFinaleRun } from "./live-pending-finale-controller";

interface BestRecord { readonly wave: number; readonly score: number; readonly time: number }

export interface LiveRunOutcomeHostContext<TReplay extends RecordedReplay> {
  readonly snapshot: () => OutcomeRunState;
  readonly displayName: () => string;
  readonly stageIndex: () => number;
  readonly loadout: () => readonly Readonly<{ id: string; tier: number; count: number }>[];
  readonly authoritativeResult: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly stopRecording: (summary: RecordingSummary) => TReplay | null;
  readonly storeReplay: (recording: TReplay, summary: StoredRecordingSummary) => string | null;
  readonly setLastRecording: (recording: TReplay | null) => void;
  readonly setLastVaultId: (id: string | null) => void;
  readonly submitScore: (mode: RunMode, difficulty: RunDifficulty,
    score: Readonly<{ score: number; wave: number; time: number }>) => Promise<boolean>;
  readonly publishReplay: (recording: TReplay, board: string) => Promise<string | null>;
  readonly linkReplay: (mode: RunMode, difficulty: RunDifficulty, shareId: string) => void;
  readonly attachShareId: (vaultId: string, shareId: string) => void;
  readonly replaceWaveLog: (log: OutcomeRunState["waveLog"]) => void;
  readonly waveActive: () => boolean;
  readonly preparedVictory: () => PreparedVictory | null;
  readonly storePreparedVictory: (prepared: PreparedVictory) => void;
  readonly stopClipper: () => void;
  readonly terminate: (outcome: "defeat" | "victory") => void;
  readonly saveBest: (run: OutcomeRunState) => boolean;
  readonly best: (run: OutcomeRunState) => BestRecord;
  readonly awardCoins: (score: number) => number;
  readonly coins: () => number;
  readonly achievementTracking: () => boolean;
  readonly economyTelemetry: (earned: number) => Readonly<Record<string, unknown>>;
  readonly recordDefeatProgress: (run: OutcomeRunState, earned: number) => void;
  readonly executeVictoryIntents: (intents: readonly VictoryProgressionIntent[]) => void;
  readonly persistPendingFinale: (record: PendingFinaleRecord) => void;
  readonly saveProfile: () => void;
  readonly clearPendingFinale: () => void;
  readonly pushCloud: () => void;
  readonly present: (outcome: "defeat" | "victory", result: RunResultInfo) => void;
  readonly midgame: (callback: () => void) => void;
  readonly restartCurrentRun: () => void;
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
  readonly installRecording: (controller: LiveRecordingController<TReplay>) => void;
  readonly installOutcome: (controller: LiveRunOutcomeController) => void;
  readonly installPendingFinale: (controller: LivePendingFinaleController) => void;
}

/** Composes recording, terminal outcomes, and pending-finale recovery as one run boundary. */
export function createLiveRunOutcomeHost<TReplay extends RecordedReplay>(
  context: LiveRunOutcomeHostContext<TReplay>,
): void {
  const recording = new LiveRecordingController<TReplay>({
    snapshot: context.snapshot,
    displayName: context.displayName,
    stageIndex: context.stageIndex,
    loadout: context.loadout,
    authoritativeResult: context.authoritativeResult,
    stopRecording: context.stopRecording,
    storeReplay: context.storeReplay,
    recordingStopped: context.setLastRecording,
    replayStored: context.setLastVaultId,
    submitScore: context.submitScore,
    publishReplay: context.publishReplay,
    linkReplay: context.linkReplay,
    attachShareId: context.attachShareId,
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
    saveBest: context.saveBest,
    best: context.best,
    awardCoins: context.awardCoins,
    coins: context.coins,
    achievementTracking: context.achievementTracking,
    economyTelemetry: context.economyTelemetry,
    recordDefeatProgress: context.recordDefeatProgress,
    executeVictoryIntents: context.executeVictoryIntents,
    persistPendingFinale: context.persistPendingFinale,
    saveProfile: context.saveProfile,
    clearPendingFinale: context.clearPendingFinale,
    pushCloud: context.pushCloud,
    present: context.present,
    midgame: context.midgame,
    restartCurrentRun: context.restartCurrentRun,
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
    terminateVictory: () => { context.terminate("victory"); },
    presentClaimed: context.presentClaimed,
    launchFinale: context.launchFinale,
  });
  context.installPendingFinale(pending);
}
