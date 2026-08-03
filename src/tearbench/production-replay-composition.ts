import { applyWeapon } from "../gameplay/weapons";
import { parseCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../gameplay/campaign/chapter-cinematic-binding";
import type { ChapterIntent } from "../gameplay/campaign/chapter-controller";
import type { RunDifficulty } from "../gameplay/run/session";
import { projectCanonicalGameplayState, type CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot, AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { stageAt } from "../gameplay/stages";
import type { TearSnapshotV1 } from "./contracts";
import { applyTearCodecConfiguration, hydrateTearCodecWorld } from "./detached-world-hydrator";
import { createProductionCombatSimulation } from "./production-combat-simulation";
import { createProductionRunOutcomeRuntime, type ProductionRunOutcomeRuntime } from "./production-run-outcome-runtime";
import { createProductionReplayWorld, type ProductionReplayWorld } from "./production-world-factory";
import { createProductionWaveRewardRuntime, type ProductionWaveRewardRuntime } from "./production-wave-reward-runtime";

export interface ProductionGhostReplayCompositionOptions {
  readonly seed: string;
  readonly mode?: string;
  readonly weaponId?: string;
  readonly difficulty?: RunDifficulty;
  readonly inputSnapshots?: ReadonlyMap<number, AuthoritativeInputSnapshot>;
  /** Optional portable fact sink for a host that compares source replay output. */
  readonly gameplayEvents?: TearGameplayEventPort;
  /** Optional portable terminal endpoint; device/persistence behavior stays outside this composition. */
  readonly endRun?: () => void;
}

/** Shared renderer-neutral projection for production replay and headless worlds. */
export function projectProductionReplayCanonicalState(
  replay: ProductionReplayWorld,
  tick: number,
  input: AuthoritativeInputState,
) {
  return projectCanonicalGameplayState(
    tick,
    input.snapshot(),
    replay.world.state.run(),
    replay.world.state.player() as never,
    replay.world.state.blade() as never,
    replay.world.state.enemies().map((entity) => {
      const enemy = entity as never as { _gid?: number; kind: string; bossId?: string;
        x: number; y: number; vx: number; vy: number; hp: number; dead: boolean };
      return {
        ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind,
        ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
        x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
      };
    }),
  );
}

/** Restores a data-bound active chapter without reviving any browser/UI owner. */
export function restoreProductionReplayChapterBinding(
  replay: ProductionReplayWorld,
  runtime: Readonly<Record<string, unknown>>,
): void {
  replay.world.lifecycle.restore(runtime.lifecycle as never);
  const rawSpec = runtime.chapterBinding;
  if (rawSpec === null || rawSpec === undefined) {
    replay.world.context.cinema.restoreState(runtime.cinema);
    return;
  }
  const spec = parseCampaignChapterBindingSpec(rawSpec);
  const dispatch = (intents: readonly ChapterIntent[]): void => {
    for (const intent of intents) {
      if (intent.type === "chapter-state") {
        const run = replay.world.state.run() as never as { chapterState: string };
        run.chapterState = intent.state;
      } else if (intent.type === "clear-projectiles") {
        replay.world.state.setProjectiles([]);
      } else if (intent.type === "activate-prepared-wave" && replay.world.lifecycle.hasPreparedWave) {
        replay.world.lifecycle.activateWave();
      }
    }
  };
  const staged = stageCampaignChapterBinding(spec, stageAt(spec.stageIndex), {
    dispatch,
    preparedWave: () => replay.world.lifecycle.hasPreparedWave,
    activationDeferred: () => replay.world.lifecycle.activationDeferred,
    clear: () => undefined,
  });
  replay.world.context.cinema.restoreState(runtime.cinema, staged.binding);
}

/** Applies a saved State Forge world to a newly composed production replay world. */
function hydrateProductionReplayWorld(replay: ProductionReplayWorld, snapshot: TearSnapshotV1) {
  const codecWorld = {
    components: new Map(Object.entries(snapshot.state)),
    references: new Map<string, string>(),
    entityIds: new Set<string>(),
  } as never;
  const staged = hydrateTearCodecWorld(
    { ...replay.world.entities, hydrateReward: () => null },
    codecWorld,
    { requireIdentity: (id: string) => id },
  );
  if (staged.tick !== snapshot.tick) throw new TypeError("recorded snapshot tick does not match its run component");
  replay.world.state.setRun(staged.run);
  replay.world.state.setPlayer(staged.player);
  replay.world.state.setBlade(staged.blade);
  replay.world.state.setEnemies(staged.enemies);
  replay.world.state.setProjectiles(staged.projectiles);
  replay.world.state.setFloaters(staged.floaters as never);
  replay.world.state.setSlowZones(staged.slowZones as never);
  replay.world.state.setTemporaryWalls(staged.walls as never);
  replay.configuration.resetToBase();
  const weapon = applyWeapon(replay.configuration.value, staged.weaponId);
  const restoredConfiguration = replay.configuration.snapshot();
  applyTearCodecConfiguration(restoredConfiguration, staged.configuration);
  replay.configuration.restore(restoredConfiguration);
  const blade = staged.blade as { weapon: unknown; model: unknown };
  blade.weapon = weapon; blade.model = weapon.model;
  replay.world.context.services.random.restore(staged.rng as never);
  replay.stage.index = staged.stageIndex;
  replay.stage.platforms = [...staged.platforms] as unknown[];
  restoreProductionReplayChapterBinding(replay, staged.runtime);
  const transient = replay.world.context.transient;
  transient.assignImpact({ hitStop: Number(staged.runtime.hitStop), slowMotion: Number(staged.runtime.slowmo), shake: Number(staged.runtime.shake) });
  transient.assignOpening({ throwCooldown: Number(staged.runtime.throwCd), dashGhostTime: Number(staged.runtime.dashGhostT),
    landingVelocity: Number(staged.runtime.landingV), wasDashing: Boolean(staged.runtime.wasDashing),
    wasSwinging: Boolean(staged.runtime.wasSwinging), wasOnGround: Boolean(staged.runtime.wasOnGround) });
  Object.assign(transient.feel, { timeScale: Number(staged.runtime.timeScale), zoom: Number(staged.runtime.zoom), flash: Number(staged.runtime.flash),
    bannerSeconds: Number(staged.runtime.bannerT), worldZoom: Number(staged.runtime.worldZoom), worldZoomTarget: Number(staged.runtime.worldZoomTarget),
    rankPopupSeconds: Number(staged.runtime.rankPopT), rankPopupText: String(staged.runtime.rankPopText) });
  const protection = staged.runtime.cinemaProtection as Readonly<{ active?: unknown; lastMode?: unknown }> | undefined;
  transient.assignProtection({ active: Boolean(protection?.active), lastMode: typeof protection?.lastMode === "string" ? protection.lastMode : null });
  return staged;
}

/**
 * Rebuilds a V3 keyframe through the same source-owned world and combat graph
 * used by the C29 replay path. It owns no Vault access and never mutates the
 * source snapshot; Vault/admission adapters remain responsible for custody.
 */
export function createProductionGhostReplayComposition(
  options: ProductionGhostReplayCompositionOptions,
) {
  return Object.freeze({
    create(snapshot: TearSnapshotV1 | undefined) {
      const replay = createProductionReplayWorld({ seed: snapshot?.seed ?? options.seed,
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.weaponId === undefined ? {} : { weaponId: options.weaponId }),
        ...(options.difficulty === undefined ? {} : { difficulty: options.difficulty }) });
      const staged = snapshot === undefined ? undefined : hydrateProductionReplayWorld(replay, snapshot);
      let waveReward: ProductionWaveRewardRuntime | null = null;
      let outcome: ProductionRunOutcomeRuntime | null = null;
      const core = createProductionCombatSimulation<CanonicalGameplayState>(replay, {
        ...(staged === undefined || staged.platforms.length === 0 ? {} : { platforms: staged.platforms }),
        updateWave: (seconds) => { waveReward?.update(seconds); },
        ...(options.gameplayEvents === undefined ? {} : { gameplayEvents: options.gameplayEvents }),
        endRun: () => { options.endRun?.(); outcome?.controller.defeat(); },
        snapshot: (tick, input) => projectProductionReplayCanonicalState(replay, tick, input),
      });
      outcome = createProductionRunOutcomeRuntime(replay, options.gameplayEvents);
      waveReward = createProductionWaveRewardRuntime(replay, {
        ...(options.gameplayEvents === undefined ? {} : { gameplayEvents: options.gameplayEvents }),
        actorId: (enemy) => core.combatEntityRuntime.id(enemy, "enemy"),
      });
      if (staged === undefined) waveReward.startNaturalOpening();
      if (staged !== undefined) {
        core.combatEntityRuntime.restoreIdentityState(staged.identityState as never);
        for (const binding of staged.identityBindings) core.combatEntityRuntime.bindId(binding.entity, binding.id);
      }
      core.simulationRuntime.reset(snapshot?.tick ?? 0);
      if (snapshot !== undefined) {
        const input = options.inputSnapshots?.get(snapshot.tick);
        if (input !== undefined) core.simulationRuntime.input.restore(input);
      }
      return Object.freeze({
        replay,
        combat: core,
        simulation: core.simulationRuntime,
        outcome,
        waveReward,
        routeAction: waveReward.routeAction,
        semanticProjection: () => core.simulationRuntime.lastResult?.state
          ?? projectProductionReplayCanonicalState(replay, core.simulationRuntime.scheduler.tick, core.simulationRuntime.input),
      });
    },
  });
}
