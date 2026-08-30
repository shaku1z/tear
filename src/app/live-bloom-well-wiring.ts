import type { BloomWellActor } from "../gameplay/environment/bloom-well";
import { createVerdantEnvironmentFeature } from "../gameplay/environment/verdant-environment-feature";

interface BloomWellEntity { x: number; y: number; vx: number; vy: number; weight?: number; isBoss?: boolean; kind?: string; anchored?: boolean }

interface BloomWellEnvironment {
  addFeature(feature: ReturnType<typeof createVerdantEnvironmentFeature>): void;
  setFeatureActorSource(featureId: string, slot: string, source: () => readonly BloomWellActor[]): void;
}

/** Binds live mutable actors to the environment phase without exposing weapon routes. */
export function bindLiveBloomWellActors(
  environment: BloomWellEnvironment,
  player: () => BloomWellEntity,
  enemies: () => readonly BloomWellEntity[],
  actorId: (enemy: BloomWellEntity) => string,
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", "bloom-well", () => {
    const hero = player();
    const actors: BloomWellActor[] = [{
      id: "player", kind: "player", get x() { return hero.x; }, get y() { return hero.y; },
      get vx() { return hero.vx; }, set vx(value: number) { hero.vx = value; },
      get vy() { return hero.vy; }, set vy(value: number) { hero.vy = value; },
    }];
    for (const enemy of enemies()) actors.push({
      id: actorId(enemy), kind: "enemy", get x() { return enemy.x; }, get y() { return enemy.y; },
      get vx() { return enemy.vx; }, set vx(value: number) { enemy.vx = value; },
      get vy() { return enemy.vy; }, set vy(value: number) { enemy.vy = value; },
      ...(enemy.weight === undefined ? {} : { mass: enemy.weight }),
      ...(enemy.isBoss === undefined ? {} : { isBoss: enemy.isBoss }),
      isFlyer: enemy.kind === "flyer" || enemy.kind === "wraith",
      ...(enemy.anchored === undefined ? {} : { anchored: enemy.anchored }),
    });
    return actors;
  });
}
