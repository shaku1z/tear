import { createTearWorldState, type TearWorldState } from "../../gameplay/runtime/tear-world-context";
import { createTearWorldComposition } from "../../gameplay/runtime/tear-world-composition";
import type { RunLifecycleController } from "../../gameplay/run/lifecycle";
import type { RunResultInfo } from "../../gameplay/run/outcome-planner";
import type { KeptReplay } from "../replay/live-replay-production";
import { MusicDirector } from "../../audio/music-director";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type {
  GameBlade,
  GameEnemy,
  GameFloater,
  GamePlayer,
  GameProjectile,
  GameRun,
  GameSlowZone,
  GameTemporaryWall,
} from "../../gameplay/runtime/game-runtime-state";
import type { StageBeat, BossIntroState, LiveGameHostState } from "./game-host-state";
import { createLiveWorldServices, type LiveWorldContext } from "./world-context";
import { createLiveWorldEntityFactory, type LiveWorldEntityConstructionPort } from "./world-entity-factory";
import type { TearWorldConfiguration } from "../../gameplay/runtime/tear-world-configuration";
import { createEnvironmentRuntime, type EnvironmentRuntime } from "../../gameplay/environment/environment-runtime";
import { BLOOM_WELL_VALIDATION } from "../../gameplay/environment/bloom-well";
import { PALE_TRACK_VALIDATION } from "../../gameplay/environment/aurora-track";
import { createVerdantEnvironmentFeature } from "../../gameplay/environment/verdant-environment-feature";
import { createPaleEnvironmentFeature } from "../../gameplay/environment/pale-environment-feature";

type WorldRun = GameRun & { voidDescent?: unknown };
type PortableWorldState = TearWorldState<
  WorldRun,
  GamePlayer,
  GameBlade,
  GameEnemy,
  GameProjectile,
  GameFloater,
  GameSlowZone,
  GameTemporaryWall,
  BossIntroState,
  StageBeat
>;

/**
 * Write-through hooks for the host's remaining local views of world values.
 * The world owns the values; a host may keep a cached reference for its hot
 * frame paths and is told whenever the world replaces one.
 */
export interface LiveWorldMirrors {
  run?(value: WorldRun): void;
  player?(value: GamePlayer): void;
  blade?(value: GameBlade): void;
  enemies?(value: GameEnemy[]): void;
  projectiles?(value: GameProjectile[]): void;
  floaters?(value: GameFloater[]): void;
  slowZones?(value: GameSlowZone[]): void;
  temporaryWalls?(value: GameTemporaryWall[]): void;
  bossIntro?(value: BossIntroState | null): void;
  stageBeat?(value: StageBeat | null): void;
}

/** Session values the host owns; they outlive any single world. */
export interface LiveWorldSessionPort {
  selectedWeapon(): string;
  setSelectedWeapon(value: string): void;
  outcome(): RunResultInfo | null;
  setOutcome(value: RunResultInfo | null): void;
  /** The last finished run's kept replay record, for the results screen's WATCH. */
  lastReplay(): KeptReplay | null;
  setLastReplay(value: KeptReplay | null): void;
  winSeconds(): number;
  setWinSeconds(value: number): void;
}

export interface LiveWorldCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly session: LiveWorldSessionPort;
  readonly configuration: TearWorldConfiguration<GameRuntimeDependencies["CONFIG"]>;
  readonly worldId?: string;
  readonly mirrors?: LiveWorldMirrors;
  /**
   * True when the environment publishes its facts on
   * `dependencies.GAMEPLAY_EVENTS` (the live world). A detached replay world
   * keeps its environment off the bus.
   */
  readonly publishEnvironmentEvents: boolean;
  /**
   * True when the world owns a music director over `dependencies.SFX` (the
   * live world). A detached replay world has no music direction.
   */
  readonly musicDirection: boolean;
}

export interface LiveWorldComposition<Music extends MusicDirector | null = MusicDirector> {
  readonly state: LiveGameHostState;
  readonly context: LiveWorldContext;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly lifecycle: RunLifecycleController;
  readonly music: Music;
  readonly environment: EnvironmentRuntime;
  readonly dispose: () => void;
}

/** A world built without music direction, such as the detached TearBench replay world. */
export type DetachedWorldComposition = LiveWorldComposition<null>;

