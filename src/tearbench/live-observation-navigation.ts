import type {
  TearNavigationObservationV1,
  TearObservedBoundsV1,
  TearObservedHazardV1,
  TearObservedSurfaceV1,
} from "./contracts";
import type { LiveObservationPlatform } from "./live-runtime-contracts";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`live ${label} must be finite`);
  return value;
}

function bounds(x: number, y: number, w: number, h: number): TearObservedBoundsV1 {
  const left = finite(x, "platform x"), top = finite(y, "platform y");
  const width = finite(w, "platform width"), height = finite(h, "platform height");
  if (width < 0 || height < 0) throw new RangeError("live platform dimensions must be non-negative");
  return Object.freeze({ minX: left, maxX: left + width, minY: top, maxY: top + height });
}

function geometryId(stage: string, platform: LiveObservationPlatform): string {
  const encoded = [platform.x, platform.y, platform.w, platform.h].map((value) =>
    Number.isInteger(value) ? String(value) : value.toFixed(3)).join(":");
  return `surface:${stage.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-")}:${encoded}`;
}

function surfaceId(stage: string, platform: LiveObservationPlatform): string {
  const authored = platform.platformId ?? platform.id;
  return typeof authored === "string" && authored.length > 0 ? authored : geometryId(stage, platform);
}

function hazardBounds(platform: LiveObservationPlatform): TearObservedBoundsV1 {
  const cage = platform.voidType === "cage" ? platform.cageRect : null;
  return cage === null || cage === undefined
    ? bounds(platform.x, platform.y, platform.w, platform.h)
    : bounds(cage.x, cage.y, cage.w, cage.h);
}

function hazardState(platform: LiveObservationPlatform): Readonly<{ state: string; active: boolean }> {
  if (platform.voidType === "fire") {
    return Object.freeze({ state: platform.fireState ?? (platform.fireOn ? "hot" : "cold"),
      active: platform.fireOn === true });
  }
  if (platform.voidType === "crumble") {
    const state = platform.materializationState ?? (typeof platform.touchT === "number" && platform.touchT >= 0
      ? "cracking" : "stable");
    return Object.freeze({ state, active: state === "cracking" || state === "gone" });
  }
  return Object.freeze({ state: platform.materializationState ?? "active",
    active: platform.materializationState !== "gone" });
}

/**
 * Projects immutable navigation telemetry from host-owned live geometry.
 * This is observation only: it neither mutates the stage nor derives hidden routes.
 */
export function projectLiveNavigationObservation(
  platforms: readonly LiveObservationPlatform[],
  stage: string,
): TearNavigationObservationV1 {
  const surfaces: TearObservedSurfaceV1[] = [];
  const hazards: TearObservedHazardV1[] = [];
  const ids = new Set<string>();
  for (const platform of platforms) {
    const id = surfaceId(stage, platform);
    if (ids.has(id)) throw new RangeError(`duplicate live platform observation id: ${id}`);
    ids.add(id);
    surfaces.push(Object.freeze({
      id,
      bounds: bounds(platform.x, platform.y, platform.w, platform.h),
      oneWay: platform.oneway === true,
      collidable: platform.collidable !== false && platform.materializationState !== "gone",
      materializationState: platform.materializationState ?? "active",
      ...(platform.voidLane === undefined ? {} : { lane: platform.voidLane }),
      ...(platform.voidRole === undefined ? {} : { role: platform.voidRole }),
      ...(platform.transferNode === undefined ? {} : { transferNode: platform.transferNode }),
      connectionIds: Object.freeze([...(platform.connectionIds ?? [])]),
    }));
    if (platform.voidType === undefined || platform.voidType === "plain") continue;
    const projectedState = hazardState(platform);
    hazards.push(Object.freeze({
      id: `hazard:${id}`,
      surfaceId: id,
      type: platform.voidType,
      state: projectedState.state,
      active: projectedState.active,
      bounds: hazardBounds(platform),
    }));
  }
  return Object.freeze({ surfaces: Object.freeze(surfaces), hazards: Object.freeze(hazards) });
}
