import type {
  EnvironmentFieldState,
  EnvironmentGeometry,
  EnvironmentPoint,
  EnvironmentRouteState,
  EnvironmentTrackDirection,
  EnvironmentTrackLifecycle,
  EnvironmentObjectValidationPort,
} from "./environment-contracts";
import { isRecord } from "../../domain/records";
import type { FieldEnemyClass } from "./field-runtime";

export type AuroraTrackVariant = "stage" | "boss-wake";
export type GhostTrackVariant = "ghost";
export type AuroraTrackTarget = "player" | FieldEnemyClass;

/**
 * An Aurora Track is a road of light lying on a surface. Whoever travels its way on it may go faster
 * than they otherwise can; standing on it, crossing it or going against it changes nothing.
 *
 * `topSpeed` is the multiplier on top speed at full share. `targets` is who a road carries and with what
 * share of the raise: the one place that decides it. Held and flying enemies are never carried, whatever
 * their row. After leaving the road the raise fades to nothing over `carryTicks`, while the traveller keeps
 * going the road's way.
 */
export const AURORA_TRACK_TRAVEL = Object.freeze({
  topSpeed: 1.5,
  carryTicks: 48,
  targets: Object.freeze({
    player: 1,
    "light-enemy": 1,
    "heavy-enemy": 0.35,
    boss: 0,
  } satisfies Readonly<Record<AuroraTrackTarget, number>>),
});

/** A road's box rises this far above the surface it lies on, so whoever stands on the surface is on the road. */
export const AURORA_TRACK_HEIGHT = 70;

/** Warning, awake and asleep, in ticks. A stage's road wakes again for the whole stage; a boss's wake runs once. */
export const AURORA_TRACK_TIMING: Readonly<Record<AuroraTrackVariant, EnvironmentTrackLifecycle>> = Object.freeze({
  stage: Object.freeze({ warningTicks: 72, activeTicks: 360, cooldownTicks: 480 }),
  "boss-wake": Object.freeze({ warningTicks: 72, activeTicks: 300, cooldownTicks: 0 }),
});
export const AURORA_TRACK_RECURS: Readonly<Record<AuroraTrackVariant, boolean>> = Object.freeze({
  stage: true,
  "boss-wake": false,
});

export const GHOST_TRACK_DEFINITION = Object.freeze({
  id: "ghost" as const,
  ownership: "boss" as const,
  maximumConcurrent: 3,
  lifecycle: Object.freeze({ warningTicks: 72, activeTicks: 60, cooldownTicks: 0 }),
});

/** Who is still being carried by a road, and for how many more ticks once off it. */
export interface AuroraTrackCarryState {
  readonly actorId: string;
  readonly direction: EnvironmentTrackDirection;
  readonly remainingTicks: number;
}

function positiveSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive safe integer`);
}
function nonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative safe integer`);
}
function assertDirection(direction: unknown): asserts direction is EnvironmentTrackDirection {
  if (direction !== -1 && direction !== 1) throw new RangeError("track direction must be -1 or 1");
}
function assertLifecycle(value: EnvironmentTrackLifecycle): void {
  positiveSafeInteger(value.warningTicks, "track warningTicks");
  positiveSafeInteger(value.activeTicks, "track activeTicks");
  nonNegativeSafeInteger(value.cooldownTicks, "track cooldownTicks");
}
function assertPoints(points: readonly EnvironmentPoint[]): void {
  if (points.length < 2 || points.length > 32)
    throw new RangeError("track points must contain between 2 and 32 points");
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)))
    throw new TypeError("track points must be finite");
}

export type AuroraTrackFieldState = EnvironmentFieldState &
  Readonly<{
    kind: "aurora-track";
    trackId: string;
    variant: AuroraTrackVariant;
    direction: EnvironmentTrackDirection;
    /** The first tick of its first cycle; a later start is how roads are set to alternate. */
    startTick: number;
    lifecycle: EnvironmentTrackLifecycle;
    carryStates: readonly AuroraTrackCarryState[];
  }>;
export type GhostTrackRouteState = EnvironmentRouteState &
  Readonly<{
    kind: "ghost-track";
    variant: "ghost";
    direction: EnvironmentTrackDirection;
    width: number;
    lifecycle: EnvironmentTrackLifecycle;
    maximumConcurrent: 3;
    damage: number;
    threatening: boolean;
    hitActorIds: readonly string[];
    sourceTrackId: string | null;
  }>;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function assertAuroraTrackFieldState(value: EnvironmentFieldState): asserts value is AuroraTrackFieldState {
  if (value.kind !== "aurora-track") return;
  const candidate = value as EnvironmentFieldState & Partial<AuroraTrackFieldState>;
  if (typeof candidate.trackId !== "string" || candidate.trackId.length === 0)
    throw new TypeError("Aurora Track requires a stable trackId");
  if (candidate.variant !== "stage" && candidate.variant !== "boss-wake")
    throw new TypeError("Aurora Track variant is not approved");
  assertDirection(candidate.direction);
  nonNegativeSafeInteger(candidate.startTick, "Aurora Track startTick");
  if (candidate.lifecycle === undefined) throw new TypeError("Aurora Track lifecycle is required");
  assertLifecycle(candidate.lifecycle);
  const timing = AURORA_TRACK_TIMING[candidate.variant];
  for (const key of ["warningTicks", "activeTicks", "cooldownTicks"] as const)
    if (candidate.lifecycle[key] !== timing[key])
      throw new RangeError(`Aurora Track ${key} does not match its variant definition`);
  const carryStates: unknown = candidate.carryStates;
  if (!isUnknownArray(carryStates)) throw new TypeError("Aurora Track carryStates must be an array");
  const carryIds = new Set<string>();
  for (const carry of carryStates) {
    if (!isRecord(carry)) throw new TypeError("Aurora Track carry state must be an object");
    const actorId = carry.actorId,
      direction = carry.direction,
      remainingTicks = carry.remainingTicks;
    if (typeof actorId !== "string" || actorId.length === 0)
      throw new TypeError("Aurora Track carry actorId must be stable");
    if (carryIds.has(actorId)) throw new TypeError(`duplicate Aurora Track carry actorId: ${actorId}`);
    carryIds.add(actorId);
    assertDirection(direction);
    positiveSafeInteger(remainingTicks, "Aurora Track carry remainingTicks");
    if (remainingTicks > AURORA_TRACK_TRAVEL.carryTicks) throw new RangeError("Aurora Track carry exceeds carryTicks");
  }
}

