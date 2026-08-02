import { inspectBrowserGhostVault, type BrowserGhostVaultCatalog } from "../ghost/browser-capsule-vault";
import type { TearGhostManifest } from "../ghost/capsule-vault";

export interface GhostVaultLibraryCapsule {
  readonly id: string;
  readonly createdAt: string;
  readonly status: TearGhostManifest["status"];
  readonly recordingProfile: TearGhostManifest["recordingProfile"];
  readonly chunkCount: number;
  readonly healthy: boolean;
}

export interface GhostVaultLibrarySnapshot {
  readonly status: "idle" | "loading" | "ready" | "unavailable" | "failed";
  readonly capsules: readonly GhostVaultLibraryCapsule[];
  readonly evictedCapsuleIds: readonly string[];
  readonly message?: string;
}

export interface GhostVaultLibraryPort {
  readonly snapshot: () => GhostVaultLibrarySnapshot;
  readonly refresh: () => void;
}

export interface GhostVaultLibraryControllerOptions {
  readonly inspect: () => Promise<BrowserGhostVaultCatalog>;
}

function capsuleView(manifest: TearGhostManifest, healthy: boolean): GhostVaultLibraryCapsule {
  return Object.freeze({
    id: manifest.id,
    createdAt: manifest.createdAt,
    status: manifest.status,
    recordingProfile: manifest.recordingProfile,
    chunkCount: manifest.chunks.length,
    healthy,
  });
}

function frozenSnapshot(
  status: GhostVaultLibrarySnapshot["status"],
  capsules: readonly GhostVaultLibraryCapsule[],
  evictedCapsuleIds: readonly string[] = [],
  message?: string,
): GhostVaultLibrarySnapshot {
  return Object.freeze({
    status,
    capsules: Object.freeze([...capsules]),
    evictedCapsuleIds: Object.freeze([...evictedCapsuleIds]),
    ...(message === undefined ? {} : { message }),
  });
}

/**
 * App-facing vault catalog. It exposes only immutable custody metadata, never
 * a recorder instance or raw unvalidated storage bytes.
 */
export function createGhostVaultLibraryController(options: GhostVaultLibraryControllerOptions): GhostVaultLibraryPort {
  let current = frozenSnapshot("idle", []);
  let generation = 0;
  return Object.freeze({
    snapshot: () => current,
    refresh: () => {
      const request = ++generation;
      current = frozenSnapshot("loading", current.capsules);
      void options.inspect().then((catalog) => {
        if (request !== generation) return;
        const health = new Map(catalog.maintenance.integrity.map((entry) => [entry.id, entry.healthy]));
        const capsules = catalog.manifests.map((manifest) => capsuleView(manifest, health.get(manifest.id) === true))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        current = frozenSnapshot("ready", capsules, catalog.maintenance.evictedCapsuleIds);
      }).catch((error: unknown) => {
        if (request !== generation) return;
        const message = error instanceof Error ? error.message : String(error);
        current = frozenSnapshot("failed", current.capsules, current.evictedCapsuleIds, `Ghost Vault could not open: ${message}`);
      });
    },
  } satisfies GhostVaultLibraryPort);
}

/** Browser composition adapter; unsupported IndexedDB is an explicit non-fatal state. */
export function createBrowserGhostVaultLibrary(factory: IDBFactory | undefined): GhostVaultLibraryPort {
  if (factory === undefined) {
    return Object.freeze({
      snapshot: () => frozenSnapshot("unavailable", [], [], "Ghost Vault is unavailable in this browser."),
      refresh: () => undefined,
    } satisfies GhostVaultLibraryPort);
  }
  return createGhostVaultLibraryController({ inspect: () => inspectBrowserGhostVault(factory) });
}
