import type {
  EnvironmentPoint, EnvironmentRuntimeState, EnvironmentTrackDirection,
} from "./environment-contracts";
import {
  createAuroraTrackFieldState, createGhostTrackRouteState, type GhostTrackRouteState,
} from "./aurora-track";

export type WhiteHartEnvironmentRequest = Readonly<{
  sequence: number;
  phase: 1 | 2 | 3;
}> & (
  | Readonly<{
    kind: "ghost-track";
    points: readonly EnvironmentPoint[];
    direction: EnvironmentTrackDirection;
    width: number;
    damage: number;
    threatening: boolean;
    sourceTrackId?: string | null;
  }>
  | Readonly<{
    kind: "boss-wake";
    geometry: Readonly<{ x: number; y: number; w: number; h: number }>;
    direction: EnvironmentTrackDirection;
    patternId: string;
  }>
);

export interface WhiteHartRouteTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly invulnerable: boolean;
  readonly hazardDamageMultiplier: number;
  readonly takeDamage: (damage: number, sourceX: number, source: unknown) => void;
}

export interface GhostTrackAdvanceResult {
  readonly route: GhostTrackRouteState;
  readonly hit: boolean;
}

function pointSegmentDistance(
  pointX: number, pointY: number, start: EnvironmentPoint, end: EnvironmentPoint,
): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(pointX - start.x, pointY - start.y);
  const amount = Math.max(0, Math.min(1, ((pointX - start.x) * dx + (pointY - start.y) * dy) / lengthSquared));
  return Math.hypot(pointX - (start.x + dx * amount), pointY - (start.y + dy * amount));
}

function routeTouchesTarget(route: GhostTrackRouteState, target: WhiteHartRouteTarget): boolean {
  const reach = route.width / 2 + Math.max(target.hw, target.hh);
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1], end = route.points[index];
    if (start !== undefined && end !== undefined
      && pointSegmentDistance(target.x, target.y, start, end) <= reach) return true;
  }
  return false;
}

/** Advances one persisted route without renderer or actor-owned clocks. */
export function advanceGhostTrackRoute(
  route: GhostTrackRouteState,
  tick: number,
  target?: WhiteHartRouteTarget,
): GhostTrackAdvanceResult {
  if (route.state === "expired" || route.state === "destroyed") return Object.freeze({ route, hit: false });
  let next = route;
  if (route.state === "warning" && tick - route.stateTick >= route.lifecycle.warningTicks) {
    next = Object.freeze({ ...route, state: "active", stateTick: tick });
  } else if (route.state === "active" && tick - route.stateTick >= route.lifecycle.activeTicks) {
    next = Object.freeze({ ...route, state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
  }
  if (next.state !== "active" || !next.threatening || target === undefined || target.invulnerable
    || next.hitActorIds.includes(target.id) || !routeTouchesTarget(next, target)) {
    return Object.freeze({ route: next, hit: false });
  }
  return Object.freeze({
    route: Object.freeze({ ...next, hitActorIds: Object.freeze([...next.hitActorIds, target.id]) }),
    hit: true,
  });
}

function retireOldest(
  values: readonly Readonly<{ id: string; state: string; stateTick: number }>[],
  maximum: number, retire: (id: string) => void,
): void {
  const live = values.filter((value) => value.state !== "expired" && value.state !== "destroyed")
    .sort((left, right) => left.stateTick - right.stateTick || left.id.localeCompare(right.id));
  while (live.length >= maximum) {
    const oldest = live.shift();
    if (oldest !== undefined) retire(oldest.id);
  }
}

/** Installs one actor request into the shared bounded environment collections. */
export function installWhiteHartEnvironmentRequest(
  environment: EnvironmentRuntimeState,
  ownerId: string,
  request: WhiteHartEnvironmentRequest,
  tick: number,
): string {
  const id = `${ownerId}:p${String(request.phase)}:${request.kind}:${String(request.sequence)}`;
  if (request.kind === "ghost-track") {
    if (environment.routes().some((route) => route.id === id)) return id;
    for (const route of environment.routes().filter((entry) => entry.ownerId === ownerId
      && entry.kind === "ghost-track" && (entry.state === "expired" || entry.state === "destroyed"))) {
      environment.removeRoute(route.id);
    }
    const owned = environment.routes().filter((route) => route.ownerId === ownerId && route.kind === "ghost-track");
    retireOldest(owned, 3, (routeId) => { environment.removeRoute(routeId); });
    environment.addRoute(createGhostTrackRouteState({
      id, ownerId, direction: request.direction, width: request.width, points: request.points,
      startTick: tick, damage: request.damage, threatening: request.threatening,
      ...(request.sourceTrackId === undefined ? {} : { sourceTrackId: request.sourceTrackId }),
    }));
    return id;
  }
  if (environment.fields().some((field) => field.id === id)) return id;
  for (const field of environment.fields().filter((entry) => entry.ownerId === ownerId
    && entry.kind === "aurora-track" && entry.variant === "boss-wake"
    && (entry.state === "expired" || entry.state === "destroyed"))) environment.removeField(field.id);
  const owned = environment.fields().filter((field) => field.ownerId === ownerId
    && field.kind === "aurora-track" && field.variant === "boss-wake");
  retireOldest(owned, 3, (fieldId) => { environment.removeField(fieldId); });
  environment.addField(createAuroraTrackFieldState({
    id, ownerId, variant: "boss-wake", direction: request.direction,
    geometry: request.geometry, startTick: tick, patternId: request.patternId,
  }));
  return id;
}
