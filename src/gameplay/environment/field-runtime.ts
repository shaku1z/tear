import type { EnvironmentClearReason, EnvironmentFieldState, EnvironmentGeometry, EnvironmentObjectState } from "./environment-contracts";
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

function finite(value: number): boolean { return Number.isFinite(value); }

function insideGeometry(geometry: EnvironmentGeometry, x: number, y: number): boolean {
  if (!finite(x) || !finite(y)) return false;
  if (geometry.radius !== undefined) {
    return Math.hypot(x - geometry.x, y - geometry.y) <= geometry.radius;
  }
  return x >= geometry.x && x <= geometry.x + (geometry.w ?? 0)
    && y >= geometry.y && y <= geometry.y + (geometry.h ?? 0);
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
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("environment field tick must be a non-negative safe integer");
  if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("environment field duration must be finite and positive");
  if (field.state === "destroyed" || field.state === "expired") return Object.freeze({ field });
  const schedule = field.schedule;
  let nextState: EnvironmentObjectState = field.state;
  if (schedule !== null && tick >= schedule.startTick && field.state === "scheduled") nextState = "active";
  if (schedule?.endTick !== undefined && tick >= schedule.endTick
    && (nextState === "active" || nextState === "cooldown" || nextState === "warning")) nextState = "expired";
  const timer = field.timer + seconds;
  if (nextState === field.state) return Object.freeze({ field: Object.freeze({ ...field, timer }) });
  const transition: EnvironmentFieldTransition = Object.freeze({ previousState: field.state, nextState,
    ...(nextState === "expired" ? { cleanupReason } : {}) });
  if (events !== undefined) publishEnvironmentEvent(events, {
    event: nextState === "active" ? "field-started" : "field-resolved", objectId: field.id, category: "field", objectKind: field.kind,
    ...(nextState === "expired" ? { reason: cleanupReason } : {}),
  }, tick);
  return Object.freeze({
    field: Object.freeze({ ...field, state: nextState, timer, ...(nextState === "expired" ? { cleanupReason } : {}) }),
    transition,
  });
}
