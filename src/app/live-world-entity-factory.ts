import type { TearWorldEntityConstructionPort } from "../gameplay/runtime/tear-world-entity-construction";
import { createTearWorldLegacyEntityConstruction } from "../gameplay/runtime/tear-world-legacy-entity-construction";
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
 * Outward adapter for the production constructors. Gameplay owns the stable
 * IDs and selection; this app module only binds legacy classes to those ports.
 */
export function createLiveWorldEntityFactory(
  dependencies: LiveWorldEntityDependencies,
): LiveWorldEntityConstructionPort {
  const enemy = (value: unknown): GameEnemy => makeCombatEnemy(value);
  return createTearWorldLegacyEntityConstruction<GameRun, GamePlayer, GameBlade, GameEnemy, GameProjectile, GameRun["mods"]>({
    createPlayer: (x, y) => new dependencies.Player(x, y),
    createBlade: () => new dependencies.Blade(),
    createProjectile: (x, y, vx, vy) => new dependencies.Projectile(x, y, vx, vy),
    echoMods: (run) => run.mods,
    enemy: {
      charger: (x, y) => enemy(new dependencies.Charger(x, y)), ranged: (x, y) => enemy(new dependencies.Ranged(x, y)),
      flyer: (x, y) => enemy(new dependencies.Flyer(x, y)), bomber: (x, y) => enemy(new dependencies.Bomber(x, y)),
      armored: (x, y) => enemy(new dependencies.Armored(x, y)), wraith: (x, y) => enemy(new dependencies.Wraith(x, y)),
      chimera: (x, y) => enemy(new dependencies.Chimera(x, y)), warden: (x, y) => enemy(new dependencies.Warden(x, y)),
      colossus: (x, y) => enemy(new dependencies.Colossus(x, y)), aldric: (x, y) => enemy(new dependencies.Aldric(x, y)),
      // Echo must use the live Mirror host, not the visual Ghost 2 Echo puppet.
      echo: (x, y, mods) => enemy(new dependencies.MirrorHost(x, y, mods)),
      source: (x, y) => enemy(new dependencies.Source(x, y)), voidWisp: (x, y) => enemy(new dependencies.VoidWisp(x, y)),
      reflection: (x, y) => enemy(new dependencies.ReflectionEnemy(x, y)),
      support: (x, y, kind) => enemy(new dependencies.Support(x, y, kind)), boss: (x, y) => enemy(new dependencies.Boss(x, y)),
    },
    rebindEchoMods(actor, mods): void {
      // Codec hydration clones `_mods`; restore the Echo host's live run link
      // only after the final staged run has been decoded.
      (actor as GameEnemy & { _mods?: GameRun["mods"] })._mods = mods;
    },
  });
}
