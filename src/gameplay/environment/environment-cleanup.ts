import type {
  EnvironmentClearReason, EnvironmentCombatObjectState, EnvironmentFieldState,
  EnvironmentRouteState, EnvironmentSnapshot,
} from "./environment-contracts";

type EnvironmentEntry = EnvironmentFieldState | EnvironmentCombatObjectState | EnvironmentRouteState;

function orphaned(entry: EnvironmentEntry, availableActorIds: ReadonlySet<string>): boolean {
  const ownerOrphan = entry.ownerId !== null && !availableActorIds.has(entry.ownerId);
  const bossOwnerId = "bossOwnerId" in entry && typeof entry.bossOwnerId === "string" ? entry.bossOwnerId : null;
  const bossOwnerOrphan = bossOwnerId !== null && !availableActorIds.has(bossOwnerId);
  const targetOrphan = "targetId" in entry && entry.targetId !== null && !availableActorIds.has(entry.targetId);
  return entry.state !== "destroyed" && entry.state !== "expired" && (ownerOrphan || bossOwnerOrphan || targetOrphan);
}

function cleanupEntry<T extends EnvironmentEntry>(entry: T, availableActorIds: ReadonlySet<string>, reason: EnvironmentClearReason): T {
  if (!orphaned(entry, availableActorIds)) return entry;
  const missingBossOwner = "bossOwnerId" in entry && typeof entry.bossOwnerId === "string" && !availableActorIds.has(entry.bossOwnerId);
  return Object.freeze({ ...entry, state: entry.kind === "bloom-well" && missingBossOwner ? "dormant" : "expired",
    cleanupReason: missingBossOwner ? "boss-terminal" : reason }) as unknown as T;
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
