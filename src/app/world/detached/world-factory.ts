import { createProductionFinaleRuntime } from "./finale-runtime";
import type { TearGameplayEventPort } from "../../../gameplay/runtime/gameplay-events";
import { deriveVoidSeed } from "../../../gameplay/run/live-run-start-controller";
import { createLiveBossPhasePractice } from "../../campaign/boss-phase-practice";
import { createLiveCinematicHost } from "../../campaign/cinematic-host";
import { createLiveSourceVoidController } from "../../run/source-void-controller";
import { stageAt } from "../../../gameplay/stages";
import type { EnemyKind } from "../../../gameplay/run/content-director";
import { A11Y, CONFIG, GFX, REMOTE } from "../../../config/game-config";
import { createLiveAuthoritativeInputAdapter } from "../../../gameplay/runtime/authoritative-input-adapter";
import { createLiveWorldComposition, type LiveWorldSessionPort } from "../world-composition";
import type { GameRuntimeDependencies } from "../../shell/game-runtime-dependencies";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist } from "../../../domain/geometry";
import { applyWeapon } from "../../../gameplay/weapons";
import { CinematicTimeline } from "../../../gameplay/runtime/cinematic-director";
import { createTearWorldBootstrap } from "../../../gameplay/runtime/tear-world-bootstrap";
import {
  createTearWorldSimulationFactories,
  type TearWorldEntityPresentationPorts,
  type TearWorldSimulationFactoryOptions,
} from "../../../gameplay/runtime/tear-world-simulation-factories";
import { newMods } from "../../../gameplay/upgrades";
import { planRunStart } from "../../../gameplay/run/run-start-plan";
import type { RunDifficulty } from "../../../gameplay/run/session";
import { stagePlatforms } from "../../../gameplay/stages";
import { cosmeticRandom } from "../../../presentation/cosmetic-random";
import { createCosmeticEmissionRandom } from "../../../domain/cosmetic-emission-random";
import { createMirrorLockFeedback } from "../../../presentation/mirror-lock-feedback";
import { createParticleSystem } from "../../../presentation/particles";
import {
  createLiveTutorialRuntime,
  recoverTutorialBlade,
  resetTutorialActors,
} from "../../../gameplay/training/live-tutorial-runtime";
import { createTutorialArena } from "../../../gameplay/training/tutorial-arenas";
import { trainingPlatforms } from "../../../gameplay/training/playground-controller";
import { DEFAULT_COSMETIC_LOOKS } from "../../../presentation/cosmetic-defaults";
import type { CosmeticLooks } from "../../../presentation/cosmetic-styles";
import { StageRuntimeState } from "../stage-runtime-state";
import { createRunStageController, loadRunStage } from "../run-stage";

type FactoryOptions = TearWorldSimulationFactoryOptions;

export interface ProductionReplayPresentationContext {
  readonly clock: ReturnType<typeof createTearWorldBootstrap>["clock"];
  readonly config: typeof CONFIG;
  readonly effects: ReturnType<typeof createParticleSystem>;
  readonly cosmeticRandom: () => number;
}
export interface ProductionReplayWorldOptions {
  readonly presentation?: (context: ProductionReplayPresentationContext) => TearWorldEntityPresentationPorts;
  readonly gameplayEvents?: TearGameplayEventPort;
  readonly worldId?: string;
  /** The run seed: a non-zero unsigned 32-bit integer (`scenarioRunSeed` names one from text). */
  readonly runSeed: number;
  readonly enemies?: readonly Readonly<{ id: string; x: number; y: number }>[];
  readonly mode?: string;
  readonly weaponId?: string;
  readonly difficulty?: RunDifficulty;
  /** Boss-only mode: the boss chosen on the start screen. It is fought first; the roster is drawn after it. */
  readonly firstBoss?: string;
  /** Source-owned persisted discovery projection for detached Endless/Gauntlet runs. */
  readonly discoveredVariantIds?: readonly string[];
  /** Host-only notification; completion never issues a new run seed or writes progress. */
  readonly tutorialHandoff?: () => void;
  /** Who wears which cosmetics in this world; the game's own look when absent. Never read by the simulation. */
  readonly looks?: CosmeticLooks;
}

