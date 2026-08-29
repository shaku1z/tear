/**
 * Portable selection contract for outer world construction. Concrete hosts own
 * their constructors; this catalog owns the stable factory IDs and refuses to
 * silently substitute an actor when a snapshot or caller names an unknown ID.
 */
export const TEAR_WORLD_ENTITY_FACTORY_IDS = Object.freeze([
  "charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera",
  "warden", "colossus", "aldric", "rootbound", "white-hart", "echo", "source", "void-wisp", "reflection",
  "priest", "herald", "mender", "anchor", "rootbinder", "rimehound", "boss",
] as const);

export type TearWorldEntityFactoryId = typeof TEAR_WORLD_ENTITY_FACTORY_IDS[number];

export interface TearWorldEnemyFactory<Run, Enemy extends object> {
  create(x: number, y: number, run: Run): Enemy;
}

/** DOM-free construction port shared by live, replay, and headless hosts. */
export interface TearWorldEntityConstructionPort<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
> {
  createPlayer(x: number, y: number): Player;
  createBlade(): Blade;
  createEnemy(factoryId: string, x: number, y: number, run: Run): Enemy;
  createProjectile(x: number, y: number, vx: number, vy: number): Projectile;
  /** Reconnect constructor-only host links after codec fields are restored. */
  finalizeEnemy?(factoryId: string, enemy: Enemy, run: Run): void;
}

export interface TearWorldEntityConstructionOptions<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
> {
  readonly createPlayer: (x: number, y: number) => Player;
  readonly createBlade: () => Blade;
  readonly enemyFactories: Readonly<Partial<Record<
    TearWorldEntityFactoryId,
    TearWorldEnemyFactory<Run, Enemy>
  >>>;
  readonly createProjectile: (x: number, y: number, vx: number, vy: number) => Projectile;
  readonly finalizeEnemy?: (factoryId: string, enemy: Enemy, run: Run) => void;
}

export function isTearWorldEntityFactoryId(value: string): value is TearWorldEntityFactoryId {
  return (TEAR_WORLD_ENTITY_FACTORY_IDS as readonly string[]).includes(value);
}

/**
 * Creates an immutable factory selection boundary. It forwards caller-owned
 * coordinates and run state unchanged, so placement/order remains a concern
 * of the live content, State Forge, replay, or headless caller.
 */
export function createTearWorldEntityConstructionCatalog<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
>(
  options: TearWorldEntityConstructionOptions<Run, Player, Blade, Enemy, Projectile>,
): TearWorldEntityConstructionPort<Run, Player, Blade, Enemy, Projectile> {
  return Object.freeze({
    createPlayer: options.createPlayer,
    createBlade: options.createBlade,
    createEnemy(factoryId: string, x: number, y: number, run: Run): Enemy {
      if (!isTearWorldEntityFactoryId(factoryId)) {
        throw new RangeError(`unsupported Tear world entity factory: ${factoryId}`);
      }
      const factory = options.enemyFactories[factoryId];
      if (factory === undefined) {
        throw new RangeError(`unavailable Tear world entity factory: ${factoryId}`);
      }
      return factory.create(x, y, run);
    },
    createProjectile: options.createProjectile,
    ...(options.finalizeEnemy === undefined ? {} : { finalizeEnemy: options.finalizeEnemy }),
  });
}
