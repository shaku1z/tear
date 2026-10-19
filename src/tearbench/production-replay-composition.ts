import { applyWeapon } from "../gameplay/weapons";
import { A11Y, GFX } from "../config/game-config";
import { launchCampaignChapter } from "../app/live-campaign-sequences";
import { createCampaignChapterController } from "../app/campaign-controller-factory";
import { createUiState } from "../presentation/ui-tokens";
import { createLiveParticlePresentationState } from "../app/live-particle-presentation-state";
import { validateParticlePresentationBinding } from "./particle-presentation-checkpoint";
import { prepareParticlePresentationRestore } from "./particle-presentation-checkpoint";
import { createTearWorldConfiguration } from "../gameplay/runtime/tear-world-configuration";
import { UPGRADES } from "../gameplay/upgrades";
import { eligibleTierChoices } from "../gameplay/run/reward-selection";
import { restoreUpgradeHooks } from "../gameplay/upgrade-hooks";
import { hydrateRewardCodecPayload, hydrateRewardUpgrade } from "./reward-codec-hydrator";
import { captureCampaignChapterBindingSpec, parseCampaignChapterBindingSpec, stageCampaignChapterBinding,
  type StagedCampaignChapterBinding } from "../gameplay/campaign/chapter-cinematic-binding";
import type { ChapterIntent } from "../gameplay/campaign/chapter-controller";
import { validateRunLifecycleSnapshot, type RunLifecycleSnapshot } from "../gameplay/run/lifecycle";
import { CinematicTimeline, type CinematicDirectorBinding, type CinematicDirectorPort } from "../gameplay/runtime/cinematic-director";
import { createLiveStateForgeAdapter } from "../app/live-state-forge-adapter";
import { createLiveStateForgeRuntimeBridge, resolveStateForgeBossIntro } from "../app/live-state-forge-runtime-bridge";
import type { RunDifficulty } from "../gameplay/run/session";
import { RunRandomStreams, type RunRandomStreamsSnapshot } from "../simulation/run-random";
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
import { rebaseEnvironmentSnapshot } from "./environment-codec";
import { validateAuthoredEnvironmentCodecPayload as validateEnvironmentCodecPayload } from "./authored-environment-codec-validation";
import { readGhostRecordedOpeningPermit, type GhostRecordedOpeningPermit } from "../ghost/replay-admission";

const productionChapterBindings = new WeakMap<ProductionReplayWorld, StagedCampaignChapterBinding>();
const productionFocus = new WeakMap<ProductionReplayWorld, number>();
const productionWaveRewards = new WeakMap<ProductionReplayWorld, ProductionWaveRewardRuntime>();

/** Explicit application-frame inputs, independent of fixed simulation ticks. */
export type ProductionApplicationFrameConfirm = NonNullable<Parameters<InstanceType<typeof CinematicTimeline.Director>["update"]>[1]>;

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
  readonly openingPermit?: GhostRecordedOpeningPermit;
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
        x: number; y: number; vx: number; vy: number; hp: number; dead: boolean;
        atk?: string; atkT?: number; atkCd?: number; packRole?: string; packFlank?: number;
        packLockT?: number; packAttackAuthorized?: boolean; pounceTargetX?: number; pounceAirborne?: boolean;
        auroraDirection?: number; auroraResponseT?: number; auroraPounceExtended?: boolean;
        state?: string; stateT?: number; stateMax?: number; phaseMarker?: number; attackCursor?: number;
        attackStep?: number; attackSequence?: number; environmentSequence?: number; routeProgress?: number;
        trueRouteIndex?: number; fracturePlatformId?: string | null; fractureWindow?: boolean; batonStrike?: number;
        auroraBossChargeActive?: boolean; parryOutcome?: string;
        routeTelegraph?: readonly Readonly<{ x: number; y: number }>[];
        candidateRoutes?: readonly (readonly Readonly<{ x: number; y: number }>[])[] };
      return {
        ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind,
        ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
        x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
        ...(enemy.kind === "rimehound" ? {
          atk: enemy.atk, atkT: enemy.atkT, atkCd: enemy.atkCd,
          packRole: enemy.packRole, packFlank: enemy.packFlank, packLockT: enemy.packLockT,
          packAttackAuthorized: enemy.packAttackAuthorized, pounceTargetX: enemy.pounceTargetX,
          pounceAirborne: enemy.pounceAirborne, auroraDirection: enemy.auroraDirection,
          auroraResponseT: enemy.auroraResponseT, auroraPounceExtended: enemy.auroraPounceExtended,
        } : {}),
        ...(enemy.kind === "white-hart" ? {
          state: enemy.state, atk: enemy.atk, stateT: enemy.stateT, stateMax: enemy.stateMax,
          phaseMarker: enemy.phaseMarker, attackCursor: enemy.attackCursor, attackStep: enemy.attackStep,
          attackSequence: enemy.attackSequence, environmentSequence: enemy.environmentSequence,
          routeProgress: enemy.routeProgress, trueRouteIndex: enemy.trueRouteIndex,
          fracturePlatformId: enemy.fracturePlatformId, fractureWindow: enemy.fractureWindow,
          batonStrike: enemy.batonStrike, auroraBossChargeActive: enemy.auroraBossChargeActive,
          parryOutcome: enemy.parryOutcome, routeTelegraph: enemy.routeTelegraph,
          candidateRoutes: enemy.candidateRoutes,
        } : {}),
      };
    }),
    replay.world.context.environment.snapshot(),
  );
}

