import {
  inspectBrowserGhostVault,
  repairBrowserGhostCapsule,
  type BrowserGhostVaultCatalog,
  type BrowserGhostVaultRepairResult,
} from "../ghost/browser-capsule-vault";
import type { TearGhostManifest } from "../ghost/capsule-vault";
import type { GhostLibraryKind } from "../ghost/knowledge-libraries";

export interface GhostVaultLibraryCapsule {
  readonly id: string;
  readonly createdAt: string;
  readonly status: TearGhostManifest["status"];
  readonly recordingProfile: TearGhostManifest["recordingProfile"];
  readonly chunkCount: number;
  readonly healthy: boolean;
  readonly libraries: readonly GhostLibraryKind[];
  readonly repairable: boolean;
  readonly repairChildId?: string;
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
  readonly repair: (id: string) => void;
}

export interface GhostVaultLibraryControllerOptions {
  readonly inspect: () => Promise<BrowserGhostVaultCatalog>;
  readonly repair: (id: string) => Promise<BrowserGhostVaultRepairResult>;
}

function capsuleView(
  manifest: TearGhostManifest,
  healthy: boolean,
  libraries: readonly GhostLibraryKind[],
  repairChildId?: string,
): GhostVaultLibraryCapsule {
  return Object.freeze({
    id: manifest.id,
    createdAt: manifest.createdAt,
    status: manifest.status,
    recordingProfile: manifest.recordingProfile,
    chunkCount: manifest.chunks.length,
    healthy,
    libraries: Object.freeze([...libraries].sort()),
    repairable: !healthy && repairChildId === undefined,
    ...(repairChildId === undefined ? {} : { repairChildId }),
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
  const catalogSnapshot = (catalog: BrowserGhostVaultCatalog, message?: string): GhostVaultLibrarySnapshot => {
    const health = new Map(catalog.maintenance.integrity.map((entry) => [entry.id, entry.healthy]));
    const memberships = new Map<string, GhostLibraryKind[]>();
    const repairedChildren = new Map<string, string>();
    for (const entry of catalog.maintenance.libraries.entries) {
      const membershipsForGhost = memberships.get(entry.ghostId) ?? [];
      membershipsForGhost.push(entry.library);
      memberships.set(entry.ghostId, membershipsForGhost);
    }
    for (const manifest of catalog.manifests) {
      if (manifest.lineage?.relation === "repaired-from") repairedChildren.set(manifest.lineage.parentId, manifest.id);
    }
    const capsules = catalog.manifests.map((manifest) => capsuleView(manifest, health.get(manifest.id) === true,
      memberships.get(manifest.id) ?? [], repairedChildren.get(manifest.id)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return frozenSnapshot("ready", capsules, catalog.maintenance.evictedCapsuleIds, message);
  };
  return Object.freeze({
    snapshot: () => current,
    refresh: () => {
      const request = ++generation;
      current = frozenSnapshot("loading", current.capsules);
      void options.inspect().then((catalog) => {
        if (request !== generation) return;
        current = catalogSnapshot(catalog);
      }).catch((error: unknown) => {
        if (request !== generation) return;
        const message = error instanceof Error ? error.message : String(error);
        current = frozenSnapshot("failed", current.capsules, current.evictedCapsuleIds, `Ghost Vault could not open: ${message}`);
      });
    },
    repair: (id) => {
      const source = current.capsules.find((capsule) => capsule.id === id);
      if (!source?.repairable) {
        current = frozenSnapshot("failed", current.capsules, current.evictedCapsuleIds, "This Ghost capsule cannot be repaired.");
        return;
      }
      const request = ++generation;
      current = frozenSnapshot("loading", current.capsules);
      void options.repair(id).then((repair) => options.inspect().then((catalog) => Object.freeze({ repair, catalog })))
        .then(({ repair, catalog }) => {
          if (request !== generation) return;
          current = catalogSnapshot(catalog, repair.reused
            ? "A verified repair child is already available."
            : "Ghost repair child created; the original remains preserved.");
        }).catch((error: unknown) => {
          if (request !== generation) return;
          const message = error instanceof Error ? error.message : String(error);
          current = frozenSnapshot("failed", current.capsules, current.evictedCapsuleIds, `Ghost repair failed: ${message}`);
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
      repair: () => undefined,
    } satisfies GhostVaultLibraryPort);
  }
  return createGhostVaultLibraryController({ inspect: () => inspectBrowserGhostVault(factory),
    repair: (id) => repairBrowserGhostCapsule(factory, id) });
}
