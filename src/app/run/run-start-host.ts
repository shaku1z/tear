import type { MusicDirector } from "../../audio/music-director";
import { loadoutOf } from "../../domain/cosmetics";
import { snapshotProgress, type ProgressSource } from "../../domain/progress-facts";
import { COSMETIC_CATALOG } from "../../gameplay/progression/cosmetic-catalog";
import { admittedMusicProgress } from "../../audio/music/run-progress";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveGameHostState } from "../world/game-host-state";
import { LiveRunStartController } from "../../gameplay/run/live-run-start-controller";
import { RunReplacementGuard } from "../../gameplay/run/run-replacement";
import { admittedRunMode, tracksModeProgress } from "../../gameplay/run/mode-catalog";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import { tutorialUsesBaselineLoadout } from "../../gameplay/training/tutorial-contract";
import { FINAL_FIVE_WEAPON_SCHEMA_VERSION, migrateWeaponSelection } from "../../gameplay/weapon-selection";
import { resolveDiscoveredVariantIds } from "../../gameplay/variants";
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import type { RunStartChoices } from "../../gameplay/run/run-start-choices";
import { createRunStartWorldPort, type RunStartWorldContext } from "./run-start-world";
import { sanitizeCinematicPreference, type CinematicPreference } from "../../gameplay/campaign/cinematic-preference";

interface InstalledRunStartController {
  start(mode: RunMode, difficulty: RunDifficulty): GameRun;
}

export interface LiveOpeningCaptureBoundary {
  readonly phase: "opening-initialized-before-run-start";
  readonly runId: string;
  readonly seed: number;
}

interface RunStartHostContext extends Omit<RunStartWorldContext, "dependencies" | "hooks" | "race"> {
  readonly runInstalled?: (run: GameRun) => void;
  /** A run's start is resolved, before its world initializes: the live replay tap opens its record here. */
  readonly runStarted?: (start: RunStartChoices) => void;
  readonly dependencies: GameRuntimeDependencies;
  readonly applySettings: () => void;
  readonly race?: Readonly<{
    active(): boolean;
    apply(): boolean;
    finalize(): void;
    discovery(ordinary: readonly string[]): readonly string[];
  }>;
  readonly createRunSeed?: () => number;
  /** The cinematics setting a new run starts with, and the chapters this session has played. */
  readonly cinematics: Readonly<{ preference(): CinematicPreference; playedChapters(): readonly number[] }>;
  /** The HUD feedback a new run clears; presentation only. */
  readonly hud?: Readonly<{ restore(value: undefined): void }>;
  readonly install: (controller: InstalledRunStartController) => void;
  readonly setScreen: (screen: "playing", detail: { runId: string }) => void;
  readonly selectedBoss: () => string;
  readonly achievementTracking: () => boolean;
  readonly achievementCheck: () => void;
  /** Scoped around the existing synchronous recorder call; never a second start transaction. */
  readonly withOpeningCapture?: (boundary: LiveOpeningCaptureBoundary, record: () => void) => void;
  readonly openingExposed?: (runId: string) => void;
  readonly discardOpeningCapture?: () => void;
  /** A new ordinary run must never inherit Ghost practice's non-persistent disposition. */
  readonly clearPracticeSession?: () => void;
  readonly music: MusicDirector;
  readonly requestPointerLock: () => void;
  readonly testMode: boolean;
  readonly window: Window & { TEAR_WEAPON_DEBUG?: () => unknown };
}

