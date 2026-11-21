import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveGameHostState } from "../world/game-host-state";
import type { LiveRunStartPort } from "../../gameplay/run/live-run-start-controller";
import { planRunStart, type RunStartPlan } from "../../gameplay/run/run-start-plan";
import type { BossId } from "../../gameplay/run/content-director";
import { isBossDefinitionId } from "../../gameplay/run/boss-definitions";
import type { RunDifficulty } from "../../gameplay/run/session";
import type { RunLifecycleSnapshot } from "../../gameplay/run/lifecycle";
import { tutorialUsesBaselineLoadout } from "../../gameplay/training/tutorial-contract";
import type { RandomSource } from "../../domain/random";
import type { TearWorldServices } from "../../gameplay/runtime/tear-world-context";
import type { RunRandomStreamName, RunRandomStreamsSnapshot } from "../../simulation/run-random";
import type { EnvironmentRuntimeState } from "../../gameplay/environment/environment-contracts";
import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import { applyMetaRanks } from "../../gameplay/progression/meta";

type WorldServices = Pick<
  TearWorldServices<RunRandomStreamsSnapshot, RunRandomStreamName, RandomSource>,
  "configuration" | "random" | "clock" | "effects" | "mirror" | "bossFeedback"
>;

type Mods = ReturnType<GameRuntimeDependencies["newMods"]>;

/** The world steps of a run start, the part of `LiveRunStartPort` that changes the world. */
export type RunStartWorldPort = Pick<
  LiveRunStartPort<Mods>,
  | "initializeWorld"
  | "resetAuthoritativeClocks"
  | "finishWorldReset"
  | "resetRunRandom"
  | "installSession"
  | "startLifecycle"
  | "publishRunStarted"
  | "configureMode"
  | "applyMetaProgression"
  | "activateOpeningContent"
>;

/**
 * What a run start changes: one world. Live play passes its world; a detached world passes its own.
 * `hooks` are the live game's effects inside these steps (audio, cosmetics, practice state, settings);
 * a detached world has none, and none of them changes the simulation.
 */
export interface RunStartWorldContext {
  readonly dependencies: Pick<GameRuntimeDependencies, "CONFIG" | "REMOTE" | "SHOP" | "GAMEPLAY_EVENTS" | "newMods">;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly prepareWorld: () => void;
  readonly configureBlade: (blade: GameBlade, weaponId: string) => void;
  readonly createPlayer: (x: number, y: number) => GamePlayer;
  readonly createBlade: () => GameBlade;
  readonly installRun: (run: GameRun) => void;
  readonly runInstalled?: (run: GameRun) => void;
  readonly world: Readonly<{ resetTransient(): void; finishReset(): void }>;
  readonly services: WorldServices;
  readonly environment: EnvironmentRuntimeState;
  readonly resetAuthoritativeClocks: () => void;
  readonly resetCombatIdentity: () => void;
  readonly race?: Readonly<{ apply(): boolean }>;
  /** Loads a stage at the start of a run, with its environment. */
  readonly loadStage: (index: number) => void;
  readonly stage: { platforms: unknown[]; resetBanner(): void };
  readonly story: Readonly<{ resetChapter(): void }>;
  readonly lifecycle: Readonly<{
    reset(): RunLifecycleSnapshot;
    start(sessionId: string): void;
    activateTraining(): void;
  }>;
  readonly shuffledRoster: () => BossId[];
  readonly gauntletTrials: () => BossId[];
  readonly bossBiome: (bossId: BossId) => number;
  readonly trainingPlatforms: () => unknown[];
  readonly playground: Readonly<{
    readonly state: Readonly<{
      hpMultiplier?: number;
      count?: number;
      god?: boolean;
      freeze?: boolean;
      slow?: boolean;
    }>;
    reset(): void;
    enterArena(): void;
  }>;
  readonly tutorial: Readonly<{ start(): void }>;
  readonly baselinePractice?: () => boolean;
  readonly startNextWave: () => void;
  readonly resetRewards: () => void;
  readonly hooks?: Readonly<{
    /** Before the world resets. */
    beforeReset?(): void;
    /** After the configuration returns to base, with the run's weapon. */
    configured?(weaponId: string): void;
    /** After the blade is built and before it is installed. */
    dressBlade?(blade: GameBlade): void;
    /** After the world reset. */
    reset?(): void;
  }>;
}

