import { releasePointerLock } from "../../platform/browser-pointer-lock";
import {
  snapshotOutcomeRun,
  type PreparedVictory,
  type RunResultInfo,
  type VictoryProgressionIntent,
} from "../../gameplay/run/outcome-planner";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import type { RunLifecycleController } from "../../gameplay/run/lifecycle";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveRunControllerRegistry } from "./run-controller-api";
import { createLiveRunOutcomeHost } from "./run-outcome-host";
import type { RecordingSummary } from "../../gameplay/run/outcome-planner";
import type { StoredRecordingSummary } from "../../gameplay/run/live-recording-controller";
import { createTearTerminalRunFactPublisher } from "../../gameplay/runtime/gameplay-event-publishers";
import type { OutcomeChronologyEffect } from "../../gameplay/run/outcome-chronology-journal";
import type { LiveGhostPracticeSessionState } from "../replay/ghost-practice-session-state";
import type { EnvironmentRuntimeState } from "../../gameplay/environment/environment-contracts";
import type { ReplayRunEnd } from "../../replay/recorder";
import { keepsReplayRecord, replayRunTotals } from "../replay/live-replay-production";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

const recordingMetadata = (summary: RecordingSummary): Readonly<Record<string, unknown>> => ({ ...summary });
const storedRecordingMetadata = (summary: StoredRecordingSummary): Readonly<Record<string, unknown>> => ({
  ...summary,
});

export interface LiveOutcomeCompositionOptions {
  readonly observeTerminal?: (outcome: "defeat" | "victory") => void;
  /** Ends the run's replay record (src/app/replay/live-replay-production.ts); `keep` says whether it is kept. */
  readonly replayRunEnded?: (run: () => ReplayRunEnd["run"], keep: boolean) => void;
  readonly dependencies: GameRuntimeDependencies;
  readonly lifecycle: RunLifecycleController;
  readonly controllers: LiveRunControllerRegistry<GameRun, ReplayPacket, PreparedVictory>;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly stageIndex: () => number;
  readonly loadStage: (index: number) => void;
  readonly authoritativeResult: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly setLastRecording: (recording: ReplayPacket | null) => void;
  readonly setLastVaultId: (id: string | null) => void;
  readonly setOutcome: (result: RunResultInfo) => void;
  readonly selectedWeapon: () => string;
  readonly selectWeapon: (weapon: string) => void;
  readonly clearCombat: () => void;
  readonly environment: EnvironmentRuntimeState;
  readonly resetWinSeconds: () => void;
  readonly setScreen: (screen: "win" | "gameover") => void;
  readonly saveBest: (mode: string, difficulty: string, wave: number, score: number, seconds: number) => boolean;
  readonly getBest: (mode: string, difficulty: string) => Readonly<{ wave: number; score: number; time: number }>;
  readonly awardCoins: (score: number) => number;
  readonly economyTelemetry: (earned: number) => Readonly<Record<string, unknown>>;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  /** Active Ghost practice runs are playable but may not publish durable outcomes. */
  readonly practiceSession?: Pick<LiveGhostPracticeSessionState, "active">;
  readonly finishRecording: (won: boolean) => void;
  readonly executeVictory: (intents: readonly VictoryProgressionIntent[]) => void;
  readonly emitMusicOutcome: (outcome: "defeat" | "victory") => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly cleanupBossActors: () => void;
  readonly startFinale: (death: Readonly<{ x: number; y: number }>, recovered?: boolean) => void;
  readonly cinema: Readonly<{ active: boolean; cancel(reason: string): void }>;
  readonly width: number;
  readonly height: number;
  /** Test-only synchronous terminal receipt sink. */
  readonly observeOutcomeChronology?: (effect: OutcomeChronologyEffect) => void;
}

