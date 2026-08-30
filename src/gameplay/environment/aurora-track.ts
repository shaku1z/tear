import type {
  EnvironmentFieldState, EnvironmentGeometry, EnvironmentPoint, EnvironmentRouteState,
  EnvironmentTrackDirection, EnvironmentTrackLifecycle,
  EnvironmentObjectValidationPort,
} from "./environment-contracts";

export type AuroraTrackVariant = "stage" | "boss-wake";
export type GhostTrackVariant = "ghost";
export interface AuroraTrackTransportEligibility {
  readonly player: boolean; readonly enemies: boolean; readonly bosses: boolean;
  readonly lightEnemies: boolean; readonly heavyEnemies: boolean; readonly thrownBlade: boolean;
  readonly deflectedProjectiles: boolean; readonly bossCharges: boolean;
}
export interface AuroraTrackMomentumPolicy {
  readonly accelerationMultiplier: number; readonly velocityRetention: number;
  readonly exitCarryTicks: number; readonly heavyInfluenceScale: number;
}
export interface AuroraTrackCarryState {
  readonly actorId: string; readonly direction: EnvironmentTrackDirection; readonly remainingTicks: number;
}

export interface AuroraTrackDefinition {
  readonly id: AuroraTrackVariant;
  readonly ownership: "stage" | "boss";
  readonly maximumConcurrent: number;
  readonly lifecycle: EnvironmentTrackLifecycle;
  readonly transportEligibility: AuroraTrackTransportEligibility;
  readonly momentum: AuroraTrackMomentumPolicy;
}

const TRANSPORT = Object.freeze({ player: true, enemies: true, bosses: true, lightEnemies: true,
  heavyEnemies: true, thrownBlade: true, deflectedProjectiles: true, bossCharges: true,
} as const satisfies AuroraTrackTransportEligibility);
const MOMENTUM = Object.freeze({ accelerationMultiplier: 1.35, velocityRetention: 0.92,
  exitCarryTicks: 48, heavyInfluenceScale: 0.35,
} as const satisfies AuroraTrackMomentumPolicy);

/** Provisional fixed-tick data; PT3-C2 may tune values without changing ownership. */
export const AURORA_TRACK_DEFINITIONS: Readonly<Record<AuroraTrackVariant, AuroraTrackDefinition>> = Object.freeze({
  stage: Object.freeze({ id: "stage", ownership: "stage", maximumConcurrent: 4,
    lifecycle: Object.freeze({ warningTicks: 72, activeTicks: 360, cooldownTicks: 480 }),
    transportEligibility: TRANSPORT, momentum: MOMENTUM }),
  "boss-wake": Object.freeze({ id: "boss-wake", ownership: "boss", maximumConcurrent: 3,
    lifecycle: Object.freeze({ warningTicks: 72, activeTicks: 300, cooldownTicks: 0 }),
    transportEligibility: TRANSPORT, momentum: Object.freeze({ ...MOMENTUM, exitCarryTicks: 42 }) }),
});

export const GHOST_TRACK_DEFINITION = Object.freeze({ id: "ghost" as const, ownership: "boss" as const,
  maximumConcurrent: 3, lifecycle: Object.freeze({ warningTicks: 72, activeTicks: 60, cooldownTicks: 0 }),
});

function positiveSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
}
function nonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
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
  if (points.length < 2 || points.length > 32) throw new RangeError("track points must contain between 2 and 32 points");
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) throw new TypeError("track points must be finite");
}

