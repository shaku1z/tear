import type { CONFIG } from "../../../config/game-config";
import type { EnvironmentRuntime } from "../environment-runtime";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";
import {
  bindLiveAuroraTrackActors,
  type LiveAuroraBlade,
  type LiveAuroraEnemy,
  type LiveAuroraPlayer,
  type LiveAuroraProjectile,
} from "./aurora-track-actors";
import type { BloomWellEntity } from "./bloom-well-actors";
import { bindLiveVerdantActors } from "./rootbound-actors";
import { bindLiveWhiteHartActors } from "./white-hart-actors";

export interface BiomeActorSources {
  readonly environment: EnvironmentRuntime;
  readonly config: typeof CONFIG;
  readonly player: () => BiomeActorPlayer & LiveAuroraPlayer & BloomWellEntity;
  readonly blade: () => LiveAuroraBlade;
  readonly enemies: () => readonly (BiomeActorEnemy & LiveAuroraEnemy & BloomWellEntity)[];
  readonly projectiles: () => readonly LiveAuroraProjectile[];
  /** Stable combat identity; the combat runtime is constructed after the bindings. */
  readonly entityId: (entity: object, prefix: "enemy" | "projectile") => string;
}

/**
 * The one registration path for biome actors. Live play, the production replay world and headless
 * runs all call this, so a new biome's actors are bound everywhere once they are added here.
 * Order matters for determinism: Verdant, then Pale's Aurora Track, then the White Hart.
 */
export function bindBiomeActors(sources: BiomeActorSources): void {
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
