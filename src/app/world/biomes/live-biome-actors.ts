import type { EnvironmentRuntime } from "../../../gameplay/environment/environment-runtime";
import type { GameRuntimeDependencies } from "../../shell/game-runtime-dependencies";
import type { GameBlade, GameEnemy, GamePlayer, GameProjectile } from "../../shell/game-runtime-state";
import { bindLiveAuroraTrackActors } from "./aurora-track-wiring";
import { bindLiveVerdantActors } from "./rootbound-wiring";
import { bindLiveWhiteHartActors } from "./white-hart-wiring";

export interface LiveBiomeActorSources {
  readonly environment: EnvironmentRuntime;
  readonly config: GameRuntimeDependencies["CONFIG"];
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly enemies: () => GameEnemy[];
  readonly projectiles: () => GameProjectile[];
  /** Stable combat identity; the combat runtime is constructed after the bindings. */
  readonly entityId: (entity: object, prefix: "enemy" | "projectile") => string;
}

/** Installs every biome feature's actor source on the live environment, Verdant and Pale alike. */
export function bindLiveBiomeActors(sources: LiveBiomeActorSources): void {
  const { environment, config, player, enemies, entityId } = sources;
  const enemyId = (enemy: object) => entityId(enemy, "enemy");
  bindLiveVerdantActors(environment, player, enemies, enemyId, config);
  bindLiveAuroraTrackActors(
    environment,
    player,
    sources.blade,
    enemies,
    sources.projectiles,
    enemyId,
    (projectile) => entityId(projectile, "projectile"),
    {
      playerAcceleration: config.player.groundAccel,
      playerMaximumSpeed: config.player.moveSpeed,
      bladeAcceleration: config.blade.throw.speed,
      bladeMaximumSpeed: config.blade.throw.maxSpeed,
      projectileAcceleration: config.proj.speed,
      projectileMaximumSpeed: config.chargedShot.speed,
    },
  );
  bindLiveWhiteHartActors(environment, player, enemies, enemyId);
}