function dispatchProductionChapter(replay: ProductionReplayWorld, intents: readonly ChapterIntent[]): void {
    for (const intent of intents) {
      if (intent.type === "chapter-state") {
        const run = replay.world.state.run() as never as { chapterState: string };
        run.chapterState = intent.state;
      } else if (intent.type === "clear-projectiles") {
        replay.world.state.setProjectiles([]);
      } else if (intent.type === "activate-prepared-wave" && replay.world.lifecycle.hasPreparedWave) {
        // Bare snapshot helpers have no composition root yet. Lazily use the same
        // canonical owner; a subsequently installed event-enabled owner takes precedence.
        let owner = productionWaveRewards.get(replay);
        if (owner === undefined) { owner = createProductionWaveRewardRuntime(replay); productionWaveRewards.set(replay, owner); }
        owner.waves.activatePreparedWave();
      }
    }
}

function stageProductionChapter(replay: ProductionReplayWorld, rawSpec: unknown): StagedCampaignChapterBinding | null {
  if (rawSpec === null || rawSpec === undefined) return null;
  const spec = parseCampaignChapterBindingSpec(rawSpec);
  return stageCampaignChapterBinding(spec, stageAt(spec.stageIndex), {
    dispatch: (intents) => { dispatchProductionChapter(replay, intents); },
    preparedWave: () => replay.world.lifecycle.hasPreparedWave,
    activationDeferred: () => replay.world.lifecycle.activationDeferred,
    clear: () => { productionChapterBindings.delete(replay); },
  });
}

function installProductionChapter(replay: ProductionReplayWorld, chapter: StagedCampaignChapterBinding | null) {
  if (chapter === null) productionChapterBindings.delete(replay);
  else productionChapterBindings.set(replay, chapter);
  return chapter?.binding;
}

function prepareProductionChapter(replay: ProductionReplayWorld, runtime: Readonly<Record<string, unknown>>,
  configuration = replay.configuration.value, existingBinding?: CinematicDirectorBinding) {
  const lifecycle = validateRunLifecycleSnapshot(runtime.lifecycle);
  const chapter = stageProductionChapter(replay, runtime.chapterBinding);
  // Validate timing and executable identities without changing the destination's director/configuration.
  const director = new CinematicTimeline.Director(configuration);
  const cinema = director.validateState(runtime.cinema, chapter?.binding ?? existingBinding);
  if (chapter !== null && (!cinema.active || lifecycle.phase !== "wave-prepared" || !lifecycle.activationDeferred)) {
    throw new RangeError("active campaign chapter requires a deferred prepared-wave lifecycle");
  }
  return { lifecycle, chapter, cinema, director };
}

