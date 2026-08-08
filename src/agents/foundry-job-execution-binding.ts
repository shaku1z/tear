import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { parseTearFoundryOfflineTrainingLaunch, type TearFoundryOfflineTrainingLaunchV2, type TearFoundryOfflineTrainingRequestV1 } from "./foundry-job-offline-training";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { parseTearFoundryJobSchedule, setTearFoundryJobScheduleEnabled, type TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const KEY = "foundry-job-execution-binding:v1:";
const V2_KEY = "foundry-job-execution-binding:v2:";
const HASH = /^[a-f0-9]{16}$/u;
type Manifest = Readonly<{ id: string; trainerId: string; version: number }>;
type Offline = Readonly<{ training: TearFoundryOfflineTrainingRequestV1; manifest: Manifest; manifestHash: string; manifestRootHash: string; datasetHash: string; planHash: string; configurationHash: string; rewardHash: string }>;
export type TearFoundryExecutionBindingPayloadV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "trainer-manifest"; manifest: Manifest }>
  | Readonly<{ kind: "offline-launch"; offline: Offline }>
  | Readonly<{ kind: "offline-resume"; launchHash: string }>;
export interface TearFoundryExecutionBindingV1 {
  readonly format: "tear-foundry-execution-binding"; readonly schemaVersion: 1;
  readonly schedule: Readonly<{ id: string; revision: number; scheduleHash: string }>;
  readonly job: Readonly<{ id: string; jobHash: string; phase: TearFoundryJobV1["phase"] }>;
  readonly payload: TearFoundryExecutionBindingPayloadV1; readonly bindingHash: string;
}
/**
 * V2 is intentionally separate from V1: old bytes remain readable for
 * recovery, but cannot be used to infer a successor intent.
 */
