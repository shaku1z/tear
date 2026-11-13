import {
  inspectBrowserGhostVaultReadOnly,
  repairBrowserGhostCapsule,
  type BrowserGhostVaultCatalog,
  type BrowserGhostVaultRepairResult,
} from "../../ghost/browser-capsule-vault";
import type { TearGhostManifest } from "../../ghost/capsule-vault";
import { createBrowserGhostColdRestore, type BrowserGhostColdRestorePort } from "../../ghost/browser-cold-restore";
import { readGhostFinaleCompanion } from "../../ghost/finale-companion";
import { NORMAL_GHOST_ARCHIVE_LIMITS } from "../../ghost/capsule-archive";
import type { GhostColdRestoreJob } from "../../ghost/cold-restore-job";
import { GhostColdRestoreError } from "../../ghost/cold-restore";
import {
  normalBrowserGhostArchiveFiles,
  type GhostArchiveFile,
  type GhostArchiveFilePort,
} from "./browser-ghost-archive-files";
import type { GhostArchiveOperationView } from "../../presentation/screens/contracts";
import type { GhostLibraryKind } from "../../ghost/knowledge-libraries";
import type { GhostTheaterOpenResult } from "../../ghost/theater-open-result";

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
  /** Player-safe, runtime-only Theater eligibility; custody remains unchanged. */
  readonly theaterEligible: boolean;
  readonly canDownloadLinkedPair?: boolean;
  readonly theaterRefusal?: GhostTheaterOpenResult;
}

export interface GhostVaultLibrarySnapshot {
  readonly status: "idle" | "loading" | "ready" | "unavailable" | "failed";
  readonly capsules: readonly GhostVaultLibraryCapsule[];
  readonly evictedCapsuleIds: readonly string[];
  readonly message?: string;
  readonly archive?: GhostArchiveOperationView;
}

export interface GhostVaultLibraryPort {
  readonly snapshot: () => GhostVaultLibrarySnapshot;
  readonly refresh: () => void;
  readonly repair: (id: string) => void;
  readonly setTheaterEligibility: (id: string, result: GhostTheaterOpenResult) => void;
  readonly pickArchive: (jobId?: string) => void;
  readonly restoreArchive: (id: string, revision: number) => void;
  readonly cancelArchive: (id?: string, revision?: number) => void;
  readonly downloadArchive: (id: string, paired?: boolean) => void;
  readonly dispose: () => void;
}

export interface GhostVaultLibraryControllerOptions {
  readonly inspect: () => Promise<BrowserGhostVaultCatalog>;
  readonly repair: (id: string) => Promise<BrowserGhostVaultRepairResult>;
  readonly files?: GhostArchiveFilePort;
  readonly restore?: BrowserGhostColdRestorePort;
  readonly newIntent?: () => string;
}

