import type {
  EnvironmentClearReason,
  EnvironmentCombatObjectState,
  EnvironmentFieldState,
  EnvironmentRouteState,
  EnvironmentSnapshot,
} from "./environment-contracts";

type EnvironmentEntry = EnvironmentFieldState | EnvironmentCombatObjectState | EnvironmentRouteState;
/** The only capability cleanup needs from an actor-id collection. */
export type EnvironmentActorIds = Pick<ReadonlySet<string>, "has">;

function orphaned(entry: EnvironmentEntry, availableActorIds: EnvironmentActorIds): boolean {
  const ownerOrphan = entry.ownerId !== null && !availableActorIds.has(entry.ownerId);
  const bossOwnerId = "bossOwnerId" in entry && typeof entry.bossOwnerId === "string" ? entry.bossOwnerId : null;
  const bossOwnerOrphan = bossOwnerId !== null && !availableActorIds.has(bossOwnerId);
  const targetOrphan = "targetId" in entry && entry.targetId !== null && !availableActorIds.has(entry.targetId);
  return entry.state !== "destroyed" && entry.state !== "expired" && (ownerOrphan || bossOwnerOrphan || targetOrphan);
}

function cleanupEntry<T extends EnvironmentEntry>(
  entry: T,
  availableActorIds: EnvironmentActorIds,
  reason: EnvironmentClearReason,
): T {
  if (!orphaned(entry, availableActorIds)) return entry;
  const missingBossOwner =
    "bossOwnerId" in entry && typeof entry.bossOwnerId === "string" && !availableActorIds.has(entry.bossOwnerId);
  return Object.freeze({
    ...entry,
    state: entry.kind === "bloom-well" && missingBossOwner ? "dormant" : "expired",
    cleanupReason: missingBossOwner ? "boss-terminal" : reason,
  }) as unknown as T;
}

/** The actor id an actor-reference list item names, if it is one. */
export function environmentActorReferenceId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const actorId = (value as Readonly<{ actorId?: unknown }>).actorId;
  return typeof actorId === "string" ? actorId : undefined;
}

/** True when some array-valued property lists an actor reference to a missing actor. */
function hasMissingActorReference(
  entry: Readonly<Record<string, unknown>>,
  availableActorIds: EnvironmentActorIds,
): boolean {
  for (const key in entry) {
    const value = entry[key];
    if (!Array.isArray(value)) continue;
    for (const item of value as readonly unknown[]) {
      const actorId = environmentActorReferenceId(item);
      if (actorId !== undefined && !availableActorIds.has(actorId)) return true;
    }
  }
  return false;
}

/**
 * True when commit-time cleanup would change anything: an entry is orphaned,
 * or a field lists a reference to a missing actor. When this is false the
 * cleanup pass returns every entry unchanged, so it can be skipped without
 * cloning the environment.
 */
export function environmentNeedsOrphanCleanup(
  fields: readonly EnvironmentFieldState[],
  combatObjects: readonly EnvironmentCombatObjectState[],
  routes: readonly EnvironmentRouteState[],
  availableActorIds: EnvironmentActorIds,
): boolean {
  for (const field of fields) {
    if (orphaned(field, availableActorIds)) return true;
    if (hasMissingActorReference(field as unknown as Readonly<Record<string, unknown>>, availableActorIds)) return true;
  }
  for (const entry of combatObjects) if (orphaned(entry, availableActorIds)) return true;
  for (const entry of routes) if (orphaned(entry, availableActorIds)) return true;
  return false;
}

/** Pure commit-time cleanup across all environment collections. */
export function cleanupOrphanedEnvironmentReferences(
  snapshot: EnvironmentSnapshot,
  availableActorIds: EnvironmentActorIds,
  reason: EnvironmentClearReason,
): EnvironmentSnapshot {
  return Object.freeze({
    ...snapshot,
    fields: Object.freeze(snapshot.fields.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
    combatObjects: Object.freeze(snapshot.combatObjects.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
    routes: Object.freeze(snapshot.routes.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
  });
}