/** Builds the live host-shaped state around a session without constructing adapters. */
export function createLiveWorldState(session: LiveWorldSessionPort, mirrors: LiveWorldMirrors = {}): LiveGameHostState {
  const portable: PortableWorldState = createTearWorldState<
    WorldRun,
    GamePlayer,
    GameBlade,
    GameEnemy,
    GameProjectile,
    GameFloater,
    GameSlowZone,
    GameTemporaryWall,
    BossIntroState,
    StageBeat
  >();
  return Object.freeze({
    // A null run or undefined actor would be a torn world, not a reset one;
    // the live application replaces them together at run start.
    run: () => portable.run(),
    setRun: (value) => {
      if (value !== null) {
        portable.setRun(value);
        mirrors.run?.(value);
      }
    },
    player: () => portable.player(),
    setPlayer: (value) => {
      if (value !== undefined) {
        portable.setPlayer(value);
        mirrors.player?.(value);
      }
    },
    blade: () => portable.blade(),
    setBlade: (value) => {
      if (value !== undefined) {
        portable.setBlade(value);
        mirrors.blade?.(value);
      }
    },
    enemies: () => portable.enemies(),
    setEnemies: (value) => {
      portable.setEnemies(value);
      mirrors.enemies?.(portable.enemies());
    },
    projectiles: () => portable.projectiles(),
    setProjectiles: (value) => {
      portable.setProjectiles(value);
      mirrors.projectiles?.(portable.projectiles());
    },
    floaters: () => portable.floaters(),
    setFloaters: (value) => {
      portable.setFloaters(value);
      mirrors.floaters?.(portable.floaters());
    },
    slowZones: () => portable.slowZones(),
    setSlowZones: (value) => {
      portable.setSlowZones(value);
      mirrors.slowZones?.(portable.slowZones());
    },
    temporaryWalls: () => portable.temporaryWalls(),
    setTemporaryWalls: (value) => {
      portable.setTemporaryWalls(value);
      mirrors.temporaryWalls?.(portable.temporaryWalls());
    },
    bossIntro: () => portable.bossIntro(),
    setBossIntro: (value) => {
      portable.setBossIntro(value);
      mirrors.bossIntro?.(value);
    },
    stageBeat: () => portable.stageBeat(),
    setStageBeat: (value) => {
      portable.setStageBeat(value);
      mirrors.stageBeat?.(value);
    },
    selectedWeapon: () => session.selectedWeapon(),
    setSelectedWeapon: (value) => {
      session.setSelectedWeapon(value);
    },
    outcome: () => session.outcome(),
    setOutcome: (value) => {
      session.setOutcome(value);
    },
    lastReplay: () => session.lastReplay(),
    setLastReplay: (value) => {
      session.setLastReplay(value);
    },
    winSeconds: () => session.winSeconds(),
    setWinSeconds: (value) => {
      session.setWinSeconds(value);
    },
  } satisfies LiveGameHostState);
}

/**
 * The one production world constructor: a world's replaceable state, entity
 * construction adapter, run lifecycle, environment, cinema and world context
 * (services plus transient records). The live production-world root and the
 * detached TearBench replay world (src/app/world/detached/world-factory.ts)
 * both build their world here and differ only in the explicit options.
 *
 * This is deliberately world-only. The combat host, frame coordinator, input,
 * and presentation stay outward in the host that drives the world, so the same
 * composition can build a world the live host does not own. Every constructor
 * called here is pure (no random draw, id allocation or listener registration),
 * so their relative order is not observable.
 */
export function createLiveWorldComposition(
  options: LiveWorldCompositionOptions & { readonly musicDirection: true },
): LiveWorldComposition;
export function createLiveWorldComposition(
  options: LiveWorldCompositionOptions & { readonly musicDirection: false },
): DetachedWorldComposition;
export function createLiveWorldComposition(
  options: LiveWorldCompositionOptions,
): LiveWorldComposition<MusicDirector | null>;
export function createLiveWorldComposition(
  options: LiveWorldCompositionOptions,
): LiveWorldComposition<MusicDirector | null> {
  const { session, mirrors = {} } = options;
  const state = createLiveWorldState(session, mirrors);
  const entities = createLiveWorldEntityFactory(options.dependencies);
  const music = options.musicDirection ? new MusicDirector(options.dependencies.SFX) : null;
  const worldId = options.worldId ?? "live";
  const environment = createEnvironmentRuntime({
    stageId: "unknown",
    worldId,
    ...(options.publishEnvironmentEvents ? { events: options.dependencies.GAMEPLAY_EVENTS } : {}),
    features: [createVerdantEnvironmentFeature(), createPaleEnvironmentFeature()],
    validators: [BLOOM_WELL_VALIDATION, PALE_TRACK_VALIDATION],
  });
  // The world owns the simulation timeline. The live factory adds drawing;
  // detached compositions supply the gameplay-only implementation through the
  // same dependency surface.
  const cinema = new options.dependencies.Cinematics.Director(options.configuration.value);
  const world = createTearWorldComposition({
    state,
    entities,
    cinema,
    services: createLiveWorldServices({
      dependencies: options.dependencies,
      configuration: options.configuration,
    }),
    environment,
    worldId,
  });
  return Object.freeze({
    state,
    context: world.context,
    entities,
    lifecycle: world.lifecycle,
    music,
    environment,
    dispose: world.dispose,
  });
}
