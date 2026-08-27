import { applyWeapon } from "../gameplay/weapons";
import { parseCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../gameplay/campaign/chapter-cinematic-binding";
import type { ChapterIntent } from "../gameplay/campaign/chapter-controller";
import { createLiveStateForgeAdapter } from "../app/live-state-forge-adapter";
import { createLiveStateForgeRuntimeBridge } from "../app/live-state-forge-runtime-bridge";
import type { RunDifficulty } from "../gameplay/run/session";
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import { projectCanonicalGameplayState, type CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot, AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { CAMPAIGN_STAGE_IDS, stageAt } from "../gameplay/stages";
import { stableVerificationHash } from "../replay/hash";
import type { TearBuildIdentityV1, TearSnapshotV1 } from "./contracts";
import type { TearCodecWorld } from "./state-codecs";
import { applyTearCodecConfiguration, hydrateTearCodecWorld } from "./detached-world-hydrator";
import { captureLiveStateForgeSnapshot, injectedBuildIdentity } from "./live-runtime-snapshots";
import { createProductionCombatSimulation } from "./production-combat-simulation";
import { createProductionRunOutcomeRuntime, type ProductionRunOutcomeRuntime } from "./production-run-outcome-runtime";
import { createProductionReplayWorld, type ProductionReplayWorld } from "./production-world-factory";
import {
  createProductionWaveRewardRuntime,
  type ProductionWaveRewardIntent,
  type ProductionWaveRewardRuntime,
} from "./production-wave-reward-runtime";
import { ENTITY_KIND_REGISTRY } from "./registries";
import { createDefaultStateCodecRegistry, restoreSnapshotTransactionally } from "./state-codecs";
import { rebaseEnvironmentSnapshot, validateEnvironmentCodecPayload } from "./environment-codec";

export interface ProductionGhostReplayCompositionOptions {
  readonly seed: string;
  readonly mode?: string;
  readonly weaponId?: string;
  readonly difficulty?: RunDifficulty;
  /** Optional immutable identity supplied by the build/composition boundary. */
  readonly buildIdentity?: Omit<TearBuildIdentityV1, "configHash">;
  readonly inputSnapshots?: ReadonlyMap<number, AuthoritativeInputSnapshot>;
  /** Optional portable fact sink for a host that compares source replay output. */
  readonly gameplayEvents?: TearGameplayEventPort;
  /** Optional observer for source planner intents applied by this composition. */
  readonly recordWaveIntent?: (entry: ProductionWaveRewardIntent) => void;
  /** Optional portable terminal endpoint; device/persistence behavior stays outside this composition. */
  readonly endRun?: () => void;
}

export interface ProductionReplayCheckpointCapture {
  readonly snapshot: TearSnapshotV1;
  readonly input: AuthoritativeInputSnapshot;
  readonly semanticHash: string;
}

/** Immutable run-start facts captured before natural opening content consumes RNG. */
export interface ProductionReplayBootstrap {
  readonly build: TearBuildIdentityV1;
  readonly rng: RunRandomStreamsSnapshot;
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
    replay.world.context.environment.snapshot(),
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

function productionRuntimeState(replay: ProductionReplayWorld) {
  const transient = replay.world.context.transient;
  return createLiveStateForgeRuntimeBridge({
    captureTransient: () => Object.freeze({
      hitStop: transient.impact.hitStop, shake: transient.impact.shake,
      timeScale: transient.feel.timeScale, slowmo: transient.impact.slowMotion,
      zoom: transient.feel.zoom, flash: transient.feel.flash,
      bannerT: transient.feel.bannerSeconds, dashGhostT: transient.opening.dashGhostTime,
      landingV: transient.opening.landingVelocity, wasDashing: transient.opening.wasDashing,
      wasSwinging: transient.opening.wasSwinging, wasOnGround: transient.opening.wasOnGround,
      worldZoom: transient.feel.worldZoom, worldZoomTarget: transient.feel.worldZoomTarget,
      throwCd: transient.opening.throwCooldown, rankPopT: transient.feel.rankPopupSeconds,
      rankPopText: transient.feel.rankPopupText,
    }),
    restoreTransient: (state) => {
      transient.assignImpact({ hitStop: Number(state.hitStop), slowMotion: Number(state.slowmo), shake: Number(state.shake) });
      transient.assignOpening({ throwCooldown: Number(state.throwCd), dashGhostTime: Number(state.dashGhostT),
        landingVelocity: Number(state.landingV), wasDashing: Boolean(state.wasDashing),
        wasSwinging: Boolean(state.wasSwinging), wasOnGround: Boolean(state.wasOnGround) });
      Object.assign(transient.feel, { timeScale: Number(state.timeScale), zoom: Number(state.zoom), flash: Number(state.flash),
        bannerSeconds: Number(state.bannerT), worldZoom: Number(state.worldZoom), worldZoomTarget: Number(state.worldZoomTarget),
        rankPopupSeconds: Number(state.rankPopT), rankPopupText: String(state.rankPopText) });
    },
    captureLifecycle: replay.world.lifecycle.snapshot.bind(replay.world.lifecycle),
    restoreLifecycle: replay.world.lifecycle.restore.bind(replay.world.lifecycle),
    captureChapterBinding: () => null,
    stageChapterBinding: () => null,
    installChapterBinding: () => undefined,
    captureCinemaProtection: () => Object.freeze({ ...transient.protection }),
    restoreCinemaProtection: transient.assignProtection.bind(transient),
    captureStageBanner: () => Object.freeze({ name: "", seconds: transient.feel.bannerSeconds }),
    restoreStageBanner: (_name, seconds) => { transient.feel.bannerSeconds = seconds; },
    cinema: replay.world.context.cinema,
  });
}

/**
 * Captures a natural C30 keyframe from the production replay composition.
 * It reuses the State Forge codec boundary; custody stays with its caller, so
 * this creates neither durable storage nor worker/job recovery behavior.
 */
export function captureProductionReplayCheckpoint(
  replay: ProductionReplayWorld,
  simulation: ReturnType<typeof createProductionCombatSimulation<CanonicalGameplayState>>,
  waveReward: ProductionWaveRewardRuntime,
  id: string,
  buildIdentity?: Omit<TearBuildIdentityV1, "configHash">,
): ProductionReplayCheckpointCapture {
  const runtime = productionRuntimeState(replay);
  const stateForge = createLiveStateForgeAdapter({
    dependencies: replay.dependencies,
    entities: replay.world.entities,
    worldServices: replay.world.context.services,
    state: replay.world.state,
    actorId: (entity, prefix) => simulation.combatEntityRuntime.id(entity, prefix),
    bindActorId: (entity, actorId) => { simulation.combatEntityRuntime.bindId(entity, actorId); },
    platforms: () => replay.stage.platforms as never,
    stageIndex: () => replay.stage.index,
    restoreStageIndex: (index) => { replay.stage.index = index; },
    replacePlatforms: (platforms) => { replay.stage.platforms = platforms; },
    slowZones: () => replay.world.state.slowZones(),
    walls: () => replay.world.state.temporaryWalls(),
    environment: () => replay.world.context.environment,
    restoreEnvironment: (snapshot) => { replay.world.context.environment.replace(snapshot); },
    screen: waveReward.screen,
    // C30 captures only an active non-draft screen; fresh source composition
    // therefore restores the canonical `playing` screen without a UI route.
    setScreen: () => undefined,
    focus: () => -1,
    setFocus: () => undefined,
    tick: () => simulation.simulationRuntime.scheduler.tick,
    setTick: (tick) => { simulation.simulationRuntime.reset(tick); },
    clearInputProjection: replay.input.clear.bind(replay.input),
    reward: waveReward.reward.snapshot.bind(waveReward.reward),
    restoreReward: waveReward.reward.restore.bind(waveReward.reward),
    captureGhost: () => Object.freeze({ recording: null }),
    restoreGhost: () => undefined,
    captureIdentityState: simulation.combatEntityRuntime.captureIdentityState.bind(simulation.combatEntityRuntime),
    restoreIdentityState: simulation.combatEntityRuntime.restoreIdentityState.bind(simulation.combatEntityRuntime),
    runtimeState: runtime.capture,
    restoreRuntimeState: runtime.restore,
    captureCinema: replay.world.context.cinema.captureState.bind(replay.world.context.cinema),
    validateCinema: runtime.validate,
  });
  const tick = simulation.simulationRuntime.scheduler.tick;
  const snapshot = captureLiveStateForgeSnapshot({
    id, tick, stateClass: "recorded-canonical", seed: String(replay.world.state.run()?.runSeed ?? "unknown"),
    stateForge, world: stateForge.capture(), rng: replay.world.context.services.random.snapshot(),
    registry: createDefaultStateCodecRegistry(),
    observationClass: "structured-state", producer: "production-headless-checkpoint",
    target: buildIdentity?.target ?? "headless",
    contentHash: buildIdentity?.contentHash ?? stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
    ...(buildIdentity === undefined ? {} : { buildIdentity }),
    // A required contract hash that explicitly denotes absence of a pixel capture;
    // it is not rendered-output evidence.
    visualHash: stableVerificationHash("not-captured"),
    executionClass: "engineering",
  });
  const state = projectProductionReplayCanonicalState(replay, tick, simulation.simulationRuntime.input);
  return Object.freeze({ snapshot, input: simulation.simulationRuntime.input.snapshot(),
    semanticHash: stableVerificationHash(state) });
}

/** Applies a saved State Forge world transactionally to a newly composed production replay world. */
export function restoreProductionReplaySnapshot(replay: ProductionReplayWorld, snapshot: TearSnapshotV1) {
  let decoded: TearCodecWorld | undefined;
  const decodedResult = restoreSnapshotTransactionally(snapshot, createDefaultStateCodecRegistry(), {
    createEmpty: () => ({ components: new Map(), references: new Map(), entityIds: new Set() }),
    validate: () => [],
  }, { replace: (world) => { decoded = world; } });
  if (!decodedResult.ok || decoded === undefined) {
    const issue = decodedResult.ok ? "decoded world was not produced" : decodedResult.issues[0]?.message ?? "snapshot is invalid";
    throw new TypeError(`production replay snapshot is invalid: ${issue}`);
  }
  const staged = hydrateTearCodecWorld(
    { ...replay.world.entities, hydrateReward: () => null },
    decoded,
    { requireIdentity: (id: string) => id },
  );
  if (staged.tick !== snapshot.tick) throw new TypeError("recorded snapshot tick does not match its run component");
  const destinationWorldId = replay.world.context.environment.worldId;
  const rebasedEnvironment = rebaseEnvironmentSnapshot(staged.environment, destinationWorldId);
  const environmentIssues = validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...rebasedEnvironment });
  const firstEnvironmentIssue = environmentIssues[0];
  if (firstEnvironmentIssue !== undefined) throw new TypeError(`production replay environment is invalid after rebase: ${firstEnvironmentIssue.path} ${firstEnvironmentIssue.message}`);
  const expectedStage = CAMPAIGN_STAGE_IDS[staged.stageIndex];
  if (rebasedEnvironment.stageId !== "unknown" && expectedStage !== undefined && rebasedEnvironment.stageId !== expectedStage) {
    throw new RangeError("production replay environment stage does not match the restored world stage");
  }
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
  // Preserve an explicitly unknown source stage in the semantic projection;
  // inferred campaign stage would make a valid checkpoint restore hash drift.
  const environmentStage = rebasedEnvironment.stageId;
  replay.world.context.environment.setStage(environmentStage, "restore");
  replay.world.context.environment.replace({ ...rebasedEnvironment, stageId: environmentStage });
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

const DETACHED_SOURCE_VOID_UNSUPPORTED =
  "production detached Source void descent/scroll is unsupported; use the live backend";

function assertDetachedSourceVoidSupported(run: unknown): void {
  if (typeof run !== "object" || run === null) return;
  if ((run as { voidScroll?: unknown }).voidScroll != null) throw new Error(DETACHED_SOURCE_VOID_UNSUPPORTED);
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
      const runtimeBuild = injectedBuildIdentity("production-headless", stableVerificationHash(ENTITY_KIND_REGISTRY.ids));
      const inheritedBuild = snapshot?.provenance.build;
      const suppliedBuild = inheritedBuild === undefined ? (options.buildIdentity ?? runtimeBuild) : undefined;
      const bootstrap = Object.freeze({
        build: inheritedBuild ?? Object.freeze({
          version: suppliedBuild?.version ?? "0.1.0",
          revision: suppliedBuild?.revision ?? "unbound",
          target: suppliedBuild?.target ?? "production-headless",
          rulesetVersion: suppliedBuild?.rulesetVersion ?? "live",
          contentHash: suppliedBuild?.contentHash ?? stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
          configHash: stableVerificationHash(replay.configuration.value),
        }),
        rng: replay.world.context.services.random.snapshot(),
      } satisfies ProductionReplayBootstrap);
      const staged = snapshot === undefined ? undefined : restoreProductionReplaySnapshot(replay, snapshot);
      if (staged !== undefined) assertDetachedSourceVoidSupported(staged.run);
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
        ...(options.recordWaveIntent === undefined ? {} : { recordIntent: options.recordWaveIntent }),
        currentTick: () => core.simulationRuntime.scheduler.tick,
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
        bootstrap,
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
