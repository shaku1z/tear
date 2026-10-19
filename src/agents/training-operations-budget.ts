import type { GhostVaultBackend, GhostVaultGuard, GhostVaultStore, GhostVaultWrite } from "../ghost";
import { stableVerificationHash } from "../replay/hash";

const FORMAT = "training-operations-budget";
const HASH = /^[a-f0-9]{16}$/u;
export const trainingOperationsBudgetKey = (jobId: string): string => `training-operations-budget:v1:${jobId}`;
export const trainingOperationsBudgetOwnerKey = (jobId: string): string => `training-operations-budget-owner:v1:${jobId}`;

/** Logical retained record bytes, not physical IndexedDB allocation or CPU time. */
export interface TrainingOperationsBudgetDeclarationV1 {
  readonly jobId: string;
  readonly scheduleId: string;
  readonly maxComputeUnits: number;
  readonly maxRetainedBytes: number;
  readonly maxRecords: number;
}
interface OwnedRecord {
  readonly store: GhostVaultStore;
  readonly key: string;
  readonly bytes: number;
  readonly valueHash: string;
}
export interface TrainingOperationsBudgetV1 {
  readonly format: typeof FORMAT;
  readonly schemaVersion: 1;
  readonly declaration: TrainingOperationsBudgetDeclarationV1;
  readonly declarationHash: string;
  readonly revision: number;
  readonly computeUsed: number;
  readonly retainedBytes: number;
  readonly records: readonly OwnedRecord[];
  readonly budgetHash: string;
}

