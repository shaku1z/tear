import { GhostCareerStore } from "./career-archive-store";
import { ghostRootIntegrity, type GhostLocalVault, type TearGhostManifest } from "./capsule-vault";

export type GhostVaultRetentionTier = "pinned" | "standard" | "temporary";

export interface GhostVaultMaintenanceOptions {
  /** App-owned migrations run on this exact Vault before destructive upkeep. */
  readonly beforeQuota?: (vault: GhostLocalVault) => Promise<void>;
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
}

export const DEFAULT_GHOST_VAULT_MAXIMUM_BYTES = 256 * 1024 * 1024;
export const GHOST_VAULT_MAINTENANCE_KEY = "vault-maintenance:v1";

function sortedIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...ids].sort());
}

/** Whether every chunk of a capsule reads back and its root still matches. Damaged capsules are shown, never repaired. */
export async function ghostCapsuleHealthy(vault: GhostLocalVault, id: string): Promise<boolean> {
  const manifest = await vault.getManifest(id);
  if (manifest === undefined) throw new RangeError(`manifest does not exist: ${id}`);
  for (const entry of manifest.chunks) {
    try {
      await vault.readChunk(entry);
    } catch {
      return false;
    }
  }
  return ghostRootIntegrity(manifest.chunks) === manifest.rootIntegrity;
}

/** Rewrites each capsule's manifest index entry from its manifest. */
async function rebuildManifestIndexes(vault: GhostLocalVault, values: readonly TearGhostManifest[]): Promise<number> {
  for (const manifest of values) {
    await vault
      .backend()
      .put(
        "indexes",
        `manifest:${manifest.id}`,
        JSON.stringify({ status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length }),
      );
  }
  return values.length;
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
  await options.beforeQuota?.(vault);
  const evictedCapsuleIds = await vault.enforceQuota(maximumBytes, {
    ...(await new GhostCareerStore(vault.backend()).retention()),
    ...options.retention,
  });
  const remaining = await manifests(vault);
  const checkedAt = (options.now ?? (() => new Date().toISOString()))();
  const integrity = Object.freeze(
    await Promise.all(
      remaining.map(async (manifest) =>
        Object.freeze({ id: manifest.id, healthy: await ghostCapsuleHealthy(vault, manifest.id) }),
      ),
    ),
  );
  const rebuiltIndexes = await rebuildManifestIndexes(vault, remaining);
  const report = Object.freeze({
    schemaVersion: 1 as const,
    checkedAt,
    maximumBytes,
    evictedCapsuleIds: sortedIds(evictedCapsuleIds),
    integrity: Object.freeze([...integrity].sort((left, right) => left.id.localeCompare(right.id))),
    rebuiltIndexes,
  });
  await vault.backend().put("analysis", GHOST_VAULT_MAINTENANCE_KEY, JSON.stringify(report));
  return report;
}
