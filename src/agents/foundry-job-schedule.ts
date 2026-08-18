import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import type { TearFoundryDueAttemptReceiptV1 } from "./foundry-job-due-dispatcher";

const KEY = "foundry-job-schedule:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type ScheduleState = "enabled" | "disabled";
export type TearFoundryScheduleDisposition = "disabled" | "waiting" | "due" | "blocked-invalid-job" | "blocked-terminal-job" | "blocked-stop-identity" | "blocked-revoked-custody";

export interface TearFoundryJobScheduleV1 {
  readonly format: "tear-foundry-job-schedule"; readonly schemaVersion: 1; readonly id: string;
  readonly jobId: string; readonly jobHash: string; readonly intervalMs: number;
  readonly computeBudgetHash: string; readonly storageBudgetHash: string; readonly stopConditionsHash: string;
  readonly state: ScheduleState; readonly configuredAt: string; readonly enabledAt?: string; readonly revision: number; readonly scheduleHash: string;
}
export interface TearFoundryScheduleProjectionV1 {
  readonly scheduleHash: string; readonly jobHash: string; readonly state: ScheduleState; readonly disposition: TearFoundryScheduleDisposition;
  readonly dueAt: string | null; readonly intervalMs: number; readonly revision: number;
}
/** Implementations must recheck every `job.inputs.corpusRecordHashes` at `at`; a cached permission is not authority. */
export interface TearFoundryScheduleAuthority { held(job: TearFoundryJobV1, at: string): Promise<boolean>; }
export interface TearFoundryScheduleContinuationReceiptV1 {
  readonly format: "tear-foundry-schedule-continuation"; readonly schemaVersion: 1;
  readonly sourceScheduleHash: string; readonly previousJobHash: string; readonly nextJobHash: string;
  readonly attemptReceiptHash: string; readonly continuedAt: string; readonly continuationHash: string;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function terminal(phase: TearFoundryJobV1["phase"]): boolean { return ["rejected", "rolled-back", "completed", "cancelled", "failed"].includes(phase); }
function continuation(draft: Omit<TearFoundryScheduleContinuationReceiptV1, "continuationHash">): TearFoundryScheduleContinuationReceiptV1 {
  if (!HASH.test(draft.sourceScheduleHash) || !HASH.test(draft.previousJobHash) || !HASH.test(draft.nextJobHash) || !HASH.test(draft.attemptReceiptHash) || !time(draft.continuedAt)) throw new TypeError("invalid Foundry schedule continuation receipt");
  return Object.freeze({ ...draft, continuationHash: stableVerificationHash(draft) });
}
function parseAttempt(raw: string): TearFoundryDueAttemptReceiptV1 {
  const source = JSON.parse(raw) as Record<string, unknown>;
  const draft = { format: source.format, schemaVersion: source.schemaVersion, scheduleHash: source.scheduleHash, jobHash: source.jobHash, attemptedAt: source.attemptedAt, leaseId: source.leaseId, actionHash: source.actionHash, disposition: source.disposition };
  if (source.format !== "tear-foundry-due-attempt" || source.schemaVersion !== 1 || source.receiptHash !== stableVerificationHash(draft)) throw new TypeError("invalid Foundry due attempt receipt");
  return source as unknown as TearFoundryDueAttemptReceiptV1;
}
function draft(value: Omit<TearFoundryJobScheduleV1, "format" | "schemaVersion" | "scheduleHash">): TearFoundryJobScheduleV1 {
  if (!text(value.id) || !text(value.jobId) || !hash(value.jobHash) || !Number.isSafeInteger(value.intervalMs) || value.intervalMs < 60_000 || value.intervalMs > 2_592_000_000
    || ![value.computeBudgetHash, value.storageBudgetHash, value.stopConditionsHash].every(hash) || !["enabled", "disabled"].includes(value.state)
    || !time(value.configuredAt) || (value.enabledAt !== undefined && !time(value.enabledAt)) || (value.state === "enabled" && value.enabledAt === undefined)
    || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new TypeError("invalid Foundry schedule");
  const normalized = { format: "tear-foundry-job-schedule" as const, schemaVersion: 1 as const, id: value.id, jobId: value.jobId, jobHash: value.jobHash,
    intervalMs: value.intervalMs, computeBudgetHash: value.computeBudgetHash, storageBudgetHash: value.storageBudgetHash, stopConditionsHash: value.stopConditionsHash,
    state: value.state, configuredAt: value.configuredAt, ...(value.enabledAt === undefined ? {} : { enabledAt: value.enabledAt }), revision: value.revision };
  return Object.freeze({ ...normalized, scheduleHash: stableVerificationHash(normalized) });
}
export function createTearFoundryJobSchedule(input: Omit<TearFoundryJobScheduleV1, "format" | "schemaVersion" | "revision" | "scheduleHash" | "enabledAt">): TearFoundryJobScheduleV1 {
  return draft({ ...input, revision: 1, ...(input.state === "enabled" ? { enabledAt: input.configuredAt } : {}) });
}
export function parseTearFoundryJobSchedule(value: unknown): TearFoundryJobScheduleV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry schedule");
  const source = value as Record<string, unknown>; if (source.format !== "tear-foundry-job-schedule" || source.schemaVersion !== 1 || !hash(source.scheduleHash)) throw new TypeError("invalid Foundry schedule");
  const typed = source as unknown as TearFoundryJobScheduleV1, parsed = draft({ id: typed.id, jobId: typed.jobId, jobHash: typed.jobHash, intervalMs: typed.intervalMs,
    computeBudgetHash: typed.computeBudgetHash, storageBudgetHash: typed.storageBudgetHash, stopConditionsHash: typed.stopConditionsHash, state: typed.state, configuredAt: typed.configuredAt,
    ...(typed.enabledAt === undefined ? {} : { enabledAt: typed.enabledAt }), revision: typed.revision });
  if (typed.scheduleHash !== parsed.scheduleHash) throw new TypeError("Foundry schedule integrity mismatch"); return parsed;
}
export function setTearFoundryJobScheduleEnabled(input: TearFoundryJobScheduleV1, enabled: boolean, at: string): TearFoundryJobScheduleV1 {
  const current = parseTearFoundryJobSchedule(input); if (!time(at)) throw new TypeError("Foundry schedule update requires timestamp");
  if ((current.state === "enabled") === enabled) return current;
  return draft({ id: current.id, jobId: current.jobId, jobHash: current.jobHash, intervalMs: current.intervalMs, computeBudgetHash: current.computeBudgetHash,
    storageBudgetHash: current.storageBudgetHash, stopConditionsHash: current.stopConditionsHash, state: enabled ? "enabled" : "disabled", configuredAt: current.configuredAt,
    ...(enabled ? { enabledAt: at } : {}), revision: current.revision + 1 });
}
/** Rebinds cadence only to the exact next immutable job head; it never executes that head. */
export function rebindTearFoundryJobSchedule(input: TearFoundryJobScheduleV1, previous: TearFoundryJobV1, next: TearFoundryJobV1, at: string): TearFoundryJobScheduleV1 {
  const current = parseTearFoundryJobSchedule(input), prior = parseTearFoundryJob(previous), successor = parseTearFoundryJob(next);
  if (!time(at) || terminal(prior.phase) || current.jobId !== prior.id || current.jobHash !== prior.jobHash || successor.id !== prior.id
    || JSON.stringify(successor.inputs) !== JSON.stringify(prior.inputs) || successor.events.length !== prior.events.length + 1
    || successor.events.slice(0, prior.events.length).some((event, index) => event.eventHash !== prior.events[index]?.eventHash)
    || terminal(successor.phase) || prior.inputs.stopConditionsHash !== current.stopConditionsHash) throw new RangeError("Foundry schedule rebind requires its exact legal successor");
  return draft({ id: current.id, jobId: successor.id, jobHash: successor.jobHash, intervalMs: current.intervalMs, computeBudgetHash: current.computeBudgetHash, storageBudgetHash: current.storageBudgetHash, stopConditionsHash: current.stopConditionsHash, state: current.state, configuredAt: current.configuredAt, ...(current.state === "enabled" ? { enabledAt: at } : {}), revision: current.revision + 1 });
}
/** Concludes the exact current cadence at a terminal successor; it never executes that successor. */
export function concludeTearFoundryJobSchedule(input: TearFoundryJobScheduleV1, previous: TearFoundryJobV1, next: TearFoundryJobV1): TearFoundryJobScheduleV1 {
  const current = parseTearFoundryJobSchedule(input), prior = parseTearFoundryJob(previous), successor = parseTearFoundryJob(next);
  if (current.jobId !== prior.id || current.jobHash !== prior.jobHash || successor.id !== prior.id || !terminal(successor.phase)
    || JSON.stringify(successor.inputs) !== JSON.stringify(prior.inputs) || successor.events.length !== prior.events.length + 1
    || successor.events.slice(0, prior.events.length).some((event, index) => event.eventHash !== prior.events[index]?.eventHash)
    || prior.inputs.stopConditionsHash !== current.stopConditionsHash) throw new RangeError("Foundry schedule conclusion requires its exact terminal successor");
  return draft({ id: current.id, jobId: successor.id, jobHash: successor.jobHash, intervalMs: current.intervalMs, computeBudgetHash: current.computeBudgetHash,
    storageBudgetHash: current.storageBudgetHash, stopConditionsHash: current.stopConditionsHash, state: "disabled", configuredAt: current.configuredAt, revision: current.revision + 1 });
}
export function dueAtFoundryJobSchedule(input: TearFoundryJobScheduleV1): string | null {
  const schedule = parseTearFoundryJobSchedule(input); return schedule.state === "enabled" && schedule.enabledAt !== undefined ? new Date(Date.parse(schedule.enabledAt) + schedule.intervalMs).toISOString() : null;
}
export class TearFoundryJobScheduleVault {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearFoundryJobScheduleV1): Promise<TearFoundryJobScheduleV1> {
    const schedule = parseTearFoundryJobSchedule(input), key = `${KEY}${schedule.id}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) { const current = await this.#read(key, existing); if (current === undefined) throw new RangeError("Foundry schedule is quarantined"); if (current.scheduleHash !== schedule.scheduleHash) throw new RangeError("Foundry schedule already exists"); return current; }
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(schedule) }, { store: "indexes", key: `foundry-job-schedule:${schedule.id}:${schedule.scheduleHash}`, value: JSON.stringify(Object.freeze({ state: schedule.state, jobHash: schedule.jobHash })) }])); return schedule;
  }
  async get(id: string): Promise<TearFoundryJobScheduleV1 | undefined> { const raw = await this.#backend.get("analysis", `${KEY}${id}`); return raw === undefined ? undefined : this.#read(`${KEY}${id}`, raw); }
  async list(): Promise<readonly TearFoundryJobScheduleV1[]> { const ids = (await this.#backend.keys("analysis")).filter((key) => key.startsWith(KEY)).map((key) => key.slice(KEY.length)); return Object.freeze((await Promise.all(ids.map((id) => this.get(id)))).filter((value): value is TearFoundryJobScheduleV1 => value !== undefined)); }
  async setEnabledByHash(scheduleHash: string, enabled: boolean, at: string): Promise<TearFoundryJobScheduleV1 | undefined> {
    if (!hash(scheduleHash)) throw new TypeError("Foundry schedule hash is required"); const current = (await this.list()).find((schedule) => schedule.scheduleHash === scheduleHash); if (current === undefined) return undefined;
    const next = setTearFoundryJobScheduleEnabled(current, enabled, at); if (next.scheduleHash === current.scheduleHash) return current;
    await this.#backend.commit(Object.freeze([{ store: "analysis", key: `${KEY}${next.id}`, value: JSON.stringify(next) }, { store: "indexes", key: `foundry-job-schedule:${next.id}:${next.scheduleHash}`, value: JSON.stringify(Object.freeze({ state: next.state, jobHash: next.jobHash })) }])); return next;
  }
  /** Atomically advances the durable job head and its cadence binding. It cannot execute either head. */
  async rebind(scheduleHash: string, previousInput: TearFoundryJobV1, nextInput: TearFoundryJobV1, at: string, authority: TearFoundryScheduleAuthority, jobs: TearFoundryJobVault): Promise<TearFoundryJobScheduleV1> {
    if (!hash(scheduleHash) || !time(at) || jobs.backend() !== this.#backend) throw new TypeError("invalid Foundry schedule rebind request");
    const previous = parseTearFoundryJob(previousInput), next = parseTearFoundryJob(nextInput);
    const receiptKey = `foundry-job-schedule-rebind:v1:${stableVerificationHash({ scheduleHash, previousJobHash: previous.jobHash, nextJobHash: next.jobHash })}`;
    const priorReceipt = await this.#backend.get("analysis", receiptKey);
    if (priorReceipt !== undefined) {
      try { const record = JSON.parse(priorReceipt) as Readonly<{ id: string; scheduleHash: string; nextScheduleHash: string; nextJobHash: string }>;
        const rebound = await this.get(record.id);
        if (record.scheduleHash === scheduleHash && record.nextJobHash === next.jobHash && rebound?.scheduleHash === record.nextScheduleHash) return rebound;
      } catch { await this.#backend.put("quarantine", receiptKey, priorReceipt); }
      throw new RangeError("Foundry schedule rebind receipt is invalid");
    }
    const current = (await this.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (current === undefined) throw new RangeError("Foundry schedule rebind is unavailable");
    if (current.state !== "enabled" || Date.parse(dueAtFoundryJobSchedule(current) ?? at) > Date.parse(at) || !(await authority.held(previous, at))) throw new RangeError("Foundry schedule rebind is not due or custody is unavailable");
    const rebound = rebindTearFoundryJobSchedule(current, previous, next, at), scheduleKey = `${KEY}${current.id}`, jobKey = `foundry-job:v1:${previous.id}`;
    const [scheduleRaw, jobRaw] = await Promise.all([this.#backend.get("analysis", scheduleKey), this.#backend.get("analysis", jobKey)]);
    if (scheduleRaw === undefined || jobRaw === undefined) throw new RangeError("Foundry schedule or job disappeared");
    let durable: TearFoundryJobV1; try { durable = parseTearFoundryJob(JSON.parse(jobRaw)); } catch { throw new RangeError("Foundry durable job is invalid"); }
    if (durable.jobHash !== previous.jobHash) throw new RangeError("Foundry schedule rebind predecessor is not the durable current head");
    const event = next.events.at(-1); if (event === undefined) throw new RangeError("Foundry successor event disappeared");
    try { await this.#backend.commitIfMatches(Object.freeze([{ store: "analysis", key: scheduleKey, expected: scheduleRaw }, { store: "analysis", key: jobKey, expected: jobRaw }]), Object.freeze([
      { store: "analysis", key: scheduleKey, value: JSON.stringify(rebound) },
      { store: "indexes", key: `foundry-job-schedule:${rebound.id}:${rebound.scheduleHash}`, value: JSON.stringify(Object.freeze({ state: rebound.state, jobHash: rebound.jobHash, previousScheduleHash: current.scheduleHash })) },
      { store: "analysis", key: jobKey, value: JSON.stringify(next) },
      { store: "analysis", key: `foundry-job-event:v1:${next.id}:${String(event.sequence)}:${event.eventHash}`, value: JSON.stringify(event) },
      { store: "indexes", key: `foundry-job-current:${next.id}`, value: JSON.stringify(Object.freeze({ jobHash: next.jobHash, phase: next.phase })) },
      { store: "analysis", key: receiptKey, value: JSON.stringify(Object.freeze({ format: "foundry-job-schedule-rebind", schemaVersion: 1, id: current.id, scheduleHash, nextScheduleHash: rebound.scheduleHash, nextJobHash: next.jobHash })) },
    ])); } catch { throw new RangeError("Foundry schedule rebind lost its current schedule or job head"); }
    return rebound;
  }
  /** Advances only an already-persisted legal successor's cadence binding; it cannot invoke a Foundry executor. */
  async continueAfterAttempt(scheduleHash: string, previousInput: TearFoundryJobV1, nextInput: TearFoundryJobV1, attemptInput: TearFoundryDueAttemptReceiptV1, at: string, budgets: Readonly<{ computeBudgetHash: string; storageBudgetHash: string }>, authority: TearFoundryScheduleAuthority, jobs: TearFoundryJobVault): Promise<TearFoundryJobScheduleV1> {
    if (!hash(scheduleHash) || !time(at) || !hash(budgets.computeBudgetHash) || !hash(budgets.storageBudgetHash) || jobs.backend() !== this.#backend) throw new TypeError("invalid Foundry schedule continuation request");
    const previous = parseTearFoundryJob(previousInput), next = parseTearFoundryJob(nextInput), attempt = attemptInput;
    if (attempt.disposition !== "collected" || attempt.scheduleHash !== scheduleHash || attempt.jobHash !== previous.jobHash) throw new RangeError("Foundry schedule continuation requires its successful source attempt");
    const receiptKey = `foundry-job-schedule-continuation:v1:${stableVerificationHash({ scheduleHash, previousJobHash: previous.jobHash, nextJobHash: next.jobHash, attemptReceiptHash: attempt.receiptHash })}`;
    const oldContinuation = await this.#backend.get("analysis", receiptKey);
    if (oldContinuation !== undefined) {
      try { const record = continuation(JSON.parse(oldContinuation) as Omit<TearFoundryScheduleContinuationReceiptV1, "continuationHash">);
        const current = (await this.list()).find((entry) => entry.jobHash === next.jobHash);
        if (record.sourceScheduleHash === scheduleHash && record.previousJobHash === previous.jobHash && record.nextJobHash === next.jobHash && record.attemptReceiptHash === attempt.receiptHash && current?.jobHash === next.jobHash) return current;
      } catch { await this.#backend.put("quarantine", receiptKey, oldContinuation); }
      throw new RangeError("Foundry schedule continuation receipt is invalid");
    }
    const current = (await this.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (current === undefined) throw new RangeError("Foundry schedule continuation is unavailable");
    if (current.state !== "enabled" || Date.parse(dueAtFoundryJobSchedule(current) ?? at) > Date.parse(at) || current.computeBudgetHash !== budgets.computeBudgetHash || current.storageBudgetHash !== budgets.storageBudgetHash || !(await authority.held(next, at))) throw new RangeError("Foundry schedule continuation is not due or authorized");
    const rebound = rebindTearFoundryJobSchedule(current, previous, next, at), scheduleKey = `${KEY}${current.id}`, jobKey = `foundry-job:v1:${next.id}`, attemptKey = `foundry-job-due-attempt:v1:${attempt.actionHash}`;
    const [scheduleRaw, jobRaw, attemptRaw] = await Promise.all([this.#backend.get("analysis", scheduleKey), this.#backend.get("analysis", jobKey), this.#backend.get("analysis", attemptKey)]);
    if (scheduleRaw === undefined || jobRaw === undefined || attemptRaw === undefined) throw new RangeError("Foundry schedule continuation state disappeared");
    let durable: TearFoundryJobV1; let durableAttempt: TearFoundryDueAttemptReceiptV1;
    try { durable = parseTearFoundryJob(JSON.parse(jobRaw)); durableAttempt = parseAttempt(attemptRaw); } catch { throw new RangeError("Foundry schedule continuation durable evidence is invalid"); }
    if (durable.jobHash !== next.jobHash || durableAttempt.receiptHash !== attempt.receiptHash || durableAttempt.scheduleHash !== scheduleHash || durableAttempt.jobHash !== previous.jobHash || durableAttempt.disposition !== "collected") throw new RangeError("Foundry schedule continuation current lineage changed");
    const record = continuation({ format: "tear-foundry-schedule-continuation", schemaVersion: 1, sourceScheduleHash: scheduleHash, previousJobHash: previous.jobHash, nextJobHash: next.jobHash, attemptReceiptHash: attempt.receiptHash, continuedAt: at });
    try { await this.#backend.commitIfMatches(Object.freeze([{ store: "analysis", key: scheduleKey, expected: scheduleRaw }, { store: "analysis", key: jobKey, expected: jobRaw }, { store: "analysis", key: attemptKey, expected: attemptRaw }]), Object.freeze([
      { store: "analysis", key: scheduleKey, value: JSON.stringify(rebound) },
      { store: "indexes", key: `foundry-job-schedule:${rebound.id}:${rebound.scheduleHash}`, value: JSON.stringify(Object.freeze({ state: rebound.state, jobHash: rebound.jobHash, previousScheduleHash: current.scheduleHash })) },
      { store: "analysis", key: receiptKey, value: JSON.stringify(record) },
    ])); } catch { throw new RangeError("Foundry schedule continuation lost its current schedule, job, or attempt evidence"); }
    return rebound;
  }
  async #read(key: string, raw: string): Promise<TearFoundryJobScheduleV1 | undefined> { try { return parseTearFoundryJobSchedule(JSON.parse(raw)); } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "foundry-job-schedule-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; } }
}
export class TearFoundryScheduleController {
  readonly #jobs: TearFoundryJobVault; readonly #schedules: TearFoundryJobScheduleVault; readonly #authority: TearFoundryScheduleAuthority;
  constructor(jobs: TearFoundryJobVault, schedules: TearFoundryJobScheduleVault, authority: TearFoundryScheduleAuthority) { this.#jobs = jobs; this.#schedules = schedules; this.#authority = authority; }
  async discoverDue(at: string): Promise<readonly TearFoundryScheduleProjectionV1[]> {
    if (!time(at)) throw new TypeError("Foundry due discovery requires timestamp"); return Object.freeze(await Promise.all((await this.#schedules.list()).map(async (schedule) => {
      const dueAt = dueAtFoundryJobSchedule(schedule); let disposition: TearFoundryScheduleDisposition = schedule.state === "disabled" ? "disabled" : Date.parse(dueAt ?? at) <= Date.parse(at) ? "due" : "waiting";
      const job = await this.#jobs.get(schedule.jobId);
      if (job?.jobHash !== schedule.jobHash) disposition = "blocked-invalid-job";
      else if (terminal(job.phase)) disposition = "blocked-terminal-job";
      else if (job.inputs.stopConditionsHash !== schedule.stopConditionsHash) disposition = "blocked-stop-identity";
      else if (schedule.state === "enabled" && !(await this.#authority.held(job, at))) disposition = "blocked-revoked-custody";
      return Object.freeze({ scheduleHash: schedule.scheduleHash, jobHash: schedule.jobHash, state: schedule.state, disposition, dueAt, intervalMs: schedule.intervalMs, revision: schedule.revision });
    })));
  }
}