function closed(value: unknown, fields: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid Training Operations budget object");
  const keys = fields.split(" ");
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("invalid Training Operations budget fields");
  return value as Record<string, unknown>;
}
function natural(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function identifier(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 512; }
function sum(left: number, right: number): number {
  const result = left + right;
  if (!natural(result)) throw new RangeError("Training Operations budget arithmetic overflow");
  return result;
}
function declaration(input: TrainingOperationsBudgetDeclarationV1): TrainingOperationsBudgetDeclarationV1 {
  closed(input, "jobId scheduleId maxComputeUnits maxRetainedBytes maxRecords");
  if (!identifier(input.jobId) || !identifier(input.scheduleId) || !natural(input.maxComputeUnits) || input.maxComputeUnits < 1
    || !natural(input.maxRetainedBytes) || input.maxRetainedBytes < 1 || !natural(input.maxRecords) || input.maxRecords < 1 || input.maxRecords > 4096) {
    throw new RangeError("invalid Training Operations numeric budget declaration");
  }
  return Object.freeze({ ...input });
}
export const validateTrainingOperationsBudgetDeclaration = declaration;
export function trainingOperationsComputeBudgetHash(input: TrainingOperationsBudgetDeclarationV1): string {
  const value = declaration(input);
  return stableVerificationHash({ format: "training-operations-compute-budget", schemaVersion: 1,
    unit: "offline-update-or-source-tick", jobId: value.jobId, scheduleId: value.scheduleId, maxComputeUnits: value.maxComputeUnits });
}
export function trainingOperationsStorageBudgetHash(input: TrainingOperationsBudgetDeclarationV1): string {
  const value = declaration(input);
  return stableVerificationHash({ format: "training-operations-storage-budget", schemaVersion: 1,
    unit: "utf8-store-key-value", jobId: value.jobId, scheduleId: value.scheduleId,
    maxRetainedBytes: value.maxRetainedBytes, maxRecords: value.maxRecords });
}
const identity = (row: Pick<OwnedRecord, "store" | "key">): string => JSON.stringify([row.store, row.key]);
const bytes = (store: GhostVaultStore, key: string, value: string): number => new TextEncoder().encode(store + key + value).byteLength;
function finish(input: Omit<TrainingOperationsBudgetV1, "budgetHash">): TrainingOperationsBudgetV1 {
  return Object.freeze({ ...input, budgetHash: stableVerificationHash(input) });
}

export function parseTrainingOperationsBudget(value: unknown): TrainingOperationsBudgetV1 {
  const raw = closed(value, "format schemaVersion declaration declarationHash revision computeUsed retainedBytes records budgetHash");
  if (raw.format !== FORMAT || raw.schemaVersion !== 1 || typeof raw.budgetHash !== "string" || !HASH.test(raw.budgetHash)) throw new TypeError("invalid Training Operations budget version");
  const input = value as TrainingOperationsBudgetV1, limits = declaration(input.declaration);
  if (input.declarationHash !== stableVerificationHash(limits) || !natural(input.revision) || input.revision < 1
    || !natural(input.computeUsed) || input.computeUsed > limits.maxComputeUnits || !natural(input.retainedBytes)
    || input.retainedBytes > limits.maxRetainedBytes || !Array.isArray(input.records) || input.records.length > limits.maxRecords) throw new RangeError("invalid Training Operations budget usage");
  let total = 0, previous = "";
  const sourceRecords: readonly OwnedRecord[] = input.records;
  const records = sourceRecords.map((row) => {
    closed(row, "store key bytes valueHash");
    // This meter owns derived orchestration/output records only, never source tracks.
    if (!["analysis", "indexes"].includes(row.store) || !identifier(row.key) || row.key.startsWith("training-operations-budget:")
      || !natural(row.bytes) || row.bytes < bytes(row.store, row.key, "") || typeof row.valueHash !== "string" || !HASH.test(row.valueHash)) throw new TypeError("invalid Training Operations owned record");
    const key = identity(row);
    if (key <= previous) throw new RangeError("Training Operations owned records repeat or are unordered");
    previous = key; total = sum(total, row.bytes);
    return Object.freeze({ ...row });
  });
  if (total !== input.retainedBytes) throw new RangeError("Training Operations retained-byte total changed");
  const parsed = finish({ format: FORMAT, schemaVersion: 1, declaration: limits, declarationHash: input.declarationHash,
    revision: input.revision, computeUsed: input.computeUsed, retainedBytes: total, records: Object.freeze(records) });
  if (parsed.budgetHash !== input.budgetHash) throw new RangeError("Training Operations budget integrity mismatch");
  return parsed;
}

async function applyWrites(backend: GhostVaultBackend, current: TrainingOperationsBudgetV1,
  input: readonly GhostVaultWrite[], computeUnits: number,
): Promise<Readonly<{ next: TrainingOperationsBudgetV1; guards: readonly GhostVaultGuard[] }>> {
  if (!natural(computeUnits)) throw new RangeError("Training Operations compute charge must be a nonnegative integer");
  const computeUsed = sum(current.computeUsed, computeUnits);
  if (computeUsed > current.declaration.maxComputeUnits) throw new RangeError("Training Operations compute budget exhausted");
  const records = new Map(current.records.map((row) => [identity(row), row]));
  const seen = new Set<string>(), guards: GhostVaultGuard[] = [];
  for (const write of input) {
    const key = identity(write);
    if (seen.has(key) || !["analysis", "indexes"].includes(write.store) || !identifier(write.key)
      || write.key.startsWith("training-operations-budget:") || write.value !== undefined && typeof write.value !== "string") throw new TypeError("invalid Training Operations budget write set");
    seen.add(key);
    const old = await backend.get(write.store, write.key), owned = records.get(key);
    if (owned === undefined ? old !== undefined : old === undefined || stableVerificationHash(old) !== owned.valueHash || bytes(write.store, write.key, old) !== owned.bytes) {
      throw new RangeError("Training Operations owned record changed or belongs to another writer");
    }
    guards.push({ store: write.store, key: write.key, ...(old === undefined ? {} : { expected: old }) });
    if (write.value === undefined) records.delete(key);
    else records.set(key, Object.freeze({ store: write.store, key: write.key, bytes: bytes(write.store, write.key, write.value), valueHash: stableVerificationHash(write.value) }));
  }
  const ordered = [...records.values()].sort((a, b) => identity(a) < identity(b) ? -1 : identity(a) > identity(b) ? 1 : 0);
  const retainedBytes = ordered.reduce((total, row) => sum(total, row.bytes), 0);
  if (ordered.length > current.declaration.maxRecords || retainedBytes > current.declaration.maxRetainedBytes) throw new RangeError("Training Operations retained storage budget exhausted");
  return { next: finish({ format: FORMAT, schemaVersion: 1, declaration: current.declaration, declarationHash: current.declarationHash,
    revision: sum(current.revision, 1), computeUsed, retainedBytes, records: Object.freeze(ordered) }), guards };
}

function mergeGuards(guards: readonly GhostVaultGuard[]): readonly GhostVaultGuard[] {
  const unique = new Map<string, GhostVaultGuard>();
  for (const guard of guards) {
    const key = identity(guard), prior = unique.get(key);
    if (prior !== undefined && prior.expected !== guard.expected) throw new RangeError("Training Operations budget authority conflicts");
    unique.set(key, guard);
  }
  return Object.freeze([...unique.values()]);
}

/**
 * Reserves new, absent records only. Existing corpus/artifacts cannot be adopted
 * as free storage. The one ledger is excluded from logical payload bytes; its
 * metadata is bounded by maxRecords (<=4096) and 512-character record keys.
 */
export async function initializeTrainingOperationsBudget(backend: GhostVaultBackend, input: TrainingOperationsBudgetDeclarationV1,
  guardsInput: readonly GhostVaultGuard[], writesInput: readonly GhostVaultWrite[],
): Promise<TrainingOperationsBudgetV1> {
  const guards = structuredClone(guardsInput), writes = structuredClone(writesInput);
  const limits = declaration(input), key = trainingOperationsBudgetKey(limits.jobId);
  const initial = finish({ format: FORMAT, schemaVersion: 1, declaration: limits, declarationHash: stableVerificationHash(limits),
    revision: 0, computeUsed: 0, retainedBytes: 0, records: Object.freeze([]) });
  const { next, guards: ownedGuards } = await applyWrites(backend, initial, writes, 0);
  await backend.commitIfMatches(mergeGuards([...guards, ...ownedGuards, { store: "analysis", key }]),
    [...writes, { store: "analysis", key, value: JSON.stringify(next) }]);
  return next;
}

/**
 * No implicit retry/refund: the caller must derive computeUnits from its bounded
 * operation, and commit the charge BEFORE doing work. Failed attempts stay spent.
 * A lost CAS performs neither the payload writes nor the charge.
 */
export async function commitTrainingOperationsBudget(backend: GhostVaultBackend, jobId: string, declarationHash: string,
  guardsInput: readonly GhostVaultGuard[], writesInput: readonly GhostVaultWrite[], computeUnits = 0,
): Promise<TrainingOperationsBudgetV1> {
  const guards = structuredClone(guardsInput), writes = structuredClone(writesInput);
  if (!identifier(jobId) || !HASH.test(declarationHash)) throw new TypeError("invalid Training Operations budget identity");
  const key = trainingOperationsBudgetKey(jobId), raw = await backend.get("analysis", key);
  if (raw === undefined) throw new RangeError("Training Operations budget authority is missing");
  const current = parseTrainingOperationsBudget(JSON.parse(raw));
  if (current.declaration.jobId !== jobId || current.declarationHash !== declarationHash) throw new RangeError("Training Operations budget declaration changed");
  if (writes.length === 0 && computeUnits === 0) {
    await backend.commitIfMatches(mergeGuards([...guards, { store: "analysis", key, expected: raw }]), []);
    return current;
  }
  const { next, guards: ownedGuards } = await applyWrites(backend, current, writes, computeUnits);
  await backend.commitIfMatches(mergeGuards([...guards, ...ownedGuards, { store: "analysis", key, expected: raw }]),
    [...writes, { store: "analysis", key, value: JSON.stringify(next) }]);
  return next;
}

type BudgetJob = Readonly<{ id: string; schemaVersion: 1 | 2 | 3; inputs: Readonly<{ budgetHash: string }> }>;

/** A durable owner prevents a missing ledger from silently becoming an unmetered legacy job. */
export async function trainingOperationsJobBudgetAuthority(backend: GhostVaultBackend, job: BudgetJob): Promise<Readonly<{
  budget: TrainingOperationsBudgetV1 | undefined; guards: readonly GhostVaultGuard[];
}>> {
  const key = trainingOperationsBudgetKey(job.id), ownerKey = trainingOperationsBudgetOwnerKey(job.id);
  const [raw, owner] = await Promise.all([backend.get("analysis", key), backend.get("analysis", ownerKey)]);
  const budget = raw === undefined ? undefined : parseTrainingOperationsBudget(JSON.parse(raw));
  if (budget === undefined ? owner !== undefined || job.schemaVersion === 3 : owner !== budget.declarationHash
    || budget.declaration.jobId !== job.id || budget.declarationHash !== job.inputs.budgetHash) throw new RangeError("Training Operations job budget authority is missing or changed");
  return { budget, guards: [{ store: "analysis", key, ...(raw === undefined ? {} : { expected: raw }) },
    { store: "analysis", key: ownerKey, ...(owner === undefined ? {} : { expected: owner }) }] };
}

/** Shared job mutation boundary. Legacy jobs pin absence; budgeted jobs cannot bypass their ledger. */
export async function commitTrainingOperationsJobWrites(backend: GhostVaultBackend, jobInput: BudgetJob,
  guardsInput: readonly GhostVaultGuard[], writesInput: readonly GhostVaultWrite[], computeUnits = 0,
): Promise<void> {
  const job = structuredClone(jobInput), guards = structuredClone(guardsInput), writes = structuredClone(writesInput);
  if (writes.some((write) => write.key.startsWith("training-operations-budget:") || write.key.startsWith("training-operations-budget-owner:"))) throw new RangeError("job writes cannot replace budget authority");
  const authority = await trainingOperationsJobBudgetAuthority(backend, job);
  const combined = mergeGuards([...guards, ...authority.guards]);
  if (authority.budget === undefined) await backend.commitIfMatches(combined, writes);
  else await commitTrainingOperationsBudget(backend, job.id, authority.budget.declarationHash, combined, writes, computeUnits);
}
