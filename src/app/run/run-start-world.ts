import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveWorldComposition } from "../world/world-composition";
import type { MusicDirector } from "../../audio/music-director";
import type { LiveRunStartPort } from "../../gameplay/run/live-run-start-controller";
import { planRunStart, type RunStartPlan } from "../../gameplay/run/run-start-plan";
import type { BossId } from "../../gameplay/run/content-director";
import { isBossDefinitionId } from "../../gameplay/run/boss-definitions";
import type { RunDifficulty } from "../../gameplay/run/session";
import { tutorialUsesBaselineLoadout } from "../../gameplay/training/tutorial-contract";
import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import { applyMetaRanks } from "../../gameplay/progression/meta";

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

/** The world a run starts in: live play's, or a detached world built by the same constructor. */
export type RunStartWorld = Pick<
  LiveWorldComposition<MusicDirector | null>,
  "state" | "context" | "entities" | "lifecycle" | "environment"
>;

/**
 * What a run start changes: one world and the runtimes around it. Live play passes its own; a detached
 * world passes its own, built from the same constructors. `hooks` are the live game's effects inside
 * these steps (audio, cosmetics, practice state, settings, HUD); a detached world has none, and none of
 * them changes the simulation.
 */
export interface RunStartWorldContext {
  readonly dependencies: Pick<
    GameRuntimeDependencies,
    "CONFIG" | "REMOTE" | "SHOP" | "GAMEPLAY_EVENTS" | "newMods" | "applyWeapon"
  >;
  readonly world: RunStartWorld;
  readonly width: number;
  /** The authoritative tick clock and entity identities of the world's combat simulation. */
  readonly combat: Readonly<{ resetClock(): void; resetIdentity(): void }>;
  readonly race?: Readonly<{ apply(): boolean }>;
  /** Loads a stage at the start of a run, with its environment. */
  readonly loadStage: (index: number) => void;
  readonly stage: { platforms: unknown[]; resetBanner(): void };
  readonly story: Readonly<{ resetFinale(): void; resetChapter(): void }>;
  readonly content: Readonly<{
    shuffledRoster(): BossId[];
    gauntletTrials(): BossId[];
    bossBiome(bossId: BossId): number;
  }>;
  readonly training: Readonly<{
    platforms(): unknown[];
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
    readonly tutorial: Readonly<{
      restoreSession(value: undefined): void;
      restorePresentation(value: undefined): void;
      start(): void;
    }>;
  }>;
  /** True while a tutorial practice run starts from the baseline loadout. */
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
    /** With the transient feel reset. */
    resetTransient?(): void;
    /** After the world reset. */
    reset?(): void;
    /** After the run is installed in the world. */
    runInstalled?(run: GameRun): void;
  }>;
}

/** The one implementation of a run start's world steps, for live play and for a detached world. */
export function createRunStartWorldPort(context: RunStartWorldContext): RunStartWorldPort {
  const { world } = context;
  const { state } = world;
  const { transient, cinema, services } = world.context;
  const { CONFIG, REMOTE, SHOP, GAMEPLAY_EVENTS, newMods } = context.dependencies;
  const { tutorial } = context.training;
  let startingPlan: RunStartPlan | null = null;
  return Object.freeze({
    initializeWorld: (start) => {
      context.hooks?.beforeReset?.();
      cleanupBossEncounterActors(state.enemies(), "reset");
      world.environment.clear("new-run");
      if (context.baselinePractice?.() !== true) {
        tutorial.restoreSession(undefined);
        tutorial.restorePresentation(undefined);
      }
      if (cinema.active) cinema.cancel("new-run");
      context.story.resetFinale();
      state.setBossIntro(null);
      state.setStageBeat(null);
      context.combat.resetIdentity();
      world.lifecycle.reset();
      services.mirror.reset();
      services.bossFeedback.clear();
      services.configuration.resetToBase();
      context.hooks?.configured?.(start.weapon);
      const difficulties = CONFIG.difficulties.flatMap((definition) =>
        isRunDifficulty(definition.id)
          ? [{ id: definition.id, oneHit: definition.oneHit === true, mods: definition.mods }]
          : [],
      );
      startingPlan = planRunStart(start.difficulty, difficulties, REMOTE);
      CONFIG.player.dmgTakenMult *= startingPlan.playerDamageMultiplier;
      const player = world.entities.createPlayer(context.width * 0.5, CONFIG.world.groundY - 60);
      player.oneHit = startingPlan.oneHit;
      const blade = world.entities.createBlade();
      const weapon = context.dependencies.applyWeapon(CONFIG, start.weapon);
      blade.weapon = weapon;
      blade.model = weapon.model;
      blade.restoredTrail = start.restoredTrail;
      context.hooks?.dressBlade?.(blade);
      state.setPlayer(player);
      state.setBlade(blade);
      state.setEnemies([]);
      state.setProjectiles([]);
      state.setFloaters([]);
      transient.impact.hitStop = 0;
      transient.impact.shake = 0;
      context.hooks?.resetTransient?.();
      services.effects.resetWorld();
      services.clock.reset();
      context.hooks?.reset?.();
      return {
        weaponId: start.weapon,
        mods: newMods(),
        scaling: startingPlan.scaling,
        achievementSnapshot: [...start.achievementSnapshot],
        variantDiscovery: [...start.variantDiscovery],
        cinematics: start.cinematics,
      };
    },
    resetAuthoritativeClocks: () => {
      context.combat.resetClock();
    },
    finishWorldReset: () => {
      transient.resetFeel();
      transient.impact.slowMotion = 0;
      transient.resetOpening();
      context.loadStage(0);
      context.stage.resetBanner();
      context.story.resetChapter();
    },
    resetRunRandom: (seed) => {
      services.random.resetRun(seed);
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
      state.setRun(run);
      context.hooks?.runInstalled?.(run);
    },
    startLifecycle: (sessionId) => {
      world.lifecycle.start(sessionId);
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
        const order = context.content.shuffledRoster();
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
        world.environment.clear("boss-encounter-replacement");
        context.loadStage(context.content.bossBiome(first));
      } else if (mode === "gauntlet") {
        run.bossOrder = context.content.gauntletTrials();
        run.bossIdx = 0;
        run.bossesBeaten = 0;
      }
    },
    applyMetaProgression: (start) => {
      const run = requireRun(state);
      if (!tutorialUsesBaselineLoadout(run.mode) && context.baselinePractice?.() !== true) {
        if (context.race?.apply() !== true)
          applyMetaRanks(SHOP, start.metaRanks, {
            player: requireValue(state.player(), "player"),
            blade: requireValue(state.blade(), "blade"),
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
      context.stage.platforms = context.training.platforms();
      run.wave = 1;
      world.lifecycle.activateTraining();
      run.diffDmg = requireValue(startingPlan, "run start plan").playerDamageMultiplier;
      if (mode === "playground") {
        const { playground } = context.training;
        playground.reset();
        run.bossOrder = context.content.shuffledRoster();
        run.bossIdx = 0;
        run.pg = playground.state;
        playground.enterArena();
      } else tutorial.start();
    },
  });
}

function requireRun(state: RunStartWorld["state"]): GameRun {
  return requireValue(state.run(), "an active run");
}

function requireValue<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) throw new Error(`Run start requires ${name}`);
  return value;
}

function isRunDifficulty(value: string): value is RunDifficulty {
  return value === "easy" || value === "normal" || value === "hard" || value === "extreme" || value === "onehit";
}

const isBossId = isBossDefinitionId satisfies (value: string) => value is BossId;
