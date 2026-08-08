import type { GhostVaultBackend } from "../ghost";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";

const KEY = "foundry-job:v1:";
function text(value: string): boolean { return value.trim().length > 0; }

/** Local custody for C36 requests. It does not schedule, train, evaluate, activate, or promote anything. */
export class TearFoundryJobVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearFoundryJobV1): Promise<TearFoundryJobV1> {
    const job = parseTearFoundryJob(input), key = `${KEY}${job.id}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) {
      const current = parseTearFoundryJob(JSON.parse(existing));
      if (current.jobHash !== job.jobHash) throw new RangeError(`Foundry job already exists: ${job.id}`);
      return current;
    }
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(job) },
      { store: "indexes", key: `foundry-job:${job.id}:${job.jobHash}`, value: JSON.stringify(Object.freeze({ phase: job.phase, championArtifactHash: job.inputs.champion.artifactHash, evaluationPlanHash: job.inputs.evaluationPlanHash })) },
    ]));
    return job;
  }

  async get(id: string): Promise<TearFoundryJobV1 | undefined> {
    if (!text(id)) throw new TypeError("Foundry job ID is required");
    const key = `${KEY}${id}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseTearFoundryJob(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "foundry-job-quarantine", schemaVersion: 1, key, raw,
        reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}
