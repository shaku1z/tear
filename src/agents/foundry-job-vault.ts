import type { GhostVaultBackend, GhostVaultWrite } from "../ghost";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";

const KEY = "foundry-job:v1:";
function text(value: string): boolean { return value.trim().length > 0; }

/** Local custody for C36 requests. It does not schedule, train, evaluate, activate, or promote anything. */
export class TearFoundryJobVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  /** C36 executors must share this local Vault with the custody they consume. */
  backend(): GhostVaultBackend { return this.#backend; }

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

  /** Atomically checkpoints one exact legal successor; it refuses job-history rewrites or forks. */
  async persistSuccessor(previousInput: TearFoundryJobV1, nextInput: TearFoundryJobV1, extra: readonly GhostVaultWrite[] = []): Promise<TearFoundryJobV1> {
    const previous = parseTearFoundryJob(previousInput), next = parseTearFoundryJob(nextInput);
    if (previous.id !== next.id || JSON.stringify(previous.inputs) !== JSON.stringify(next.inputs)
      || next.events.length !== previous.events.length + 1
      || next.events.slice(0, previous.events.length).some((event, index) => event.eventHash !== previous.events[index]?.eventHash)) {
      throw new RangeError("Foundry job successor does not extend its exact immutable history");
    }
    if (extra.some((write) => write.store === "analysis" && write.key === `${KEY}${next.id}`
      || write.store === "indexes" && write.key === `foundry-job-current:${next.id}`)) {
      throw new RangeError("Foundry job successor extra writes cannot replace durable job state");
    }
    const current = await this.get(previous.id);
    if (current?.jobHash === next.jobHash) return current;
    if (current?.jobHash !== previous.jobHash) throw new RangeError("Foundry job successor does not match durable current state");
    const event = next.events.at(-1); if (event === undefined) throw new Error("Foundry job successor event disappeared");
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key: `${KEY}${next.id}`, value: JSON.stringify(next) },
      { store: "analysis", key: `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`, value: JSON.stringify(event) },
      { store: "indexes", key: `foundry-job-current:${next.id}`, value: JSON.stringify(Object.freeze({ jobHash: next.jobHash, phase: next.phase })) },
      ...extra,
    ]));
    return next;
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
