import { GhostDoctor } from "./ghost-doctor";
import { GhostVaultKnowledgeLibraries, type GhostVaultKnowledgeLibraryInventory } from "./durable-knowledge-libraries";
import type { GhostLocalVault, TearGhostManifest } from "./capsule-vault";

export type GhostVaultRetentionTier = "pinned" | "standard" | "temporary";

export interface GhostVaultMaintenanceOptions {
  /** A deliberately conservative local default until player-configurable policy lands. */
  readonly maximumBytes?: number;
  readonly retention?: Readonly<Record<string, GhostVaultRetentionTier>>;
  readonly now?: () => string;
}

export interface GhostVaultIntegrityEntry {
  readonly id: string;
  readonly healthy: boolean;
}

export interface GhostVaultMaintenanceReport {
  readonly schemaVersion: 1;
  readonly checkedAt: string;
  readonly maximumBytes: number;
  readonly evictedCapsuleIds: readonly string[];
  readonly integrity: readonly GhostVaultIntegrityEntry[];
  readonly rebuiltIndexes: number;
  readonly libraries: GhostVaultKnowledgeLibraryInventory;
}

export const DEFAULT_GHOST_VAULT_MAXIMUM_BYTES = 256 * 1024 * 1024;
export const GHOST_VAULT_MAINTENANCE_KEY = "vault-maintenance:v1";

function sortedIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...ids].sort());
}

async function manifests(vault: GhostLocalVault): Promise<readonly TearGhostManifest[]> {
  const ids = await vault.backend().keys("manifests");
  const values = await Promise.all(ids.map((id) => vault.getManifest(id)));
  return Object.freeze(values.filter((value): value is TearGhostManifest => value !== undefined));
}

/**
 * Runs the durable, bounded Vault upkeep that a player opening their
 * catalog relies on: quota enforcement, index rebuilding, and verified reads.
 */
export async function maintainGhostVault(
  vault: GhostLocalVault,
  options: GhostVaultMaintenanceOptions = {},
): Promise<GhostVaultMaintenanceReport> {
  const maximumBytes = options.maximumBytes ?? DEFAULT_GHOST_VAULT_MAXIMUM_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Ghost Vault maximum bytes must be a non-negative safe integer");
  }
  const evictedCapsuleIds = await vault.enforceQuota(maximumBytes, options.retention ?? {});
  const remaining = await manifests(vault);
  const doctor = new GhostDoctor(vault);
  const checkedAt = (options.now ?? (() => new Date().toISOString()))();
  const scans = await Promise.all(remaining.map(async (manifest) => Object.freeze({
    manifest,
    report: await doctor.scan(manifest.id),
  })));
  const integrity = Object.freeze(scans.map(({ manifest, report }) => Object.freeze({
    id: manifest.id, healthy: report.healthy,
  })));
  const libraries = new GhostVaultKnowledgeLibraries(vault.backend());
  for (const { manifest, report } of scans) {
    if (!report.healthy) await libraries.recordCorruptCapsule(manifest, report, checkedAt);
  }
  const rebuiltIndexes = await doctor.rebuildIndex();
  const report = Object.freeze({
    schemaVersion: 1 as const,
    checkedAt,
    maximumBytes,
    evictedCapsuleIds: sortedIds(evictedCapsuleIds),
    integrity: Object.freeze([...integrity].sort((left, right) => left.id.localeCompare(right.id))),
    rebuiltIndexes,
    libraries: await libraries.inventory(),
  });
  await vault.backend().put("analysis", GHOST_VAULT_MAINTENANCE_KEY, JSON.stringify(report));
  return report;
}
