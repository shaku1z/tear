import type { EnvironmentClearReason, EnvironmentCombatObjectState } from "./environment-contracts";
import { assertEnvironmentCombatCapabilities, type EnvironmentCounterplayTag } from "./environment-definitions";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";

export interface EnvironmentDamageResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly damage: number;
  readonly integrity: number;
  readonly destroyed: boolean;
}

export interface EnvironmentCombatObjectPolicy {
  readonly countsAsOrdinaryEnemy: false;
  readonly grantsEnemyReward: false;
  readonly procEligible: false;
  readonly counterplayTags: readonly EnvironmentCounterplayTag[];
}

export interface EnvironmentCounterplayResolution {
  readonly capability: EnvironmentCounterplayTag;
  readonly accepted: boolean;
  readonly matchedTag: EnvironmentCounterplayTag | null;
}

export interface EnvironmentCombatObjectRuntime {
  readonly state: EnvironmentCombatObjectState;
  readonly policy: EnvironmentCombatObjectPolicy;
  damage(amount: number, attackId: string, tick?: number): EnvironmentDamageResult;
  cleanup(reason: EnvironmentClearReason): EnvironmentCombatObjectState;
  hasProcessedAttack(attackId: string): boolean;
  resolveCounterplay(capability: EnvironmentCounterplayTag): EnvironmentCounterplayResolution;
}

const MAX_ATTACK_IDS = 512;
const MAX_ATTACK_ID_LENGTH = 256;
const COUNTERPLAY_CAPABILITIES = new Set<EnvironmentCounterplayTag>(["cut", "break", "projectile-cut"]);

/** Resolves a weapon/action capability against source-owned object metadata. Capabilities match exactly. */
export function resolveEnvironmentCounterplay(
  counterplayTags: readonly EnvironmentCounterplayTag[],
  capability: EnvironmentCounterplayTag,
): EnvironmentCounterplayResolution {
  if (!COUNTERPLAY_CAPABILITIES.has(capability)) throw new RangeError(`unknown environment counterplay capability: ${capability}`);
  const accepted = counterplayTags.includes(capability);
  return Object.freeze({ capability, accepted, matchedTag: accepted ? capability : null });
}

/** Creates a bounded damageable relationship object; it never enters enemy reward/proc paths. */
export function createEnvironmentCombatObjectRuntime(
  initial: EnvironmentCombatObjectState,
  counterplayTags: readonly EnvironmentCounterplayTag[] = initial.counterplayTags as readonly EnvironmentCounterplayTag[],
  events?: TearGameplayEventPort,
): EnvironmentCombatObjectRuntime {
  if (!Number.isFinite(initial.integrity) || initial.integrity < 0
    || !Number.isFinite(initial.maxIntegrity) || initial.maxIntegrity <= 0
    || initial.integrity > initial.maxIntegrity) throw new RangeError("environment integrity must be finite and within maxIntegrity");
  assertEnvironmentCombatCapabilities(initial.kind, counterplayTags, initial.procEligible);
  let state = Object.freeze({ ...initial, counterplayTags: Object.freeze([...counterplayTags]), procEligible: false });
  const processed = new Set<string>();
  const policy: EnvironmentCombatObjectPolicy = Object.freeze({ countsAsOrdinaryEnemy: false, grantsEnemyReward: false, procEligible: false, counterplayTags: state.counterplayTags });
  return Object.freeze({
    get state(): EnvironmentCombatObjectState { return state; },
    policy,
    hasProcessedAttack(attackId: string): boolean { return processed.has(attackId); },
    resolveCounterplay: (capability: EnvironmentCounterplayTag) => resolveEnvironmentCounterplay(policy.counterplayTags, capability),
    damage(amount: number, attackId: string, tick?: number): EnvironmentDamageResult {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError("environment damage must be finite and non-negative");
      if (typeof attackId !== "string" || attackId.length === 0) throw new TypeError("environment damage requires an attack ID");
      if (attackId.length > MAX_ATTACK_ID_LENGTH) throw new RangeError("environment attack ID exceeds bounded length");
      if (state.state === "destroyed" || state.state === "expired") return Object.freeze({ accepted: false, duplicate: false, damage: 0, integrity: state.integrity, destroyed: state.state === "destroyed" });
      if (processed.has(attackId)) return Object.freeze({ accepted: false, duplicate: true, damage: 0, integrity: state.integrity, destroyed: false });
      if (processed.size >= MAX_ATTACK_IDS) {
        const oldest = processed.values().next().value;
        if (oldest !== undefined) processed.delete(oldest);
      }
      processed.add(attackId);
      const damage = Math.min(amount, state.integrity);
      const integrity = state.integrity - damage;
      const destroyed = integrity <= 0;
      state = Object.freeze({ ...state, integrity, state: destroyed ? "destroyed" : state.state });
      if (events !== undefined) {
        publishEnvironmentEvent(events, { event: "combat-object-damaged", objectId: state.id, category: "combat-object", objectKind: state.kind, integrity }, tick);
        if (destroyed) publishEnvironmentEvent(events, { event: "combat-object-destroyed", objectId: state.id, category: "combat-object", objectKind: state.kind, integrity: 0 }, tick);
      }
      return Object.freeze({ accepted: true, duplicate: false, damage, integrity, destroyed });
    },
    cleanup(reason: EnvironmentClearReason): EnvironmentCombatObjectState {
      state = Object.freeze({ ...state, state: "expired", cleanupReason: reason });
      if (events !== undefined) publishEnvironmentEvent(events, { event: "object-cleaned", objectId: state.id, category: "combat-object", objectKind: state.kind, reason });
      return state;
    },
  });
}

/** Expires relationship objects whose owner or target disappeared in the same commit. */
export function cleanupOrphanedEnvironmentCombatObjects(
  objects: readonly EnvironmentCombatObjectState[],
  availableActorIds: ReadonlySet<string>,
  reason: EnvironmentClearReason,
): readonly EnvironmentCombatObjectState[] {
  return Object.freeze(objects.map((object) => {
    const orphaned = object.state !== "destroyed" && object.state !== "expired"
      && ((object.ownerId !== null && !availableActorIds.has(object.ownerId))
        || (object.targetId !== null && !availableActorIds.has(object.targetId)));
    return orphaned ? Object.freeze({ ...object, state: "expired", cleanupReason: reason }) : object;
  }));
}
