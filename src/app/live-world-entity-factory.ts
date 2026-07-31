import {
  createTearWorldEntityConstructionCatalog,
  type TearWorldEntityConstructionPort,
} from "../gameplay/runtime/tear-world-entity-construction";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameProjectile, GameRun } from "./game-runtime-state";
import { makeCombatEnemy } from "./live-runtime-type-guards";

export type LiveWorldEntityDependencies = Pick<GameRuntimeDependencies,
  "Player" | "Blade" | "Projectile" | "Charger" | "Ranged" | "Flyer" | "Bomber" | "Armored"
  | "Wraith" | "Chimera" | "Warden" | "Colossus" | "Aldric" | "MirrorHost" | "Source"
  | "VoidWisp" | "ReflectionEnemy" | "Support" | "Boss"
>;

export type LiveWorldEntityConstructionPort = TearWorldEntityConstructionPort<
  GameRun,
  GamePlayer,
  GameBlade,
  GameEnemy,
  GameProjectile
>;

/**
 * Outward adapter for the production constructors. The portable catalog owns
 * IDs and selection; this app module is the only place that knows legacy
 * constructor names or Echo's mutable modifier link.
 */
export function createLiveWorldEntityFactory(
  dependencies: LiveWorldEntityDependencies,
): LiveWorldEntityConstructionPort {
  const enemy = (value: unknown): GameEnemy => makeCombatEnemy(value);
  return createTearWorldEntityConstructionCatalog<GameRun, GamePlayer, GameBlade, GameEnemy, GameProjectile>({
    createPlayer: (x, y) => new dependencies.Player(x, y),
    createBlade: () => new dependencies.Blade(),
    enemyFactories: {
      charger: { create: (x, y) => enemy(new dependencies.Charger(x, y)) },
      ranged: { create: (x, y) => enemy(new dependencies.Ranged(x, y)) },
      flyer: { create: (x, y) => enemy(new dependencies.Flyer(x, y)) },
      bomber: { create: (x, y) => enemy(new dependencies.Bomber(x, y)) },
      armored: { create: (x, y) => enemy(new dependencies.Armored(x, y)) },
      wraith: { create: (x, y) => enemy(new dependencies.Wraith(x, y)) },
      chimera: { create: (x, y) => enemy(new dependencies.Chimera(x, y)) },
      warden: { create: (x, y) => enemy(new dependencies.Warden(x, y)) },
      colossus: { create: (x, y) => enemy(new dependencies.Colossus(x, y)) },
      aldric: { create: (x, y) => enemy(new dependencies.Aldric(x, y)) },
      // Echo must use the live Mirror host, not the visual Ghost 2 Echo puppet.
      echo: { create: (x, y, run) => enemy(new dependencies.MirrorHost(x, y, run.mods)) },
      source: { create: (x, y) => enemy(new dependencies.Source(x, y)) },
      "void-wisp": { create: (x, y) => enemy(new dependencies.VoidWisp(x, y)) },
      reflection: { create: (x, y) => enemy(new dependencies.ReflectionEnemy(x, y)) },
      priest: { create: (x, y) => enemy(new dependencies.Support(x, y, "priest")) },
      herald: { create: (x, y) => enemy(new dependencies.Support(x, y, "herald")) },
      mender: { create: (x, y) => enemy(new dependencies.Support(x, y, "mender")) },
      anchor: { create: (x, y) => enemy(new dependencies.Support(x, y, "anchor")) },
      boss: { create: (x, y) => enemy(new dependencies.Boss(x, y)) },
    },
    createProjectile: (x, y, vx, vy) => new dependencies.Projectile(x, y, vx, vy),
    finalizeEnemy(factoryId, actor, run): void {
      if (factoryId !== "echo") return;
      // Codec hydration clones `_mods`; restore the Echo host's live run link
      // only after the final staged run has been decoded.
      (actor as GameEnemy & { _mods?: GameRun["mods"] })._mods = run.mods;
    },
  });
}