/** Restores a prepared data-bound chapter without replaying start/enter callbacks. */
export function restoreProductionReplayChapterBinding(
  replay: ProductionReplayWorld, runtime: Readonly<Record<string, unknown>>,
): void {
  const cinema = replay.world.context.cinema;
  // This helper retains the same world. Only here may an already-bound owner be
  // validated on the isolated director; full-world replacement supplies no fallback.
  const existingBinding = cinema.script === null ? undefined : { script: cinema.script, context: cinema.context ?? {} };
  const prepared = prepareProductionChapter(replay, runtime, replay.configuration.value, existingBinding);
  replay.world.lifecycle.restore(prepared.lifecycle);
  replay.world.context.cinema.restoreState(prepared.cinema, prepared.chapter?.binding);
  installProductionChapter(replay, prepared.chapter);
}

interface PreparedRuntimeOwners {
  readonly chapter: StagedCampaignChapterBinding | null;
  readonly lifecycle: RunLifecycleSnapshot;
  readonly director: Pick<CinematicDirectorPort, "captureState" | "restoreState" | "validateState">;
}

function productionRuntimeState(replay: ProductionReplayWorld, prepared?: PreparedRuntimeOwners) {
  const transient = replay.world.context.transient;
  return createLiveStateForgeRuntimeBridge({
    captureBossIntro: () => replay.world.state.bossIntro(),
    restoreBossIntro: (intro) => { replay.world.state.setBossIntro(intro); },
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
    captureLifecycle: prepared === undefined ? replay.world.lifecycle.snapshot.bind(replay.world.lifecycle) : () => prepared.lifecycle,
    restoreLifecycle: replay.world.lifecycle.restore.bind(replay.world.lifecycle),
    captureChapterBinding: () => {
      const chapter = productionChapterBindings.get(replay);
      return chapter === undefined ? null : captureCampaignChapterBindingSpec(chapter.spec, chapter.flow);
    },
    stageChapterBinding: (value) => prepared === undefined ? stageProductionChapter(replay, value) : prepared.chapter,
    installChapterBinding: (value) => installProductionChapter(replay,
      prepared === undefined ? stageProductionChapter(replay, value) : prepared.chapter),
    captureCinemaProtection: () => Object.freeze({ ...transient.protection }),
    restoreCinemaProtection: transient.assignProtection.bind(transient),
    captureStageBanner: () => Object.freeze({ name: "", seconds: transient.feel.bannerSeconds }),
    restoreStageBanner: (_name, seconds) => { transient.feel.bannerSeconds = seconds; },
    cinema: prepared?.director ?? replay.world.context.cinema,
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
    // The fresh host restores the captured screen after installing its reward owner.
    setScreen: () => undefined,
    focus: waveReward.focus,
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
    particlesPresentation: createLiveParticlePresentationState(replay.effects, () => ({ effects: replay.configuration.value.effects, lowGraphics: GFX.low, reducedMotion: A11Y.reducedMotion }), replay.cosmeticEmissionRandom),
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
export function restoreProductionReplaySnapshot(replay: ProductionReplayWorld, snapshot: TearSnapshotV1, openingPermit?: GhostRecordedOpeningPermit) {
  const opening = openingPermit === undefined ? undefined : readGhostRecordedOpeningPermit(openingPermit, snapshot);
  let decoded: TearCodecWorld | undefined;
  const decodedResult = restoreSnapshotTransactionally(snapshot, createDefaultStateCodecRegistry(), {
    createEmpty: () => ({ components: new Map(), references: new Map(), entityIds: new Set() }),
    validate: () => [],
  }, { replace: (world) => { decoded = world; } });
  if (!decodedResult.ok || decoded === undefined) {
    const issue = decodedResult.ok ? "decoded world was not produced" : decodedResult.issues[0]?.message ?? "snapshot is invalid";
    throw new TypeError(`production replay snapshot is invalid: ${issue}`);
  }
  // Entity constructors may consume destination RNG even when hydration fails.
  const randomBeforeStaging = replay.world.context.services.random.snapshot();
  const staged = (() => {
    try {
      return hydrateTearCodecWorld(
        { ...replay.world.entities, hydrateReward: (payload) => hydrateRewardCodecPayload(UPGRADES, payload) },
        decoded,
        { requireIdentity: (id: string) => id },
      );
    } finally { replay.world.context.services.random.restore(randomBeforeStaging); }
  })();
  if (staged.tick !== snapshot.tick) throw new TypeError("recorded snapshot tick does not match its run component");
  restoreUpgradeHooks({ mods: staged.run.mods, config: replay.configuration.value });
  const restoredBossIntro = resolveStateForgeBossIntro(staged.runtime, staged.enemies);
  const destinationWorldId = replay.world.context.environment.worldId;
  const rebasedEnvironment = rebaseEnvironmentSnapshot(staged.environment, destinationWorldId);
  const environmentIssues = validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...rebasedEnvironment });
  const firstEnvironmentIssue = environmentIssues[0];
  if (firstEnvironmentIssue !== undefined) throw new TypeError(`production replay environment is invalid after rebase: ${firstEnvironmentIssue.path} ${firstEnvironmentIssue.message}`);
  const expectedStage = CAMPAIGN_STAGE_IDS[staged.stageIndex];
  if (rebasedEnvironment.stageId !== "unknown" && expectedStage !== undefined && rebasedEnvironment.stageId !== expectedStage) {
    throw new RangeError("production replay environment stage does not match the restored world stage");
  }
  const candidateConfiguration = replay.configuration.baseSnapshot();
  const weapon = applyWeapon(candidateConfiguration, staged.weaponId);
  applyTearCodecConfiguration(candidateConfiguration, staged.configuration);
  createTearWorldConfiguration(replay.configuration.baseSnapshot()).restore(candidateConfiguration);
  validateParticlePresentationBinding(staged.particlesPresentation, candidateConfiguration.effects);
  const particleRestore = prepareParticlePresentationRestore(staged.particlesPresentation, staged.run.runSeed, staged.tick);
  const preparedRuntime = prepareProductionChapter(replay, staged.runtime, candidateConfiguration);
  productionRuntimeState(replay, preparedRuntime).validate(staged.runtime, staged.run, staged.stageIndex, staged.enemies);
  // Exercise the same portable RNG restore before any destination stream changes.
  new RunRandomStreams().restore(staged.rng as RunRandomStreamsSnapshot);
  // Live opening capture precedes the menu -> playing route in the same start-run call.
  // The executable chapter/lifecycle above must already be coherent before admitting that anchor.
  const noPendingReward = staged.reward === null || (staged.reward.phase === "idle" && staged.reward.mode === staged.run.mode
    && staged.reward.choices.length === 0 && staged.reward.reserveChoices.length === 0 && staged.reward.reservedChoice === null);
  const openingCampaign = staged.run.mode === "campaign" && snapshot.tick === 0
    && staged.run.runTime === 0 && noPendingReward
    && preparedRuntime.chapter?.spec.flowState === "LORE_ENTER"
    && preparedRuntime.lifecycle.phase === "wave-prepared" && preparedRuntime.lifecycle.activationDeferred
    && preparedRuntime.cinema.active && preparedRuntime.cinema.beatId === "enter" && preparedRuntime.cinema.elapsedSeconds === 0;
  const admittedOpening = opening !== undefined && snapshot.tick === 0 && staged.run.runTime === 0 && noPendingReward
    && preparedRuntime.lifecycle.reward === null && preparedRuntime.lifecycle.outcome === null
    && restoredBossIntro === null
    && (openingCampaign || (staged.run.mode === "endless" && preparedRuntime.chapter === null
      && preparedRuntime.lifecycle.phase === "wave-active" && preparedRuntime.lifecycle.wave === staged.run.wave
      && !preparedRuntime.lifecycle.activationDeferred && !preparedRuntime.cinema.active));
  if (opening !== undefined && !admittedOpening) throw new RangeError("recorded opening runtime is incoherent or unsupported");
  if (!["playing", "paused", "draft", "reserve", "tierup"].includes(staged.screen) && !admittedOpening && !(openingCampaign && staged.screen === "menu")) {
    throw new RangeError(`production replay UI screen is invalid: ${staged.screen}`);
  }
  if (["draft", "reserve", "tierup"].includes(staged.screen) && staged.reward?.phase !== staged.screen) {
    throw new RangeError("production replay reward screen requires a matching selection");
  }
  const selectingReward = staged.reward !== null && ["draft", "reserve", "tierup"].includes(staged.reward.phase);
  if (selectingReward && (staged.screen !== staged.reward.phase || preparedRuntime.lifecycle.phase !== "reward-pending"
    || staged.reward.mode !== staged.run.mode)
    || preparedRuntime.lifecycle.phase === "reward-pending" && !selectingReward) {
    throw new RangeError("production replay reward selection requires coherent UI and lifecycle");
  }
  const reservedUpgrade = hydrateRewardUpgrade(UPGRADES, staged.run.reservedUpgrade);
  if (selectingReward) {
    const selection = staged.reward, choices = selection.phase === "reserve" ? selection.reserveChoices : selection.choices;
    if (choices.length === 0 || new Set(choices.map((choice) => choice.id)).size !== choices.length
      || selection.phase !== "tierup" && selection.wave !== staged.run.wave
      || selection.rerolls !== staged.run.mods.draftRerolls || selection.specialBlock !== staged.run.specialBlock
      || selection.specialsOffered !== staged.run.specialsOffered
      || selection.reservePick !== staged.run.mods.reservePick
      || selection.expandedDraft !== staged.run.mods.expandedDraft
      || selection.reservedChoice?.id !== reservedUpgrade?.id
      || selection.phase === "reserve" && !selection.reservePick
      || selection.phase === "tierup" && choices.some((choice) => !eligibleTierChoices(UPGRADES, staged.run.mods.owned, staged.run.mods.tier)
        .some((eligible) => eligible.id === choice.id))) {
      throw new RangeError("production replay reward choices disagree with their source run");
    }
  }
  staged.run.reservedUpgrade = reservedUpgrade;
  replay.world.state.setRun(staged.run);
  productionFocus.set(replay, staged.focus);
  replay.world.state.setPlayer(staged.player);
  replay.world.state.setBlade(staged.blade);
  replay.world.state.setEnemies(staged.enemies);
  replay.world.state.setProjectiles(staged.projectiles);
  replay.world.state.setFloaters(staged.floaters as never);
  replay.world.state.setSlowZones(staged.slowZones as never);
  replay.world.state.setTemporaryWalls(staged.walls as never);
  replay.configuration.restore(candidateConfiguration);
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
  createLiveParticlePresentationState(replay.effects, () => ({ effects: replay.configuration.value.effects, lowGraphics: GFX.low, reducedMotion: A11Y.reducedMotion }), replay.cosmeticEmissionRandom)
    .restore(particleRestore);
  productionRuntimeState(replay, { ...preparedRuntime, director: replay.world.context.cinema })
    .restore({ ...staged.runtime, lifecycle: preparedRuntime.lifecycle, cinema: preparedRuntime.cinema, bossIntro: restoredBossIntro });
  if (staged.simulationSeconds !== undefined) replay.world.context.services.clock.set(staged.simulationSeconds);
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
      const openingPermit = snapshot?.tick === 0 ? options.openingPermit : undefined;
      const opening = openingPermit === undefined || snapshot === undefined ? undefined : readGhostRecordedOpeningPermit(openingPermit, snapshot);
      if (opening !== undefined && options.inputSnapshots?.get(0) !== undefined
        && stableVerificationHash(options.inputSnapshots.get(0)) !== stableVerificationHash(opening.input)) throw new TypeError("opening held input does not match its capsule receipt");
      const staged = snapshot === undefined ? undefined : restoreProductionReplaySnapshot(replay, snapshot, openingPermit);
      if (replay.world.state.bossIntro() !== null) {
        throw new Error("production detached active boss intro playback is unsupported without application-frame timing; use the live backend");
      }
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
        chapterFlowActive: () => productionChapterBindings.has(replay),
        beginCampaignChapter: (index, priorOutro = null) => {
          const run = replay.world.state.run() as never as { _prologueShown?: boolean };
          launchCampaignChapter({
            runtime: {
              chapterController: createCampaignChapterController(createUiState(replay.configuration.value.colors).t.motion, replay.configuration.value),
              installChapterBinding: (chapter) => { installProductionChapter(replay, chapter); },
              clearChapterBinding: () => { productionChapterBindings.delete(replay); },
            },
            cinema: {
              startBinding: (binding) => { replay.world.context.cinema.start(binding.script, binding.context); },
            }, stageIndex: index, stage: stageAt(index), priorOutro,
            brief: false, play: true, prologueShown: run._prologueShown === true,
            preparedWave: () => replay.world.lifecycle.hasPreparedWave,
            activationDeferred: () => replay.world.lifecycle.activationDeferred,
            dispatch: (intents) => { dispatchProductionChapter(replay, intents); },
            rememberPrologue: (shown) => { run._prologueShown = shown; },
            clearBossBeat: () => undefined,
          });
        },
      });
      productionWaveRewards.set(replay, waveReward);
      if (staged === undefined) waveReward.startNaturalOpening();
      if (staged !== undefined) {
        waveReward.reward.restore(staged.reward);
        waveReward.restoreUi(staged.screen, productionFocus.get(replay) ?? -1);
        core.combatEntityRuntime.restoreIdentityState(staged.identityState as never);
        for (const binding of staged.identityBindings) core.combatEntityRuntime.bindId(binding.entity, binding.id);
      }
      core.simulationRuntime.reset(snapshot?.tick ?? 0);
      if (snapshot !== undefined) {
        const input = opening?.input ?? options.inputSnapshots?.get(snapshot.tick);
        if (input !== undefined) core.simulationRuntime.input.restore(input);
      }
      let openingStatus: "pending" | "publishing" | "completed" | "failed" = "pending";
      const completeRecordedOpening = () => {
        if (openingStatus === "completed") return;
        if (openingStatus !== "pending") { openingStatus = "failed"; throw new Error("recorded opening completion failed or is reentrant"); }
        if (opening === undefined) {
          if (staged !== undefined && !["playing", "paused", "draft", "reserve", "tierup"].includes(staged.screen)) throw new TypeError("recorded opening requires a capsule linkage permit before advancement");
          return;
        }
        const payload = opening.started.payload;
        openingStatus = "publishing";
        try {
          options.gameplayEvents?.publish({ kind: "run", tick: 0, transition: "started", runId: String(payload.runId),
            mode: String(payload.mode), difficulty: String(payload.difficulty), weaponId: String(payload.weapon),
            wave: Number(payload.wave), score: Number(payload.score), runTimeSeconds: Number(payload.runTimeSeconds) });
          if ((openingStatus as string) !== "publishing") throw new Error("recorded opening completion was invalidated during publication");
          waveReward.restoreScreen("playing"); openingStatus = "completed";
        } catch (error) { openingStatus = "failed"; throw error; }
      };
      return Object.freeze({
        replay,
        bootstrap,
        combat: core,
        simulation: core.simulationRuntime,
        outcome,
        waveReward,
        routeAction: waveReward.routeAction,
        advanceApplicationFrame: (deltaSeconds: number, confirm: ProductionApplicationFrameConfirm = {}) => {
          // RuntimeFrameDriver caps canonical application-frame deltas at 0.1s.
          // This detached API rejects outside that domain instead of silently truncating caller time.
          if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 0.1
            || Object.entries(confirm).some(([key, value]) => !["key", "touch", "pad", "mouse", "click"].includes(key) || typeof value !== "boolean")) {
            throw new RangeError("production application frame requires bounded finite seconds and boolean confirm sources");
          }
          if (waveReward.screen() === "playing" && replay.world.context.cinema.active) replay.world.context.cinema.update(deltaSeconds, confirm);
        },
        completeRecordedOpening,
        invalidateRecordedOpening: () => { openingStatus = "failed"; },
        semanticProjection: () => core.simulationRuntime.lastResult?.state
          ?? projectProductionReplayCanonicalState(replay, core.simulationRuntime.scheduler.tick, core.simulationRuntime.input),
      });
    },
  });
}
