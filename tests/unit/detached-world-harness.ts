import { CONFIG } from "../../src/config/game-config";
import { createLiveAuthoritativeInputAdapter } from "../../src/app/live-authoritative-input-adapter";
import { createLiveWorldComposition, type LiveWorldSessionPort } from "../../src/app/live-world-composition";
import {
  createLiveWorldSimulationFactories,
  type LiveWorldSimulationFactoryOptions,
} from "../../src/app/live-world-simulation-factories";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import { newMods } from "../../src/gameplay/upgrades";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";
import { createParticleSystem } from "../../src/presentation/particles";
import { createRunRandom } from "../../src/simulation/run-random";

type Options = LiveWorldSimulationFactoryOptions;

/** Ground plus one oneway ledge; enough arena for locomotion and contact. */
export const DETACHED_PLATFORMS = Object.freeze([
  { x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: CONFIG.view.h - CONFIG.world.groundY, floor: true },
  { x: 650, y: 520, w: 300, h: 24, oneway: true },
]);

function sink(): unknown {
  // Outward effects and audio are adapters; a detached world records nothing.
  return new Proxy({}, { get: () => () => undefined });
}

function idleInput(): unknown {
  const off = () => false;
  return { right: off, left: off, up: off, down: off, dashPressed: off, jumpPressed: off, consumeThrow: off };
}

/** A legal minimal run: real upgrade mods, weapon stats, and boss/void fields. */
export function detachedRun(mode = "endless") {
  return {
    mode, mods: newMods(), mult: 1, lifestealCd: 0, weaponId: "sword", wave: 1, score: 0, runTime: 0,
    weaponStats: { distanceMoved: 0, throws: 0 },
    voidScroll: null, bossAdds: [], echoClones: null,
  };
}

export interface DetachedWorldOptions {
  readonly seed: string;
  /** Factory ids and positions spawned through the production entity port. */
  readonly enemies?: readonly Readonly<{ id: string; x: number; y: number }>[];
  readonly mode?: string;
}

/**
 * Builds a world with no DOM, canvas, screens, audio, storage, or live host,
 * using the same production composition the application uses. Callers add
 * whichever production phase they want to step.
 */
export function createDetachedWorld(options: DetachedWorldOptions) {
  const clock = createTearWorldClock();
  const random = createRunRandom();
  const effects = createParticleSystem();
  const transient = createTearWorldTransientState();
  random.streams.reset(options.seed);
  const factories = createLiveWorldSimulationFactories({
    clock, effects, sound: sink() as Options["sound"], input: idleInput() as Options["input"],
    ui: sink() as Options["ui"],
    random: { enemyAi: random.streams.stream("enemy-ai"), boss: random.streams.stream("boss") },
  });
  const dependencies = {
    CLOCK: clock, GAME_RANDOM: random.service, GAME_RANDOM_STREAMS: random.streams, FX: effects,
    Backdrop: { resetFx: () => undefined }, Mirror: { active: false, host: null }, BOSSFX: factories.enemyTypes.BOSSFX,
    Player: factories.Player, Blade: factories.Blade, Projectile: factories.Projectile,
    Charger: factories.enemyTypes.Charger, Ranged: factories.enemyTypes.Ranged, Flyer: factories.enemyTypes.Flyer,
    Bomber: factories.enemyTypes.Bomber, Armored: factories.enemyTypes.Armored, Wraith: factories.enemyTypes.Wraith,
    Chimera: factories.enemyTypes.Chimera, Warden: factories.enemyTypes.Warden, Colossus: factories.enemyTypes.Colossus,
    Aldric: factories.enemyTypes.Aldric, Source: factories.enemyTypes.Source, Support: factories.enemyTypes.Support,
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
  const world = createLiveWorldComposition({ dependencies, session, restoreConfiguration: () => undefined });
  world.context.services.random.resetRun(options.seed);
  const run = detachedRun(options.mode);
  world.state.setRun(run as never);
  world.state.setPlayer(world.entities.createPlayer(400, CONFIG.world.groundY - 80));
  world.state.setBlade(world.entities.createBlade());
  world.state.setEnemies((options.enemies ?? []).map((spawn) =>
    world.entities.createEnemy(spawn.id, spawn.x, spawn.y, run as never)));
  const input = createLiveAuthoritativeInputAdapter({
    player: () => world.state.player() as never,
    blade: () => world.state.blade() as never,
    aimRadius: () => CONFIG.blade.aimRadius,
  });
  return { world, clock, effects, random, factories, transient, input, run };
}
