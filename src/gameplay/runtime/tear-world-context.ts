import type { TearWorldConfiguration } from "./tear-world-configuration";

/**
 * Portable mutable world state. Hosts may replace a whole entity collection,
 * while simulation code keeps stable access to the current per-world values.
 * It deliberately contains no rendering, browser, persistence, or app types.
 */
export interface TearWorldState<
  Run,
  Player,
  Blade,
  Enemy,
  Projectile,
  Floater,
  SlowZone,
  Wall,
  BossIntro,
  BossBeat,
> {
  run(): Run | null;
  setRun(value: Run | null): void;
  player(): Player | undefined;
  setPlayer(value: Player | undefined): void;
  blade(): Blade | undefined;
  setBlade(value: Blade | undefined): void;
  enemies(): Enemy[];
  setEnemies(value: readonly Enemy[]): void;
  projectiles(): Projectile[];
  setProjectiles(value: readonly Projectile[]): void;
  floaters(): Floater[];
  setFloaters(value: readonly Floater[]): void;
  slowZones(): SlowZone[];
  setSlowZones(value: readonly SlowZone[]): void;
  temporaryWalls(): Wall[];
  setTemporaryWalls(value: readonly Wall[]): void;
  bossIntro(): BossIntro | null;
  setBossIntro(value: BossIntro | null): void;
  bossBeat(): BossBeat | null;
  setBossBeat(value: BossBeat | null): void;
}

export interface TearWorldStateOptions<
  Run,
  Player,
  Blade,
  Enemy,
  Projectile,
  Floater,
  SlowZone,
  Wall,
  BossIntro,
  BossBeat,
> {
  readonly run?: Run | null;
  readonly player?: Player;
  readonly blade?: Blade;
  readonly enemies?: readonly Enemy[];
  readonly projectiles?: readonly Projectile[];
  readonly floaters?: readonly Floater[];
  readonly slowZones?: readonly SlowZone[];
  readonly temporaryWalls?: readonly Wall[];
  readonly bossIntro?: BossIntro | null;
  readonly bossBeat?: BossBeat | null;
}

/** Creates one isolated mutable world state, retaining entity identity but not input array ownership. */
export function createTearWorldState<
  Run,
  Player,
  Blade,
  Enemy,
  Projectile,
  Floater,
  SlowZone,
  Wall,
  BossIntro,
  BossBeat,
>(
  options: TearWorldStateOptions<
    Run, Player, Blade, Enemy, Projectile, Floater, SlowZone, Wall, BossIntro, BossBeat
  > = {},
): TearWorldState<Run, Player, Blade, Enemy, Projectile, Floater, SlowZone, Wall, BossIntro, BossBeat> {
  let run: Run | null = options.run ?? null;
  let player = options.player;
  let blade = options.blade;
  let enemies = [...(options.enemies ?? [])];
  let projectiles = [...(options.projectiles ?? [])];
  let floaters = [...(options.floaters ?? [])];
  let slowZones = [...(options.slowZones ?? [])];
  let temporaryWalls = [...(options.temporaryWalls ?? [])];
  let bossIntro: BossIntro | null = options.bossIntro ?? null;
  let bossBeat: BossBeat | null = options.bossBeat ?? null;
  const state: TearWorldState<Run, Player, Blade, Enemy, Projectile, Floater, SlowZone, Wall, BossIntro, BossBeat> = {
    run: () => run, setRun: (value) => { run = value; },
    player: () => player, setPlayer: (value) => { player = value; },
    blade: () => blade, setBlade: (value) => { blade = value; },
    enemies: () => enemies, setEnemies: (value) => { enemies = [...value]; },
    projectiles: () => projectiles, setProjectiles: (value) => { projectiles = [...value]; },
    floaters: () => floaters, setFloaters: (value) => { floaters = [...value]; },
    slowZones: () => slowZones, setSlowZones: (value) => { slowZones = [...value]; },
    temporaryWalls: () => temporaryWalls, setTemporaryWalls: (value) => { temporaryWalls = [...value]; },
    bossIntro: () => bossIntro, setBossIntro: (value) => { bossIntro = value; },
    bossBeat: () => bossBeat, setBossBeat: (value) => { bossBeat = value; },
  };
  return Object.freeze(state);
}

/** Explicit outward services a real world needs before its implementation can become per-world. */
export interface TearWorldServices<RandomSnapshot, RandomStreamName extends string, RandomStream, Configuration extends object = object> {
  readonly configuration: TearWorldConfiguration<Configuration>;
  readonly random: Readonly<{
    resetRun(seed: number | string): void;
    stream(name: RandomStreamName): RandomStream;
    snapshot(): RandomSnapshot;
    restore(snapshot: RandomSnapshot): void;
  }>;
  readonly clock: Readonly<{ seconds(): number; set(seconds: number): void; reset(): void; advance(seconds: number): void }>;
  readonly effects: Readonly<{ resetWorld(): void; count(): number }>;
  readonly mirror: Readonly<{ reset(): void }>;
  readonly bossFeedback: Readonly<{ clear(): void }>;
}

/**
 * A host supplies narrow production services, its world state, and its
 * transient per-step records to the shared runtime. It is intentionally not a
 * replacement for app-level UI or storage.
 */
export interface TearWorldContext<State, Entities, Lifecycle, Services, Transient, Cinema> {
  readonly state: State;
  readonly entities: Entities;
  readonly lifecycle: Lifecycle;
  readonly services: Services;
  readonly transient: Transient;
  readonly cinema: Cinema;
}

export function createTearWorldContext<State, Entities, Lifecycle, Services, Transient, Cinema>(
  state: State,
  entities: Entities,
  lifecycle: Lifecycle,
  services: Services,
  transient: Transient,
  cinema: Cinema,
): TearWorldContext<State, Entities, Lifecycle, Services, Transient, Cinema> {
  return Object.freeze({ state, entities, lifecycle, services, transient, cinema });
}
