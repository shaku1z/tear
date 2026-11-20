import type {
  EnvironmentClearReason,
  EnvironmentFieldState,
  EnvironmentGeometry,
  EnvironmentObjectState,
} from "./environment-contracts";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";

export interface EnvironmentFieldTransition {
  readonly previousState: EnvironmentObjectState;
  readonly nextState: EnvironmentObjectState;
  readonly cleanupReason?: EnvironmentClearReason;
}

export interface EnvironmentFieldStepResult {
  readonly field: EnvironmentFieldState;
  readonly transition?: EnvironmentFieldTransition;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function insideGeometry(geometry: EnvironmentGeometry, x: number, y: number): boolean {
  if (!finite(x) || !finite(y)) return false;
  if (geometry.radius !== undefined) {
    return Math.hypot(x - geometry.x, y - geometry.y) <= geometry.radius;
  }
  return (
    x >= geometry.x && x <= geometry.x + (geometry.w ?? 0) && y >= geometry.y && y <= geometry.y + (geometry.h ?? 0)
  );
}

/** Pure geometry query shared by live and detached field consumers. */
export function environmentFieldContainsPoint(field: EnvironmentFieldState, x: number, y: number): boolean {
  return field.state === "active" && insideGeometry(field.geometry, x, y);
}

/** Bounded, generic lifecycle progression. It does not author any field effect. */
export function advanceEnvironmentField(
  field: EnvironmentFieldState,
  tick: number,
  seconds: number,
  cleanupReason: EnvironmentClearReason = "natural-expiry",
  events?: TearGameplayEventPort,
): EnvironmentFieldStepResult {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new RangeError("environment field tick must be a non-negative safe integer");
  if (!(seconds > 0) || !Number.isFinite(seconds))
    throw new RangeError("environment field duration must be finite and positive");
  if (field.state === "destroyed" || field.state === "expired") return Object.freeze({ field });
  const schedule = field.schedule;
  let nextState: EnvironmentObjectState = field.state;
  if (schedule !== null && tick >= schedule.startTick && field.state === "scheduled") nextState = "active";
  if (
    schedule?.endTick !== undefined &&
    tick >= schedule.endTick &&
    (nextState === "active" || nextState === "cooldown" || nextState === "warning")
  )
    nextState = "expired";
  const timer = field.timer + seconds;
  if (nextState === field.state) return Object.freeze({ field: Object.freeze({ ...field, timer }) });
  const transition: EnvironmentFieldTransition = Object.freeze({
    previousState: field.state,
    nextState,
    ...(nextState === "expired" ? { cleanupReason } : {}),
  });
  if (events !== undefined)
    publishEnvironmentEvent(
      events,
      {
        event: nextState === "active" ? "field-started" : "field-resolved",
        objectId: field.id,
        category: "field",
        objectKind: field.kind,
        ...(nextState === "expired" ? { reason: cleanupReason } : {}),
      },
      tick,
    );
  return Object.freeze({
    field: Object.freeze({ ...field, state: nextState, timer, ...(nextState === "expired" ? { cleanupReason } : {}) }),
    transition,
  });
}

/**
 * How a stage field sorts an enemy before it decides whether to move it. One rule for every biome: a field
 * lists what it does to each class as data and never reads an enemy's weight itself.
 */
export type FieldEnemyClass = "light-enemy" | "heavy-enemy" | "boss";

/** An enemy at or above this weight is heavy to a stage field. Armoured enemies and planters are; chargers are not. */
export const FIELD_HEAVY_ENEMY_WEIGHT = 1.75;

export interface FieldClassedEnemy {
  readonly weight?: number;
  readonly isBoss?: boolean;
}

export function fieldEnemyClass(enemy: FieldClassedEnemy): FieldEnemyClass {
  if (enemy.isBoss === true) return "boss";
  return (enemy.weight ?? 1) >= FIELD_HEAVY_ENEMY_WEIGHT ? "heavy-enemy" : "light-enemy";
}

/** The three stretches of a field that warns, acts and rests, in simulation ticks. */
export interface FieldCycleTiming {
  readonly warningTicks: number;
  readonly activeTicks: number;
  readonly cooldownTicks: number;
}

export interface FieldCyclePoint {
  readonly state: "dormant" | "warning" | "active" | "cooldown";
  /** The tick the state began. */
  readonly stateTick: number;
  /** The tick the state ends. */
  readonly transitionTick: number;
  /** The first tick of the cycle the tick falls in. */
  readonly cycleStart: number;
  /** True once a field that does not recur has run its one cycle: its owner ends it. */
  readonly finished: boolean;
}

export function fieldCycleTicks(timing: FieldCycleTiming): number {
  return timing.warningTicks + timing.activeTicks + timing.cooldownTicks;
}

/**
 * Where a warn-act-rest field is at a tick, from absolute ticks, so nothing drifts and a field restored
 * from a snapshot lands in the same place. A field that recurs counts cycles from its first; another has
 * one. Before its start a field is dormant, which is how paired fields are set to alternate.
 */
export function fieldCycleAt(
  timing: FieldCycleTiming,
  startTick: number,
  tick: number,
  recurs: boolean,
): FieldCyclePoint {
  const total = fieldCycleTicks(timing);
  const elapsed = tick - startTick;
  const cycleStart = !recurs || elapsed < 0 ? startTick : startTick + Math.floor(elapsed / total) * total;
  const into = tick - cycleStart;
  const activeAt = cycleStart + timing.warningTicks;
  const restAt = activeAt + timing.activeTicks;
  const end = cycleStart + total;
  if (into < 0 || into >= total)
    return { state: "dormant", stateTick: end, transitionTick: end, cycleStart, finished: into >= total };
  if (tick < activeAt)
    return { state: "warning", stateTick: cycleStart, transitionTick: activeAt, cycleStart, finished: false };
  if (tick < restAt)
    return { state: "active", stateTick: activeAt, transitionTick: restAt, cycleStart, finished: false };
  return { state: "cooldown", stateTick: restAt, transitionTick: end, cycleStart, finished: false };
}
