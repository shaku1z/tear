import type { EnvironmentRuntime } from "../environment-runtime";
import { createPaleEnvironmentFeature, type WhiteHartEnvironmentActor } from "../pale-environment-feature";
import type { WhiteHartEnvironmentRequest } from "../white-hart-route-runtime";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";
import { bindLiveContactTargets } from "./contact-target-actors";

/** Projects White Hart route intent into the existing world-owned environment runtime. */
export function bindLiveWhiteHartActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: BiomeActorEnemy) => string,
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  bindLiveContactTargets(environment, player, enemies, actorId);
  environment.setFeatureActorSource("pale", "white-hart", () =>
    enemies()
      .filter((enemy) => enemy.kind === "white-hart")
      .map((enemy): WhiteHartEnvironmentActor => {
        const actor = enemy as BiomeActorEnemy & {
          phase: 1 | 2 | 3;
          pendingEnvironmentRequests?: readonly WhiteHartEnvironmentRequest[];
          acknowledgeEnvironmentRequests?: (throughSequence: number) => void;
        };
        return Object.freeze({
          id: actorId(enemy),
          source: enemy,
          state: Object.freeze({ phase: actor.phase, requests: actor.pendingEnvironmentRequests ?? Object.freeze([]) }),
          acknowledgeRequests: (throughSequence: number) => {
            actor.acknowledgeEnvironmentRequests?.(throughSequence);
          },
        });
      }),
  );
}
