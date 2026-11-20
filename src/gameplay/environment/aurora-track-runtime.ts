import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";
import type { EnvironmentTrackDirection } from "./environment-contracts";
import {
  AURORA_TRACK_RECURS,
  AURORA_TRACK_TRAVEL,
  type AuroraTrackCarryState,
  type AuroraTrackFieldState,
  type AuroraTrackTarget,
} from "./aurora-track";
import { fieldCycleAt } from "./field-runtime";

/** Someone a road may carry. `fieldSpeed` is the multiplier on its top speed, read by whoever owns that speed. */
export interface AuroraTrackActor {
  readonly id: string;
  readonly kind: AuroraTrackTarget;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  /** The way it means to go: -1, 0 or 1. */
  readonly intentX: number;
  /** Held in place or keeping its own height in the air: a road leaves it alone. */
  readonly held?: boolean;
  fieldSpeed: number;
  onInfluenced?(direction: EnvironmentTrackDirection, onTrack: boolean): void;
}

function inside(field: AuroraTrackFieldState, actor: AuroraTrackActor): boolean {
  const { geometry } = field;
  return (
    actor.x >= geometry.x &&
    actor.x <= geometry.x + (geometry.w ?? 0) &&
    actor.y >= geometry.y &&
    actor.y <= geometry.y + (geometry.h ?? 0)
  );
}

/** Going the road's way: it means to, and it is not moving against it. */
function travelling(actor: AuroraTrackActor, direction: EnvironmentTrackDirection): boolean {
  return actor.intentX * direction > 0 && actor.vx * direction >= 0;
}

function share(actor: AuroraTrackActor): number {
  return actor.held === true ? 0 : AURORA_TRACK_TRAVEL.targets[actor.kind];
}

/**
 * One tick of a road: its warn-wake-sleep cycle, and who it is carrying. An actor travelling its way on an
 * awake road is carried in full; off the road, or once the road sleeps, the carry runs down while the actor
 * keeps going that way and ends at once when it stops or turns. Nothing here moves anyone: the carry is the
 * road's state, and `auroraTrackSpeed` turns it into a top-speed multiplier.
 */
export function advanceAuroraTrack(
  input: AuroraTrackFieldState,
  tick: number,
  actors: readonly AuroraTrackActor[],
  events?: TearGameplayEventPort,
): AuroraTrackFieldState {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new RangeError("Aurora Track tick must be a non-negative safe integer");
  if (input.cleanupReason !== null) return input;
  const cycle = fieldCycleAt(input.lifecycle, input.startTick, tick, AURORA_TRACK_RECURS[input.variant]);
  if (cycle.finished) {
    if (events !== undefined) publishResolved(events, input, tick);
    return Object.freeze({
      ...input,
      state: "expired",
      stateTick: tick,
      cleanupReason: "natural-expiry",
      carryStates: Object.freeze([]),
    });
  }
  const changed = cycle.state !== input.state || cycle.stateTick !== input.stateTick;
  if (changed && events !== undefined) {
    if (cycle.state === "active")
      publishEnvironmentEvent(
        events,
        { event: "field-started", objectId: input.id, category: "field", objectKind: input.kind },
        tick,
      );
    else if (input.state === "active") publishResolved(events, input, tick);
  }
  const awake = cycle.state === "active";
  const prior = new Map(input.carryStates.map((carry) => [carry.actorId, carry.remainingTicks]));
  const carryStates: AuroraTrackCarryState[] = [];
  const seen = new Set<string>();
  for (const actor of [...actors].sort((left, right) => left.id.localeCompare(right.id))) {
    if (seen.has(actor.id)) throw new TypeError(`duplicate Aurora Track actor ID: ${actor.id}`);
    seen.add(actor.id);
    if (![actor.x, actor.y, actor.vx, actor.intentX].every(Number.isFinite))
      throw new TypeError(`Aurora Track actor ${actor.id} must contain finite state`);
    if (share(actor) <= 0 || !travelling(actor, input.direction)) continue;
    const onTrack = awake && inside(input, actor);
    const remainingTicks = onTrack ? AURORA_TRACK_TRAVEL.carryTicks : (prior.get(actor.id) ?? 0) - 1;
    if (remainingTicks <= 0) continue;
    carryStates.push(Object.freeze({ actorId: actor.id, direction: input.direction, remainingTicks }));
    actor.onInfluenced?.(input.direction, onTrack);
  }
  const sameCarry =
    carryStates.length === input.carryStates.length &&
    carryStates.every((carry, index) => {
      const before = input.carryStates[index];
      return before?.actorId === carry.actorId && before.remainingTicks === carry.remainingTicks;
    });
  if (!changed && sameCarry) return input;
  return Object.freeze({
    ...input,
    state: cycle.state,
    stateTick: cycle.stateTick,
    carryStates: sameCarry ? input.carryStates : Object.freeze(carryStates),
  });
}

function publishResolved(events: TearGameplayEventPort, field: AuroraTrackFieldState, tick: number): void {
  publishEnvironmentEvent(
    events,
    {
      event: "field-resolved",
      objectId: field.id,
      category: "field",
      objectKind: field.kind,
      reason: "natural-expiry",
    },
    tick,
  );
}

/** The top-speed multiplier a road gives an actor now: 1 unless it carries the actor. */
export function auroraTrackSpeed(
  field: AuroraTrackFieldState,
  actor: Pick<AuroraTrackActor, "id" | "kind" | "held">,
): number {
  const carry = field.carryStates.find((entry) => entry.actorId === actor.id);
  if (carry === undefined) return 1;
  const part = actor.held === true ? 0 : AURORA_TRACK_TRAVEL.targets[actor.kind];
  return 1 + (AURORA_TRACK_TRAVEL.topSpeed - 1) * part * (carry.remainingTicks / AURORA_TRACK_TRAVEL.carryTicks);
}

/** Sets every actor's `fieldSpeed` from the roads: the largest any road gives it, and 1 with none. */
export function applyAuroraTrackSpeed(
  fields: readonly AuroraTrackFieldState[],
  actors: readonly AuroraTrackActor[],
): void {
  for (const actor of actors) {
    let speed = 1;
    for (const field of fields) speed = Math.max(speed, auroraTrackSpeed(field, actor));
    actor.fieldSpeed = speed;
  }
}