export interface TearFoundryExecutionBindingV2 {
  readonly format: "tear-foundry-execution-binding"; readonly schemaVersion: 2;
  readonly schedule: Readonly<{ id: string; revision: number; scheduleHash: string }>;
  readonly job: Readonly<{ id: string; jobHash: string; phase: TearFoundryJobV1["phase"] }>;
  readonly payload: TearFoundryExecutionBindingPayloadV1;
  readonly successorDeclaration: TearFoundryExecutionBindingPayloadV1;
  readonly bindingHash: string;
}
export type TearFoundryExecutionBinding = TearFoundryExecutionBindingV1 | TearFoundryExecutionBindingV2;
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function manifest(value: unknown): Manifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry trainer manifest identity");
  const source = value as Record<string, unknown>;
  const version = source.version;
  if (!text(source.id) || !text(source.trainerId) || !Number.isSafeInteger(version) || (version as number) < 1) throw new TypeError("invalid Foundry trainer manifest identity");
  return Object.freeze({ id: source.id, trainerId: source.trainerId, version: version as number });
}
function payload(value: unknown, phase: TearFoundryJobV1["phase"]): TearFoundryExecutionBindingPayloadV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry execution binding payload");
  const source = value as Record<string, unknown>;
  if (phase === "created" && source.kind === "none") return Object.freeze({ kind: "none" });
  if (phase === "collecting" && source.kind === "trainer-manifest") return Object.freeze({ kind: "trainer-manifest", manifest: manifest(source.manifest) });
  if (phase === "curating" && source.kind === "offline-launch") {
    if (typeof source.offline !== "object" || source.offline === null || Array.isArray(source.offline)) throw new TypeError("invalid Foundry offline launch binding");
    const offline = source.offline as Record<string, unknown>, frozen = [offline.manifestHash, offline.manifestRootHash, offline.datasetHash, offline.planHash, offline.configurationHash, offline.rewardHash];
    const training = offline.training as TearFoundryOfflineTrainingRequestV1 | undefined;
    if (!frozen.every(hash) || training === undefined || !text(training.manifestId) || !text(training.trainerId) || !Number.isSafeInteger(training.manifestVersion) || training.manifestVersion < 1 || JSON.stringify(manifest(offline.manifest)) !== JSON.stringify({ id: training.manifestId, trainerId: training.trainerId, version: training.manifestVersion })) throw new TypeError("invalid Foundry offline launch binding");
    return Object.freeze({ kind: "offline-launch", offline: Object.freeze({ training: Object.freeze({ ...training, plan: Object.freeze({ ...training.plan }), config: Object.freeze({ ...training.config }) }), manifest: manifest(offline.manifest), manifestHash: offline.manifestHash as string, manifestRootHash: offline.manifestRootHash as string, datasetHash: offline.datasetHash as string, planHash: offline.planHash as string, configurationHash: offline.configurationHash as string, rewardHash: offline.rewardHash as string }) });
  }
  if (phase === "training" && source.kind === "offline-resume" && hash(source.launchHash)) return Object.freeze({ kind: "offline-resume", launchHash: source.launchHash });
  throw new RangeError(`Foundry execution binding does not declare the ${phase} phase`);
}
function freeze(draft: Omit<TearFoundryExecutionBindingV1, "bindingHash">): TearFoundryExecutionBindingV1 {
  if (!text(draft.schedule.id) || !Number.isSafeInteger(draft.schedule.revision) || draft.schedule.revision < 1 || !hash(draft.schedule.scheduleHash) || !text(draft.job.id) || !hash(draft.job.jobHash)) throw new TypeError("invalid Foundry execution binding");
  const value = Object.freeze({ format: "tear-foundry-execution-binding" as const, schemaVersion: 1 as const, schedule: Object.freeze({ ...draft.schedule }), job: Object.freeze({ ...draft.job }), payload: payload(draft.payload, draft.job.phase) });
  return Object.freeze({ ...value, bindingHash: stableVerificationHash(value) });
}
export function parseTearFoundryExecutionBinding(value: unknown): TearFoundryExecutionBindingV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry execution binding");
  const source = value as Record<string, unknown>; if (source.format !== "tear-foundry-execution-binding" || source.schemaVersion !== 1 || !hash(source.bindingHash)) throw new TypeError("invalid Foundry execution binding");
  const typed = source as unknown as TearFoundryExecutionBindingV1, { bindingHash, ...draft } = typed, parsed = freeze(draft); if (bindingHash !== parsed.bindingHash) throw new TypeError("Foundry execution binding integrity mismatch"); return parsed;
}
function successorPhase(phase: TearFoundryJobV1["phase"]): TearFoundryJobV1["phase"] {
  if (phase === "created") return "collecting";
  if (phase === "collecting") return "curating";
  if (phase === "curating" || phase === "training") return "training";
  throw new RangeError(`Foundry V2 execution binding cannot continue the ${phase} phase`);
}
function freezeV2(draft: Omit<TearFoundryExecutionBindingV2, "bindingHash">): TearFoundryExecutionBindingV2 {
  if (!text(draft.schedule.id) || !Number.isSafeInteger(draft.schedule.revision) || draft.schedule.revision < 1 || !hash(draft.schedule.scheduleHash) || !text(draft.job.id) || !hash(draft.job.jobHash)) throw new TypeError("invalid Foundry V2 execution binding");
  const value = Object.freeze({ format: "tear-foundry-execution-binding" as const, schemaVersion: 2 as const, schedule: Object.freeze({ ...draft.schedule }), job: Object.freeze({ ...draft.job }), payload: payload(draft.payload, draft.job.phase), successorDeclaration: payload(draft.successorDeclaration, successorPhase(draft.job.phase)) });
  return Object.freeze({ ...value, bindingHash: stableVerificationHash(value) });
}
export function createTearFoundryExecutionBindingV2(input: Omit<TearFoundryExecutionBindingV2, "format" | "schemaVersion" | "bindingHash">): TearFoundryExecutionBindingV2 {
  return freezeV2({ format: "tear-foundry-execution-binding", schemaVersion: 2, ...input });
}
export function parseTearFoundryExecutionBindingV2(value: unknown): TearFoundryExecutionBindingV2 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry V2 execution binding");
  const source = value as Record<string, unknown>; if (source.format !== "tear-foundry-execution-binding" || source.schemaVersion !== 2 || !hash(source.bindingHash)) throw new TypeError("invalid Foundry V2 execution binding");
  const typed = source as unknown as TearFoundryExecutionBindingV2, { bindingHash, ...draft } = typed, parsed = freezeV2(draft); if (bindingHash !== parsed.bindingHash) throw new TypeError("Foundry V2 execution binding integrity mismatch"); return parsed;
}
/** Immutable C36 phase intent. It invokes no executor, worker, timer, cloud call, or policy operation. */
export class TearFoundryExecutionBindingVault {
  readonly #backend: GhostVaultBackend; readonly #jobs: TearFoundryJobVault;
  constructor(jobs: TearFoundryJobVault) { this.#backend = jobs.backend(); this.#jobs = jobs; }
  async bind(scheduleInput: TearFoundryJobScheduleV1, jobInput: TearFoundryJobV1, declaration: TearFoundryExecutionBindingPayloadV1): Promise<TearFoundryExecutionBindingV1> {
    const schedule = parseTearFoundryJobSchedule(scheduleInput), job = parseTearFoundryJob(jobInput);
    if (schedule.jobId !== job.id || schedule.jobHash !== job.jobHash) throw new RangeError("Foundry execution binding job does not match schedule");
    const durable = await this.#jobs.get(job.id); if (durable?.jobHash !== job.jobHash) throw new RangeError("Foundry execution binding job is not the durable current head");
    const bound = freeze({ format: "tear-foundry-execution-binding", schemaVersion: 1, schedule: { id: schedule.id, revision: schedule.revision, scheduleHash: schedule.scheduleHash }, job: { id: job.id, jobHash: job.jobHash, phase: job.phase }, payload: declaration });
    await this.#validatePayload(bound);
    const key = `${KEY}${bound.bindingHash}`, old = await this.#backend.get("analysis", key);
    if (old !== undefined) { try { const parsed = parseTearFoundryExecutionBinding(JSON.parse(old)); if (parsed.bindingHash === bound.bindingHash) return parsed; } catch { await this.#quarantine(key, old); } throw new RangeError("Foundry execution binding key is corrupt"); }
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(bound) }, { store: "analysis", key: `foundry-job-execution-binding-current:v1:${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, value: bound.bindingHash }, { store: "indexes", key: `foundry-job-execution-binding:${schedule.id}:${String(schedule.revision)}:${bound.bindingHash}`, value: JSON.stringify(Object.freeze({ scheduleHash: schedule.scheduleHash, jobHash: job.jobHash, phase: job.phase })) }])); return bound;
  }
  async get(bindingHash: string): Promise<TearFoundryExecutionBindingV1 | undefined> { if (!hash(bindingHash)) throw new TypeError("Foundry execution binding hash is invalid"); const key = `${KEY}${bindingHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { return parseTearFoundryExecutionBinding(JSON.parse(raw)); } catch { await this.#quarantine(key, raw); return undefined; } }
  async bindV2(scheduleInput: TearFoundryJobScheduleV1, jobInput: TearFoundryJobV1, declaration: Readonly<{ payload: TearFoundryExecutionBindingPayloadV1; successorDeclaration: TearFoundryExecutionBindingPayloadV1 }>): Promise<TearFoundryExecutionBindingV2> {
    const schedule = parseTearFoundryJobSchedule(scheduleInput), job = parseTearFoundryJob(jobInput);
    if (schedule.jobId !== job.id || schedule.jobHash !== job.jobHash || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) throw new RangeError("Foundry V2 execution binding current head changed");
    const binding = createTearFoundryExecutionBindingV2({ schedule: { id: schedule.id, revision: schedule.revision, scheduleHash: schedule.scheduleHash }, job: { id: job.id, jobHash: job.jobHash, phase: job.phase }, ...declaration });
    await this.#validatePayload(binding); const key = `${V2_KEY}${binding.bindingHash}`, old = await this.#backend.get("analysis", key);
    if (old !== undefined) { try { const parsed = parseTearFoundryExecutionBindingV2(JSON.parse(old)); if (parsed.bindingHash === binding.bindingHash) return parsed; } catch { await this.#quarantine(key, old); } throw new RangeError("Foundry V2 execution binding key is corrupt"); }
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(binding) }, { store: "analysis", key: `foundry-job-execution-binding-current:v2:${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, value: binding.bindingHash }, { store: "indexes", key: `foundry-job-execution-binding:v2:${schedule.id}:${String(schedule.revision)}:${binding.bindingHash}`, value: JSON.stringify(Object.freeze({ scheduleHash: schedule.scheduleHash, jobHash: job.jobHash, phase: job.phase })) }])); return binding;
  }
  async getV2(bindingHash: string): Promise<TearFoundryExecutionBindingV2 | undefined> { if (!hash(bindingHash)) throw new TypeError("Foundry V2 execution binding hash is invalid"); const key = `${V2_KEY}${bindingHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { return parseTearFoundryExecutionBindingV2(JSON.parse(raw)); } catch { await this.#quarantine(key, raw); return undefined; } }
  async getCurrentV2(scheduleInput: TearFoundryJobScheduleV1): Promise<TearFoundryExecutionBindingV2 | undefined> { const schedule = parseTearFoundryJobSchedule(scheduleInput), key = `foundry-job-execution-binding-current:v2:${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, bindingHash = await this.#backend.get("analysis", key); if (bindingHash === undefined) return undefined; const current = await this.getV2(bindingHash); return current?.schedule.scheduleHash === schedule.scheduleHash && current.schedule.revision === schedule.revision ? current : undefined; }
  async getCurrent(scheduleInput: TearFoundryJobScheduleV1): Promise<TearFoundryExecutionBindingV1 | undefined> { const schedule = parseTearFoundryJobSchedule(scheduleInput), key = `foundry-job-execution-binding-current:v1:${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, bindingHash = await this.#backend.get("analysis", key); if (bindingHash === undefined) return undefined; const current = await this.get(bindingHash); return current?.schedule.scheduleHash === schedule.scheduleHash && current.schedule.revision === schedule.revision ? current : undefined; }
  /** Atomically creates the binding for the *new* enabled revision; no enabled revision can be returned without its exact immutable intent. */
  async bindAndEnable(scheduleInput: TearFoundryJobScheduleV1, jobInput: TearFoundryJobV1, declaration: TearFoundryExecutionBindingPayloadV1, at: string): Promise<Readonly<{ schedule: TearFoundryJobScheduleV1; binding: TearFoundryExecutionBindingV1 }>> {
    const before = parseTearFoundryJobSchedule(scheduleInput), job = parseTearFoundryJob(jobInput); if (before.state !== "disabled" || !text(at)) throw new RangeError("Foundry execution binding requires a disabled schedule");
    const next = setTearFoundryJobScheduleEnabled(before, true, at), durable = await this.#jobs.get(job.id); if (before.jobId !== job.id || before.jobHash !== job.jobHash || durable?.jobHash !== job.jobHash) throw new RangeError("Foundry execution binding current head changed");
    const binding = freeze({ format: "tear-foundry-execution-binding", schemaVersion: 1, schedule: { id: next.id, revision: next.revision, scheduleHash: next.scheduleHash }, job: { id: job.id, jobHash: job.jobHash, phase: job.phase }, payload: declaration }); await this.#validatePayload(binding);
    const scheduleKey = `foundry-job-schedule:v1:${before.id}`, jobKey = `foundry-job:v1:${job.id}`, bindingKey = `${KEY}${binding.bindingHash}`;
    const [scheduleRaw, jobRaw, existing] = await Promise.all([this.#backend.get("analysis", scheduleKey), this.#backend.get("analysis", jobKey), this.#backend.get("analysis", bindingKey)]);
    if (existing !== undefined) { const parsed = await this.get(binding.bindingHash); if (parsed === undefined) throw new RangeError("Foundry execution binding is corrupt"); const current = await this.#backend.get("analysis", scheduleKey); if (current !== undefined && parseTearFoundryJobSchedule(JSON.parse(current)).scheduleHash === next.scheduleHash) return Object.freeze({ schedule: next, binding: parsed }); }
    if (scheduleRaw !== JSON.stringify(before) || jobRaw !== JSON.stringify(job)) throw new RangeError("Foundry execution binding current schedule changed");
    const guards = Object.freeze([{ store: "analysis" as const, key: scheduleKey, expected: scheduleRaw }, { store: "analysis" as const, key: jobKey, expected: jobRaw }, ...(existing === undefined ? [Object.freeze({ store: "analysis" as const, key: bindingKey })] : [Object.freeze({ store: "analysis" as const, key: bindingKey, expected: existing })])]);
    try { await this.#backend.commitIfMatches(guards, Object.freeze([{ store: "analysis", key: scheduleKey, value: JSON.stringify(next) }, { store: "analysis", key: bindingKey, value: JSON.stringify(binding) }, { store: "analysis", key: `foundry-job-execution-binding-current:v1:${next.id}:${String(next.revision)}:${next.scheduleHash}`, value: binding.bindingHash }, { store: "indexes", key: `foundry-job-execution-binding:${next.id}:${String(next.revision)}:${binding.bindingHash}`, value: JSON.stringify(Object.freeze({ scheduleHash: next.scheduleHash, jobHash: job.jobHash, phase: job.phase })) }])); } catch { throw new RangeError("Foundry execution binding lost its schedule or job head"); }
    return Object.freeze({ schedule: next, binding });
  }
  async #validatePayload(binding: TearFoundryExecutionBindingV1 | TearFoundryExecutionBindingV2): Promise<void> {
    if (binding.payload.kind !== "offline-resume") return;
    const raw = await this.#backend.get("analysis", `foundry-job-offline-training:v1:${binding.payload.launchHash}`); if (raw === undefined) throw new RangeError("Foundry execution binding exact V2 launch is unavailable");
    let launch: TearFoundryOfflineTrainingLaunchV2; try { launch = parseTearFoundryOfflineTrainingLaunch(JSON.parse(raw)); } catch { throw new RangeError("Foundry execution binding exact V2 launch is invalid"); }
    if (launch.job.id !== binding.job.id || launch.job.resultJobHash !== binding.job.jobHash) throw new RangeError("Foundry execution binding exact V2 launch is stale");
  }
  async #quarantine(key: string, raw: string): Promise<void> { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "foundry-execution-binding-quarantine", schemaVersion: 1, key, raw }))); }
}
