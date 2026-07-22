import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { BossId } from "../gameplay/run/content-director";
import { eligibleTierChoices } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";

interface DebugLifecycle { clearWave(): void; prepareReward(reward: "draft" | "boss"): void; terminate(outcome: "defeat" | "victory"): void }
interface DebugCinema { active: boolean; beat: unknown; cancel(reason: string): void; requestSkip(): void; advance(): void }
interface DebugStage { index: number; current: unknown; platforms: unknown[] }

export interface LiveDebugHarnessContext {
  readonly enabled: boolean;
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly lifecycle: DebugLifecycle;
  readonly cinema: DebugCinema;
  readonly stage: DebugStage;
  readonly width: number;
  readonly height: number;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly selectBoss: (boss: BossId) => void;
  readonly setScreen: (screen: LegacyAppScreen, detail?: LegacyTransitionContext) => void;
  readonly setContinueSeconds: (value: number) => void;
  readonly screen: () => string;
  readonly openDraft: () => void;
  readonly openTier: (choices: readonly UpgradeDefinition[]) => void;
  readonly applyUpgrade: (upgrade: GameRuntimeDependencies["UPGRADES"][number]) => void;
  readonly enterReplay: (record: object, from: "menu") => void;
  readonly beginRename: () => void;
  readonly applyOptions: (options: object) => void;
  readonly startFinale: (death: { x: number; y: number }, recovered: boolean) => void;
  readonly severFinale: () => unknown;
  readonly selectSettingsTab: (tab: string) => void;
  readonly auditEffects: () => object;
  readonly snapshot: () => object;
  readonly stopRecording: () => void;
  readonly install: (api: object) => void;
}

function runOf(state: LiveGameHostState): GameRun {
  const run = state.run();
  if (run === null) throw new Error("Debug harness requires an active run");
  return run;
}

/** Installs the browser-journey control surface without leaking it into production. */
export function installLiveDebugHarness(context: LiveDebugHarnessContext): void {
  if (!context.enabled) return;
  const d = context.dependencies;
  const clearCombat = (): void => { context.state.setEnemies([]); context.state.setProjectiles([]); };
  context.install(Object.freeze({
    startMode(mode?: RunMode, difficulty?: RunDifficulty) { context.startRun(mode ?? "endless", difficulty ?? "normal"); },
    startBoss(boss: BossId, difficulty?: RunDifficulty) {
      context.selectBoss(boss); context.startRun("bossonly", difficulty ?? "normal");
    },
    openDraft(options?: { expanded?: boolean; rerolls?: number; reserve?: boolean }) {
      const selected = { expanded: true, rerolls: 2, reserve: true, ...options };
      context.startRun("endless", "normal");
      const run = runOf(context.state); run.wave = Math.max(1, run.wave); run.spawnQueue.length = 0; context.state.setEnemies([]);
      context.lifecycle.clearWave(); context.lifecycle.prepareReward("draft");
      run.mods.expandedDraft = selected.expanded; run.mods.draftRerolls = Math.max(0, selected.rerolls | 0);
      run.mods.reservePick = selected.reserve; context.openDraft(); document.exitPointerLock();
    },
    openTierUp() {
      context.startRun("endless", "normal");
      const run = runOf(context.state); run.wave = Math.max(1, run.wave); run.spawnQueue.length = 0; context.state.setEnemies([]);
      context.lifecycle.clearWave(); context.lifecycle.prepareReward("boss");
      for (const upgrade of d.UPGRADES.filter((candidate) => candidate.tiers != null).slice(0, 4)) context.applyUpgrade(upgrade);
      context.openTier(eligibleTierChoices(d.UPGRADES, run.mods.owned, run.mods.tier)); document.exitPointerLock();
    },
    openTerminal(kind: "campaignWin" | "win" | "continue" | "gameover") {
      const campaign = kind === "campaignWin"; context.startRun(campaign ? "campaign" : "endless", "normal");
      if (context.cinema.active) context.cinema.cancel("debug-terminal");
      const run = runOf(context.state); run.wave = campaign ? d.STAGES.length * 10 : 8; run.score = 12345; run.runTime = 96;
      run.spawnQueue.length = 0; context.state.setEnemies([]); context.state.setLastRecording(null); context.state.setWinSeconds(campaign ? 1 : 0);
      run.waveLog = [{ wave: 1, time: 12.5, kills: 5, peak: 2 }];
      context.state.setOutcome({ wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(),
        best: { wave: run.wave, score: run.score, time: run.runTime }, isNew: true,
        ...(kind === "win" || campaign ? { win: true as const } : {}), campaign,
        earned: 120, coins: d.META.coins(), diff: run.diff });
      if (kind === "continue") { context.setContinueSeconds(1e9); context.setScreen("continue"); }
      else { context.lifecycle.terminate(kind === "gameover" ? "defeat" : "victory"); context.setScreen(kind === "gameover" ? "gameover" : "win"); }
      document.exitPointerLock();
    },
    openReplay() {
      const count = 96;
      const px = Array.from({ length: count }, (_, index) => 300 + index * 8);
      const py = Array.from({ length: count }, (_, index) => 680 - Math.round(Math.sin(index / 8) * 70));
      const tx = px.map((x, index) => x + 70 + Math.round(Math.cos(index / 6) * 20));
      const ty = py.map((y, index) => y - 20 + Math.round(Math.sin(index / 6) * 20));
      context.enterReplay({ v: 2, dt: 0.1, edt: 0.25, px, py, tx, ty, fc: px.map(() => 1),
        stages: [{ t: 0, s: 0 }, { t: 4.5, s: 1 }], waves: [{ t: 0, w: 1, e: "start" }, { t: 3, w: 1, e: "clear" }, { t: 4.5, w: 2, e: "boss" }],
        spawns: [], esamp: [], deaths: [], events: [], loadout: [], thumb: null,
        mode: "endless", diff: "normal", name: "Journey Tester", wave: 2, score: 1234, won: true }, "menu");
    },
    openRename() { if (context.screen() !== "menu") context.setScreen("menu"); context.setScreen("profile"); context.beginRename(); },
    setOptions(options?: object) { context.applyOptions(options ?? {}); },
    startFinale() {
      context.startRun("campaign", "normal"); if (context.cinema.active) context.cinema.cancel("debug-final-cut");
      const run = runOf(context.state); run.wave = d.STAGES.length * 10; run.score = 12345; run.runTime = 612; run.spawnQueue.length = 0;
      run._victoryPrepared = { isNew: true, earned: 321, coins: d.META.coins() };
      context.stage.index = d.STAGES.length - 1; context.stage.current = d.stageAt(context.stage.index);
      context.stage.platforms = d.stagePlatforms(context.stage.index); clearCombat(); context.stopRecording();
      context.startFinale({ x: context.width / 2, y: context.height * 0.4 }, true);
    },
    cut: context.severFinale, skip() { context.cinema.requestSkip(); },
    advance() { if (context.cinema.active && context.cinema.beat) context.cinema.advance(); },
    pause() { if (context.screen() === "playing") context.setScreen("paused"); },
    resume() { if (context.screen() === "paused") context.setScreen("playing"); },
    openSettings(tab?: string) { if (context.screen() !== "menu") context.setScreen("menu"); context.setScreen("settings", { returnTo: "menu" }); if (tab) context.selectSettingsTab(tab); },
    auditEffects: context.auditEffects, state: context.snapshot,
  }));
}
