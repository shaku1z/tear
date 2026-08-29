import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";
import type { AuroraTrackCarryState, EnvironmentTrackDirection } from "./environment-contracts";
import type { AuroraTrackFieldState } from "./aurora-track";

export type AuroraTransportKind = "player" | "light-enemy" | "heavy-enemy" | "boss" |
  "thrown-blade" | "deflected-projectile" | "boss-charge";

export interface AuroraTransportActor {
  readonly id: string;
  readonly kind: AuroraTransportKind;
  readonly x: number;
  readonly y: number;
  readonly intentX: number;
  readonly normalAcceleration: number;
  readonly maximumSpeed: number;
  vx: number;
}

export interface AuroraTrackStepResult {
  readonly field: AuroraTrackFieldState;
  readonly influencedActorIds: readonly string[];
}

function inside(field: AuroraTrackFieldState, actor: AuroraTransportActor): boolean {
  const { geometry } = field;
  if (geometry.radius !== undefined) return Math.hypot(actor.x - geometry.x, actor.y - geometry.y) <= geometry.radius;
  return actor.x >= geometry.x && actor.x <= geometry.x + (geometry.w ?? 0)
    && actor.y >= geometry.y && actor.y <= geometry.y + (geometry.h ?? 0);
}

function eligible(field: AuroraTrackFieldState, actor: AuroraTransportActor): boolean {
  const policy = field.transportEligibility;
  switch (actor.kind) {
    case "player": return policy.player;
    case "light-enemy": return policy.enemies && policy.lightEnemies;
    case "heavy-enemy": return policy.enemies && policy.heavyEnemies;
    case "boss": return policy.bosses;
    case "thrown-blade": return policy.thrownBlade;
    case "deflected-projectile": return policy.deflectedProjectiles;
    case "boss-charge": return policy.bossCharges;
  }
}

function validIntent(actor: AuroraTransportActor, direction: EnvironmentTrackDirection): boolean {
  return Number.isFinite(actor.intentX) && actor.intentX * direction > 0 && actor.vx * direction >= 0;
}

function lifecycleState(field: AuroraTrackFieldState, tick: number): AuroraTrackFieldState {
  const elapsed = tick - field.stateTick;
  if (elapsed < 0) throw new RangeError("Aurora Track ticks must be monotonic");
  if (field.state === "warning" && elapsed >= field.lifecycle.warningTicks) {
    return Object.freeze({ ...field, state: "active", stateTick: tick });
  }
  if (field.state === "active" && elapsed >= field.lifecycle.activeTicks) {
    return Object.freeze({ ...field, state: field.variant === "boss-wake" ? "expired" : "cooldown", stateTick: tick,
      ...(field.variant === "boss-wake" ? { cleanupReason: "natural-expiry" as const } : {}), carryStates: Object.freeze([]) });
  }
  if (field.state === "cooldown" && elapsed >= field.lifecycle.cooldownTicks) {
    return Object.freeze({ ...field, state: "warning", stateTick: tick, carryStates: Object.freeze([]) });
  }
  return field;
}

export function advanceAuroraTrack(
  input: AuroraTrackFieldState,
  tick: number,
  seconds: number,
  actors: readonly AuroraTransportActor[],
  events?: TearGameplayEventPort,
): AuroraTrackStepResult {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Aurora Track tick must be a non-negative safe integer");
  if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("Aurora Track step duration must be finite and positive");
  const field = lifecycleState(input, tick);
  if (field !== input && events !== undefined && field.state !== "warning") publishEnvironmentEvent(events, {
    event: field.state === "active" ? "field-started" : "field-resolved", objectId: field.id,
    category: "field", objectKind: field.kind,
    ...(field.state === "expired" ? { reason: "natural-expiry" as const } : {}),
  }, tick);
  if (field.state !== "active") return Object.freeze({ field, influencedActorIds: Object.freeze([]) });

  const priorCarry = new Map(field.carryStates.map((carry) => [carry.actorId, carry]));
  const nextCarry: AuroraTrackCarryState[] = [];
  const influenced: string[] = [];
  const seen = new Set<string>();
  for (const actor of [...actors].sort((left, right) => left.id.localeCompare(right.id))) {
    if (seen.has(actor.id)) throw new TypeError(`duplicate Aurora transport actor ID: ${actor.id}`);
    seen.add(actor.id);
    if (![actor.x, actor.y, actor.vx, actor.intentX, actor.normalAcceleration, actor.maximumSpeed].every(Number.isFinite)
      || actor.normalAcceleration < 0 || actor.maximumSpeed <= 0) {
      throw new TypeError(`Aurora transport actor ${actor.id} must contain finite state`);
    }
    const onTrack = inside(field, actor);
    const carry = priorCarry.get(actor.id);
    const continuing = carry !== undefined && carry.remainingTicks > 0 && carry.direction === field.direction;
    if (!eligible(field, actor) || !validIntent(actor, field.direction) || (!onTrack && !continuing)) continue;
    const influenceScale = actor.kind === "heavy-enemy" ? field.momentum.heavyInfluenceScale : 1;
    const carryScale = onTrack ? 1 : field.momentum.velocityRetention;
    const delta = field.direction * actor.normalAcceleration * (field.momentum.accelerationMultiplier - 1)
      * influenceScale * carryScale * seconds;
    const cap = actor.maximumSpeed * field.momentum.accelerationMultiplier;
    if (Math.abs(actor.vx) < cap) actor.vx = Math.max(-cap, Math.min(cap, actor.vx + delta));
    influenced.push(actor.id);
    const remainingTicks = onTrack ? field.momentum.exitCarryTicks : Math.max(0, (carry?.remainingTicks ?? 0) - 1);
    if (remainingTicks > 0) nextCarry.push(Object.freeze({ actorId: actor.id, direction: field.direction, remainingTicks }));
  }
  return Object.freeze({ field: Object.freeze({ ...field, carryStates: Object.freeze(nextCarry) }),
    influencedActorIds: Object.freeze(influenced) });
}