function createArchiveActions(options: GhostVaultLibraryControllerOptions, refresh: () => void) {
  let generation = 0,
    disposed = false,
    picker: (() => void) | undefined,
    bytes: Uint8Array | undefined,
    job: GhostColdRestoreJob | undefined;
  let view: GhostArchiveOperationView = Object.freeze({
    status: options.files && options.restore ? "idle" : "unavailable",
    detail: "Select a local complete capsule archive. No upload or training.",
    canPick: Boolean(options.files && options.restore),
  });
  const show = (status: GhostArchiveOperationView["status"], detail: string, ready = false): void => {
    view = Object.freeze({
      status,
      detail,
      canPick:
        !disposed &&
        Boolean(options.files && options.restore) &&
        !["restoring", "validating", "picking"].includes(status),
      ...(job === undefined
        ? {}
        : {
            jobId: job.id,
            revision: job.revision,
            capsuleId: job.binding.capsuleId,
            byteLength: job.binding.byteLength,
            sha256: job.binding.sha256,
            rootIntegrity: job.binding.rootIntegrity,
            schemaVersion: job.binding.schemaVersion,
            ...(job.binding.protocol === "ghost-linked-archive-v1"
              ? { pairedCapsuleIds: job.binding.members.map((m) => m.capsuleId) }
              : {}),
            canReselect: !["cancelled", "restoring", "validating", "picking"].includes(status),
            canRestore: ready,
            canCancel:
              !["cancelled", "complete"].includes(status) && job.state !== "cancelled" && job.state !== "complete",
          }),
      canCancelSelection: ["picking", "validating"].includes(status),
    });
  };
  const clear = (): void => {
    picker?.();
    picker = undefined;
    bytes = undefined;
  };
  const fail = (error: unknown): void => {
    bytes = undefined;
    show(
      "failed",
      error instanceof GhostColdRestoreError
        ? restoreFailureMessage(error.code)
        : "Archive operation refused. Select a bounded valid local archive and try explicitly.",
    );
  };
  const current = (token: number): boolean => !disposed && token === generation;
  const hasJob = (): boolean => job !== undefined;
  const selected = async (file: GhostArchiveFile, token: number, resumeId?: string): Promise<void> => {
    if (!current(token) || !options.restore) return;
    try {
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > NORMAL_GHOST_ARCHIVE_LIMITS.maxEncodedBytes)
        throw new GhostColdRestoreError("limits", "File exceeds limit.");
      show("validating", "Validating the selected archive locally…");
      const selectedBytes = new Uint8Array(await file.arrayBuffer());
      if (!current(token)) return;
      if (selectedBytes.byteLength !== file.size)
        throw new GhostColdRestoreError("input-mismatch", "Selected file size changed.");
      const result =
        resumeId === undefined
          ? await options.restore.select(options.newIntent?.() ?? crypto.randomUUID(), selectedBytes)
          : await options.restore.reselect(resumeId, selectedBytes);
      if (!current(token)) return;
      job = result.job;
      bytes = selectedBytes;
      show(
        "ready",
        `Archive validated. ${result.fidelity}. Choose ${job.state === "complete" ? "VALIDATE CUSTODY" : job.binding.protocol === "ghost-linked-archive-v1" ? "RESTORE BOTH" : "RESTORE"} explicitly.`,
        true,
      );
    } catch (error) {
      if (current(token)) fail(error);
    }
  };
  return {
    snapshot: () => view,
    reload: async () => {
      if (!options.restore || job !== undefined || disposed) return;
      const token = generation;
      try {
        const jobs = await options.restore.jobs();
        if (!current(token) || hasJob()) return;
        job = jobs.find((entry) => entry.state !== "cancelled");
        if (job)
          show(
            "reselect-required",
            job.state === "complete"
              ? "Historical completion recorded. Reselect its exact archive and explicitly validate current custody."
              : "Restore intent retained. Reselect its exact archive, then explicitly resume.",
          );
      } catch (error) {
        if (current(token)) fail(error);
      }
    },
    pickArchive: (jobId?: string): void => {
      if (
        disposed ||
        !options.files ||
        !options.restore ||
        ["restoring", "validating", "picking"].includes(view.status)
      )
        return;
      if (jobId !== undefined && job?.id !== jobId) return;
      const token = ++generation;
      clear();
      if (jobId === undefined) job = undefined;
      show("picking", "Choose one local capsule archive. Cancelling keeps Vault custody unchanged.");
      try {
        picker = options.files.pick(
          (file) => {
            picker = undefined;
            void selected(file, token, jobId);
          },
          () => {
            if (current(token)) {
              clear();
              show(job ? "reselect-required" : "idle", "File selection cancelled. No archive bytes retained.");
            }
          },
        );
      } catch {
        clear();
        show("failed", "File picker unavailable or activation expired. Click or tap SELECT ARCHIVE again.");
      }
    },
    restoreArchive: (id: string, revision: number): void => {
      if (
        disposed ||
        !options.restore ||
        view.status !== "ready" ||
        !bytes ||
        job?.id !== id ||
        job.revision !== revision
      )
        return;
      const token = ++generation,
        selectedBytes = bytes,
        selectedJob = job;
      bytes = undefined;
      show("restoring", "Restoring exact selected bytes locally…");
      void options.restore.restore(selectedJob, selectedBytes).then(
        () => {
          if (!current(token)) return;
          show("complete", "Current capsule custody validated. No consent, training or publication authority added.");
          refresh();
        },
        (error: unknown) => {
          if (current(token)) fail(error);
        },
      );
    },
    cancelArchive: (id?: string, revision?: number): void => {
      if (disposed) return;
      if (id === undefined) {
        ++generation;
        clear();
        show(job ? "reselect-required" : "idle", "Selection cancelled. No selected archive bytes retained.");
        return;
      }
      if (!options.restore || job?.id !== id || job.revision !== revision) return;
      const token = ++generation,
        cancelledJob = job;
      clear();
      void options.restore.cancel(cancelledJob).then(
        (result) => {
          if (!current(token)) return;
          job = result;
          show(
            result.state === "cancelled" ? "cancelled" : "reselect-required",
            result.state === "cancelled"
              ? "Restore cancelled. Existing capsules remain unchanged."
              : "Completion recorded. Reselect exact bytes to validate current custody.",
          );
        },
        (error: unknown) => {
          if (current(token)) fail(error);
        },
      );
    },
    downloadArchive: (id: string, paired = false): void => {
      if (
        disposed ||
        !options.restore ||
        !options.files ||
        ["restoring", "validating", "picking"].includes(view.status)
      )
        return;
      const token = ++generation;
      clear();
      show("validating", "Validating original capsule chunks for local download…");
      void options.restore
        .download(id, paired)
        .then((result) => {
          if (!current(token)) return;
          options.files?.download(result.bytes, `ghost-${result.binding.sha256.slice(0, 16)}.tearghost.json`);
          show(
            "download-requested",
            `Download requested: ${String(result.binding.byteLength)} bytes; SHA256 ${result.binding.sha256}. Browser save is not confirmed.`,
          );
        })
        .catch((error: unknown) => {
          if (current(token)) fail(error);
        });
    },
    dispose: (): void => {
      disposed = true;
      ++generation;
      clear();
      job = undefined;
      show("unavailable", "Local file operations closed.");
    },
  };
}

function restoreFailureMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    "input-mismatch": "This file differs from the retained restore intent. Reselect the exact original file.",
    "commit-indeterminate":
      "Completion could not be confirmed. Reselect exact bytes and explicitly validate current custody.",
    "physical-quota": "Storage refused the transaction. Free space separately, then reselect and retry explicitly.",
    "logical-quota": "Archive exceeds the local retained-data limit. No capsules were evicted.",
    cancelled: "Restore was cancelled. Select an archive to create a new intent.",
    conflict: "Restore authority changed. Refresh and reselect the exact file.",
    limits: "Archive exceeds the bounded local file limits.",
    unavailable: "Local archive storage is unavailable.",
  };
  return messages[code] ?? "Archive validation refused malformed, incomplete or unsupported data.";
}

function capsuleView(
  manifest: TearGhostManifest,
  healthy: boolean,
  libraries: readonly GhostLibraryKind[],
  repairChildId?: string,
  theaterRefusal?: GhostTheaterOpenResult,
  repairMetadataComplete = false,
): GhostVaultLibraryCapsule {
  return Object.freeze({
    id: manifest.id,
    createdAt: manifest.createdAt,
    status: manifest.status,
    recordingProfile: manifest.recordingProfile,
    chunkCount: manifest.chunks.length,
    healthy,
    libraries: Object.freeze([...libraries].sort()),
    repairable: !healthy && (repairChildId === undefined || !repairMetadataComplete),
    theaterEligible: theaterRefusal?.kind !== "refused",
    ...(theaterRefusal === undefined ? {} : { theaterRefusal }),
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
  const theaterRefusals = new Map<string, GhostTheaterOpenResult>();
  let refresh = (): void => undefined;
  const archive = createArchiveActions(options, () => {
    refresh();
  });
  const catalogSnapshot = (catalog: BrowserGhostVaultCatalog, message?: string): GhostVaultLibrarySnapshot => {
    const health = new Map(catalog.maintenance.integrity.map((entry) => [entry.id, entry.healthy]));
    const memberships = new Map<string, GhostLibraryKind[]>();
    const repairedChildren = new Map<string, string>();
    const repairMetadata = new Map(catalog.repairMetadata?.map((entry) => [entry.id, entry.complete]));
    for (const entry of catalog.maintenance.libraries.entries) {
      const membershipsForGhost = memberships.get(entry.ghostId) ?? [];
      membershipsForGhost.push(entry.library);
      memberships.set(entry.ghostId, membershipsForGhost);
    }
    for (const manifest of catalog.manifests) {
      if (manifest.lineage?.relation === "repaired-from") repairedChildren.set(manifest.lineage.parentId, manifest.id);
    }
    const capsules = catalog.manifests
      .map((manifest) => {
        let linked = false;
        try {
          const declaration = readGhostFinaleCompanion(manifest.provenance);
          linked =
            declaration !== undefined
              ? catalog.manifests.some((m) => m.id === declaration.parentId && m.status === "complete")
              : catalog.manifests.filter((m) => {
                  try {
                    return m.status === "complete" && readGhostFinaleCompanion(m.provenance)?.parentId === manifest.id;
                  } catch {
                    return false;
                  }
                }).length === 1;
        } catch {
          /* Malformed declarations never expose the paired action. */
        }
        return Object.freeze({
          ...capsuleView(
            manifest,
            health.get(manifest.id) === true,
            memberships.get(manifest.id) ?? [],
            repairedChildren.get(manifest.id),
            theaterRefusals.get(manifest.id),
            repairMetadata.get(manifest.id),
          ),
          canDownloadLinkedPair: linked && health.get(manifest.id) === true && manifest.status === "complete",
        });
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return frozenSnapshot("ready", capsules, catalog.maintenance.evictedCapsuleIds, message);
  };
  refresh = () => {
    const request = ++generation;
    current = frozenSnapshot("loading", current.capsules);
    void options
      .inspect()
      .then((catalog) => {
        if (request !== generation) return;
        current = catalogSnapshot(catalog);
        void archive.reload();
      })
      .catch((error: unknown) => {
        if (request !== generation) return;
        const message = error instanceof Error ? error.message : String(error);
        current = frozenSnapshot(
          "failed",
          current.capsules,
          current.evictedCapsuleIds,
          `Ghost Vault could not open: ${message}`,
        );
      });
  };
  return Object.freeze({
    snapshot: () => Object.freeze({ ...current, archive: archive.snapshot() }),
    refresh,
    pickArchive: archive.pickArchive,
    restoreArchive: archive.restoreArchive,
    cancelArchive: archive.cancelArchive,
    downloadArchive: archive.downloadArchive,
    dispose: () => {
      generation++;
      archive.dispose();
    },
    repair: (id) => {
      const source = current.capsules.find((capsule) => capsule.id === id);
      if (!source?.repairable) {
        current = frozenSnapshot(
          "failed",
          current.capsules,
          current.evictedCapsuleIds,
          "This Ghost capsule cannot be repaired.",
        );
        return;
      }
      const request = ++generation;
      current = frozenSnapshot("loading", current.capsules);
      void options
        .repair(id)
        .then((repair) => options.inspect().then((catalog) => Object.freeze({ repair, catalog })))
        .then(({ repair, catalog }) => {
          if (request !== generation) return;
          current = catalogSnapshot(
            catalog,
            repair.reused
              ? "A verified repair child is already available."
              : "Ghost repair child created; the original remains preserved.",
          );
        })
        .catch((error: unknown) => {
          if (request !== generation) return;
          const message = error instanceof Error ? error.message : String(error);
          current = frozenSnapshot(
            "failed",
            current.capsules,
            current.evictedCapsuleIds,
            `Ghost repair failed: ${message}`,
          );
        });
    },
    setTheaterEligibility: (id, result) => {
      if (result.kind !== "refused" || !current.capsules.some((capsule) => capsule.id === id)) return;
      theaterRefusals.set(id, result);
      current = frozenSnapshot(
        current.status,
        current.capsules.map((capsule) =>
          capsule.id !== id
            ? capsule
            : Object.freeze({
                ...capsule,
                theaterEligible: false,
                theaterRefusal: result,
              }),
        ),
        current.evictedCapsuleIds,
        current.message,
      );
    },
  } satisfies GhostVaultLibraryPort);
}

/** Browser composition adapter; unsupported IndexedDB is an explicit non-fatal state. */
export function createBrowserGhostVaultLibrary(factory: IDBFactory | undefined): GhostVaultLibraryPort {
  if (factory === undefined) {
    return Object.freeze({
      snapshot: () =>
        Object.freeze({
          ...frozenSnapshot("unavailable", [], [], "Ghost Vault is unavailable in this browser."),
          archive: Object.freeze({
            status: "unavailable" as const,
            detail: "Local archive storage is unavailable in this browser.",
            canPick: false,
          }),
        }),
      refresh: () => undefined,
      repair: () => undefined,
      setTheaterEligibility: () => undefined,
      pickArchive: () => undefined,
      restoreArchive: () => undefined,
      cancelArchive: () => undefined,
      downloadArchive: () => undefined,
      dispose: () => undefined,
    } satisfies GhostVaultLibraryPort);
  }
  const files = normalBrowserGhostArchiveFiles();
  return createGhostVaultLibraryController({
    inspect: () => inspectBrowserGhostVaultReadOnly(factory),
    ...(files === undefined ? {} : { files }),
    restore: createBrowserGhostColdRestore(factory),
    repair: (id) => repairBrowserGhostCapsule(factory, id),
  });
}