/** Owns the complete new-run transaction and its world-reset side effects. */
export function createLiveRunStartHost(
  context: RunStartHostContext,
): LiveRunStartController<ReturnType<GameRuntimeDependencies["newMods"]>> {
  const { dependencies } = context;
  const { state, lifecycle } = context.world;
  const { GHOST, PROFILE, META, SHOP, SFX, GAMEPLAY_EVENTS, Input, createRunSeed, COSMETICS } = dependencies;
  const replacement = new RunReplacementGuard({
    recording: () => GHOST.recording(),
    stopInterruptedRecording: () => {
      const activeRun = state.run();
      const phase = lifecycle.snapshot();
      if (activeRun !== null && phase.sessionId !== null && phase.phase !== "terminated") {
        lifecycle.terminate("quit");
        GAMEPLAY_EVENTS.emit({
          kind: "run",
          transition: "abandoned",
          runId: phase.sessionId,
          mode: activeRun.mode,
          difficulty: activeRun.diff,
          weaponId: activeRun.weaponId,
          wave: activeRun.wave,
          score: activeRun.score,
          runTimeSeconds: activeRun.runTime,
          reason: "replaced-by-new-run",
        });
      }
      try {
        GHOST.stopRec({ interruptedByNewRun: true });
      } finally {
        Input.stopSemanticRecording();
      }
    },
  });
  /** Saved progress before this run's first stage marks its biome as reached. */
  let musicProgress: ProgressSource | null = null;
  const world = createRunStartWorldPort({
    ...context,
    hooks: {
      beforeReset: () => {
        context.clearPracticeSession?.();
      },
      configured: (weaponId) => {
        state.setSelectedWeapon(weaponId);
        context.applySettings();
        try {
          SFX.setVoidDescent(0, 0.05);
          SFX.setMusicDuck(1, 0.12);
        } catch {
          /* optional audio backend */
        }
      },
      dressBlade: (blade) => {
        COSMETICS.wear(blade, loadoutOf(COSMETIC_CATALOG, PROFILE.cosmetics()));
      },
      resetTransient: () => {
        context.hud?.restore(undefined);
      },
      reset: () => {
        musicProgress = snapshotProgress(PROFILE.data);
      },
      ...(context.runInstalled === undefined ? {} : { runInstalled: context.runInstalled }),
    },
  });

  const controller = new LiveRunStartController({
    ...world,
    replaceActiveRun: () => {
      context.discardOpeningCapture?.();
      try {
        replacement.sealActiveRecording();
      } finally {
        Input.stopSemanticRecording();
      }
    },
    resolveStart: (mode, difficulty): RunStartChoices => {
      const baseline = tutorialUsesBaselineLoadout(mode) || context.baselinePractice?.() === true;
      const discoveredBiomes = Object.keys((PROFILE.data.stats._biomes ?? {}) as Record<string, unknown>);
      const ordinary = resolveDiscoveredVariantIds(mode, discoveredBiomes);
      return Object.freeze({
        mode,
        difficulty,
        weapon: migrateWeaponSelection(state.selectedWeapon()),
        boss: context.selectedBoss(),
        runSeed: (context.createRunSeed ?? createRunSeed)(),
        metaRanks: Object.freeze(baseline ? {} : metaRanksOf(SHOP, (id) => META.level(id))),
        variantDiscovery: Object.freeze([...(context.race?.discovery(ordinary) ?? ordinary)]),
        achievementSnapshot: Object.freeze(Object.keys(PROFILE.data.ach)),
        restoredTrail: Boolean(PROFILE.data.rewards?.restoredBladeTrail),
        cinematics: sanitizeCinematicPreference(context.cinematics.preference()),
        playedChapters: Object.freeze([...context.cinematics.playedChapters()]),
      });
    },
    openReplayRecord: (start) => {
      context.runStarted?.(start);
    },
    exposeDebugState: () => {
      // The weapon inspector is an engineering global: never installed in release builds.
      if (!dependencies.surfaces.allows("global:weapon-debug") || (!context.testMode && !import.meta.env.DEV)) return;
      context.window.TEAR_WEAPON_DEBUG = () => {
        const run = requireRun(state);
        const player = requirePlayer(state);
        const blade = requireBlade(state);
        return {
          weapon: run.weaponId,
          stats: { ...run.weaponStats },
          events: run.weaponLog.slice(),
          player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
          blade: {
            state: blade.state,
            throwId: blade.throwId,
            x: blade.x,
            y: blade.y,
            tipX: blade.tipX,
            tipY: blade.tipY,
            tipVX: blade.tipVX,
            tipVY: blade.tipVY,
            tipSpeed: blade.tipSpeed,
            aimX: blade.aimX,
            aimY: blade.aimY,
            vx: blade.vx,
            vy: blade.vy,
            flyTime: blade.flyTime,
            secondaryActive: blade.secondaryActive,
            impactResolved: blade.impactResolved,
            pierced: blade.pierced.size,
            tension: blade.tension,
            linkTime: blade.linkT,
            chambers: blade.riftChambers,
            chamberCooldown: blade.riftChamberCooldown,
            actionRange: Number.isFinite(blade.actionRange()) ? blade.actionRange() : null,
            actionDistance: blade.actionDistance(player),
          },
          enemies: state
            .enemies()
            .filter((enemy) => !enemy.dead)
            .slice(0, 24)
            .map((enemy) => {
              const authored = enemy as typeof enemy & {
                state?: string;
                stateT?: number;
                atk?: string;
                atkT?: number;
                phase?: number;
                phaseMarker?: number;
                mode?: string;
                cinematicT?: number;
                cinematicRequest?: unknown;
                requestVoidCinematic?: boolean;
                isMirrorBoss?: boolean;
                _live?: boolean;
                packRole?: string;
                packFlank?: number;
                packAttackAuthorized?: boolean;
                pounceTargetX?: number;
                variant?: string;
                variantName?: string;
                behavior?: string;
                rimeRebounds?: number;
                snowWakeT?: number;
                glacierCracked?: boolean;
                attackCursor?: number;
                attackStep?: number;
                attackSequence?: number;
                environmentSequence?: number;
                routeProgress?: number;
                trueRouteIndex?: number;
                batonStrike?: number;
                auroraBossChargeActive?: boolean;
                parryOutcome?: string;
                routeTelegraph?: readonly Readonly<{ x: number; y: number }>[];
                candidateRoutes?: readonly (readonly Readonly<{ x: number; y: number }>[])[];
              };
              return {
                kind: enemy.kind,
                x: enemy.x,
                y: enemy.y,
                vx: enemy.vx,
                vy: enemy.vy,
                hp: enemy.hp,
                maxHp: enemy.maxHp,
                stun: enemy.stun,
                spawnT: enemy.spawnT,
                introT: enemy.introT ?? 0,
                aliveT: enemy.aliveT,
                boss: enemy.isBoss,
                bossId: enemy.bossId,
                state: authored.state,
                stateT: authored.stateT,
                atk: authored.atk,
                atkT: authored.atkT,
                phase: authored.isMirrorBoss === true ? dependencies.Mirror.phase : authored.phase,
                phaseMarker: authored.phaseMarker,
                mode: authored.mode,
                cinematicT: authored.cinematicT,
                cinematicPending: authored.cinematicRequest != null,
                voidPending: authored.requestVoidCinematic === true,
                mirrorBoss: authored.isMirrorBoss,
                live: authored._live,
                bound: enemy.boundT || 0,
                variant: authored.variant,
                variantName: authored.variantName,
                behavior: authored.behavior,
                rimeRebounds: authored.rimeRebounds,
                snowWakeT: authored.snowWakeT,
                glacierCracked: authored.glacierCracked,
                enraged: enemy.enraged,
                attackCursor: authored.attackCursor,
                attackStep: authored.attackStep,
                attackSequence: authored.attackSequence,
                environmentSequence: authored.environmentSequence,
                routeProgress: authored.routeProgress,
                trueRouteIndex: authored.trueRouteIndex,
                batonStrike: authored.batonStrike,
                auroraBossChargeActive: authored.auroraBossChargeActive,
                parryOutcome: authored.parryOutcome,
                routeTelegraph: authored.routeTelegraph,
                candidateRoutes: authored.candidateRoutes,
                packRole: authored.packRole,
                packFlank: authored.packFlank,
                packAttackAuthorized: authored.packAttackAuthorized,
                pounceTargetX: authored.pounceTargetX,
              };
            }),
          projectiles: state
            .projectiles()
            .filter((projectile) => !projectile.dead)
            .slice(0, 48)
            .map((projectile) => ({
              kind: projectile.kind,
              x: projectile.x,
              y: projectile.y,
              vx: projectile.vx,
              vy: projectile.vy,
              deflected: projectile.deflected,
              perfect: projectile.perfect,
              counterplay: projectile.counterplay,
            })),
          lifecycle: lifecycle.snapshot(),
        };
      };
    },
    updateProgressionTracking: (mode) => {
      if (context.baselinePractice?.() === true || context.race?.active()) return;
      if (
        context.achievementTracking() &&
        META.level("reach") > 0 &&
        META.level("throwarm") > 0 &&
        META.level("aircharge") > 0 &&
        META.level("lifeline") > 0
      )
        PROFILE.maxStat("exodiaBuild", 1);
      if (tracksModeProgress(mode)) {
        PROFILE.markMode(mode);
        context.achievementCheck();
      }
    },
    startRecording: (runId, seed) => {
      // Canonical device input is the live simulation's normal route, not a
      // Ghost 2-only observation feature.  Start it before the optional visual
      // recorder so the very first live tick (and its V3 sidecar) sees the
      // current held movement state.
      context.race?.finalize();
      Input.startSemanticRecording();
      Input.syncSemanticMovement();
      if (context.achievementTracking() || context.race?.active()) {
        const record = () => {
          GHOST.startRec({
            runId,
            seed: String(seed),
            weaponId: migrateWeaponSelection(requireRun(state).weaponId),
            weaponSchemaVersion: FINAL_FIVE_WEAPON_SCHEMA_VERSION,
          });
        };
        if (context.withOpeningCapture === undefined) record();
        else context.withOpeningCapture({ phase: "opening-initialized-before-run-start", runId, seed }, record);
      }
    },
    publishRunStarted: (session, runId) => {
      try {
        world.publishRunStarted(session, runId);
      } catch (error) {
        context.discardOpeningCapture?.();
        throw error;
      }
    },
    enterPlayingState: (sessionId) => {
      try {
        context.setScreen("playing", { runId: sessionId });
        context.openingExposed?.(sessionId);
      } catch (error) {
        context.discardOpeningCapture?.();
        throw error;
      }
    },
    beginMusic: (runId, seed) => {
      context.music.begin({
        runId,
        runSeed: String(seed),
        rulesetVersion: CURRENT_RULESET_VERSION,
        gameVersion: "0.1.0",
        scoreVersion: SFX.musicScoreVersion(),
        // First-run songs and unlocks follow saved progress only where the run also records it;
        // seed races and practice hear the same music for everyone.
        ...musicProgressField(
          admittedMusicProgress(musicProgress, {
            tracksProgress: context.achievementTracking(),
            seedRace: context.race?.active() === true,
            practice: context.baselinePractice?.() === true,
          }),
        ),
      });
    },
    requestPointerLock: context.requestPointerLock,
  });
  // Every start path (setup, restart, retry, challenge codes) passes here, so an
  // engineering mode can never start in a release build.
  context.install({
    start(mode, difficulty) {
      controller.start(admittedRunMode(mode, dependencies.surfaces), difficulty);
      return requireRun(state);
    },
  });
  return controller;
}

/** The META ranks a run starts with: every shop item the player holds at a rank above zero. */
function metaRanksOf(shop: readonly { readonly id: string }[], level: (id: string) => number): Record<string, number> {
  return Object.fromEntries(
    shop.flatMap((item) => {
      const rank = level(item.id);
      return rank > 0 ? [[item.id, rank] as const] : [];
    }),
  );
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

function musicProgressField(progress: ProgressSource | null): { progress?: ProgressSource } {
  return progress === null ? {} : { progress };
}
