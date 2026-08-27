import type {
  EnvironmentClearReason, EnvironmentCombatObjectState, EnvironmentFieldState,
  EnvironmentRouteState, EnvironmentSnapshot,
} from "./environment-contracts";

type EnvironmentEntry = EnvironmentFieldState | EnvironmentCombatObjectState | EnvironmentRouteState;

function orphaned(entry: EnvironmentEntry, availableActorIds: ReadonlySet<string>): boolean {
  const ownerOrphan = entry.ownerId !== null && !availableActorIds.has(entry.ownerId);
  const targetOrphan = "targetId" in entry && entry.targetId !== null && !availableActorIds.has(entry.targetId);
  return entry.state !== "destroyed" && entry.state !== "expired" && (ownerOrphan || targetOrphan);
}

function cleanupEntry<T extends EnvironmentEntry>(entry: T, availableActorIds: ReadonlySet<string>, reason: EnvironmentClearReason): T {
  return orphaned(entry, availableActorIds)
    ? Object.freeze({ ...entry, state: "expired", cleanupReason: reason }) as unknown as T
    : entry;
}

/** Pure commit-time cleanup across all environment collections. */
export function cleanupOrphanedEnvironmentReferences(
  snapshot: EnvironmentSnapshot,
  availableActorIds: ReadonlySet<string>,
  reason: EnvironmentClearReason,
): EnvironmentSnapshot {
  return Object.freeze({
    ...snapshot,
    fields: Object.freeze(snapshot.fields.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
    combatObjects: Object.freeze(snapshot.combatObjects.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
    routes: Object.freeze(snapshot.routes.map((entry) => cleanupEntry(entry, availableActorIds, reason))),
  });
}