export type AuroraTrackFieldState = EnvironmentFieldState & Readonly<{
  kind: "aurora-track"; trackId: string; variant: AuroraTrackVariant; direction: EnvironmentTrackDirection;
  lifecycle: EnvironmentTrackLifecycle; transportEligibility: AuroraTrackTransportEligibility;
  momentum: AuroraTrackMomentumPolicy; maximumConcurrent: number;
  carryStates: readonly AuroraTrackCarryState[];
}>;
export type GhostTrackRouteState = EnvironmentRouteState & Readonly<{
  kind: "ghost-track"; variant: "ghost"; direction: EnvironmentTrackDirection; width: number;
  lifecycle: EnvironmentTrackLifecycle; maximumConcurrent: 3; damage: number; threatening: boolean;
  hitActorIds: readonly string[]; sourceTrackId: string | null;
}>;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function assertAuroraTrackFieldState(value: EnvironmentFieldState): asserts value is AuroraTrackFieldState {
  if (value.kind !== "aurora-track") return;
  const candidate = value as EnvironmentFieldState & Partial<AuroraTrackFieldState>;
  if (typeof candidate.trackId !== "string" || candidate.trackId.length === 0) throw new TypeError("Aurora Track requires a stable trackId");
  if (candidate.variant !== "stage" && candidate.variant !== "boss-wake") throw new TypeError("Aurora Track variant is not approved");
  assertDirection(candidate.direction);
  if (candidate.lifecycle === undefined) throw new TypeError("Aurora Track lifecycle is required");
  assertLifecycle(candidate.lifecycle);
  if (candidate.transportEligibility === undefined || candidate.momentum === undefined) throw new TypeError("Aurora Track transport data is required");
  const carryStates: unknown = candidate.carryStates;
  if (!isUnknownArray(carryStates)) throw new TypeError("Aurora Track carryStates must be an array");
  const carryIds = new Set<string>();
  for (const carry of carryStates) {
    if (!isUnknownRecord(carry)) throw new TypeError("Aurora Track carry state must be an object");
    const actorId = carry.actorId, direction = carry.direction, remainingTicks = carry.remainingTicks;
    if (typeof actorId !== "string" || actorId.length === 0) throw new TypeError("Aurora Track carry actorId must be stable");
    if (carryIds.has(actorId)) throw new TypeError(`duplicate Aurora Track carry actorId: ${actorId}`);
    carryIds.add(actorId);
    assertDirection(direction);
    positiveSafeInteger(remainingTicks, "Aurora Track carry remainingTicks");
    if (remainingTicks > candidate.momentum.exitCarryTicks) throw new RangeError("Aurora Track carry exceeds exitCarryTicks");
  }
  const definition = AURORA_TRACK_DEFINITIONS[candidate.variant];
  if (candidate.maximumConcurrent !== definition.maximumConcurrent) throw new RangeError("Aurora Track maximumConcurrent does not match its variant definition");
  for (const key of ["player", "enemies", "bosses", "lightEnemies", "heavyEnemies", "thrownBlade", "deflectedProjectiles", "bossCharges"] as const) {
    if (typeof candidate.transportEligibility[key] !== "boolean") throw new TypeError(`Aurora Track eligibility ${key} must be boolean`);
  }
  const momentum = candidate.momentum;
  if (!(Number.isFinite(momentum.accelerationMultiplier) && momentum.accelerationMultiplier >= 1)) throw new RangeError("Aurora Track acceleration multiplier must be finite and at least one");
  if (!(Number.isFinite(momentum.velocityRetention) && momentum.velocityRetention >= 0 && momentum.velocityRetention <= 1)) throw new RangeError("Aurora Track velocity retention must be within zero and one");
  nonNegativeSafeInteger(momentum.exitCarryTicks, "Aurora Track exit carry ticks");
  if (!(Number.isFinite(momentum.heavyInfluenceScale) && momentum.heavyInfluenceScale >= 0 && momentum.heavyInfluenceScale <= 1)) throw new RangeError("Aurora Track heavy influence scale must be within zero and one");
  for (const key of ["warningTicks", "activeTicks", "cooldownTicks"] as const) if (candidate.lifecycle[key] !== definition.lifecycle[key]) throw new RangeError(`Aurora Track ${key} does not match its variant definition`);
  for (const key of ["accelerationMultiplier", "velocityRetention", "exitCarryTicks", "heavyInfluenceScale"] as const) if (momentum[key] !== definition.momentum[key]) throw new RangeError(`Aurora Track momentum ${key} does not match its variant definition`);
  for (const key of ["player", "enemies", "bosses", "lightEnemies", "heavyEnemies", "thrownBlade", "deflectedProjectiles", "bossCharges"] as const) if (candidate.transportEligibility[key] !== definition.transportEligibility[key]) throw new TypeError(`Aurora Track eligibility ${key} does not match its variant definition`);
}

