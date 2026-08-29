import { ROOTBOUND_ROOTLINE, type RootboundRootlineStage } from "../gameplay/entities/enemy-types/rootbound";
import type { EnvironmentRuntime } from "../gameplay/environment/environment-runtime";
import { createVerdantEnvironmentFeature, type RootboundEnvironmentActor } from "../gameplay/environment/verdant-environment-feature";
import type { GameEnemy, GamePlayer } from "./game-runtime-state";
import { CONFIG } from "../config/game-config";

/** Projects Rootbound attack intent into the world-owned environment phase. */
export function bindLiveRootboundActors(
  environment: EnvironmentRuntime,
  player: () => GamePlayer | null,
  enemies: () => readonly GameEnemy[],
  actorId: (enemy: GameEnemy) => string,
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", "rootbound", () => enemies().filter((enemy) => enemy.kind === "rootbound").map((enemy): RootboundEnvironmentActor => {
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
      phase: number;
      regrowthState: NonNullable<RootboundEnvironmentActor["state"]["regrowth"]>;
      beginRegrowth?: NonNullable<RootboundEnvironmentActor["beginRegrowth"]>;
      advanceRegrowth?: NonNullable<RootboundEnvironmentActor["advanceRegrowth"]>;
    };
    const id = actorId(enemy);
    const target = player();
    return Object.freeze({
      id,
      source: enemy,
      applyGraftEffects: (effects: Parameters<NonNullable<RootboundEnvironmentActor["applyGraftEffects"]>>[0]) => { actor.applyGraftEffects?.(effects); },
      recoverGraftHealth: (fraction: number) => actor.recoverGraftHealth?.(fraction) ?? 0,
      completeRootCage: () => { actor.completeRootCage?.(); },
      beginRegrowth: (startTick: number, connectionIds: readonly string[]) => actor.beginRegrowth?.(startTick, connectionIds) ?? false,
      advanceRegrowth: (tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken = false) => actor.advanceRegrowth?.(tick, activeConnectionIds, bossChannelBroken)
        ?? actor.regrowthState,
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
        phase: actor.phase,
        regrowth: actor.regrowthState,
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
