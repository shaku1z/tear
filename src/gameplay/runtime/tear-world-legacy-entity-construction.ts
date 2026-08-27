import {
  createTearWorldEntityConstructionCatalog,
  type TearWorldEntityConstructionPort,
} from "./tear-world-entity-construction";

type SupportKind = "priest" | "herald" | "mender" | "anchor" | "rootbinder";

/**
 * Constructor ports for the production actor families. The stable factory-ID
 * mapping belongs to gameplay; an outer adapter chooses the actual classes.
 */
export interface TearWorldLegacyEntityConstructorPorts<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
  EchoMods,
> {
  readonly createPlayer: (x: number, y: number) => Player;
  readonly createBlade: () => Blade;
  readonly createProjectile: (x: number, y: number, vx: number, vy: number) => Projectile;
  readonly echoMods: (run: Run) => EchoMods;
  readonly enemy: Readonly<{
    charger: (x: number, y: number) => Enemy;
    ranged: (x: number, y: number) => Enemy;
    flyer: (x: number, y: number) => Enemy;
    bomber: (x: number, y: number) => Enemy;
    armored: (x: number, y: number) => Enemy;
    wraith: (x: number, y: number) => Enemy;
    chimera: (x: number, y: number) => Enemy;
    warden: (x: number, y: number) => Enemy;
    colossus: (x: number, y: number) => Enemy;
    aldric: (x: number, y: number) => Enemy;
    echo: (x: number, y: number, mods: EchoMods) => Enemy;
    source: (x: number, y: number) => Enemy;
    voidWisp: (x: number, y: number) => Enemy;
    reflection: (x: number, y: number) => Enemy;
    support: (x: number, y: number, kind: SupportKind) => Enemy;
    boss: (x: number, y: number) => Enemy;
  }>;
  /** Reconnects the Echo's mutable run-modifier link after codec hydration. */
  readonly rebindEchoMods?: (enemy: Enemy, mods: EchoMods) => void;
}

/** Creates the stable production actor catalog from caller-owned constructors. */
export function createTearWorldLegacyEntityConstruction<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
  EchoMods,
>(
  ports: TearWorldLegacyEntityConstructorPorts<Run, Player, Blade, Enemy, Projectile, EchoMods>,
): TearWorldEntityConstructionPort<Run, Player, Blade, Enemy, Projectile> {
  return createTearWorldEntityConstructionCatalog({
    createPlayer: ports.createPlayer,
    createBlade: ports.createBlade,
    createProjectile: ports.createProjectile,
    enemyFactories: {
      charger: { create: ports.enemy.charger }, ranged: { create: ports.enemy.ranged },
      flyer: { create: ports.enemy.flyer }, bomber: { create: ports.enemy.bomber },
      armored: { create: ports.enemy.armored }, wraith: { create: ports.enemy.wraith },
      chimera: { create: ports.enemy.chimera }, warden: { create: ports.enemy.warden },
      colossus: { create: ports.enemy.colossus }, aldric: { create: ports.enemy.aldric },
      echo: { create: (x, y, run) => ports.enemy.echo(x, y, ports.echoMods(run)) },
      source: { create: ports.enemy.source }, "void-wisp": { create: ports.enemy.voidWisp },
      reflection: { create: ports.enemy.reflection },
      priest: { create: (x, y) => ports.enemy.support(x, y, "priest") },
      herald: { create: (x, y) => ports.enemy.support(x, y, "herald") },
      mender: { create: (x, y) => ports.enemy.support(x, y, "mender") },
      anchor: { create: (x, y) => ports.enemy.support(x, y, "anchor") },
      rootbinder: { create: (x, y) => ports.enemy.support(x, y, "rootbinder") },
      boss: { create: ports.enemy.boss },
    },
    ...(ports.rebindEchoMods === undefined ? {} : {
      finalizeEnemy: (factoryId, enemy, run) => {
        if (factoryId === "echo") ports.rebindEchoMods?.(enemy, ports.echoMods(run));
      },
    }),
  });
}
