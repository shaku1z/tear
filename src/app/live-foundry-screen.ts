import { TearFoundryJobVault, TearFoundryRecoveryController } from "../agents";
import type { GhostVaultBackend } from "../ghost";
import { createIndexedDbGhostVaultBackend } from "../ghost";
import type { FoundryScreenView } from "../presentation/screens/contracts";

type FoundrySnapshot = FoundryScreenView;

/** Browser composition for the read-only C36 recovery screen. */
export class LiveFoundryScreenController {
  #snapshot: FoundrySnapshot = Object.freeze({ id: "foundry", status: "loading", subtitle: "reading local Foundry recovery projections", automation: "unavailable", jobs: [] });
  readonly #backend: GhostVaultBackend | undefined;

  constructor(backend: GhostVaultBackend | undefined) { this.#backend = backend; }
  snapshot(): FoundrySnapshot { return this.#snapshot; }

  async refresh(): Promise<FoundrySnapshot> {
    if (this.#backend === undefined) return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry storage is unavailable in this runtime", automation: "unavailable", jobs: [] });
    try {
      const vault = new TearFoundryJobVault(this.#backend), recovery = new TearFoundryRecoveryController(vault);
      const projections = (await Promise.all((await vault.list()).map((job) => recovery.project(job.id)))).filter((value): value is NonNullable<typeof value> => value !== undefined);
      return this.#set({ id: "foundry", status: "ready", subtitle: "local, hashes-only restart recovery", automation: "unavailable", jobs: projections.map((projection) => Object.freeze({
        jobHash: projection.jobHash, phase: projection.phase, nextManualPhase: projection.nextManualPhase, resumable: projection.resumable,
        eventCount: projection.provenance.eventCount, lastEventHash: projection.provenance.lastEventHash, projectionHash: projection.projectionHash,
      })) });
    } catch { return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry recovery projections could not be read", automation: "unavailable", jobs: [] }); }
  }

  #set(snapshot: FoundrySnapshot): FoundrySnapshot { this.#snapshot = Object.freeze({ ...snapshot, jobs: Object.freeze(snapshot.jobs) }); return this.#snapshot; }
}

export function createLiveFoundryScreen(factory: IDBFactory | undefined): Readonly<{ snapshot: () => FoundryScreenView; refresh: () => void }> {
  const controller = new LiveFoundryScreenController(undefined);
  // The delayed browser backend needs one stable controller instance, not a replacement captured by the renderer.
  let active = controller;
  if (factory === undefined) void active.refresh();
  else void createIndexedDbGhostVaultBackend(factory).then((backend) => { active = new LiveFoundryScreenController(backend); return active.refresh(); }).catch(() => { void active.refresh(); });
  return Object.freeze({ snapshot: () => active.snapshot(), refresh: () => { void active.refresh(); } });
}