/** Owns replay packaging, terminal progression, and pending-finale recovery wiring. */
export function createLiveOutcomeComposition(options: LiveOutcomeCompositionOptions): void {
  const d = options.dependencies;
  const active = options.run;
  const practicing = () =>
    options.practiceSession?.active() != null || active().beatThisRun !== undefined || active().seedRace !== undefined;
  const publishTerminal = createTearTerminalRunFactPublisher(
    d.GAMEPLAY_EVENTS,
    () => options.lifecycle.snapshot().sessionId,
  );
  createLiveRunOutcomeHost<ReplayPacket>({
    ...(options.observeTerminal === undefined ? {} : { observeTerminal: options.observeTerminal }),
    snapshot: () => snapshotOutcomeRun(active()),
    displayName: () => d.Cloud.displayName(),
    stageIndex: options.stageIndex,
    loadout: () =>
      d.UPGRADES.filter((ability) => Boolean(active().mods.owned[ability.id])).map((ability) => ({
        id: ability.id,
        tier: active().mods.tier[ability.id] ?? 1,
        count: active().mods.owned[ability.id] ?? 1,
      })),
    authoritativeResult: options.authoritativeResult,
    stopRecording: (summary) => {
      // The run's real end: a defeat or a final win (a campaign stage win is not an outcome).
      const keep = keepsReplayRecord(summary, options.practiceSession?.active() != null);
      // Read when the record closes: a death ends the record after the tick it happened in.
      const run = active();
      options.replayRunEnded?.(() => replayRunTotals(run), keep);
      try {
        return d.GHOST.stopRec(recordingMetadata(summary), {
          continueSemanticInput: summary.won && active().mode === "campaign",
        });
      } finally {
        if (!(summary.won && active().mode === "campaign")) d.Input.stopSemanticRecording();
      }
    },
    storeReplay: (recording, summary) => d.VAULT.add(recording, storedRecordingMetadata(summary)),
    setLastRecording: options.setLastRecording,
    setLastVaultId: options.setLastVaultId,
    submitScore: (board, score) => d.Cloud.submitScore(board, score),
    publishReplay: (recording, board) => d.Cloud.publishReplay(recording, null, board),
    linkReplay: (board, shareId) => {
      void d.Cloud.linkReplay(board, shareId);
    },
    attachShareId: (vaultId, shareId) => {
      d.VAULT.setShareId(vaultId, shareId);
    },
    replaceWaveLog: (log) => {
      active().waveLog = log.slice();
    },
    waveActive: () => options.lifecycle.isWaveActive,
    preparedVictory: () => active()._victoryPrepared ?? null,
    storePreparedVictory: (prepared) => {
      active()._victoryPrepared = prepared;
    },
    stopClipper: () => {
      d.Clipper?.stop();
    },
    terminate: (outcome) => {
      try {
        options.cleanupBossActors();
        options.environment.clear(outcome === "defeat" ? "defeat" : "boss-terminal");
        options.lifecycle.terminate(outcome);
      } finally {
        d.Input.stopSemanticRecording();
      }
    },
    publishTerminal,
    saveBest: (run) =>
      practicing() || run.ghostAssistance !== undefined
        ? false
        : options.saveBest(run.mode, run.diff, run.wave, run.score, run.runTime),
    best: (run) => options.getBest(run.mode, run.diff),
    // A cleared Gauntlet's time joins the profile best unless the run is practice or assisted.
    recordGauntletClear: (run) =>
      run.gauntlet === undefined || practicing() || run.ghostAssistance !== undefined
        ? false
        : d.PROFILE.recordGauntletClear(run.diff, { ticks: run.gauntlet.ticks, hits: run.gauntlet.hits }),
    gauntletBest: (run) => d.PROFILE.gauntletBest(run.diff),
    awardCoins: (score) => (practicing() ? 0 : options.awardCoins(score)),
    coins: () => d.META.coins(),
    achievementTracking: () => !practicing() && options.achievementTracking(),
    economyTelemetry: options.economyTelemetry,
    recordDefeatProgress(run, earned) {
      if (practicing()) return;
      d.outcomeDefeatProgressPersistence.record(run);
      d.DAILY.bump("runs", 1);
      options.achievementCheck();
      void d.Cloud.push();
      d.Cloud.logEvent("run_end", {
        mode: run.mode,
        diff: run.diff,
        wave: run.wave,
        score: run.score,
        time: Math.round(run.runTime),
        peak: run.wavePeak,
        died: true,
        ...options.economyTelemetry(earned),
      });
      options.finishRecording(false);
    },
    finishRecording(won) {
      // Fork-practice/challenge recordings belong to their independent owner.
      if (options.practiceSession?.active() != null) return;
      const run = active();
      if (run.mode !== "tutorial" && (run.beatThisRun !== undefined || run.seedRace !== undefined))
        options.finishRecording(won);
    },
    executeVictoryIntents: (intents) => {
      if (!practicing()) options.executeVictory(intents);
    },
    persistPendingFinale: (record) => {
      if (!practicing()) d.pendingFinalePersistence.persist(record);
    },
    saveProfile: () => {
      if (!practicing()) d.pendingFinalePersistence.saveProfile();
    },
    clearPendingFinale: () => {
      if (!practicing()) d.pendingFinalePersistence.clear();
    },
    pushCloud: () => {
      if (!practicing()) void d.Cloud.push();
    },
    present(outcome, result) {
      options.setOutcome(result);
      options.setScreen(outcome === "victory" ? "win" : "gameover");
      releasePointerLock(document);
      options.emitMusicOutcome(outcome);
      if (outcome === "victory") {
        d.SFX.wave();
        d.CG.happytime();
      } else d.SFX.gameover();
    },
    midgame: (callback) => {
      d.CG.midgame(callback);
    },
    restartCurrentRun: () => {
      options.cleanupBossActors();
      options.environment.clear("retry");
      options.startRun(active().mode, active().diff);
    },
    ...(options.observeOutcomeChronology === undefined
      ? {}
      : { observeOutcomeChronology: options.observeOutcomeChronology }),
    pendingFinale: d.pendingFinalePersistence.pending,
    selectedWeapon: options.selectedWeapon,
    selectWeapon: options.selectWeapon,
    startCampaign: (difficulty) => {
      options.startRun("campaign", difficulty);
    },
    cancelCinematic: (reason) => {
      if (options.cinema.active) options.cinema.cancel(reason);
    },
    pendingRun: active,
    player: options.player,
    stageCount: () => d.STAGES.length,
    loadStage: options.loadStage,
    clearCombat: options.clearCombat,
    groundY: () => d.CONFIG.world.groundY,
    viewport: () => ({ width: options.width, height: options.height }),
    isRecording: () => d.GHOST.recording(),
    stopInterruptedRecording: (reason) => {
      try {
        d.GHOST.stopRec({ [reason]: true });
      } finally {
        d.Input.stopSemanticRecording();
      }
    },
    presentClaimed(result) {
      options.setOutcome(result);
      options.setScreen("win");
      options.resetWinSeconds();
      d.SFX.wave();
      d.CG.happytime();
    },
    launchFinale: (death, recovered) => {
      options.startFinale(death, recovered);
    },
    installRecording: (controller) => {
      options.controllers.installRecording(controller);
    },
    installOutcome: (controller) => {
      options.controllers.installOutcome(controller);
    },
    installPendingFinale: (controller) => {
      options.controllers.installPendingFinale(controller);
    },
  });
}
