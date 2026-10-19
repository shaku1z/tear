import type { GhostVaultBackend, GhostVaultWrite, GhostVaultStore } from "../ghost";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { stableVerificationHash } from "../replay/hash";
import { commitTrainingOperationsJobWrites, initializeTrainingOperationsBudget, trainingOperationsBudgetOwnerKey,
  type TrainingOperationsBudgetDeclarationV1 } from "./training-operations-budget";

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
    const indexKey = `foundry-job:${job.id}:${job.jobHash}`;
    const indexValue = JSON.stringify({ phase: job.phase, championArtifactHash: job.inputs.champion.artifactHash,
      evaluationPlanHash: job.inputs.evaluationPlanHash });
    if (existing !== undefined) {
      const current = parseTearFoundryJob(JSON.parse(existing));
      if (current.jobHash !== job.jobHash) throw new RangeError(`Foundry job already exists: ${job.id}`);
      await commitTrainingOperationsJobWrites(this.#backend, job, [
        { store: "analysis", key, expected: existing }, { store: "indexes", key: indexKey, expected: indexValue },
      ], []);
      return current;
    }
    try { await commitTrainingOperationsJobWrites(this.#backend, job, [
      { store: "analysis", key }, { store: "indexes", key: indexKey },
    ], Object.freeze([
      { store: "analysis", key, value: JSON.stringify(job) },
      { store: "indexes", key: indexKey, value: indexValue },
    ])); } catch (error) {
      const winner = await this.get(job.id);
      if (winner?.id === job.id && winner.jobHash === job.jobHash) {
        await commitTrainingOperationsJobWrites(this.#backend, job, [
          { store: "analysis", key, expected: JSON.stringify(winner) }, { store: "indexes", key: indexKey, expected: indexValue },
        ], []);
        return winner;
      }
      throw error;
    }
    return job;
  }

  /** Creates a new budgeted job and its allowance atomically; existing jobs are never adopted. */
  async persistWithBudget(input: TearFoundryJobV1, declarationInput: TrainingOperationsBudgetDeclarationV1): Promise<TearFoundryJobV1> {
    const job = parseTearFoundryJob(input), declaration = structuredClone(declarationInput);
    if (job.schemaVersion !== 3 || declaration.jobId !== job.id || stableVerificationHash(declaration) !== job.inputs.budgetHash) throw new RangeError("job does not commit to its numeric budget");
    await initializeTrainingOperationsBudget(this.#backend, declaration, [{ store: "analysis", key: `${KEY}${job.id}` }], [
      { store: "analysis", key: `${KEY}${job.id}`, value: JSON.stringify(job) },
      { store: "indexes", key: `foundry-job:${job.id}:${job.jobHash}`, value: JSON.stringify({ phase: job.phase, championArtifactHash: job.inputs.champion.artifactHash, evaluationPlanHash: job.inputs.evaluationPlanHash }) },
      { store: "analysis", key: trainingOperationsBudgetOwnerKey(job.id), value: job.inputs.budgetHash },
    ]);
    return job;
  }

  /** Atomically checkpoints one exact legal successor; it refuses job-history rewrites or forks. */
  async persistSuccessor(previousInput: TearFoundryJobV1, nextInput: TearFoundryJobV1, extra: readonly GhostVaultWrite[] = []): Promise<TearFoundryJobV1> { return this.persistSuccessorIfMatches(previousInput, nextInput, Object.freeze([]), extra); }
  /** Extends one exact job head while pinning the caller's retained authority in the same Vault transaction. */
  async persistSuccessorIfMatches(previousInput: TearFoundryJobV1, nextInput: TearFoundryJobV1, guardsInput: readonly Readonly<{ store: GhostVaultStore; key: string; expected?: string }>[], extraInput: readonly GhostVaultWrite[] = []): Promise<TearFoundryJobV1> {
    const guards = structuredClone(guardsInput), extra = structuredClone(extraInput);
    const previous = parseTearFoundryJob(previousInput), next = parseTearFoundryJob(nextInput);
    if (previous.id !== next.id || previous.schemaVersion !== next.schemaVersion || JSON.stringify(previous.inputs) !== JSON.stringify(next.inputs)
      || next.events.length !== previous.events.length + 1
      || next.events.slice(0, previous.events.length).some((event, index) => event.eventHash !== previous.events[index]?.eventHash)) {
      throw new RangeError("Foundry job successor does not extend its exact immutable history");
    }
    const event = next.events.at(-1); if (event === undefined) throw new Error("Foundry job successor event disappeared");
    const eventKey = `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`;
    if (extra.some((write) => write.store === "analysis" && (write.key === `${KEY}${next.id}` || write.key === eventKey)
      || write.store === "indexes" && write.key === `foundry-job-current:${next.id}`)) {
      throw new RangeError("Foundry job successor extra writes cannot replace durable job state");
    }
    const current = await this.get(previous.id);
    const writes: readonly GhostVaultWrite[] = Object.freeze([
      { store: "analysis", key: `${KEY}${next.id}`, value: JSON.stringify(next) },
      { store: "analysis", key: eventKey, value: JSON.stringify(event) },
      { store: "indexes", key: `foundry-job-current:${next.id}`, value: JSON.stringify(Object.freeze({ jobHash: next.jobHash, phase: next.phase })) },
      ...extra,
    ]);
    if (current?.jobHash === next.jobHash) {
      // Exact retry must also retain all side records; it cannot hide a failed receipt write.
      const changed = new Set(writes.map((write) => JSON.stringify([write.store, write.key])));
      await commitTrainingOperationsJobWrites(this.#backend, next, [
        ...guards.filter((guard) => !changed.has(JSON.stringify([guard.store, guard.key]))),
        ...writes.map((write) => ({ store: write.store, key: write.key, ...(write.value === undefined ? {} : { expected: write.value }) })),
      ], []);
      return current;
    }
    if (current?.jobHash !== previous.jobHash) throw new RangeError("Foundry job successor does not match durable current state");
    if (await this.#backend.get("analysis", eventKey) !== undefined) throw new RangeError("Foundry successor event slot is already owned");
    const currentIndexKey = `foundry-job-current:${next.id}`, currentIndexRaw = await this.#backend.get("indexes", currentIndexKey);
    if (currentIndexRaw !== undefined && currentIndexRaw !== JSON.stringify({ jobHash: previous.jobHash, phase: previous.phase })) {
      throw new RangeError("Foundry successor current index does not identify the exact previous head");
    }
    await commitTrainingOperationsJobWrites(this.#backend, previous,
      [{ store: "analysis", key: `${KEY}${previous.id}`, expected: JSON.stringify(previous) },
        { store: "analysis", key: eventKey },
        { store: "indexes", key: currentIndexKey, ...(currentIndexRaw === undefined ? {} : { expected: currentIndexRaw }) },
        ...guards], writes);
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

  /** Lists only validated local job heads. Invalid bytes are quarantined by get(). */
  async list(): Promise<readonly TearFoundryJobV1[]> {
    const ids = (await this.#backend.keys("analysis")).filter((key) => key.startsWith(KEY)).map((key) => key.slice(KEY.length));
    const values = await Promise.all(ids.map((id) => this.get(id)));
    return Object.freeze(values.filter((value): value is TearFoundryJobV1 => value !== undefined).sort((left, right) => left.id.localeCompare(right.id)));
  }
}
