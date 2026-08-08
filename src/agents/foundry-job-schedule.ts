import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

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
export interface TearFoundryScheduleAuthority { held(job: TearFoundryJobV1, at: string): Promise<boolean>; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function terminal(phase: TearFoundryJobV1["phase"]): boolean { return ["rejected", "rolled-back", "completed", "cancelled", "failed"].includes(phase); }
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
