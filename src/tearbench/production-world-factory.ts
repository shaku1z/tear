import { A11Y, CONFIG, GFX, REMOTE } from "../config/game-config";
import { createLiveAuthoritativeInputAdapter } from "../app/live-authoritative-input-adapter";
import { createLiveWorldState, type LiveWorldSessionPort } from "../app/live-world-composition";
import { createLiveWorldServices } from "../app/live-world-context";
import { createLiveWorldEntityFactory } from "../app/live-world-entity-factory";
import type { GameRuntimeDependencies } from "../app/game-runtime-dependencies";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist } from "../domain/geometry";
import { applyWeapon } from "../gameplay/weapons";
import { CinematicTimeline } from "../gameplay/runtime/cinematic-director";
import { createTearWorldBootstrap } from "../gameplay/runtime/tear-world-bootstrap";
import { createTearWorldComposition } from "../gameplay/runtime/tear-world-composition";
import {
  createTearWorldSimulationFactories,
  type TearWorldEntityPresentationPorts,
  type TearWorldSimulationFactoryOptions,
} from "../gameplay/runtime/tear-world-simulation-factories";
import { newMods } from "../gameplay/upgrades";
import { planRunStart } from "../gameplay/run/run-start-plan";
import type { RunDifficulty } from "../gameplay/run/session";
import { stagePlatforms } from "../gameplay/stages";
import { cosmeticRandom } from "../presentation/cosmetic-random";
import { createParticleSystem } from "../presentation/particles";
import { createEnvironmentRuntime } from "../gameplay/environment/environment-runtime";

type FactoryOptions = TearWorldSimulationFactoryOptions;