export function assertGhostTrackRouteState(value: EnvironmentRouteState): asserts value is GhostTrackRouteState {
  if (value.kind !== "ghost-track") return;
  const candidate = value as EnvironmentRouteState & Partial<GhostTrackRouteState>;
  if (candidate.variant !== "ghost") throw new TypeError("Ghost Track variant is not approved");
  assertDirection(candidate.direction);
  assertPoints(value.points);
  if (!(Number.isFinite(candidate.width) && Number(candidate.width) > 0))
    throw new RangeError("Ghost Track width must be finite and positive");
  if (candidate.lifecycle === undefined) throw new TypeError("Ghost Track lifecycle is required");
  assertLifecycle(candidate.lifecycle);
  if (candidate.maximumConcurrent !== 3) throw new RangeError("Ghost Track maximumConcurrent must remain three");
  const damage = candidate.damage;
  if (!(typeof damage === "number" && Number.isFinite(damage) && damage >= 0))
    throw new RangeError("Ghost Track damage must be finite and non-negative");
  if (typeof candidate.threatening !== "boolean") throw new TypeError("Ghost Track threatening state is required");
  if (
    !Array.isArray(candidate.hitActorIds) ||
    candidate.hitActorIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(candidate.hitActorIds).size !== candidate.hitActorIds.length
  )
    throw new TypeError("Ghost Track hit actor IDs must be unique stable IDs");
}

/** Pale-only validation installed beside Pale behavior at composition. */
export const PALE_TRACK_VALIDATION: EnvironmentObjectValidationPort = Object.freeze({
  id: "pale-tracks",
  validateField: assertAuroraTrackFieldState,
  validateRoute: assertGhostTrackRouteState,
});

/** The box of a road lying on a surface: the stretch of surface, from its top up `AURORA_TRACK_HEIGHT`. */
export function auroraTrackGeometryOn(
  surface: Readonly<{ x: number; y: number; w: number }>,
): Readonly<EnvironmentGeometry> {
  return Object.freeze({ x: surface.x, y: surface.y - AURORA_TRACK_HEIGHT, w: surface.w, h: AURORA_TRACK_HEIGHT });
}

export function createAuroraTrackFieldState(
  input: Readonly<{
    id: string;
    ownerId: string;
    variant: AuroraTrackVariant;
    direction: EnvironmentTrackDirection;
    geometry: EnvironmentGeometry;
    startTick: number;
    patternId?: string;
  }>,
): AuroraTrackFieldState {
  const targets = AURORA_TRACK_TRAVEL.targets;
  const value = Object.freeze({
    id: input.id,
    factoryId: "aurora-track",
    kind: "aurora-track",
    geometry: input.geometry,
    state: "warning",
    stateTick: input.startTick,
    timer: 0,
    ownerId: input.ownerId,
    schedule: null,
    eligibility: Object.freeze({
      player: targets.player > 0,
      enemies: targets["light-enemy"] > 0 || targets["heavy-enemy"] > 0,
      bosses: targets.boss > 0,
    }),
    force: null,
    cleanupReason: null,
    trackId: input.id,
    variant: input.variant,
    direction: input.direction,
    startTick: input.startTick,
    lifecycle: AURORA_TRACK_TIMING[input.variant],
    carryStates: Object.freeze([]),
    ...(input.patternId === undefined ? {} : { patternId: input.patternId }),
  } as const satisfies AuroraTrackFieldState);
  assertAuroraTrackFieldState(value);
  return value;
}

export function createGhostTrackRouteState(
  input: Readonly<{
    id: string;
    ownerId: string;
    direction: EnvironmentTrackDirection;
    width: number;
    points: readonly EnvironmentPoint[];
    startTick: number;
    sourceTrackId?: string | null;
    damage?: number;
    threatening?: boolean;
  }>,
): GhostTrackRouteState {
  const value = Object.freeze({
    id: input.id,
    factoryId: "ghost-track",
    kind: "ghost-track",
    points: Object.freeze(input.points.map((point) => Object.freeze({ ...point }))),
    state: "warning",
    stateTick: input.startTick,
    ownerId: input.ownerId,
    cleanupReason: null,
    variant: "ghost",
    direction: input.direction,
    width: input.width,
    lifecycle: GHOST_TRACK_DEFINITION.lifecycle,
    sourceTrackId: input.sourceTrackId ?? null,
    maximumConcurrent: 3,
    damage: input.damage ?? 16,
    threatening: input.threatening ?? true,
    hitActorIds: Object.freeze([]),
  } as const satisfies GhostTrackRouteState);
  assertGhostTrackRouteState(value);
  return value;
}
