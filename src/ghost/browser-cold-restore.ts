import {
  prepareCompleteGhostPairedArchive,
  prepareGhostPortableArchive,
  type GhostPortableArchiveBinding,
} from "./capsule-paired-archive";
import { canonicalStringify } from "../domain/hash";
import { prepareCompleteGhostCapsuleArchive } from "./capsule-archive";
import { GhostColdRestore, GhostColdRestoreError } from "./cold-restore";
import { ghostColdRestoreJobKey, parseGhostColdRestoreJob, type GhostColdRestoreJob } from "./cold-restore-job";
import { GhostLocalVault } from "./capsule-vault";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";

export interface GhostArchiveSelection {
  readonly job: GhostColdRestoreJob;
  readonly fidelity: string;
}
export interface BrowserGhostColdRestorePort {
  readonly jobs: () => Promise<readonly GhostColdRestoreJob[]>;
  readonly select: (id: string, bytes: Uint8Array) => Promise<GhostArchiveSelection>;
  readonly reselect: (id: string, bytes: Uint8Array) => Promise<GhostArchiveSelection>;
  readonly restore: (job: GhostColdRestoreJob, bytes: Uint8Array) => Promise<void>;
  readonly cancel: (job: GhostColdRestoreJob) => Promise<GhostColdRestoreJob>;
  readonly download: (
    id: string,
    paired?: boolean,
  ) => Promise<Readonly<{ bytes: Uint8Array; binding: GhostPortableArchiveBinding }>>;
}

/** Explicit local operations over the production backend; no maintenance or automatic work. */
export function createGhostColdRestoreBrowserPort(vault: GhostLocalVault): BrowserGhostColdRestorePort {
  const service = new GhostColdRestore(vault);
  const ownedAttempts = new Map<string, Readonly<{ revision: number; lease: string }>>();
  const intent = (job: GhostColdRestoreJob): string =>
    canonicalStringify({
      id: job.id,
      createdAt: job.createdAt,
      binding: job.binding,
      limits: job.limits,
      baseline: job.baseline,
    });
  const read = async (id: string): Promise<GhostColdRestoreJob> => {
    const job = await service.read(id);
    if (job === undefined) throw new GhostColdRestoreError("input-required", "Restore intent is unavailable.");
    return job;
  };
  const selection = async (job: GhostColdRestoreJob, bytes: Uint8Array): Promise<GhostArchiveSelection> => {
    const archive = await prepareGhostPortableArchive(bytes, job.limits);
    if (canonicalStringify(archive.binding) !== canonicalStringify(job.binding))
      throw new GhostColdRestoreError("input-mismatch", "Select the exact original archive file.");
    if (job.state === "cancelled") throw new GhostColdRestoreError("cancelled", "This restore intent was cancelled.");
    const manifests = "members" in archive ? archive.members.map((member) => member.manifest) : [archive.manifest];
    return Object.freeze({
      job,
      fidelity: manifests
        .map(
          (manifest) =>
            `${manifest.id}: ${manifest.fidelity.presentation}; ${String(manifest.fidelity.downgrades.length)} declared downgrade(s)`,
        )
        .join(" + "),
    });
  };
  return Object.freeze({
    jobs: async () => {
      const jobs: GhostColdRestoreJob[] = [];
      for (const key of await vault.backend().keys("analysis")) {
        if (!key.startsWith("ghost-cold-restore:job:v1:")) continue;
        const raw = await vault.backend().get("analysis", key);
        if (raw === undefined) continue;
        const job = parseGhostColdRestoreJob(raw);
        if (ghostColdRestoreJobKey(job.id) !== key)
          throw new GhostColdRestoreError("conflict", "Restore metadata identity differs.");
        jobs.push(job);
      }
      return Object.freeze(jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)));
    },
    select: async (id, bytes) => selection(await service.select(id, bytes), bytes),
    reselect: async (id, bytes) => selection(await read(id), bytes),
    restore: async (job, bytes) => {
      if (ownedAttempts.has(job.id))
        throw new GhostColdRestoreError("conflict", "A local restore attempt is already active.");
      const owned = Object.freeze({ revision: job.revision, lease: crypto.randomUUID() });
      ownedAttempts.set(job.id, owned);
      try {
        const current = await read(job.id);
        if (canonicalStringify(current) !== canonicalStringify(job))
          throw new GhostColdRestoreError("conflict", "Restore revision changed; reselect explicitly.");
        await new GhostColdRestore(vault, { lease: () => owned.lease }).restore(job.id, bytes, undefined, job);
      } finally {
        if (ownedAttempts.get(job.id) === owned) ownedAttempts.delete(job.id);
      }
    },
    cancel: async (job) => {
      const current = await read(job.id),
        owned = ownedAttempts.get(job.id);
      if (intent(current) !== intent(job))
        throw new GhostColdRestoreError("conflict", "Restore intent identity changed.");
      // Completion is historical metadata here, never a claim of current custody.
      if (current.state === "complete") return current;
      // A running attempt has one internal revision after its displayed ready
      // revision. Only this facade's exact lease may cancel that successor.
      if (
        current.revision !== job.revision &&
        !(
          current.state === "restoring" &&
          owned?.revision === job.revision &&
          current.revision === job.revision + 1 &&
          current.lease === owned.lease
        )
      )
        throw new GhostColdRestoreError("conflict", "Restore cancellation revision changed.");
      return service.cancel(current.id, current.revision);
    },
    download: (id, paired) =>
      paired ? prepareCompleteGhostPairedArchive(vault, id) : prepareCompleteGhostCapsuleArchive(vault, id),
  } satisfies BrowserGhostColdRestorePort);
}

/** Opening IndexedDB is deferred until after the synchronous normal picker action. */
export function createBrowserGhostColdRestore(factory: IDBFactory | undefined): BrowserGhostColdRestorePort {
  let opened: Promise<BrowserGhostColdRestorePort> | undefined;
  const open = (): Promise<BrowserGhostColdRestorePort> => {
    if (factory === undefined)
      return Promise.reject(new GhostColdRestoreError("unavailable", "Ghost Vault is unavailable."));
    return (opened ??= createIndexedDbGhostVaultBackend(factory).then((backend) =>
      createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)),
    ));
  };
  return Object.freeze({
    jobs: async () => (await open()).jobs(),
    select: async (id, bytes) => (await open()).select(id, bytes),
    reselect: async (id, bytes) => (await open()).reselect(id, bytes),
    restore: async (job, bytes) => (await open()).restore(job, bytes),
    cancel: async (job) => (await open()).cancel(job),
    download: async (id, paired) => (await open()).download(id, paired),
  } satisfies BrowserGhostColdRestorePort);
}
