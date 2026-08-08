import { TearAcademyCandidateCustodyStore, TearFoundryJobScheduleVault, TearFoundryJobVault, TearFoundryRecoveryController, TearFoundryScheduleController } from "../agents";
import type { GhostVaultBackend } from "../ghost";
import { createIndexedDbGhostVaultBackend } from "../ghost";
import type { FoundryScreenView } from "../presentation/screens/contracts";

type FoundrySnapshot = FoundryScreenView;

/** Browser composition for the read-only C36 recovery screen. */
export class LiveFoundryScreenController {
  #snapshot: FoundrySnapshot = Object.freeze({ id: "foundry", status: "loading", subtitle: "reading local Foundry recovery projections", automation: "unavailable", jobs: [], schedules: [] });
  readonly #backend: GhostVaultBackend | undefined;

  constructor(backend: GhostVaultBackend | undefined) { this.#backend = backend; }
  snapshot(): FoundrySnapshot { return this.#snapshot; }

  async refresh(): Promise<FoundrySnapshot> {
    if (this.#backend === undefined) return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry storage is unavailable in this runtime", automation: "unavailable", jobs: [], schedules: [] });
    try {
      const vault = new TearFoundryJobVault(this.#backend), recovery = new TearFoundryRecoveryController(vault), schedules = new TearFoundryJobScheduleVault(this.#backend), custody = new TearAcademyCandidateCustodyStore(this.#backend);
      const projections = (await Promise.all((await vault.list()).map((job) => recovery.project(job.id)))).filter((value): value is NonNullable<typeof value> => value !== undefined);
      const scheduleProjections = await new TearFoundryScheduleController(vault, schedules, { held: async (job, at) => {
        const held = await custody.held(at); return job.inputs.corpusRecordHashes.every((hash) => held.some((record) => record.candidateHash === hash));
      } }).discoverDue(new Date().toISOString());
      return this.#set({ id: "foundry", status: "ready", subtitle: "local, hashes-only restart recovery", automation: "unavailable", jobs: projections.map((projection) => Object.freeze({
        jobHash: projection.jobHash, phase: projection.phase, nextManualPhase: projection.nextManualPhase, resumable: projection.resumable,
        eventCount: projection.provenance.eventCount, lastEventHash: projection.provenance.lastEventHash, projectionHash: projection.projectionHash,
      })), schedules: scheduleProjections });
    } catch { return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry recovery projections could not be read", automation: "unavailable", jobs: [], schedules: [] }); }
  }

  async setScheduleEnabled(scheduleHash: string, enabled: boolean): Promise<void> { if (this.#backend !== undefined) await new TearFoundryJobScheduleVault(this.#backend).setEnabledByHash(scheduleHash, enabled, new Date().toISOString()); await this.refresh(); }

  #set(snapshot: FoundrySnapshot): FoundrySnapshot { this.#snapshot = Object.freeze({ ...snapshot, jobs: Object.freeze(snapshot.jobs), schedules: Object.freeze(snapshot.schedules) }); return this.#snapshot; }
}

export function createLiveFoundryScreen(factory: IDBFactory | undefined): Readonly<{ snapshot: () => FoundryScreenView; refresh: () => void; setScheduleEnabled: (scheduleHash: string, enabled: boolean) => void }> {
  const controller = new LiveFoundryScreenController(undefined);
  // The delayed browser backend needs one stable controller instance, not a replacement captured by the renderer.
  let active = controller;
  if (factory === undefined) void active.refresh();
  else void createIndexedDbGhostVaultBackend(factory).then((backend) => { active = new LiveFoundryScreenController(backend); return active.refresh(); }).catch(() => { void active.refresh(); });
  return Object.freeze({ snapshot: () => active.snapshot(), refresh: () => { void active.refresh(); }, setScheduleEnabled: (scheduleHash, enabled) => { void active.setScheduleEnabled(scheduleHash, enabled); } });
}
