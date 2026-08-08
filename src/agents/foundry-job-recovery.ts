import { stableVerificationHash } from "../replay/hash";
import { reportTearFoundryJob, type TearFoundryJobPhase } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

export interface TearFoundryRecoveryProjectionV1 { readonly format: "tear-foundry-recovery-projection"; readonly schemaVersion: 1; readonly jobId: string; readonly jobHash: string; readonly phase: TearFoundryJobPhase; readonly nextManualPhase: TearFoundryJobPhase | null; readonly resumable: boolean; readonly provenance: Readonly<{ eventCount: number; lastEventHash: string }>; readonly privacy: "hashes-only"; readonly projectionHash: string; }
/** Read-only restart aid: it never starts a worker, exposes custody, or changes Foundry state. */
export class TearFoundryRecoveryController {
  readonly #jobs: TearFoundryJobVault; constructor(jobs: TearFoundryJobVault) { this.#jobs = jobs; }
  async project(jobId: string): Promise<TearFoundryRecoveryProjectionV1 | undefined> {
    const job = await this.#jobs.get(jobId); if (job === undefined) return undefined;
    const state = reportTearFoundryJob(job), last = job.events.at(-1); if (last === undefined) throw new Error("Foundry job history disappeared");
    const draft = { format: "tear-foundry-recovery-projection" as const, schemaVersion: 1 as const, jobId: job.id, jobHash: job.jobHash, phase: job.phase, nextManualPhase: state.nextPhase, resumable: state.resumable, provenance: Object.freeze({ eventCount: job.events.length, lastEventHash: last.eventHash }), privacy: "hashes-only" as const };
    return Object.freeze({ ...draft, projectionHash: stableVerificationHash(draft) });
  }
}
