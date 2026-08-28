import { ROOTBOUND_ROOTLINE, type RootboundRootlineStage } from "../gameplay/entities/enemy-types/rootbound";
import type { EnvironmentRuntime, RootboundEnvironmentActor } from "../gameplay/environment/environment-runtime";
import type { GameEnemy, GamePlayer } from "./game-runtime-state";
import { CONFIG } from "../config/game-config";

/** Projects Rootbound attack intent into the world-owned environment phase. */
export function bindLiveRootboundActors(
  environment: EnvironmentRuntime,
  player: () => GamePlayer | null,
  enemies: () => readonly GameEnemy[],
  actorId: (enemy: GameEnemy) => string,
): void {
  environment.setRootboundActorsSource(() => enemies().filter((enemy) => enemy.kind === "rootbound").map((enemy): RootboundEnvironmentActor => {
    const actor = enemy as GameEnemy & {
      rootlineStage?: RootboundRootlineStage | null;
      rootlineCleanupReason?: "natural-expiry" | "stage-transition" | null;
      rootlineGeometry?: () => Readonly<{ x: number; y: number; w: number; h: number }>;
      graftAnchorPlacements?: () => NonNullable<RootboundEnvironmentActor["state"]["graftPlacements"]>;
      applyGraftEffects?: NonNullable<RootboundEnvironmentActor["applyGraftEffects"]>;
      recoverGraftHealth?: NonNullable<RootboundEnvironmentActor["recoverGraftHealth"]>;
      bossBloomPattern?: () => NonNullable<RootboundEnvironmentActor["state"]["bloomPattern"]>;
      rootCagePlacement?: () => NonNullable<RootboundEnvironmentActor["state"]["rootCagePlacement"]> | null;
      completeRootCage?: NonNullable<RootboundEnvironmentActor["completeRootCage"]>;
    };
    const id = actorId(enemy);
    const target = player();
    return Object.freeze({
      id,
      source: enemy,
      applyGraftEffects: (effects: Parameters<NonNullable<RootboundEnvironmentActor["applyGraftEffects"]>>[0]) => { actor.applyGraftEffects?.(effects); },
      recoverGraftHealth: (fraction: number) => actor.recoverGraftHealth?.(fraction) ?? 0,
      completeRootCage: () => { actor.completeRootCage?.(); },
      state: Object.freeze({
        stage: actor.rootlineStage ?? null,
        geometry: actor.rootlineGeometry?.() ?? Object.freeze({ x: enemy.x, y: enemy.y, w: 0, h: 0 }),
        damage: ROOTBOUND_ROOTLINE.damage,
        cleanupReason: actor.rootlineCleanupReason ?? null,
        graftPlacements: actor.graftAnchorPlacements?.() ?? Object.freeze([]),
        ownerPosition: Object.freeze({ x: enemy.x, y: enemy.y }),
        bloomPattern: actor.bossBloomPattern?.() ?? null,
        rootCagePlacement: actor.rootCagePlacement?.() ?? null,
        arena: Object.freeze({ width: CONFIG.view.w, groundY: CONFIG.world.groundY }),
      }),
      ...(target === null ? {} : { player: Object.freeze({
        x: target.x, y: target.y, vx: target.vx, hw: target.hw, hh: target.hh,
        invulnerable: target.invulnerable, hazardDamageMultiplier: target.hazardDmgMult,
        takeDamage: (damage: number, sourceX: number, source: unknown) => { target.takeDamage(damage, sourceX, source as never); },
        applyCageConstraint: (x: number, vx: number) => { target.x = x; target.vx = vx; },
      }) }),
    });
  }));
}