/** Ground plus a one-way ledge, owned by each detached production world. */
export function productionReplayPlatforms(config: typeof CONFIG) {
  return Object.freeze([
    { x: 0, y: config.world.groundY, w: config.view.w, h: config.view.h - config.world.groundY, floor: true },
    { x: 650, y: 520, w: 300, h: 24, oneway: true },
  ]);
}

function unavailableOutwardPort(): unknown {
  return new Proxy({}, { get: () => () => undefined });
}

function idleInputPort(): unknown {
  const off = () => false;
  return { right: off, left: off, up: off, down: off, dashPressed: off, jumpPressed: off, consumeThrow: off };
}

function detachedPresentationPorts(
  effects: ReturnType<typeof createParticleSystem>,
  random: () => number,
): TearWorldEntityPresentationPorts {
  return Object.freeze({
    blade: { draw: () => undefined },
    player: { draw: () => undefined },
    projectile: { draw: () => undefined },
    enemy: Object.freeze({ port: { drawBossTransformationWorld: () => undefined }, install: () => undefined }),
    mirror: {
      drawMirror: () => undefined,
      drawHostFallback: () => undefined,
      drawReflection: () => undefined,
      saberLockSparks: createMirrorLockFeedback(effects, random),
    },
  });
}

function productionDifficultyPlan(difficulty: RunDifficulty) {
  return planRunStart(
    difficulty,
    CONFIG.difficulties.map((definition) => ({
      id: definition.id,
      ...(definition.oneHit === undefined ? {} : { oneHit: definition.oneHit }),
      mods: definition.mods,
    })),
    REMOTE,
  );
}

/** The minimal legal run shape used before a captured State Setup snapshot replaces it. */
export function createProductionReplayRun(
  mode = "endless",
  weaponId = "sword",
  runSeed = 1,
  difficulty: RunDifficulty = "normal",
) {
  const plan = productionDifficultyPlan(difficulty);
  return {
    mode,
    diff: plan.difficulty,
    diffDmg: plan.playerDamageMultiplier,
    diffHp: plan.scaling.enemyHp,
    diffCount: plan.scaling.enemyCount,
    coinMod: plan.scaling.coin,
    scoreMod: plan.scaling.score,
    // Match createRunSession's style baseline before any source snapshot exists.
    mods: newMods(),
    combo: 0,
    comboTimer: 0,
    mult: 1,
    rank: "",
    lastTrick: "",
    lifestealCd: 0,
    weaponId,
    runSeed,
    voidSeed: deriveVoidSeed(runSeed),
    wave: 1,
    score: 0,
    waveKills: 0,
    wavePeak: 1,
    waveTime: 0,
    runTime: 0,
    spawnQueue: [],
    spawnTimer: 0,
    clearTimer: -1,
    waveLog: [],
    specialBlock: -1,
    specialsOffered: 0,
    reservedUpgrade: null,
    isBossWave: false,
    horde: false,
    miniBoss: null,
    waveTag: "",
    waveKinds: [],
    bossOrder: [],
    bossIdx: 0,
    bossesBeaten: 0,
    curBoss: null,
    pendingBossOutro: null,
    _dmgThisWave: false,
    _dmgThisStage: false,
    weaponStats: {
      heldHits: 0,
      reversals: 0,
      trueCuts: 0,
      throws: 0,
      throwHits: 0,
      perfectParries: 0,
      breakTriggers: 0,
      distanceMoved: 0,
    },
    voidScroll: null,
    bossAdds: [],
    echoClones: null,
  };
}

/**
 * Builds the C27A gameplay composition without DOM, canvas, storage, audio
 * device, or a live host. Replay/headless adapters receive real world objects
 * and real production factories; outward ports are explicit no-ops.
 */
