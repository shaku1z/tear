import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { TearCausalEventV1 } from "./contracts";
import type { TearEventId, TearWithinTickPhase } from "./registries";

interface MappedGameplayEvent {
  readonly type: TearEventId;
  readonly phase: TearWithinTickPhase;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

const NATIVE_WAVE_EVENTS = Object.freeze({ start: "wave.started", clear: "wave.cleared", cleared: "wave.cleared",
  "spawn-completed": "wave.spawn-completed", boss: "boss.intro-started" }) satisfies Readonly<Record<string, TearEventId>>;
const NATIVE_EFFECT_EVENTS = Object.freeze({ stolenBlade: "blade.stolen", revive: "player.revived", bossKill: "boss.defeated",
  parry: "combat.perfect-parry", "perfect-parry": "combat.perfect-parry", deflect: "combat.deflect",
  "blade-throw": "blade.thrown", "blade-recall": "blade.recalled", "blade-catch": "blade.caught",
  "dash-start": "player.dash-started", superslam: "blade.power-slam", slam: "blade.slam",
  updraft: "blade.launch", pickup: "draft.selected", tierup: "tier.selected" }) satisfies Readonly<Record<string, TearEventId>>;
const NATIVE_CAUSAL_EVENTS: ReadonlySet<TearEventId> = new Set([
  "run.started", "run.paused", "run.resumed", "run.completed", "run.defeated", "run.abandoned", "stage.entered",
  "enemy.spawned", "enemy.defeated", "draft.selected", "tier.selected", "blade.thrown", "blade.caught",
  "blade.throw-resolved", "projectile.spawned", "projectile.deflected", "projectile.owner-changed", "projectile.hit",
  "projectile.expired", "world.void-rescue", ...Object.values(NATIVE_WAVE_EVENTS), ...Object.values(NATIVE_EFFECT_EVENTS),
  "world.hazard-started", "world.hazard-resolved", "world.environment-field-started", "world.environment-field-resolved",
  "world.environment-combat-object-damaged", "world.environment-combat-object-destroyed", "world.environment-object-cleaned",
]);

/** Keep historical IDs readable without advertising unsupported native gameplay facts. */
export function nativeCausalEventAvailability(id: TearEventId): "native" | "compatibility-only" {
  return NATIVE_CAUSAL_EVENTS.has(id) ? "native" : "compatibility-only";
}

export interface TearSemanticEngineEventV1 {
  readonly tick: number;
  readonly sequence: number;
  readonly type: TearEventId;
  readonly phase: TearWithinTickPhase;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * One presentation-independent translation from native gameplay facts to the
 * versioned Tear causal-event ontology. Ghost recording and TearBench must not
 * maintain separate interpretations of the same simulation event.
 */
export function mapGameplayEventToCausalEvent(event: TearGameplayEvent): MappedGameplayEvent {
  switch (event.kind) {
    case "run": return {
      type: event.transition === "started" ? "run.started" : event.transition === "paused" ? "run.paused"
        : event.transition === "resumed" ? "run.resumed" : event.transition === "completed" ? "run.completed"
          : event.transition === "defeated" ? "run.defeated" : "run.abandoned",
      phase: event.transition === "started" || event.transition === "resumed"
        ? "pre-simulation" : "post-simulation-commit",
      payload: Object.freeze({
        runId: event.runId, mode: event.mode, difficulty: event.difficulty, weapon: event.weaponId,
        wave: event.wave, score: event.score, runTimeSeconds: event.runTimeSeconds,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
      }),
    };
    case "stage": return {
      type: "stage.entered", phase: "wave-draft-and-state-transitions",
      payload: Object.freeze({ stage: event.stage }),
    };
    case "wave": {
      const type = (NATIVE_WAVE_EVENTS as Readonly<Record<string, TearEventId>>)[event.event];
      if (type === undefined) throw new RangeError(`unrecognized native wave marker: ${event.event}`);
      return { type, phase: "wave-draft-and-state-transitions",
        payload: Object.freeze({ wave: event.wave, marker: event.event }) };
    }
    case "spawn": return {
      type: "enemy.spawned", phase: "wave-draft-and-state-transitions", actorId: event.actorId,
      payload: Object.freeze({
        actorKind: event.actorKind, x: event.x, y: event.y,
        ...(event.variantName === undefined ? {} : { variantName: event.variantName }),
        ...(event.bossId === undefined ? {} : { bossId: event.bossId }),
      }),
    };
    case "death": return {
      type: "enemy.defeated", phase: "deaths-and-rewards", actorId: event.actorId,
      payload: Object.freeze({ cause: event.cause }),
    };
    case "loadout": return {
      type: event.tier > 1 ? "tier.selected" : "draft.selected",
      phase: "wave-draft-and-state-transitions",
      payload: Object.freeze({ choiceId: event.choiceId, tier: event.tier, wave: event.wave }),
    };
    case "weapon": return {
      type: event.event === "throw-launch" ? "blade.thrown"
        : event.event === "catch" ? "blade.caught" : "blade.throw-resolved",
      phase: event.event === "throw-launch" ? "player-and-blade" : "post-simulation-commit",
      payload: Object.freeze({
        weaponId: event.weaponId, throwId: event.throwId, x: event.x, y: event.y,
        ...(event.damage === undefined ? {} : { damage: event.damage }),
      }),
    };
    case "projectile": return {
      type: event.event === "spawned" ? "projectile.spawned"
        : event.event === "deflected" ? "projectile.deflected"
          : event.event === "owner-changed" ? "projectile.owner-changed"
            : event.event === "hit" ? "projectile.hit" : "projectile.expired",
      phase: event.event === "spawned" ? "wave-draft-and-state-transitions"
        : event.event === "hit" || event.event === "expired" ? "deaths-and-rewards" : "player-and-blade",
      actorId: event.projectileId,
      payload: Object.freeze({
        x: event.x, y: event.y, vx: event.vx, vy: event.vy, owner: event.owner,
        ...(event.sourceEnemyId === undefined ? {} : { sourceEnemyId: event.sourceEnemyId }),
        ...(event.targetEnemyId === undefined ? {} : { targetEnemyId: event.targetEnemyId }),
        ...(event.perfect === undefined ? {} : { perfect: event.perfect }),
      }),
    };
    case "world": return {
      type: "world.void-rescue", phase: "post-simulation-commit",
      payload: Object.freeze({ x: event.x, y: event.y, lane: event.lane, hp: event.hp }),
    };
    case "environment": {
      if (!["field-started", "field-resolved", "combat-object-damaged", "combat-object-destroyed", "object-cleaned"].includes(event.event)) {
        throw new RangeError(`unrecognized native environment event: ${event.event}`);
      }
      const type = event.event === "field-started" ? "world.environment-field-started"
        : event.event === "field-resolved" ? "world.environment-field-resolved"
          : event.event === "combat-object-damaged" ? "world.environment-combat-object-damaged"
            : event.event === "combat-object-destroyed" ? "world.environment-combat-object-destroyed" : "world.environment-object-cleaned";
      return {
      type,
      phase: event.event === "combat-object-damaged" ? "collision-and-damage"
        : event.event === "field-started" ? "projectiles-and-hazards"
          : event.event === "object-cleaned" ? "post-simulation-commit" : "deaths-and-rewards",
      actorId: event.objectId,
      payload: Object.freeze({ event: event.event, category: event.category, objectKind: event.objectKind,
        ...(event.integrity === undefined ? {} : { integrity: event.integrity }), ...(event.reason === undefined ? {} : { reason: event.reason }) }),
      };
    }
    case "effect": {
      const type = (NATIVE_EFFECT_EVENTS as Readonly<Record<string, TearEventId>>)[event.effect];
      if (type === undefined) throw new RangeError(`unrecognized native gameplay effect: ${event.effect}`);
      return { type, phase: "post-simulation-commit",
        payload: Object.freeze({ effect: event.effect, x: event.x, y: event.y }) };
    }
  }
}

/** Builds a validated-shape V1 causal event while leaving host-specific IDs to composition. */
export function createGameplayCausalEvent(
  event: TearGameplayEvent,
  sequence: number,
  id: string,
): TearCausalEventV1 {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("gameplay causal event sequence must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
    throw new RangeError("gameplay causal event tick must be a non-negative safe integer");
  }
  if (id.trim().length === 0 || id.length > 256) {
    throw new RangeError("gameplay causal event ID must be a bounded nonblank identifier");
  }
  const mapped = mapGameplayEventToCausalEvent(event);
  return Object.freeze({
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id, type: mapped.type, tick: event.tick, phase: mapped.phase, sequence, source: "engine",
    ...(mapped.actorId === undefined ? {} : { actorId: mapped.actorId }), payload: mapped.payload,
  });
}

/** Host-independent native-event projection used only for live/detached equality evidence. */
export function projectGameplayEventForParity(
  event: TearGameplayEvent,
  sequence: number,
): TearSemanticEngineEventV1 {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("gameplay parity event sequence must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
    throw new RangeError("gameplay parity event tick must be a non-negative safe integer");
  }
  const mapped = mapGameplayEventToCausalEvent(event);
  return Object.freeze({
    tick: event.tick, sequence, type: mapped.type, phase: mapped.phase,
    ...(mapped.actorId === undefined ? {} : { actorId: mapped.actorId }), payload: mapped.payload,
  });
}
