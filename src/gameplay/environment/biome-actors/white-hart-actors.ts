import type { EnvironmentRuntime } from "../environment-runtime";
import {
  createPaleEnvironmentFeature,
  type WhiteHartEnvironmentActor,
} from "../pale-environment-feature";
import type { WhiteHartEnvironmentRequest } from "../white-hart-route-runtime";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";

/** Projects White Hart route intent into the existing world-owned environment runtime. */
export function bindLiveWhiteHartActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: BiomeActorEnemy) => string,
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  environment.setFeatureActorSource("pale", "white-hart", () =>
    enemies()
      .filter((enemy) => enemy.kind === "white-hart")
      .map((enemy): WhiteHartEnvironmentActor => {
        const actor = enemy as BiomeActorEnemy & {
          phase: 1 | 2 | 3;
          pendingEnvironmentRequests?: readonly WhiteHartEnvironmentRequest[];
          acknowledgeEnvironmentRequests?: (throughSequence: number) => void;
        };
        const target = player();
        return Object.freeze({
          id: actorId(enemy),
          source: enemy,
          state: Object.freeze({ phase: actor.phase, requests: actor.pendingEnvironmentRequests ?? Object.freeze([]) }),
          acknowledgeRequests: (throughSequence: number) => {
            actor.acknowledgeEnvironmentRequests?.(throughSequence);
          },
          ...(target === null
            ? {}
            : {
                player: Object.freeze({
                  id: "player",
                  x: target.x,
                  y: target.y,
                  hw: target.hw,
                  hh: target.hh,
                  invulnerable: target.invulnerable,
                  hazardDamageMultiplier: target.hazardDmgMult,
                  takeDamage: (damage: number, sourceX: number, source: unknown) => {
                    target.takeDamage(damage, sourceX, source as never);
                  },
                }),
              }),
        });
      }),
  );
}
