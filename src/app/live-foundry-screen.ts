import { TearAcademyCandidateCurationStore, TearAcademyCandidateCustodyStore, TearAcademyCandidateQualityStore, TearAcademyCandidateSplitStore, TearAcademyCorpusStore, TearAcademyReviewedSampleStore, TearFoundryBootstrapExecutor, TearFoundryJobScheduleVault, TearFoundryJobVault, TearFoundryLaunchProfileAuthority, TearFoundryRecoveryController, TearFoundryScheduleController } from "../agents";
import type { GhostVaultBackend } from "../ghost";
import { createIndexedDbGhostVaultBackend } from "../ghost";
import type { FoundryScreenView } from "../presentation/screens/contracts";
import type { LiveFoundryScheduleStatus } from "./live-foundry-scheduler";
import { createLiveFoundryScheduler, type LiveFoundryScheduler } from "./live-foundry-scheduler";

type FoundrySnapshot = FoundryScreenView;

/** Browser composition for the read-only C36 recovery screen. */
export class LiveFoundryScreenController {
  #snapshot: FoundrySnapshot = Object.freeze({ id: "foundry", status: "loading", subtitle: "reading local Foundry recovery projections", automation: "unavailable", launchProfiles: [], jobs: [], schedules: [] });
  readonly #backend: GhostVaultBackend | undefined;

  readonly #scheduleStatus: (scheduleHash: string) => LiveFoundryScheduleStatus | undefined;
  readonly #schedulerOwned: boolean;
  constructor(backend: GhostVaultBackend | undefined, scheduleStatus: (scheduleHash: string) => LiveFoundryScheduleStatus | undefined = () => undefined, schedulerOwned = false) { this.#backend = backend; this.#scheduleStatus = scheduleStatus; this.#schedulerOwned = schedulerOwned; }
  snapshot(): FoundrySnapshot { return this.#snapshot; }

  async refresh(): Promise<FoundrySnapshot> {
    if (this.#backend === undefined) return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry storage is unavailable in this runtime", automation: "unavailable", launchProfiles: [], jobs: [], schedules: [] });
    try {
      const { vault, custody, authority } = this.#services(), recovery = new TearFoundryRecoveryController(vault), schedules = new TearFoundryJobScheduleVault(this.#backend);
      const projections = (await Promise.all((await vault.list()).map((job) => recovery.project(job.id)))).filter((value): value is NonNullable<typeof value> => value !== undefined);
      const now = new Date().toISOString(), [scheduleProjections, launchProfiles] = await Promise.all([new TearFoundryScheduleController(vault, schedules, { held: async (job, at) => {
        const held = await custody.held(at); return job.inputs.corpusRecordHashes.every((hash) => held.some((record) => record.candidateHash === hash));
      } }).discoverDue(now), authority.projections(now)]);
      return this.#set({ id: "foundry", status: "ready", subtitle: "local, hashes-only restart recovery", automation: this.#schedulerOwned ? "local" : "unavailable", launchProfiles, jobs: projections.map((projection) => Object.freeze({
        jobHash: projection.jobHash, phase: projection.phase, nextManualPhase: projection.nextManualPhase, resumable: projection.resumable,
        eventCount: projection.provenance.eventCount, lastEventHash: projection.provenance.lastEventHash, projectionHash: projection.projectionHash,
      })), schedules: scheduleProjections.map((schedule) => Object.freeze({ ...schedule, runtimeStatus: this.#scheduleStatus(schedule.scheduleHash) ?? (schedule.state === "disabled" ? "disabled" : schedule.disposition === "due" ? "due" : schedule.disposition.startsWith("blocked-") ? "blocked" : "configured") })) });
    } catch { return this.#set({ id: "foundry", status: "unavailable", subtitle: "Foundry recovery projections could not be read", automation: "unavailable", launchProfiles: [], jobs: [], schedules: [] }); }
  }

  async setScheduleEnabled(scheduleHash: string, enabled: boolean): Promise<void> { if (this.#backend !== undefined) await new TearFoundryJobScheduleVault(this.#backend).setEnabledByHash(scheduleHash, enabled, new Date().toISOString()); await this.refresh(); }
  async bootstrap(profileId: string): Promise<void> {
    if (this.#backend === undefined) { await this.refresh(); return; }
    try {
      const { vault, custody, corpus, authority } = this.#services();
      const request = await authority.buildBootstrapRequest(profileId, new Date().toISOString());
      await new TearFoundryBootstrapExecutor(vault, custody, corpus).bootstrap(request);
    } finally { await this.refresh(); }
  }

  #services(): Readonly<{ vault: TearFoundryJobVault; custody: TearAcademyCandidateCustodyStore; corpus: TearAcademyCorpusStore; authority: TearFoundryLaunchProfileAuthority }> {
    if (this.#backend === undefined) throw new TypeError("Foundry storage is unavailable");
    const custody = new TearAcademyCandidateCustodyStore(this.#backend), quality = new TearAcademyCandidateQualityStore(this.#backend, custody), curation = new TearAcademyCandidateCurationStore(this.#backend, custody, quality), splits = new TearAcademyCandidateSplitStore(this.#backend, custody, quality, curation), samples = new TearAcademyReviewedSampleStore(this.#backend, custody, quality, curation, splits), corpus = new TearAcademyCorpusStore(this.#backend, custody, curation, splits, samples);
    return Object.freeze({ vault: new TearFoundryJobVault(this.#backend), custody, corpus, authority: new TearFoundryLaunchProfileAuthority(this.#backend, custody, corpus) });
  }

  #set(snapshot: FoundrySnapshot): FoundrySnapshot { this.#snapshot = Object.freeze({ ...snapshot, jobs: Object.freeze(snapshot.jobs), schedules: Object.freeze(snapshot.schedules) }); return this.#snapshot; }
}

export function createLiveFoundryScreen(factory: IDBFactory | undefined): Readonly<{ snapshot: () => FoundryScreenView; refresh: () => void; bootstrap: (profileId: string) => void; setScheduleEnabled: (scheduleHash: string, enabled: boolean) => void }> {
  const controller = new LiveFoundryScreenController(undefined);
  // The delayed browser backend needs one stable controller instance, not a replacement captured by the renderer.
  let active = controller;
  if (factory === undefined) void active.refresh();
  else void createIndexedDbGhostVaultBackend(factory).then((backend) => {
    const scheduler = { value: undefined as LiveFoundryScheduler | undefined };
    active = new LiveFoundryScreenController(backend, (scheduleHash) => scheduler.value?.status(scheduleHash), true);
    scheduler.value = createLiveFoundryScheduler(backend, () => { void active.refresh(); });
    scheduler.value.start(); return active.refresh();
  }).catch(() => { void active.refresh(); });
  return Object.freeze({ snapshot: () => active.snapshot(), refresh: () => { void active.refresh(); }, bootstrap: (profileId) => { void active.bootstrap(profileId); }, setScheduleEnabled: (scheduleHash, enabled) => { void active.setScheduleEnabled(scheduleHash, enabled); } });
}
