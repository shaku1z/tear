import type { EnvironmentClearReason, EnvironmentFieldState, EnvironmentForcePolicy, EnvironmentGeometry } from "./environment-contracts";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";

/** Bloom Wells use authored fixed ticks so warning and force do not drift with render cadence. */
export const BLOOM_WELL_TIMING = Object.freeze({
  ticksPerSecond: 120,
  warningTicks: 84,
  activeTicks: 180,
  cooldownTicks: 480,
  totalTicks: 744,
});

export type BloomWellVariant = "stage" | "boss";

export interface BloomWellDefinition {
  readonly id: string;
  readonly ownerId: string;
  readonly bossOwnerId?: string;
  readonly variant: BloomWellVariant;
  readonly geometry: EnvironmentGeometry;
  readonly patternId: string;
  readonly force?: EnvironmentForcePolicy;
}

export interface BloomWellState extends EnvironmentFieldState {
  readonly kind: "bloom-well";
  readonly factoryId: "environment-field";
  readonly bloomWellId: string;
  readonly variant: BloomWellVariant;
  readonly startTick: number;
  readonly transitionTick: number;
  readonly stageOwnerId: string;
  readonly bossOwnerId: string | null;
}

export interface BloomWellActor {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  vx: number;
  vy: number;
  readonly mass?: number;
  readonly weight?: number;
  readonly anchored?: boolean;
  readonly isBoss?: boolean;
  readonly isFlyer?: boolean;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

function assertTick(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
}

export function isValidBloomWellForcePolicy(value: unknown): value is EnvironmentForcePolicy {
  if (typeof value !== "object" || value === null) return false;
  const force = value as Partial<EnvironmentForcePolicy>;
  if (![force.x, force.y, force.magnitude].every((entry) => typeof entry === "number" && Number.isFinite(entry))) return false;
  if ((force.magnitude ?? -1) < 0 || (force.magnitude ?? Infinity) > 2400) return false;
  return Math.hypot(force.x ?? Infinity, force.y ?? Infinity) <= (force.magnitude ?? -1);
}

export function assertBloomWellForcePolicy(value: unknown): asserts value is EnvironmentForcePolicy {
  if (!isValidBloomWellForcePolicy(value)) throw new RangeError("Bloom Well force vector must be finite and fit its bounded declared magnitude");
}

export function createBloomWellDefinition(value: BloomWellDefinition): BloomWellDefinition {
  if (!value.id || !value.ownerId || !value.patternId) throw new TypeError("Bloom Well identity and pattern are required");
  assertFinite(value.geometry.x, "Bloom Well geometry.x"); assertFinite(value.geometry.y, "Bloom Well geometry.y");
  const extent = value.geometry.radius ?? Math.max(value.geometry.w ?? 0, value.geometry.h ?? 0);
  if (!(extent > 0) || !Number.isFinite(extent)) throw new RangeError("Bloom Well geometry must be bounded and non-empty");
  const force = value.force ?? { x: 0, y: -720, magnitude: 720 };
  assertBloomWellForcePolicy(force);
  return Object.freeze({ ...value, geometry: Object.freeze({ ...value.geometry }), force: Object.freeze({ ...force }) });
}

export function createBloomWellState(input: BloomWellDefinition, startTick = 0): BloomWellState {
  const definition = createBloomWellDefinition(input); assertTick(startTick, "Bloom Well startTick");
  return Object.freeze({
    id: definition.id, factoryId: "environment-field", bloomWellId: definition.id, kind: "bloom-well",
    variant: definition.variant, startTick, transitionTick: startTick + BLOOM_WELL_TIMING.warningTicks, state: "warning", stateTick: startTick,
    timer: 0, ownerId: definition.bossOwnerId ?? null, stageOwnerId: definition.ownerId, bossOwnerId: definition.bossOwnerId ?? null,
    geometry: definition.geometry, schedule: { startTick, endTick: startTick + BLOOM_WELL_TIMING.totalTicks },
    eligibility: { player: true, enemies: true, bosses: false }, force: definition.force ?? { x: 0, y: -720, magnitude: 720 },
    cleanupReason: null, patternId: `bloom-well/${definition.patternId}`,
  });
}

function stateAt(startTick: number, tick: number): BloomWellState["state"] {
  const elapsed = tick - startTick;
  if (elapsed < 0) return "dormant";
  if (elapsed < BLOOM_WELL_TIMING.warningTicks) return "warning";
  if (elapsed < BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks) return "active";
  if (elapsed < BLOOM_WELL_TIMING.totalTicks) return "cooldown";
  return "dormant";
}

function transitionAt(startTick: number, state: BloomWellState["state"]): number {
  if (state === "warning") return startTick + BLOOM_WELL_TIMING.warningTicks;
  if (state === "active") return startTick + BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks;
  return startTick + BLOOM_WELL_TIMING.totalTicks;
}

function stateStartedAt(startTick: number, state: BloomWellState["state"]): number {
  if (state === "warning") return startTick;
  if (state === "active") return startTick + BLOOM_WELL_TIMING.warningTicks;
  if (state === "cooldown") return startTick + BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks;
  return startTick + BLOOM_WELL_TIMING.totalTicks;
}

/** Pure, absolute-tick lifecycle advancement; repeated renders cannot accumulate drift. */
export function advanceBloomWell(state: BloomWellState, tick: number, events?: TearGameplayEventPort): BloomWellState {
  assertTick(tick, "Bloom Well tick");
  if (state.cleanupReason !== null) return state;
  const next = stateAt(state.startTick, tick);
  const timer = Math.max(0, tick - state.startTick) / BLOOM_WELL_TIMING.ticksPerSecond;
  if (next === state.state) return state.timer === timer ? state : Object.freeze({ ...state, timer });
  if (events !== undefined && next !== state.state && (next === "active" || next === "dormant")) {
    publishEnvironmentEvent(events, {
      event: next === "active" ? "field-started" : "field-resolved", objectId: state.id, category: "field", objectKind: state.kind,
      ...(next === "dormant" ? { reason: "natural-expiry" as const } : {}),
    }, tick);
  }
  return Object.freeze({ ...state, state: next, stateTick: stateStartedAt(state.startTick, next), transitionTick: transitionAt(state.startTick, next), timer });
}

function contains(state: BloomWellState, x: number, y: number): boolean {
  if (state.geometry.radius !== undefined) return Math.hypot(x - state.geometry.x, y - state.geometry.y) <= state.geometry.radius;
  return x >= state.geometry.x && x <= state.geometry.x + (state.geometry.w ?? 0)
    && y >= state.geometry.y && y <= state.geometry.y + (state.geometry.h ?? 0);
}

function liftScale(actor: BloomWellActor): number {
  if (actor.kind !== "enemy") return actor.kind === "player" ? 1 : 0;
  if (actor.isBoss || actor.isFlyer || actor.anchored) return 0;
  const mass = actor.mass ?? actor.weight ?? 1;
  if (!Number.isFinite(mass) || mass <= 0) return 0;
  if (mass > 3) return 0.18;
  if (mass > 1.5) return 0.55;
  return 1;
}

/** Applies only vertical acceleration to eligible actors; weapon transport is deliberately absent. */
export function applyBloomWellForce(state: BloomWellState, actor: BloomWellActor, seconds = 1 / BLOOM_WELL_TIMING.ticksPerSecond): boolean {
  const eligible = actor.kind === "player" ? state.eligibility.player : actor.kind === "enemy" ? state.eligibility.enemies : false;
  if (state.state !== "active" || !eligible || !contains(state, actor.x, actor.y)) return false;
  const scale = liftScale(actor);
  if (scale <= 0 || !(seconds > 0) || !Number.isFinite(seconds)) return false;
  actor.vy += (state.force?.y ?? -720) * scale * seconds;
  return true;
}

export function cleanupBloomWell(state: BloomWellState, reason: EnvironmentClearReason): BloomWellState {
  return Object.freeze({ ...state, state: "dormant", stateTick: state.stateTick, transitionTick: state.stateTick, cleanupReason: reason });
}

export function isBloomWellState(value: EnvironmentFieldState): value is BloomWellState {
  return value.kind === "bloom-well" && value.factoryId === "environment-field" && typeof (value as Partial<BloomWellState>).bloomWellId === "string";
}
