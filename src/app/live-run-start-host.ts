import type { MusicDirector } from "../audio/music-director";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import { LiveRunStartController } from "../gameplay/run/live-run-start-controller";
import { planRunStart, type RunStartPlan } from "../gameplay/run/run-start-plan";
import { RunReplacementGuard } from "../gameplay/run/run-replacement";
import type { BossId } from "../gameplay/run/content-director";
import { isBossDefinitionId } from "../gameplay/run/boss-definitions";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { RunLifecycleSnapshot } from "../gameplay/run/lifecycle";
import { tutorialUsesBaselineLoadout } from "../gameplay/training/tutorial-contract";
import { FINAL_FIVE_WEAPON_SCHEMA_VERSION, migrateWeaponSelection } from "../gameplay/weapon-selection";
import type { RandomSource } from "../domain/random";
import type { TearWorldServices } from "../gameplay/runtime/tear-world-context";
import type { RunRandomStreamName, RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { EnvironmentRuntimeState } from "../gameplay/environment/environment-contracts";
import { resolveDiscoveredVariantIds } from "../gameplay/variants";
import { cleanupBossEncounterActors } from "../gameplay/run/boss-encounter";

interface MutableWorldState {
  resetTransient(): void;
  finishReset(): void;
}

type WorldServices = Pick<
  TearWorldServices<RunRandomStreamsSnapshot, RunRandomStreamName, RandomSource>,
  "configuration" | "random" | "clock" | "effects" | "mirror" | "bossFeedback"
>;

interface RunLifecyclePort {
  reset(): RunLifecycleSnapshot;
  start(sessionId: string): void;
  activateTraining(): void;
  terminate(outcome: "quit"): void;
  snapshot(): RunLifecycleSnapshot;
}

interface StagePort {
  platforms: unknown[];
  resetBanner(): void;
}

interface CampaignPort {
  resetFinale(): void;
  resetChapter(): void;
}

interface PlaygroundPort {
  readonly state: Readonly<{ hpMultiplier?: number; count?: number; god?: boolean; freeze?: boolean; slow?: boolean }>;
  reset(): void;
}

interface TutorialPort { start(): void }
interface InstalledRunStartController { start(mode: RunMode, difficulty: RunDifficulty): GameRun }

interface RunStartHostContext {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly prepareWorld: () => void;
  readonly applySettings: () => void;
  readonly configureBlade: (blade: GameBlade, weaponId: string) => void;
  readonly createPlayer: (x: number, y: number) => GamePlayer;
  readonly createBlade: () => GameBlade;
  readonly installRun: (run: GameRun) => void;
  readonly world: MutableWorldState;
  readonly services: WorldServices;
  readonly environment: EnvironmentRuntimeState;
  readonly resetAuthoritativeClocks: () => void;
  readonly resetCombatIdentity: () => void;
  readonly createRunSeed?: () => number;
  readonly loadStage: (index: number) => void;
  readonly stage: StagePort;
  readonly story: CampaignPort;
  readonly lifecycle: RunLifecyclePort;
  readonly install: (controller: InstalledRunStartController) => void;
  readonly setScreen: (screen: "playing", detail: { runId: string }) => void;
  readonly selectedBoss: () => string;
  readonly shuffledRoster: () => BossId[];
  readonly bossBiome: (bossId: BossId) => number;
  readonly trainingPlatforms: () => unknown[];
  readonly playground: PlaygroundPort;
  readonly tutorial: TutorialPort;
  readonly startNextWave: () => void;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  /** A new ordinary run must never inherit Ghost practice's non-persistent disposition. */
  readonly clearPracticeSession?: () => void;
  readonly resetRewards: () => void;
  readonly music: MusicDirector;
  readonly requestPointerLock: () => void;
  readonly testMode: boolean;
  readonly window: Window & { TEAR_WEAPON_DEBUG?: () => unknown };
}

/** Owns the complete new-run transaction and its world-reset side effects. */
export function createLiveRunStartHost(context: RunStartHostContext): LiveRunStartController<ReturnType<GameRuntimeDependencies["newMods"]>> {
  const { dependencies, state } = context;
  const { CONFIG, REMOTE, GHOST, PROFILE, META, SFX, GAMEPLAY_EVENTS, Input, createRunSeed, newMods } = dependencies;
  const replacement = new RunReplacementGuard({
    recording: () => GHOST.recording(),
    stopInterruptedRecording: () => {
      const activeRun = state.run();
      const lifecycle = context.lifecycle.snapshot();
      if (activeRun !== null && lifecycle.sessionId !== null && lifecycle.phase !== "terminated") {
        context.lifecycle.terminate("quit");
        GAMEPLAY_EVENTS.emit({
        kind: "run", transition: "abandoned", runId: lifecycle.sessionId,
          mode: activeRun.mode, difficulty: activeRun.diff, weaponId: activeRun.weaponId,
          wave: activeRun.wave, score: activeRun.score,
          runTimeSeconds: activeRun.runTime, reason: "replaced-by-new-run",
        });
      }
      try { GHOST.stopRec({ interruptedByNewRun: true }); }
      finally { Input.stopSemanticRecording(); }
    },
  });
  let startingPlan: RunStartPlan | null = null;

  const controller = new LiveRunStartController({
    replaceActiveRun: () => {
      try { replacement.sealActiveRecording(); }
      finally { Input.stopSemanticRecording(); }
    },
    initializeWorld: (mode, difficulty) => {
      context.clearPracticeSession?.();
      cleanupBossEncounterActors(state.enemies(), "reset");
      context.environment.clear("new-run");
      context.prepareWorld();
      context.resetCombatIdentity();
      context.lifecycle.reset();
      context.services.mirror.reset();
      context.services.bossFeedback.clear();
      context.services.configuration.resetToBase();
      const weaponId = migrateWeaponSelection(state.selectedWeapon());
      state.setSelectedWeapon(weaponId);
      context.applySettings();
      try { SFX.setVoidDescent(0, 0.05); SFX.setMusicDuck(1, 0.12); } catch { /* optional audio backend */ }
      const difficulties = CONFIG.difficulties.flatMap((definition) => isRunDifficulty(definition.id)
        ? [{ id: definition.id, oneHit: definition.oneHit === true, mods: definition.mods }]
        : []);
      startingPlan = planRunStart(difficulty, difficulties, REMOTE);
      CONFIG.player.dmgTakenMult *= startingPlan.playerDamageMultiplier;
      const player = context.createPlayer(context.width * 0.5, CONFIG.world.groundY - 60);
      player.oneHit = startingPlan.oneHit;
      const blade = context.createBlade();
      context.configureBlade(blade, weaponId);
      blade.restoredTrail = Boolean(PROFILE.data.rewards?.restoredBladeTrail);
      state.setPlayer(player);
      state.setBlade(blade);
      state.setEnemies([]);
      state.setProjectiles([]);
      state.setFloaters([]);
      context.world.resetTransient();
      context.services.effects.resetWorld();
      context.services.clock.reset();
      const biomeTracker = PROFILE.data.stats._biomes;
      const discoveredBiomes = Object.keys((biomeTracker ?? {}) as Record<string, unknown>);
      return { weaponId, mods: newMods(), scaling: startingPlan.scaling,
        achievementSnapshot: Object.keys(PROFILE.data.ach), variantDiscovery: [...resolveDiscoveredVariantIds(mode, discoveredBiomes)] };
    },
    resetAuthoritativeClocks: context.resetAuthoritativeClocks,
    finishWorldReset: () => {
      context.world.finishReset();
      context.loadStage(0);
      context.stage.resetBanner();
      context.story.resetChapter();
    },
    createRunSeed: context.createRunSeed ?? createRunSeed,
    resetRunRandom: (seed) => { context.services.random.resetRun(seed); },
    installSession: (session) => {
      const run: GameRun = {
        ...session, diffDmg: 1, bossIdx: 0, bossOrder: [], curBoss: null, voidScroll: null,
        pg: {}, reservedUpgrade: null,
      };
      context.installRun(run);
    },
    startLifecycle: (sessionId) => { context.lifecycle.start(sessionId); },
    exposeDebugState: () => {
      if (!context.testMode && !import.meta.env.DEV) return;
      context.window.TEAR_WEAPON_DEBUG = () => {
        const run = requireRun(state);
        const player = requirePlayer(state);
        const blade = requireBlade(state);
        return {
          weapon: run.weaponId, stats: { ...run.weaponStats }, events: run.weaponLog.slice(),
          player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
          blade: { state: blade.state, throwId: blade.throwId, x: blade.x, y: blade.y,
            tipX: blade.tipX, tipY: blade.tipY, tipVX: blade.tipVX, tipVY: blade.tipVY, tipSpeed: blade.tipSpeed,
            aimX: blade.aimX, aimY: blade.aimY,
            vx: blade.vx, vy: blade.vy, flyTime: blade.flyTime, secondaryActive: blade.secondaryActive,
            impactResolved: blade.impactResolved, pierced: blade.pierced.size, tension: blade.tension,
            linkTime: blade.linkT, chambers: blade.riftChambers, chamberCooldown: blade.riftChamberCooldown,
            actionRange: Number.isFinite(blade.actionRange()) ? blade.actionRange() : null,
            actionDistance: blade.actionDistance(player) },
          enemies: state.enemies().filter((enemy) => !enemy.dead).slice(0, 24).map((enemy) => {
            const authored = enemy as typeof enemy & { state?: string; stateT?: number; atk?: string; atkT?: number; phase?: number;
              phaseMarker?: number; mode?: string; cinematicT?: number; cinematicRequest?: unknown;
              requestVoidCinematic?: boolean; isMirrorBoss?: boolean; _live?: boolean };
            return { x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, maxHp: enemy.maxHp,
              stun: enemy.stun, spawnT: enemy.spawnT, introT: enemy.introT ?? 0, aliveT: enemy.aliveT,
              boss: enemy.isBoss, bossId: enemy.bossId, state: authored.state, stateT: authored.stateT,
              atk: authored.atk, atkT: authored.atkT,
              phase: authored.isMirrorBoss === true ? dependencies.Mirror.phase : authored.phase,
              phaseMarker: authored.phaseMarker, mode: authored.mode,
              cinematicT: authored.cinematicT, cinematicPending: authored.cinematicRequest != null,
              voidPending: authored.requestVoidCinematic === true, mirrorBoss: authored.isMirrorBoss,
              live: authored._live, bound: enemy.boundT || 0 };
          }),
          lifecycle: context.lifecycle.snapshot(),
        };
      };
    },
    updateProgressionTracking: (mode) => {
      if (context.achievementTracking() && META.level("reach") > 0 && META.level("throwarm") > 0
        && META.level("aircharge") > 0 && META.level("lifeline") > 0) PROFILE.maxStat("exodiaBuild", 1);
      if (mode !== "bossonly" && mode !== "sandbox") { PROFILE.markMode(mode); context.achievementCheck(); }
    },
    startRecording: (runId, seed) => {
      // Canonical device input is the live simulation's normal route, not a
      // Ghost 2-only observation feature.  Start it before the optional visual
      // recorder so the very first live tick (and its V3 sidecar) sees the
      // current held movement state.
      Input.startSemanticRecording();
      Input.syncSemanticMovement();
      if (context.achievementTracking()) GHOST.startRec({ runId, seed: String(seed), weaponId: migrateWeaponSelection(requireRun(state).weaponId), weaponSchemaVersion: FINAL_FIVE_WEAPON_SCHEMA_VERSION });
    },
    publishRunStarted: (session, runId) => {
      GAMEPLAY_EVENTS.emit({
        kind: "run", transition: "started", runId, mode: session.mode, difficulty: session.diff,
        weaponId: session.weaponId, wave: session.wave, score: session.score, runTimeSeconds: session.runTime,
      });
    },
    configureMode: (mode) => {
      const run = requireRun(state);
      if (mode === "bossonly") {
        const order = context.shuffledRoster();
        const selected = context.selectedBoss();
        if (selected !== "shuffle" && isBossId(selected)) { const index = order.indexOf(selected); if (index >= 0) order.splice(index, 1); order.unshift(selected); }
        const first = order[0];
        if (first === undefined) throw new Error("Boss-only mode requires a boss roster");
        run.bossOrder = order; run.bossIdx = 0; run.bossesBeaten = 0; run.curBoss = first;
        context.loadStage(context.bossBiome(first));
        context.environment.clear("boss-encounter-replacement");
      } else if (mode === "gauntlet") {
        run.bossOrder = context.shuffledRoster(); run.bossIdx = 0; run.bossesBeaten = 0;
      }
    },
    applyMetaProgression: () => {
      const run = requireRun(state);
      if (!tutorialUsesBaselineLoadout(run.mode)) {
        META.apply({ player: requirePlayer(state), blade: requireBlade(state), mods: run.mods });
      }
      context.resetRewards();
    },
    activateOpeningContent: (mode) => {
      const run = requireRun(state);
      if (mode !== "tutorial" && mode !== "playground") { context.startNextWave(); return; }
      context.stage.platforms = context.trainingPlatforms(); run.wave = 1; context.lifecycle.activateTraining();
      run.diffDmg = requirePlan(startingPlan).playerDamageMultiplier;
      if (mode === "playground") {
        context.playground.reset(); run.bossOrder = context.shuffledRoster(); run.bossIdx = 0;
        run.pg = context.playground.state; run.pgArena = -1;
      } else context.tutorial.start();
    },
    enterPlayingState: (sessionId) => { context.setScreen("playing", { runId: sessionId }); },
    beginMusic: (runId, seed) => { context.music.begin({ runId, runSeed: String(seed), rulesetVersion: "tear-rules-2026.07",
      gameVersion: "0.1.0", scoreVersion: SFX.musicScoreVersion() }); },
    requestPointerLock: context.requestPointerLock,
  });
  context.install({ start(mode, difficulty) { controller.start(mode, difficulty); return requireRun(state); } });
  return controller;
}

function requireRun(state: LiveGameHostState): GameRun {
  const run = state.run();
  if (run === null) throw new Error("Run start host requires an active run");
  return run;
}

function requirePlayer(state: LiveGameHostState): GamePlayer {
  const player = state.player();
  if (player === undefined) throw new Error("Run start host requires a player");
  return player;
}

function requireBlade(state: LiveGameHostState): GameBlade {
  const blade = state.blade();
  if (blade === undefined) throw new Error("Run start host requires a blade");
  return blade;
}

function requirePlan(plan: RunStartPlan | null): RunStartPlan {
  if (plan === null) throw new Error("Run start plan was not initialized");
  return plan;
}

function isRunDifficulty(value: string): value is RunDifficulty {
  return value === "easy" || value === "normal" || value === "hard" || value === "extreme" || value === "onehit";
}

const isBossId = isBossDefinitionId satisfies (value: string) => value is BossId;
