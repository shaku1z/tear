import type {
  TearSimulationPlayerView,
  TearSimulationProjectileView,
} from "../simulation/runtime-world-port";
import type { TearObservedActorV1 } from "./contracts";
import { projectLiveProjectileMechanics } from "./live-observation-actors";
import type { TearRuntimeAccessClass } from "./live-runtime-contracts";

type TearLiveProjectileSource = TearSimulationProjectileView & Readonly<{
  playerOwned?: unknown;
  ownerId?: unknown;
  sourceEnemyId?: unknown;
}>;

export type TearProjectileOwnerResolver = (projectile: TearLiveProjectileSource) => string | undefined;

function projectileOwnerId(projectile: TearLiveProjectileSource,
  resolveOwnerId: TearProjectileOwnerResolver | undefined): string | undefined {
  if (projectile.playerOwned === true) return "player";
  const ownerId = resolveOwnerId?.(projectile);
  return typeof ownerId === "string" && ownerId.length > 0 ? ownerId : undefined;
}

function projectileThreat(projectile: TearSimulationProjectileView, player: TearSimulationPlayerView): number {
  const dx = player.x - projectile.x;
  const dy = player.y - projectile.y;
  const speedSquared = projectile.vx * projectile.vx + projectile.vy * projectile.vy;
  const closing = speedSquared > 0
    ? Math.max(0, (dx * projectile.vx + dy * projectile.vy) / Math.sqrt(speedSquared))
    : 0;
  const distance = Math.hypot(dx, dy);
  const proximity = Math.max(0, 1 - distance / 520);
  return Math.min(1, proximity * 0.55 + Math.min(1, closing / 520) * 0.45);
}

export function projectLiveProjectiles(
  projectiles: readonly TearLiveProjectileSource[],
  player: TearSimulationPlayerView,
  accessClass: TearRuntimeAccessClass,
  resolveOwnerId?: TearProjectileOwnerResolver,
): readonly TearObservedActorV1[] {
  return Object.freeze(projectiles.flatMap((projectile, index) => {
    if (projectile.dead || projectile.deflected || projectile.harmless) return [];
    const family = projectile.family ?? "ordinaryProjectile";
    const ownerId = projectileOwnerId(projectile, resolveOwnerId);
    return [Object.freeze({
      id: `projectile:${String(index)}`,
      kind: "projectile" as const,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      hpRatio: 1,
      state: `${family}:${projectile.counterplay ?? "deflect"}`,
      ...projectLiveProjectileMechanics(projectile, accessClass),
      threat: projectileThreat(projectile, player),
      ...(ownerId === undefined ? {} : { ownerId }),
    })];
  }));
}