export interface ProductionReplayWorldOptions {
  readonly worldId?: string;
  readonly seed: string;
  readonly enemies?: readonly Readonly<{ id: string; x: number; y: number }>[];
  readonly mode?: string;
  readonly weaponId?: string;
  readonly difficulty?: RunDifficulty;
  /** Source-owned persisted discovery projection for detached Endless/Gauntlet runs. */
  readonly discoveredVariantIds?: readonly string[];
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

function noOpPresentationPorts(): TearWorldEntityPresentationPorts {
  return Object.freeze({
    blade: { draw: () => undefined }, player: { draw: () => undefined }, projectile: { draw: () => undefined },
    enemy: Object.freeze({ port: { drawBossTransformationWorld: () => undefined }, install: () => undefined }),
    mirror: {
      drawMirror: () => undefined, drawHostFallback: () => undefined,
      drawReflection: () => undefined, saberLockSparks: () => undefined,
    },
  });
}

/** The minimal legal run shape used before a captured State Forge snapshot replaces it. */
function productionRunSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

function productionDifficultyPlan(difficulty: RunDifficulty) {
  return planRunStart(difficulty, CONFIG.difficulties.map((definition) => ({
    id: definition.id,
    ...(definition.oneHit === undefined ? {} : { oneHit: definition.oneHit }),
    mods: definition.mods,
  })), REMOTE);
}

export function createProductionReplayRun(
  mode = "endless",
  weaponId = "sword",
  runSeed = 1,
  difficulty: RunDifficulty = "normal",
) {
  const plan = productionDifficultyPlan(difficulty);
  return {
    mode, diff: plan.difficulty, diffDmg: plan.playerDamageMultiplier,
    diffHp: plan.scaling.enemyHp, diffCount: plan.scaling.enemyCount,
    coinMod: plan.scaling.coin, scoreMod: plan.scaling.score,
    mods: newMods(), mult: 1, lifestealCd: 0,
    weaponId, runSeed, wave: 1, score: 0, waveKills: 0, wavePeak: 1, waveTime: 0, runTime: 0,
    spawnQueue: [], spawnTimer: 0, clearTimer: -1, waveLog: [],
    specialBlock: -1, specialsOffered: 0, reservedUpgrade: null,
    isBossWave: false, horde: false, miniBoss: null, waveTag: "", waveKinds: [],
    bossOrder: [], bossIdx: 0, bossesBeaten: 0, curBoss: null, pendingBossOutro: null,
    _dmgThisWave: false, _dmgThisStage: false,
    weaponStats: { distanceMoved: 0, throws: 0 }, voidScroll: null, bossAdds: [], echoClones: null,
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
  const runSeed = productionRunSeed(options.seed);
  const effects = createParticleSystem({
    effects: config.effects, lowGraphics: () => GFX.low,
    reducedMotion: () => A11Y.reducedMotion, random: cosmeticRandom,
  });
  random.streams.reset(runSeed);
  const factories = createTearWorldSimulationFactories({
    clock, config, graphics: GFX, effects, sound: unavailableOutwardPort() as FactoryOptions["sound"],
    input: idleInputPort() as FactoryOptions["input"], presentation: noOpPresentationPorts(),
    random: { enemyAi: random.streams.stream("enemy-ai"), boss: random.streams.stream("boss") },
    geometry: { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist }, cosmeticRandom,
  });
  const dependencies = {
    CLOCK: clock, CONFIG: config, GAME_RANDOM: random.service, GAME_RANDOM_STREAMS: random.streams, FX: effects,
    Backdrop: { resetFx: () => undefined }, Mirror: factories.mirrorTypes.Mirror, BOSSFX: factories.enemyTypes.BOSSFX,
    Cinematics: CinematicTimeline, Player: factories.Player, Blade: factories.Blade, Projectile: factories.Projectile,
    Charger: factories.enemyTypes.Charger, Ranged: factories.enemyTypes.Ranged, Flyer: factories.enemyTypes.Flyer,
    Bomber: factories.enemyTypes.Bomber, Armored: factories.enemyTypes.Armored, Wraith: factories.enemyTypes.Wraith,
    Chimera: factories.enemyTypes.Chimera, Warden: factories.enemyTypes.Warden, Colossus: factories.enemyTypes.Colossus,
    Aldric: factories.enemyTypes.Aldric, Rootbound: factories.enemyTypes.Rootbound,
    Source: factories.enemyTypes.Source, Support: factories.enemyTypes.Support,
    VoidWisp: factories.enemyTypes.VoidWisp, Boss: factories.enemyTypes.Boss,
    MirrorHost: factories.mirrorTypes.MirrorHost, ReflectionEnemy: factories.mirrorTypes.ReflectionEnemy,
  } as unknown as GameRuntimeDependencies;
  const session: LiveWorldSessionPort = {
    selectedWeapon: () => "sword", setSelectedWeapon: () => undefined,
    outcome: () => null, setOutcome: () => undefined,
    lastRecording: () => null, setLastRecording: () => undefined,
    lastVaultId: () => null, setLastVaultId: () => undefined,
    winSeconds: () => 0, setWinSeconds: () => undefined,
  };
  const state = createLiveWorldState(session);
  const entities = createLiveWorldEntityFactory(dependencies);
  const worldId = options.worldId ?? `production-replay:${options.seed}:${options.mode ?? "endless"}:${options.weaponId ?? "sword"}`;
  const environment = createEnvironmentRuntime({ worldId });
  const world = createTearWorldComposition({
    state, entities, services: createLiveWorldServices({ dependencies, configuration }),
    cinema: new CinematicTimeline.Director(config),
    worldId, environment,
  });
  world.context.services.random.resetRun(runSeed);
  const difficulty = options.difficulty ?? "normal";
  const difficultyPlan = productionDifficultyPlan(difficulty);
  const run = { ...createProductionReplayRun(options.mode, options.weaponId, runSeed, difficulty),
    variantDiscovery: [...(options.discoveredVariantIds ?? [])] };
  world.state.setRun(run as never);
  configuration.resetToBase();
  config.player.dmgTakenMult *= difficultyPlan.playerDamageMultiplier;
  // Match the live run-start host: source replay/headless natural openings
  // begin at the centered, ground-relative player coordinate, not a detached
  // harness convenience position.
  const player = world.entities.createPlayer(config.view.w * 0.5, config.world.groundY - 60) as { oneHit: boolean };
  player.oneHit = difficultyPlan.oneHit;
  world.state.setPlayer(player as never);
  const blade = world.entities.createBlade() as { weapon?: unknown; model?: unknown };
  const weapon = applyWeapon(config, run.weaponId);
  blade.weapon = weapon; blade.model = weapon.model;
  world.state.setBlade(blade as never);
  world.state.setEnemies((options.enemies ?? []).map((spawn) =>
    world.entities.createEnemy(spawn.id, spawn.x, spawn.y, run as never)));
  const input = createLiveAuthoritativeInputAdapter({
    player: () => world.state.player() as never, blade: () => world.state.blade() as never,
    aimRadius: () => config.blade.aimRadius,
  });
  const stage: { index: number; platforms: unknown[] } = { index: 0, platforms: stagePlatforms(0, config) };
  return Object.freeze({
    dependencies, world, configuration, clock, effects, random, factories,
    transient: world.context.transient, input, run, stage,
  });
}

export type ProductionReplayWorld = ReturnType<typeof createProductionReplayWorld>;
