import { snapshotOutcomeRun, type PreparedVictory, type RunResultInfo, type VictoryProgressionIntent } from "../gameplay/run/outcome-planner";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveRunControllerRegistry } from "./live-run-controller-api";
import { createLiveRunOutcomeHost } from "./live-run-outcome-host";
import type { RecordingSummary } from "../gameplay/run/outcome-planner";
import type { StoredRecordingSummary } from "../gameplay/run/live-recording-controller";

type ReplayPacket = NonNullable<ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>>;

const recordingMetadata = (summary: RecordingSummary): Readonly<Record<string, unknown>> => ({ ...summary });
const storedRecordingMetadata = (summary: StoredRecordingSummary): Readonly<Record<string, unknown>> => ({ ...summary });

export interface LiveOutcomeCompositionOptions {
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
  readonly resetWinSeconds: () => void;
  readonly setScreen: (screen: "win" | "gameover") => void;
  readonly saveBest: (mode: string, difficulty: string, wave: number, score: number, seconds: number) => boolean;
  readonly getBest: (mode: string, difficulty: string) => Readonly<{ wave: number; score: number; time: number }>;
  readonly awardCoins: (score: number) => number;
  readonly economyTelemetry: (earned: number) => Readonly<Record<string, unknown>>;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  readonly finishRecording: (won: boolean) => void;
  readonly executeVictory: (intents: readonly VictoryProgressionIntent[]) => void;
  readonly emitMusicOutcome: (outcome: "defeat" | "victory") => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly startFinale: (death: Readonly<{ x: number; y: number }>, recovered?: boolean) => void;
  readonly cinema: Readonly<{ active: boolean; cancel(reason: string): void }>;
  readonly width: number;
  readonly height: number;
}

/** Owns replay packaging, terminal progression, and pending-finale recovery wiring. */
export function createLiveOutcomeComposition(options: LiveOutcomeCompositionOptions): void {
  const d = options.dependencies;
  const active = options.run;
  createLiveRunOutcomeHost<ReplayPacket>({
    snapshot: () => snapshotOutcomeRun(active()),
    displayName: () => d.Cloud.displayName(),
    stageIndex: options.stageIndex,
    loadout: () => d.UPGRADES.filter((ability) => Boolean(active().mods.owned[ability.id])).map((ability) => ({
      id: ability.id, tier: active().mods.tier[ability.id] ?? 1, count: active().mods.owned[ability.id] ?? 1,
    })),
    authoritativeResult: options.authoritativeResult,
    stopRecording: (summary) => d.GHOST.stopRec(recordingMetadata(summary)),
    storeReplay: (recording, summary) => d.VAULT.add(recording, storedRecordingMetadata(summary)),
    setLastRecording: options.setLastRecording,
    setLastVaultId: options.setLastVaultId,
    submitScore: (mode, difficulty, score) => d.Cloud.submitScore(mode, difficulty, score),
    publishReplay: (recording, board) => d.Cloud.publishReplay(recording, null, board),
    linkReplay: (mode, difficulty, shareId) => { void d.Cloud.linkReplay(mode, difficulty, shareId); },
    attachShareId: (vaultId, shareId) => { d.VAULT.setShareId(vaultId, shareId); },
    replaceWaveLog: (log) => { active().waveLog = log.slice(); },
    waveActive: () => options.lifecycle.isWaveActive,
    preparedVictory: () => active()._victoryPrepared ?? null,
    storePreparedVictory: (prepared) => { active()._victoryPrepared = prepared; },
    stopClipper: () => { d.Clipper?.stop(); },
    terminate: (outcome) => { options.lifecycle.terminate(outcome); },
    saveBest: (run) => options.saveBest(run.mode, run.diff, run.wave, run.score, run.runTime),
    best: (run) => options.getBest(run.mode, run.diff),
    awardCoins: options.awardCoins,
    coins: () => d.META.coins(),
    achievementTracking: options.achievementTracking,
    economyTelemetry: options.economyTelemetry,
    recordDefeatProgress(run, earned) {
      d.PROFILE.addStat("runs", 1);
      d.PROFILE.maxStat("longestRun", Math.floor(run.runTime));
      d.DAILY.bump("runs", 1);
      options.achievementCheck();
      void d.Cloud.push();
      d.Cloud.logEvent("run_end", { mode: run.mode, diff: run.diff, wave: run.wave, score: run.score,
        time: Math.round(run.runTime), peak: run.wavePeak, died: true, ...options.economyTelemetry(earned) });
      options.finishRecording(false);
    },
    executeVictoryIntents: options.executeVictory,
    persistPendingFinale: (record) => { d.PROFILE.setPendingFinale(record); },
    saveProfile: () => { d.PROFILE.save(); },
    clearPendingFinale: () => { d.PROFILE.clearPendingFinale(); },
    pushCloud: () => { void d.Cloud.push(); },
    present(outcome, result) {
      options.setOutcome(result);
      options.setScreen(outcome === "victory" ? "win" : "gameover");
      document.exitPointerLock();
      options.emitMusicOutcome(outcome);
      if (outcome === "victory") { d.SFX.wave(); d.CG.happytime(); } else d.SFX.gameover();
    },
    midgame: (callback) => { d.CG.midgame(callback); },
    restartCurrentRun: () => { options.startRun(active().mode, active().diff); },
    pendingFinale: () => d.PROFILE.pendingFinale(),
    selectedWeapon: options.selectedWeapon,
    selectWeapon: options.selectWeapon,
    startCampaign: (difficulty) => { options.startRun("campaign", difficulty); },
    cancelCinematic: (reason) => { if (options.cinema.active) options.cinema.cancel(reason); },
    pendingRun: active,
    player: options.player,
    stageCount: () => d.STAGES.length,
    loadStage: options.loadStage,
    clearCombat: options.clearCombat,
    groundY: () => d.CONFIG.world.groundY,
    viewport: () => ({ width: options.width, height: options.height }),
    isRecording: () => d.GHOST.recording(),
    stopInterruptedRecording: (reason) => { d.GHOST.stopRec({ [reason]: true }); },
    presentClaimed(result) { options.setOutcome(result); options.setScreen("win"); options.resetWinSeconds(); d.SFX.wave(); d.CG.happytime(); },
    launchFinale: (death, recovered) => { options.startFinale(death, recovered); },
    installRecording: (controller) => { options.controllers.installRecording(controller); },
    installOutcome: (controller) => { options.controllers.installOutcome(controller); },
    installPendingFinale: (controller) => { options.controllers.installPendingFinale(controller); },
  });
}
