import type { AuroraTrackActor } from "../aurora-track-runtime";
import { fieldEnemyClass } from "../field-runtime";
import { createPaleEnvironmentFeature } from "../pale-environment-feature";

interface DirectionInput {
  right(): boolean;
  left(): boolean;
}
export interface LiveAuroraPlayer {
  x: number;
  y: number;
  vx: number;
  fieldSpeed: number;
  aiInput?: DirectionInput;
}
export interface LiveAuroraEnemy {
  x: number;
  y: number;
  vx: number;
  fieldSpeed: number;
  weight?: number;
  isBoss?: boolean;
  anchored?: boolean;
  flies?: boolean;
  onAuroraTrackInfluence?(direction: -1 | 1, onTrack: boolean): void;
}
interface AuroraEnvironment {
  addFeature(feature: ReturnType<typeof createPaleEnvironmentFeature>): void;
  setFeatureActorSource(featureId: string, slot: string, source: () => readonly AuroraTrackActor[]): void;
}

/**
 * Hands the roads the live player and enemies. The player means to go where its input points; an enemy means
 * to go where it is going. An enemy that is held or flies is marked so, and the road leaves it alone.
 * A world has no player until a run places one (the environment is cleared before that), so none is handed on.
 */
export function bindLiveAuroraTrackActors(
  environment: AuroraEnvironment,
  player: () => LiveAuroraPlayer | null | undefined,
  enemies: () => readonly LiveAuroraEnemy[],
  actorId: (enemy: LiveAuroraEnemy) => string,
): void {
  environment.addFeature(createPaleEnvironmentFeature());
  environment.setFeatureActorSource("pale", "aurora-track", () => {
    const hero = player();
    const actors: AuroraTrackActor[] = [];
    if (hero !== null && hero !== undefined) {
      const input = hero.aiInput;
      actors.push({
        id: "player",
        kind: "player",
        get x() {
          return hero.x;
        },
        get y() {
          return hero.y;
        },
        get vx() {
          return hero.vx;
        },
        get intentX() {
          return input === undefined ? 0 : (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
        },
        get fieldSpeed() {
          return hero.fieldSpeed;
        },
        set fieldSpeed(value: number) {
          hero.fieldSpeed = value;
        },
      });
    }
    for (const enemy of enemies())
      actors.push({
        id: actorId(enemy),
        kind: fieldEnemyClass(enemy),
        held: enemy.anchored === true || enemy.flies === true,
        get x() {
          return enemy.x;
        },
        get y() {
          return enemy.y;
        },
        get vx() {
          return enemy.vx;
        },
        get intentX() {
          return Math.sign(enemy.vx);
        },
        get fieldSpeed() {
          return enemy.fieldSpeed;
        },
        set fieldSpeed(value: number) {
          enemy.fieldSpeed = value;
        },
        onInfluenced: (direction, onTrack) => enemy.onAuroraTrackInfluence?.(direction, onTrack),
      });
    return actors;
  });
}
