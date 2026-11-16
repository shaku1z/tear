import type { EnvironmentPoint, EnvironmentRuntimeState, EnvironmentTrackDirection } from "./environment-contracts";
import {
  assertAuroraTrackFieldState,
  createAuroraTrackFieldState,
  createGhostTrackRouteState,
  type GhostTrackRouteState,
} from "./aurora-track";

export type WhiteHartEnvironmentRequest = Readonly<{
  sequence: number;
  phase: 1 | 2 | 3;
}> &
  (
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

/**
 * Advances one persisted route's lifecycle on absolute ticks. Its contact damage (`damage`,
 * `threatening`, `hitActorIds`) is declared on the route and applied by the environment runtime.
 */
export function advanceGhostTrackRoute(route: GhostTrackRouteState, tick: number): GhostTrackRouteState {
  if (route.state === "warning" && tick - route.stateTick >= route.lifecycle.warningTicks)
    return Object.freeze({ ...route, state: "active", stateTick: tick });
  if (route.state === "active" && tick - route.stateTick >= route.lifecycle.activeTicks)
    return Object.freeze({ ...route, state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
  return route;
}

function retireOldest(
  values: readonly Readonly<{ id: string; state: string; stateTick: number }>[],
  maximum: number,
  retire: (id: string) => void,
): void {
  const live = values
    .filter((value) => value.state !== "expired" && value.state !== "destroyed")
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
    // Ended tracks leave through the environment's lifetime rule; retireOldest counts live ones only.
    const owned = environment.routes().filter((route) => route.ownerId === ownerId && route.kind === "ghost-track");
    retireOldest(owned, 3, (routeId) => {
      environment.removeRoute(routeId);
    });
    environment.addRoute(
      createGhostTrackRouteState({
        id,
        ownerId,
        direction: request.direction,
        width: request.width,
        points: request.points,
        startTick: tick,
        damage: request.damage,
        threatening: request.threatening,
        ...(request.sourceTrackId === undefined ? {} : { sourceTrackId: request.sourceTrackId }),
      }),
    );
    return id;
  }
  if (environment.fields().some((field) => field.id === id)) return id;
  const wakes = environment.fields().filter((field) => {
    if (field.ownerId !== ownerId || field.kind !== "aurora-track") return false;
    assertAuroraTrackFieldState(field);
    return field.variant === "boss-wake";
  });
  retireOldest(wakes, 3, (fieldId) => {
    environment.removeField(fieldId);
  });
  environment.addField(
    createAuroraTrackFieldState({
      id,
      ownerId,
      variant: "boss-wake",
      direction: request.direction,
      geometry: request.geometry,
      startTick: tick,
      patternId: request.patternId,
    }),
  );
  return id;
}
