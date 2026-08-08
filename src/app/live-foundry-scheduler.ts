import { TearAcademyCandidateCustodyStore, TearFoundryJobScheduleVault, TearFoundryJobVault, TearFoundryScheduleController, TearFoundryScheduledExecution, type TearFoundryJobV1, type TearFoundryScheduleProjectionV1 } from "../agents";
import type { GhostVaultBackend } from "../ghost";

export type LiveFoundryScheduleStatus = "disabled" | "configured" | "due" | "running" | "blocked" | "error";

export interface LiveFoundrySchedulerPorts {
  readonly discover: (at: string) => Promise<readonly TearFoundryScheduleProjectionV1[]>;
  readonly execute: (scheduleHash: string, at: string, leaseId: string) => Promise<unknown>;
  readonly now: () => Date;
  readonly defer: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  readonly cancel: (handle: ReturnType<typeof setTimeout>) => void;
  readonly leaseId: () => string;
  readonly onChange?: () => void;
}

/**
 * Browser-lifecycle owner for one persisted Foundry schedule wakeup at a time.
 * It deliberately owns neither Foundry rules nor durable authority: those stay
 * in the already-bound executor and Vault. Restart simply rediscovers the Vault.
 */
export class LiveFoundryScheduler {
  readonly #ports: LiveFoundrySchedulerPorts;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #started = false;
  #waking = false;
  #status = new Map<string, LiveFoundryScheduleStatus>();

  constructor(ports: LiveFoundrySchedulerPorts) { this.#ports = ports; }
  status(scheduleHash: string): LiveFoundryScheduleStatus | undefined { return this.#status.get(scheduleHash); }
  start(): void { if (this.#started) return; this.#started = true; void this.wake(); }
  stop(): void { this.#started = false; if (this.#timer !== undefined) this.#ports.cancel(this.#timer); this.#timer = undefined; }

  async wake(): Promise<void> {
    if (!this.#started || this.#waking) return;
    this.#waking = true;
    try {
      const at = this.#ports.now().toISOString();
      const schedules = await this.#ports.discover(at);
      for (const schedule of schedules) this.#set(schedule.scheduleHash, this.#project(schedule));
      const due = schedules.find((schedule) => schedule.state === "enabled" && schedule.disposition === "due");
      if (due !== undefined) {
        this.#set(due.scheduleHash, "running");
        try { await this.#ports.execute(due.scheduleHash, at, this.#ports.leaseId()); this.#set(due.scheduleHash, "configured"); }
        catch { this.#set(due.scheduleHash, "error"); }
      }
    } finally {
      this.#waking = false;
      this.#scheduleNext();
    }
  }

  #project(schedule: TearFoundryScheduleProjectionV1): LiveFoundryScheduleStatus {
    if (schedule.state === "disabled") return "disabled";
    if (schedule.disposition === "due") return "due";
    if (schedule.disposition.startsWith("blocked-")) return "blocked";
    return "configured";
  }
  #set(scheduleHash: string, status: LiveFoundryScheduleStatus): void {
    if (this.#status.get(scheduleHash) === status) return;
    this.#status.set(scheduleHash, status); this.#ports.onChange?.();
  }
  #scheduleNext(): void { if (!this.#started) return; this.#timer = this.#ports.defer(() => { void this.wake(); }, 60_000); }
}

/** Creates the local browser owner. It has no worker, network, cloud, artifact, or policy dependency. */
export function createLiveFoundryScheduler(backend: GhostVaultBackend, onChange?: () => void): LiveFoundryScheduler {
  const jobs = new TearFoundryJobVault(backend), schedules = new TearFoundryJobScheduleVault(backend), custody = new TearAcademyCandidateCustodyStore(backend);
  const authority = { held: async (job: TearFoundryJobV1, at: string) => {
    const held = await custody.held(at); return job.inputs.corpusRecordHashes.every((hash) => held.some((entry) => entry.recordHash === hash));
  } };
  const controller = new TearFoundryScheduleController(jobs, schedules, authority);
  const execution = new TearFoundryScheduledExecution(jobs, schedules, custody);
  return new LiveFoundryScheduler({ discover: (at) => controller.discoverDue(at), execute: (hash, at, lease) => execution.runScheduledOnce(hash, at, lease), now: () => new Date(), defer: (callback, ms) => { return setTimeout(callback, ms); }, cancel: (handle) => { clearTimeout(handle); }, leaseId: () => `browser-${crypto.randomUUID()}`, ...(onChange === undefined ? {} : { onChange }) });
}
