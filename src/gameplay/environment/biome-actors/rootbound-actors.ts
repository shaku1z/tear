import type { EnvironmentRuntime } from "../environment-runtime";
import { createVerdantEnvironmentFeature, type RootboundEnvironmentActor } from "../verdant-environment-feature";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";
import type { CONFIG } from "../../../config/game-config";
import { bindLiveBloomWellActors } from "./bloom-well-actors";
import { bindLiveRootbinderActors } from "./rootbinder-actors";
import { bindLiveContactTargets } from "./contact-target-actors";

/**
 * Binds every Verdant actor source (Bloom Wells, Rootbinders, the Rootbound) in one place,
 * so live play and the production replay simulation cannot drift apart.
 */
export function bindLiveVerdantActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: object) => string,
  config: typeof CONFIG,
): void {
  bindLiveBloomWellActors(environment, player, enemies, actorId);
  bindLiveRootbinderActors(environment, player, enemies, actorId);
  bindLiveRootboundActors(environment, player, enemies, actorId, config);
}

/** Projects Rootbound attack intent into the world-owned environment phase. */
export function bindLiveRootboundActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly BiomeActorEnemy[],
  actorId: (enemy: BiomeActorEnemy) => string,
  config: typeof CONFIG,
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  bindLiveContactTargets(environment, player, enemies, actorId);
  environment.setFeatureActorSource("verdant", "rootbound", () =>
    enemies()
      .filter((enemy) => enemy.kind === "rootbound")
      .map((enemy): RootboundEnvironmentActor => {
        const actor = enemy as BiomeActorEnemy & {
          graftAnchorPlacements?: () => NonNullable<RootboundEnvironmentActor["state"]["graftPlacements"]>;
          plantedGraftTypes?: readonly string[];
          plantedBloomPattern?: RootboundEnvironmentActor["state"]["plantedBloomPattern"];
          acknowledgeBloomPattern?: NonNullable<RootboundEnvironmentActor["acknowledgeBloomPattern"]>;
          acknowledgeGraftPlanted?: NonNullable<RootboundEnvironmentActor["acknowledgeGraftPlanted"]>;
          applyGraftEffects?: NonNullable<RootboundEnvironmentActor["applyGraftEffects"]>;
          recoverGraftHealth?: NonNullable<RootboundEnvironmentActor["recoverGraftHealth"]>;
          bossBloomPattern?: () => NonNullable<RootboundEnvironmentActor["state"]["bloomPattern"]>;
          rootCagePlacement?: () => NonNullable<RootboundEnvironmentActor["state"]["rootCagePlacement"]> | null;
          completeRootCage?: NonNullable<RootboundEnvironmentActor["completeRootCage"]>;
          phase: number;
          regrowthState: NonNullable<RootboundEnvironmentActor["state"]["regrowth"]>;
          beginRegrowth?: NonNullable<RootboundEnvironmentActor["beginRegrowth"]>;
          advanceRegrowth?: NonNullable<RootboundEnvironmentActor["advanceRegrowth"]>;
          regrowthChannelBroken?: () => boolean;
        };
        const id = actorId(enemy);
        const target = player();
        return Object.freeze({
          id,
          source: enemy,
          applyGraftEffects: (effects: Parameters<NonNullable<RootboundEnvironmentActor["applyGraftEffects"]>>[0]) => {
            actor.applyGraftEffects?.(effects);
          },
          recoverGraftHealth: (fraction: number) => actor.recoverGraftHealth?.(fraction) ?? 0,
          completeRootCage: () => {
            actor.completeRootCage?.();
          },
          acknowledgeGraftPlanted: (graftType: string) => {
            actor.acknowledgeGraftPlanted?.(graftType);
          },
          acknowledgeBloomPattern: (
            patternId: Parameters<NonNullable<RootboundEnvironmentActor["acknowledgeBloomPattern"]>>[0],
          ) => {
            actor.acknowledgeBloomPattern?.(patternId);
          },
          beginRegrowth: (startTick: number, connectionIds: readonly string[]) =>
            actor.beginRegrowth?.(startTick, connectionIds) ?? false,
          advanceRegrowth: (tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken = false) =>
            actor.advanceRegrowth?.(
              tick,
              activeConnectionIds,
              bossChannelBroken || actor.regrowthChannelBroken?.() === true,
            ) ?? actor.regrowthState,
          state: Object.freeze({
            graftPlacements: actor.graftAnchorPlacements?.() ?? Object.freeze([]),
            plantedGraftTypes: actor.plantedGraftTypes ?? Object.freeze([]),
            ownerPosition: Object.freeze({ x: enemy.x, y: enemy.y }),
            bloomPattern: actor.bossBloomPattern?.() ?? null,
            plantedBloomPattern: actor.plantedBloomPattern ?? null,
            rootCagePlacement: actor.rootCagePlacement?.() ?? null,
            arena: Object.freeze({ width: config.view.w, groundY: config.world.groundY }),
            phase: actor.phase,
            regrowth: actor.regrowthState,
          }),
          ...(target === null
            ? {}
            : {
                player: Object.freeze({
                  x: target.x,
                  y: target.y,
                  vx: target.vx,
                  hw: target.hw,
                  hh: target.hh,
                  applyCageConstraint: (x: number, vx: number) => {
                    target.x = x;
                    target.vx = vx;
                  },
                }),
              }),
        });
      }),
  );
}