/** The one implementation of a run start's world steps, for live play and for a detached world. */
export function createRunStartWorldPort(context: RunStartWorldContext): RunStartWorldPort {
  const { state } = context;
  const { CONFIG, REMOTE, SHOP, GAMEPLAY_EVENTS, newMods } = context.dependencies;
  let startingPlan: RunStartPlan | null = null;
  return Object.freeze({
    initializeWorld: (start) => {
      context.hooks?.beforeReset?.();
      cleanupBossEncounterActors(state.enemies(), "reset");
      context.environment.clear("new-run");
      context.prepareWorld();
      context.resetCombatIdentity();
      context.lifecycle.reset();
      context.services.mirror.reset();
      context.services.bossFeedback.clear();
      context.services.configuration.resetToBase();
      context.hooks?.configured?.(start.weapon);
      const difficulties = CONFIG.difficulties.flatMap((definition) =>
        isRunDifficulty(definition.id)
          ? [{ id: definition.id, oneHit: definition.oneHit === true, mods: definition.mods }]
          : [],
      );
      startingPlan = planRunStart(start.difficulty, difficulties, REMOTE);
      CONFIG.player.dmgTakenMult *= startingPlan.playerDamageMultiplier;
      const player = context.createPlayer(context.width * 0.5, CONFIG.world.groundY - 60);
      player.oneHit = startingPlan.oneHit;
      const blade = context.createBlade();
      context.configureBlade(blade, start.weapon);
      blade.restoredTrail = start.restoredTrail;
      context.hooks?.dressBlade?.(blade);
      state.setPlayer(player);
      state.setBlade(blade);
      state.setEnemies([]);
      state.setProjectiles([]);
      state.setFloaters([]);
      context.world.resetTransient();
      context.services.effects.resetWorld();
      context.services.clock.reset();
      context.hooks?.reset?.();
      return {
        weaponId: start.weapon,
        mods: newMods(),
        scaling: startingPlan.scaling,
        achievementSnapshot: [...start.achievementSnapshot],
        variantDiscovery: [...start.variantDiscovery],
      };
    },
    resetAuthoritativeClocks: context.resetAuthoritativeClocks,
    finishWorldReset: () => {
      context.world.finishReset();
      context.loadStage(0);
      context.stage.resetBanner();
      context.story.resetChapter();
    },
    resetRunRandom: (seed) => {
      context.services.random.resetRun(seed);
    },
    installSession: (session) => {
      const run: GameRun = {
        ...session,
        diffDmg: 1,
        bossIdx: 0,
        bossOrder: [],
        curBoss: null,
        voidScroll: null,
        pg: {},
        reservedUpgrade: null,
      };
      context.installRun(run);
      context.runInstalled?.(run);
    },
    startLifecycle: (sessionId) => {
      context.lifecycle.start(sessionId);
    },
    publishRunStarted: (session, runId) => {
      GAMEPLAY_EVENTS.emit({
        kind: "run",
        transition: "started",
        runId,
        mode: session.mode,
        difficulty: session.diff,
        weaponId: session.weaponId,
        wave: session.wave,
        score: session.score,
        runTimeSeconds: session.runTime,
      });
    },
    configureMode: ({ mode, boss: selected }) => {
      const run = requireRun(state);
      if (mode === "bossonly") {
        const order = context.shuffledRoster();
        if (selected !== "shuffle" && isBossId(selected)) {
          // The production selector can only supply policy-published IDs. A
          // test-build engineering launch may explicitly supply an authored
          // preview boss, which remains absent from every ordinary roster.
          const index = order.indexOf(selected);
          if (index >= 0) order.splice(index, 1);
          order.unshift(selected);
        }
        const first = order[0];
        if (first === undefined) throw new Error("Boss-only mode requires a boss roster");
        run.bossOrder = order;
        run.bossIdx = 0;
        run.bossesBeaten = 0;
        run.curBoss = first;
        // Remove the reset stage before activating the selected boss biome so
        // its authored environment fields survive the replacement boundary.
        context.environment.clear("boss-encounter-replacement");
        context.loadStage(context.bossBiome(first));
      } else if (mode === "gauntlet") {
        run.bossOrder = context.gauntletTrials();
        run.bossIdx = 0;
        run.bossesBeaten = 0;
      }
    },
    applyMetaProgression: (start) => {
      const run = requireRun(state);
      if (!tutorialUsesBaselineLoadout(run.mode) && context.baselinePractice?.() !== true) {
        if (context.race?.apply() !== true)
          applyMetaRanks(SHOP, start.metaRanks, {
            player: requirePlayer(state),
            blade: requireBlade(state),
            mods: run.mods,
          });
      }
      context.resetRewards();
    },
    activateOpeningContent: (mode) => {
      const run = requireRun(state);
      if (mode !== "tutorial" && mode !== "playground") {
        context.startNextWave();
        return;
      }
      context.stage.platforms = context.trainingPlatforms();
      run.wave = 1;
      context.lifecycle.activateTraining();
      run.diffDmg = requirePlan(startingPlan).playerDamageMultiplier;
      if (mode === "playground") {
        context.playground.reset();
        run.bossOrder = context.shuffledRoster();
        run.bossIdx = 0;
        run.pg = context.playground.state;
        context.playground.enterArena();
      } else context.tutorial.start();
    },
  });
}

function requireRun(state: LiveGameHostState): GameRun {
  const run = state.run();
  if (run === null) throw new Error("Run start requires an active run");
  return run;
}

function requirePlayer(state: LiveGameHostState): GamePlayer {
  const player = state.player();
  if (player === undefined) throw new Error("Run start requires a player");
  return player;
}

function requireBlade(state: LiveGameHostState): GameBlade {
  const blade = state.blade();
  if (blade === undefined) throw new Error("Run start requires a blade");
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