export function createProductionReplayWorld(options: ProductionReplayWorldOptions) {
  const { configuration, clock, random } = createTearWorldBootstrap(CONFIG);
  const config = configuration.value;
  const { runSeed } = options;
  const cosmeticEmissionRandom = createCosmeticEmissionRandom();
  const effects = createParticleSystem({
    looks: options.looks ?? DEFAULT_COSMETIC_LOOKS,
    effects: config.effects,
    lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion,
    random: cosmeticEmissionRandom.next,
  });
  random.streams.reset(runSeed);
  const factories = createTearWorldSimulationFactories({
    clock,
    config,
    graphics: GFX,
    effects,
    sound: unavailableOutwardPort() as FactoryOptions["sound"],
    input: idleInputPort() as FactoryOptions["input"],
    presentation:
      options.presentation?.({ clock, config, effects, cosmeticRandom: cosmeticEmissionRandom.next }) ??
      detachedPresentationPorts(effects, cosmeticEmissionRandom.next),
    random: { enemyAi: random.streams.stream("enemy-ai"), boss: random.streams.stream("boss") },
    geometry: { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist },
    cosmeticRandom: cosmeticEmissionRandom.next,
  });
  const dependencies = {
    CLOCK: clock,
    CONFIG: config,
    GAMEPLAY_EVENTS: {
      emit: (event: Parameters<TearGameplayEventPort["emit"]>[0]) => {
        options.gameplayEvents?.emit(event);
      },
    },
    GFX,
    A11Y,
    SFX: unavailableOutwardPort(),
    browserStorage: unavailableOutwardPort(),
    lerp,
    clamp,
    GAME_RANDOM: random.service,
    GAME_RANDOM_STREAMS: random.streams,
    FX: effects,
    cosmeticRandom,
    cosmeticEmissionRandom,
    Backdrop: { resetFx: () => undefined },
    Mirror: factories.mirrorTypes.Mirror,
    Cinematics: CinematicTimeline,
    Player: factories.Player,
    Blade: factories.Blade,
    Projectile: factories.Projectile,
    // Every live enemy constructor, so a replayed wave can build whatever live play spawned
    // (a hand-written list silently omitted Rootbinder and broke Verdant replays).
    ...factories.enemyTypes,
    MirrorHost: factories.mirrorTypes.MirrorHost,
    ReflectionEnemy: factories.mirrorTypes.ReflectionEnemy,
  } as unknown as GameRuntimeDependencies;
  const session: LiveWorldSessionPort = {
    selectedWeapon: () => "sword",
    setSelectedWeapon: () => undefined,
    outcome: () => null,
    setOutcome: () => undefined,
    lastRecording: () => null,
    setLastRecording: () => undefined,
    lastVaultId: () => null,
    setLastVaultId: () => undefined,
    winSeconds: () => 0,
    setWinSeconds: () => undefined,
  };
  // The live world's constructor. A detached world keeps its environment off
  // the gameplay event bus (options.gameplayEvents never receives environment
  // facts) and has no music direction.
  const world = createLiveWorldComposition({
    dependencies,
    configuration,
    session,
    worldId:
      options.worldId ??
      `production-replay:${String(runSeed)}:${options.mode ?? "endless"}:${options.weaponId ?? "sword"}`,
    publishEnvironmentEvents: false,
    musicDirection: false,
  });
  const { state } = world;
  world.context.services.random.resetRun(runSeed);
  const difficulty = options.difficulty ?? "normal";
  const difficultyPlan = productionDifficultyPlan(difficulty);
  const run = {
    ...createProductionReplayRun(options.mode, options.weaponId, runSeed, difficulty),
    variantDiscovery: [...(options.discoveredVariantIds ?? [])],
    ...(options.firstBoss === undefined ? {} : { bossOrder: [options.firstBoss] }),
  };
  world.state.setRun(run as never);
  configuration.resetToBase();
  config.player.dmgTakenMult *= difficultyPlan.playerDamageMultiplier;
  // Match the live run-start host: source replay/headless natural openings
  // begin at the centered, ground-relative player coordinate, not a detached
  // harness convenience position.
  const player = world.entities.createPlayer(config.view.w * 0.5, config.world.groundY - 60) as { oneHit: boolean };
  player.oneHit = difficultyPlan.oneHit;
  world.state.setPlayer(player as never);
  const blade = world.entities.createBlade() as InstanceType<typeof factories.Blade>;
  const weapon = applyWeapon(config, run.weaponId);
  blade.weapon = weapon;
  blade.model = weapon.model;
  // Fresh-run initialization precedes any retained snapshot hydration. Restored
  // chambers, cooldowns and trigger state remain owned by that snapshot.
  weapon.onReset?.({ blade });
  world.state.setBlade(blade);
  world.state.setEnemies(
    (options.enemies ?? []).map((spawn) => world.entities.createEnemy(spawn.id, spawn.x, spawn.y, run as never)),
  );
  const input = createLiveAuthoritativeInputAdapter({
    player: () => world.state.player() as never,
    blade: () => world.state.blade() as never,
    aimRadius: () => config.blade.aimRadius,
  });
  const stage = new StageRuntimeState<ReturnType<typeof stageAt>, unknown[]>(stageAt, (index) =>
    stagePlatforms(index, config).map((platform) => ({ ...platform })),
  );
  const stageController = createRunStageController({
    stage,
    state,
    cinema: world.context.cinema,
    gameplayEvents: dependencies.GAMEPLAY_EVENTS,
  });
  let authoritativeTick = (): number => 0;
  const stageLoad = {
    load: (index: number) => {
      stageController.load(index);
    },
    enemies: () => state.enemies(),
    environment: world.environment,
    tick: () => authoritativeTick(),
  };
  const finale = createProductionFinaleRuntime({
    state,
    lifecycle: world.lifecycle,
    config,
    stage,
    cinema: world.context.cinema,
    zoom: (value) => {
      world.context.transient.feel.worldZoomTarget = value;
      world.context.transient.feel.worldZoom = value;
    },
  });
  const practiceCinematic = createLiveCinematicHost({
    dependencies,
    state: state,
    sourceController: createLiveSourceVoidController({ CONFIG: config }, config.view.w, config.view.h),
    cinema: world.context.cinema,
    story: {
      get finale() {
        return finale.story.finale;
      },
      lastCinemaPlayerMode: null,
      markFinaleLanded: () => {
        finale.story.finaleController.markLanded();
      },
      syncFinale: () => {
        finale.story.syncFinale();
      },
    },
    stage: {
      get platforms() {
        return stage.platforms as never[];
      },
      set platforms(value) {
        stage.platforms = value;
      },
      get current() {
        return stageAt(stage.index);
      },
    },
    width: config.view.w,
    policy: () => ({ play: true, brief: false }),
    clearBossBeat: () => {
      state.setBossBeat(null);
    },
    setWorldZoom: (value) => {
      world.context.transient.feel.worldZoomTarget = value;
    },
    spawnWisp: (x, y, lane) => {
      const actor = world.entities.createEnemy("void-wisp", x, y, state.run() as never);
      Reflect.set(actor, "voidLane", lane);
      state.setEnemies([...state.enemies(), actor]);
    },
    addFlash: (value) => {
      world.context.transient.feel.flash = Math.max(world.context.transient.feel.flash, value);
    },
    addShake: (value) => {
      world.context.transient.impact.shake = Math.max(world.context.transient.impact.shake, value);
    },
    loseStyle: () => undefined,
    shieldAbsorb: () => undefined,
    addFloater: () => undefined,
    finaleBladeCut: finale.runtime.tryBladeCut,
    playSound: () => undefined,
  });
  const tutorialOutward: string[] = [];
  let tutorialSpawn: ((kind: EnemyKind, hpScale: number) => ReturnType<typeof world.entities.createEnemy>) | undefined;
  const requirePlayer = () => {
    const value = world.state.player();
    if (value === undefined) throw new Error("tutorial requires its world player");
    return value;
  };
  const tutorial = createLiveTutorialRuntime({
    weaponId: () => world.state.run()?.weaponId ?? "sword",
    config,
    viewportWidth: config.view.w,
    groundY: () => config.world.groundY,
    skipPressed: () => false,
    movingLeft: () => requirePlayer().aiInput?.left() === true,
    movingRight: () => requirePlayer().aiInput?.right() === true,
    player: requirePlayer,
    bladeState: () => world.state.blade()?.state ?? "held",
    bladeTipVY: () => world.state.blade()?.tipVY ?? 0,
    enemies: () => world.state.enemies(),
    spawn: (kind, hpScale) => {
      if (tutorialSpawn === undefined) throw new Error("tutorial source content owner is not installed");
      return tutorialSpawn(kind, hpScale);
    },
    playSound: (cue) => {
      tutorialOutward.push(`sound:${cue}`);
    },
    installArena: (arena) => {
      stage.platforms = createTutorialArena(arena, config.view.w, config.view.h, config.world.groundY);
    },
    resetTrainingSpace: () => {
      world.context.transient.resetOpening();
      world.context.transient.impact.hitStop = 0;
      world.state.setEnemies([]);
      world.state.setProjectiles([]);
      resetTutorialActors(config, config.view.w, requirePlayer(), world.state.blade());
    },
    recoverBlade: () => {
      recoverTutorialBlade(config, requirePlayer(), world.state.blade());
    },
    finishBossPractice: () => {
      options.tutorialHandoff?.();
    },
    beginPractice: () => {
      tutorialOutward.push("awaiting-next-run");
      options.tutorialHandoff?.();
    },
    terminateRun: (reason) => {
      world.lifecycle.terminate(reason);
    },
    navigate: (screen) => {
      tutorialOutward.push(`navigate:${screen}`);
    },
    releasePointer: () => {
      tutorialOutward.push("release-pointer");
    },
    addProfileStat: () => {
      throw new Error("detached tutorial cannot write profile progress");
    },
    completeCourse: (id) => {
      tutorialOutward.push(`complete-course:${id}`);
      return Promise.resolve("nonpersistent");
    },
    checkAchievements: () => {
      tutorialOutward.push("achievement-check");
    },
    drawGhost: () => undefined,
  });
  const bossPractice = createLiveBossPhasePractice({
    config,
    state: state,
    stage,
    selectStage: (index) => {
      stage.index = index;
      world.context.environment.setStage(stageAt(index).id, "stage-transition");
    },
    resetEnvironment: () => {
      world.context.environment.clear("new-run");
    },
    createEnemy: (id, x, y, active) => world.entities.createEnemy(id, x, y, active),
    cinematicActive: () => world.context.cinema.active,
    cancelCinema: () => {
      if (world.context.cinema.active) world.context.cinema.cancel("practice-reset");
    },
  });
  tutorial.bindBossPractice(bossPractice);
  return Object.freeze({
    finale,
    practiceCinematic,
    dependencies,
    world,
    configuration,
    clock,
    effects,
    random,
    cosmeticEmissionRandom,
    factories,
    transient: world.context.transient,
    input,
    run,
    stage,
    /** Loads a stage as live play does: the stage controller, then the stage's environment. */
    loadStage: (index: number, reason: "new-run" | "stage-transition") => {
      loadRunStage(stageLoad, index, reason);
    },
    /** The combat simulation's tick, once it exists; a stage's environment fields start there. */
    bindAuthoritativeTick: (tick: () => number) => {
      authoritativeTick = tick;
    },
    trainingHome: () =>
      trainingPlatforms(config.view.w, config.view.h, config.world.groundY).map((platform) => ({ ...platform })),
    tutorial,
    tutorialOutward,
    bindTutorialSpawn: (spawn: NonNullable<typeof tutorialSpawn>) => {
      tutorialSpawn = spawn;
    },
    tutorialHandoff: () => {
      // Asked twice every tick, so it reads two fields and never builds a session checkpoint.
      if (world.state.run()?.mode !== "tutorial") return null;
      const courseSessionId = tutorial.freePracticeCourse();
      return courseSessionId === undefined
        ? null
        : Object.freeze({ status: "awaiting-next-run" as const, courseSessionId });
    },
  });
}

export type ProductionReplayWorld = ReturnType<typeof createProductionReplayWorld>;
