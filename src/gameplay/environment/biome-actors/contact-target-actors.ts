import type { EnvironmentContactTarget } from "../environment-contact-damage";
import type { EnvironmentRuntime } from "../environment-runtime";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";

/**
 * Lets the environment's one contact damage path reach the player. The object's owner is passed as the
 * damage source, as the boss's own strikes do; an object whose owner is gone deals no damage.
 */
export function bindLiveContactTargets(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: BiomeActorEnemy) => string,
): void {
  environment.setContactTargets((): readonly EnvironmentContactTarget[] => {
    const target = player();
    if (target === null) return [];
    return [
      Object.freeze({
        id: "player",
        x: target.x,
        y: target.y,
        hw: target.hw,
        hh: target.hh,
        invulnerable: target.invulnerable,
        hazardDamageMultiplier: target.hazardDmgMult,
        takeDamage: (damage: number, sourceX: number, ownerId: string | null) => {
          const owner = ownerId === null ? undefined : enemies().find((enemy) => actorId(enemy) === ownerId);
          if (owner !== undefined) target.takeDamage(damage, sourceX, owner as never);
        },
      }),
    ];
  });
}
