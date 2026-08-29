import type { EnvironmentRuntime } from "../gameplay/environment/environment-runtime";
import { createPaleEnvironmentFeature, type WhiteHartEnvironmentActor } from "../gameplay/environment/pale-environment-feature";
import type { WhiteHartEnvironmentRequest } from "../gameplay/environment/white-hart-route-runtime";
import type { GameEnemy, GamePlayer } from "./game-runtime-state";

/** Projects White Hart route intent into the existing world-owned environment runtime. */
export function bindLiveWhiteHartActors(
  environment: EnvironmentRuntime,
  player: () => GamePlayer | null,
  enemies: () => readonly GameEnemy[],
  actorId: (enemy: GameEnemy) => string,
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  environment.setFeatureActorSource("pale", "white-hart", () => enemies().filter((enemy) => enemy.kind === "white-hart")
    .map((enemy): WhiteHartEnvironmentActor => {
      const actor = enemy as GameEnemy & {
        phase: 1 | 2 | 3;
        pendingEnvironmentRequests?: readonly WhiteHartEnvironmentRequest[];
        acknowledgeEnvironmentRequests?: (throughSequence: number) => void;
      };
      const target = player();
      return Object.freeze({
        id: actorId(enemy), source: enemy,
        state: Object.freeze({ phase: actor.phase, requests: actor.pendingEnvironmentRequests ?? Object.freeze([]) }),
        acknowledgeRequests: (throughSequence: number) => { actor.acknowledgeEnvironmentRequests?.(throughSequence); },
        ...(target === null ? {} : { player: Object.freeze({
          id: "player", x: target.x, y: target.y, hw: target.hw, hh: target.hh,
          invulnerable: target.invulnerable, hazardDamageMultiplier: target.hazardDmgMult,
          takeDamage: (damage: number, sourceX: number, source: unknown) => {
            target.takeDamage(damage, sourceX, source as never);
          },
        }) }),
      });
    }));
}