export function assertGhostTrackRouteState(value: EnvironmentRouteState): asserts value is GhostTrackRouteState {
  if (value.kind !== "ghost-track") return;
  const candidate = value as EnvironmentRouteState & Partial<GhostTrackRouteState>;
  if (candidate.variant !== "ghost") throw new TypeError("Ghost Track variant is not approved");
  assertDirection(candidate.direction);
  assertPoints(value.points);
  if (!(Number.isFinite(candidate.width) && Number(candidate.width) > 0)) throw new RangeError("Ghost Track width must be finite and positive");
  if (candidate.lifecycle === undefined) throw new TypeError("Ghost Track lifecycle is required");
  assertLifecycle(candidate.lifecycle);
  if (candidate.maximumConcurrent !== 3) throw new RangeError("Ghost Track maximumConcurrent must remain three");
  const damage = candidate.damage;
  if (!(typeof damage === "number" && Number.isFinite(damage) && damage >= 0)) throw new RangeError("Ghost Track damage must be finite and non-negative");
  if (typeof candidate.threatening !== "boolean") throw new TypeError("Ghost Track threatening state is required");
  if (!Array.isArray(candidate.hitActorIds) || candidate.hitActorIds.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(candidate.hitActorIds).size !== candidate.hitActorIds.length) throw new TypeError("Ghost Track hit actor IDs must be unique stable IDs");
}

/** Pale-only validation installed beside Pale behavior at composition. */
export const PALE_TRACK_VALIDATION: EnvironmentObjectValidationPort = Object.freeze({
  id: "pale-tracks",
  validateField: assertAuroraTrackFieldState,
  validateRoute: assertGhostTrackRouteState,
});

export function createAuroraTrackFieldState(input: Readonly<{ id: string; ownerId: string;
  variant: AuroraTrackVariant; direction: EnvironmentTrackDirection; geometry: EnvironmentGeometry;
  startTick: number; patternId?: string }>): AuroraTrackFieldState {
  const definition = AURORA_TRACK_DEFINITIONS[input.variant];
  const value = Object.freeze({ id: input.id, factoryId: "aurora-track", kind: "aurora-track", geometry: input.geometry,
    state: "warning", stateTick: input.startTick, timer: 0, ownerId: input.ownerId, schedule: null,
    eligibility: Object.freeze({ player: true, enemies: true, bosses: true }), force: null, cleanupReason: null,
    trackId: input.id, variant: input.variant, direction: input.direction, lifecycle: definition.lifecycle,
    transportEligibility: definition.transportEligibility, momentum: definition.momentum,
    maximumConcurrent: definition.maximumConcurrent,
    carryStates: Object.freeze([]),
    ...(input.patternId === undefined ? {} : { patternId: input.patternId }),
  } as const satisfies AuroraTrackFieldState);
  assertAuroraTrackFieldState(value);
  return value;
}

export function createGhostTrackRouteState(input: Readonly<{ id: string; ownerId: string;
  direction: EnvironmentTrackDirection; width: number; points: readonly EnvironmentPoint[];
  startTick: number; sourceTrackId?: string | null; damage?: number; threatening?: boolean }>): GhostTrackRouteState {
  const value = Object.freeze({ id: input.id, factoryId: "ghost-track", kind: "ghost-track",
    points: Object.freeze(input.points.map((point) => Object.freeze({ ...point }))), state: "warning", stateTick: input.startTick,
    ownerId: input.ownerId, cleanupReason: null, variant: "ghost", direction: input.direction, width: input.width,
    lifecycle: GHOST_TRACK_DEFINITION.lifecycle, sourceTrackId: input.sourceTrackId ?? null, maximumConcurrent: 3,
    damage: input.damage ?? 16, threatening: input.threatening ?? true, hitActorIds: Object.freeze([]),
  } as const satisfies GhostTrackRouteState);
  assertGhostTrackRouteState(value);
  return value;
}
