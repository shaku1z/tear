import type { GhostVaultWrite } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { validateProductionHeadlessScenario } from "../tearbench/production-headless-environment";
import { validateTrainingArchiveV3CandidateTrainingRequest, type trainTrainingArchiveV3Candidate, type TrainingArchiveV3CandidateTrainingRequest } from "./training-archive-v3-candidate-training";
import { assertTrainingOperationsV3CasePayload, assertTrainingOperationsV3JobPayload } from "./training-archive-v3-derived-evidence-contract";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { concludeTearFoundryJobSchedule, dueAtFoundryJobSchedule, parseTearFoundryJobSchedule, rebindTearFoundryJobSchedule, setTearFoundryJobScheduleEnabled,
  type TearFoundryJobScheduleV1, type TearFoundryJobScheduleVault } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "./policy-artifact-registry";
import { freezeTrainingOperationsEvidence } from "./training-operations-v3-comparison-result";
import type { TrainingOperationsV3Continuation, TrainingOperationsV3Guard } from "./training-operations-v3-commit";
import { parseTrainingOperationsV3EvaluationAdmission, parseTrainingOperationsV3EvaluationExecution, parseTrainingOperationsV3Decision, TrainingOperationsV3EvaluationExecutor } from "./training-operations-v3-evaluation";
import { parseTrainingOperationsV3TrainingReceipt, TrainingOperationsV3TrainingAdmissionExecutor, type TrainingOperationsV3TrainingReceiptV1 } from "./training-operations-v3-training";
import { createTrainingOperationsLaunchReceipt, parseTrainingOperationsPreparation, trainingOperationsLaunchReceiptKey, trainingOperationsPreparationKey, type TrainingOperationsPreparationV1 } from "./training-operations-preparation";
import { commitTrainingOperationsJobWrites, trainingOperationsComputeBudgetHash, trainingOperationsStorageBudgetHash,
  trainingOperationsJobBudgetAuthority, validateTrainingOperationsBudgetDeclaration, type TrainingOperationsBudgetDeclarationV1 } from "./training-operations-budget";

const CURRENT = "training-operations-execution-binding-current:v5:";
const OWNER = "training-operations-schedule-owner:v5:";
const ATTEMPT = "training-operations-scheduled-attempt:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
type Request = Omit<TrainingArchiveV3CandidateTrainingRequest, "at">;
type Step = "train" | "admit" | "execute" | "decide" | "awaiting-promotion" | "promoted" | "rejected";
const stepFor = (phase: TearFoundryJobV1["phase"]): Step => {
  const step = { curating: "train", training: "admit", evaluating: "execute", deciding: "decide", monitoring: "awaiting-promotion", rejected: "rejected" } as const;
  if (!Object.hasOwn(step, phase)) throw new RangeError("V5 binding phase is outside the governed pipeline");
  return step[phase as keyof typeof step];
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const time = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const same = (left: unknown, right: unknown): boolean => stableVerificationHash(left) === stableVerificationHash(right);
const scheduleKey = (schedule: TearFoundryJobScheduleV1): string => `foundry-job-schedule:v1:${schedule.id}`;
const currentKey = (schedule: Pick<TearFoundryJobScheduleV1, "id" | "revision" | "scheduleHash">, version: 5 | 6 = 5): string => `${version === 5 ? CURRENT : "training-operations-execution-binding-current:v6:"}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`;
const bindingKey = (hash: string, version: 5 | 6): string => `training-operations-execution-binding:v${String(version)}:${hash}`;

function closed(value: unknown, keys: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid V5 binding object");
  const allowed = keys.split(" ");
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError("invalid V5 binding fields");
  return value as Record<string, unknown>;
}

/** V1–V4 bindings are not rewritten or inferred. This distinct namespace owns the governed V3 cycle. */
export interface TrainingOperationsExecutionBindingV5 {
  readonly format: "training-operations-execution-binding";
  readonly schemaVersion: 5;
  readonly schedule: Readonly<{ id: string; revision: number; scheduleHash: string }>;
  readonly sourceJob: TearFoundryJobV1;
  readonly job: Readonly<{ id: string; jobHash: string; phase: TearFoundryJobV1["phase"] }>;
  readonly request: Request;
  readonly evaluationCases: readonly TearScenarioV1[];
  readonly step: Step;
  readonly previousBindingHash: string | null;
  /** An initial training head was already admitted; this is an origin, not an invented predecessor binding. */
  readonly admittedTraining?: Readonly<{ receiptHash: string; jobHash: string }>;
  readonly promotion?: Readonly<{ approvalHash: string; receiptHash: string; activationHash: string; intentHash: string }>;
  readonly boundAt: string;
  readonly bindingHash: string;
}
export interface TrainingOperationsExecutionBindingV6 extends Omit<TrainingOperationsExecutionBindingV5, "schemaVersion"> {
  readonly schemaVersion: 6;
  readonly budget: TrainingOperationsBudgetDeclarationV1;
}
export type TrainingOperationsExecutionBinding = TrainingOperationsExecutionBindingV5 | TrainingOperationsExecutionBindingV6;

function createBinding(input: Omit<TrainingOperationsExecutionBindingV5, "format" | "schemaVersion" | "bindingHash" | "step">): TrainingOperationsExecutionBindingV5 {
  assertTrainingOperationsV3JobPayload(input.sourceJob);
  const source = parseTearFoundryJob(input.sourceJob);
  if (Object.hasOwn(input.request, "at")) throw new TypeError("V5 binding request must not include an execution timestamp");
  validateTrainingArchiveV3CandidateTrainingRequest({ ...input.request, at: input.boundAt });
  assertTrainingOperationsV3CasePayload(input.evaluationCases);
  for (const scenario of input.evaluationCases) validateProductionHeadlessScenario(scenario);
  if (new Set(input.evaluationCases.map((entry) => stableVerificationHash(entry))).size !== input.evaluationCases.length) throw new RangeError("V5 binding evaluation cases repeat");
  closed(input.schedule, "id revision scheduleHash");
  closed(input.job, "id jobHash phase");
  if (input.admittedTraining !== undefined) closed(input.admittedTraining, "receiptHash jobHash");
  if (source.phase !== "curating" || source.schemaVersion === 1 || !same(source, input.sourceJob)
    || !time(input.boundAt) || Date.parse(input.boundAt) < Date.parse(source.events.at(-1)?.at ?? "")
    || !text(input.schedule.id) || !hash(input.schedule.scheduleHash) || !Number.isSafeInteger(input.schedule.revision) || input.schedule.revision < 1
    || input.job.id !== source.id || !hash(input.job.jobHash) || input.previousBindingHash !== null && !hash(input.previousBindingHash)
    || input.admittedTraining !== undefined && (!hash(input.admittedTraining.receiptHash) || !hash(input.admittedTraining.jobHash))
    || input.previousBindingHash === null && (input.admittedTraining === undefined
      ? input.job.jobHash !== source.jobHash || input.job.phase !== "curating"
      : input.job.jobHash !== input.admittedTraining.jobHash || input.job.phase !== "training")
    || !text(input.request.actor) || !hash(input.request.manifestHash) || !hash(input.request.manifestRootHash)
    || !text(input.request.dataset.manifestId) || !text(input.request.dataset.trainerId) || !Number.isSafeInteger(input.request.dataset.version) || input.request.dataset.version < 1
    || !text(input.request.artifact.id) || input.request.artifact.id === source.inputs.champion.id || !time(input.request.artifact.createdAt)
    || !Number.isFinite(input.request.minimumRewardGain) || input.request.minimumRewardGain < 0
    || stableVerificationHash({ format: "tear-offline-rl-reward-definition", schemaVersion: 1, ...input.request.reward.reward }) !== source.inputs.rewardDefinitionHash
    || input.evaluationCases.length < 1 || input.evaluationCases.length > 256 || input.evaluationCases.some((entry) => !text(entry.seed))
    || stableVerificationHash(input.evaluationCases) !== source.inputs.evaluationPlanHash) throw new RangeError("V5 binding does not match its frozen governed request");
  if (input.promotion !== undefined) {
    closed(input.promotion, "approvalHash receiptHash activationHash intentHash");
    if (input.job.phase !== "monitoring" || input.previousBindingHash === null || !Object.values(input.promotion).every(hash)) throw new RangeError("invalid native promoted binding");
  }
  const draft = { format: "training-operations-execution-binding" as const, schemaVersion: 5 as const,
    ...structuredClone(input), step: input.promotion === undefined ? stepFor(input.job.phase) : "promoted" as const };
  return freezeTrainingOperationsEvidence({ ...draft, bindingHash: stableVerificationHash(draft) });
}

/** Pure schema validation for source-owned launch authoring; it performs no durable admission. */
export const createTrainingOperationsExecutionBindingV5 = createBinding;

export function parseTrainingOperationsExecutionBindingV5(value: unknown): TrainingOperationsExecutionBindingV5 {
  const raw = closed(value, `format schemaVersion schedule sourceJob job request evaluationCases step previousBindingHash boundAt bindingHash${value !== null && typeof value === "object" && Object.hasOwn(value, "admittedTraining") ? " admittedTraining" : ""}${value !== null && typeof value === "object" && Object.hasOwn(value, "promotion") ? " promotion" : ""}`);
  if (raw.format !== "training-operations-execution-binding" || raw.schemaVersion !== 5 || !hash(raw.bindingHash)) throw new TypeError("invalid V5 binding version");
  const typed = value as TrainingOperationsExecutionBindingV5;
  const parsed = createBinding({ schedule: typed.schedule, sourceJob: typed.sourceJob, job: typed.job, request: typed.request,
    evaluationCases: typed.evaluationCases, previousBindingHash: typed.previousBindingHash, boundAt: typed.boundAt,
    ...(typed.admittedTraining === undefined ? {} : { admittedTraining: typed.admittedTraining }),
    ...(typed.promotion === undefined ? {} : { promotion: typed.promotion }) });
  if (!same(parsed, typed)) throw new RangeError("V5 binding integrity mismatch");
  return parsed;
}

function createBudgetBinding(input: Parameters<typeof createBinding>[0], budgetInput?: TrainingOperationsBudgetDeclarationV1): TrainingOperationsExecutionBinding {
  const base = createBinding(input);
  if (budgetInput === undefined) return base;
  const budget = validateTrainingOperationsBudgetDeclaration(budgetInput);
  if (budget.jobId !== base.sourceJob.id || budget.scheduleId !== base.schedule.id || stableVerificationHash(budget) !== base.sourceJob.inputs.budgetHash) throw new RangeError("budgeted binding numeric authority mismatch");
  const { bindingHash, ...draft } = base; void bindingHash;
  const value = { ...draft, schemaVersion: 6 as const, budget };
  return freezeTrainingOperationsEvidence({ ...value, bindingHash: stableVerificationHash(value) });
}

export function parseTrainingOperationsExecutionBinding(value: unknown): TrainingOperationsExecutionBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid Training Operations binding");
  if ((value as Record<string, unknown>).schemaVersion !== 6) return parseTrainingOperationsExecutionBindingV5(value);
  closed(value, `format schemaVersion schedule sourceJob job request evaluationCases step previousBindingHash boundAt bindingHash budget${Object.hasOwn(value, "admittedTraining") ? " admittedTraining" : ""}${Object.hasOwn(value, "promotion") ? " promotion" : ""}`);
  const typed = value as TrainingOperationsExecutionBindingV6;
  const parsed = createBudgetBinding({ schedule: typed.schedule, sourceJob: typed.sourceJob, job: typed.job, request: typed.request,
    evaluationCases: typed.evaluationCases, previousBindingHash: typed.previousBindingHash, boundAt: typed.boundAt,
    ...(typed.admittedTraining === undefined ? {} : { admittedTraining: typed.admittedTraining }),
    ...(typed.promotion === undefined ? {} : { promotion: typed.promotion }) }, typed.budget);
  if (!same(parsed, typed)) throw new RangeError("budgeted binding integrity mismatch");
  return parsed;
}

function requireScheduleBudget(schedule: TearFoundryJobScheduleV1, budget: TrainingOperationsBudgetDeclarationV1): void {
  if (budget.scheduleId !== schedule.id || budget.jobId !== schedule.jobId
    || trainingOperationsComputeBudgetHash(budget) !== schedule.computeBudgetHash
    || trainingOperationsStorageBudgetHash(budget) !== schedule.storageBudgetHash) throw new RangeError("schedule numeric budget identity mismatch");
}

function bindingWrites(schedule: Pick<TearFoundryJobScheduleV1, "id" | "revision" | "scheduleHash">, binding: TrainingOperationsExecutionBinding): readonly GhostVaultWrite[] {
  return [
    { store: "analysis", key: bindingKey(binding.bindingHash, binding.schemaVersion), value: JSON.stringify(binding) },
    { store: "analysis", key: currentKey(schedule, binding.schemaVersion), value: binding.bindingHash },
    { store: "indexes", key: `${bindingKey(schedule.id, binding.schemaVersion)}:${String(schedule.revision)}:${binding.bindingHash}`,
      value: JSON.stringify({ scheduleHash: schedule.scheduleHash, jobHash: binding.job.jobHash, step: binding.step }) },
  ];
}

interface Attempt {
  readonly format: "training-operations-scheduled-attempt";
  readonly schemaVersion: 1;
  readonly scheduleHash: string;
  readonly bindingHash: string;
  readonly sourceJobHash: string;
  readonly leaseId: string;
  readonly attemptedAt: string;
  readonly expiresAt: string;
  readonly status: "running" | "completed";
  readonly outputReceiptHash: string | null;
  readonly nextBindingHash: string | null;
  readonly resultJobHash: string | null;
  readonly resultPhase: TearFoundryJobV1["phase"] | null;
  readonly attemptHash: string;
}
function createAttempt(input: Omit<Attempt, "attemptHash">): Attempt {
  if (![input.scheduleHash, input.bindingHash, input.sourceJobHash].every(hash) || !text(input.leaseId)
    || !time(input.attemptedAt) || !time(input.expiresAt) || Date.parse(input.expiresAt) !== Date.parse(input.attemptedAt) + 60_000
    || !["running", "completed"].includes(input.status)
    || (input.status === "running" ? [input.outputReceiptHash, input.nextBindingHash, input.resultJobHash, input.resultPhase].some((value) => value !== null)
      : ![input.outputReceiptHash, input.nextBindingHash, input.resultJobHash].every(hash) || input.resultPhase === null)) {
    throw new TypeError("invalid V5 scheduled attempt");
  }
  if (input.resultPhase !== null) stepFor(input.resultPhase);
  return Object.freeze({ ...input, attemptHash: stableVerificationHash(input) });
}
function parseAttempt(value: unknown): Attempt {
  const raw = closed(value, "format schemaVersion scheduleHash bindingHash sourceJobHash leaseId attemptedAt expiresAt status outputReceiptHash nextBindingHash resultJobHash resultPhase attemptHash");
  if (raw.format !== "training-operations-scheduled-attempt" || raw.schemaVersion !== 1 || !hash(raw.attemptHash)) throw new TypeError("invalid V5 scheduled attempt version");
  const { attemptHash, ...draft } = value as Attempt, parsed = createAttempt(draft);
  if (parsed.attemptHash !== attemptHash) throw new RangeError("V5 scheduled attempt integrity mismatch");
  return parsed;
}
export interface TrainingOperationsScheduledResultV1 {
  readonly bindingHash: string;
  readonly phase: TearFoundryJobV1["phase"];
  readonly receiptHash: string;
  readonly job: Readonly<{ id: string; schemaVersion: 1 | 2 | 3; inputs: Readonly<{ budgetHash: string }> }>;
}
async function completedResult(jobs: TearFoundryJobVault, attempt: Attempt, at: string, services?: Services): Promise<TrainingOperationsScheduledResultV1> {
  if (Date.parse(at) < Date.parse(attempt.attemptedAt)) throw new RangeError("V5 completion retry precedes its attempt");
  if (attempt.status !== "completed" || attempt.resultPhase === null) throw new RangeError("V5 attempt has no completed result");
  if (services === undefined) throw new RangeError("V5 completion requires governed services");
  const backend = jobs.backend(), guards: TrainingOperationsV3Guard[] = [];
  const required = async (store: TrainingOperationsV3Guard["store"], key: string) => {
    const raw = await backend.get(store, key);
    if (raw === undefined) throw new RangeError("V5 completion retained authority is unavailable");
    guards.push({ store, key, expected: raw }); return raw;
  };
  const [legacy, budgeted] = await Promise.all([backend.get("analysis", bindingKey(attempt.bindingHash, 5)), backend.get("analysis", bindingKey(attempt.bindingHash, 6))]);
  if (legacy !== undefined && budgeted !== undefined || legacy === undefined && budgeted === undefined) throw new RangeError("scheduled completion binding is missing or ambiguous");
  const bindingRaw = budgeted ?? legacy;
  if (bindingRaw === undefined) throw new RangeError("scheduled completion binding is unavailable");
  const binding = parseTrainingOperationsExecutionBinding(JSON.parse(bindingRaw));
  if (binding.bindingHash !== attempt.bindingHash || binding.job.jobHash !== attempt.sourceJobHash) throw new RangeError("scheduled completion binding changed");
  guards.push({ store: "analysis", key: bindingKey(binding.bindingHash, binding.schemaVersion), expected: bindingRaw },
    { store: "analysis", key: `${ATTEMPT}${attempt.scheduleHash}`, expected: JSON.stringify(attempt) });
  const next = parseTrainingOperationsExecutionBinding(JSON.parse(await required("analysis", bindingKey(attempt.nextBindingHash ?? "", binding.schemaVersion))));
  if (next.previousBindingHash !== binding.bindingHash || next.bindingHash !== attempt.nextBindingHash
    || next.job.jobHash !== attempt.resultJobHash || next.job.phase !== attempt.resultPhase
    || !same(next.sourceJob, binding.sourceJob) || !same(next.request, binding.request) || !same(next.evaluationCases, binding.evaluationCases)) throw new RangeError("V5 completion successor binding changed");
  for (const retained of [binding, next]) {
    const pointer = await required("analysis", currentKey(retained.schedule, retained.schemaVersion));
    if (pointer !== retained.bindingHash) throw new RangeError("V5 completion pointer changed");
    for (const write of bindingWrites(retained.schedule, retained).filter((entry) => entry.store === "indexes")) {
      if (await required(write.store, write.key) !== write.value) throw new RangeError("V5 completion binding index changed");
    }
  }
  if (await required("analysis", `${OWNER}${binding.schedule.id}`) !== binding.sourceJob.jobHash) throw new RangeError("V5 completion owner changed");
  const training = parseTrainingOperationsV3TrainingReceipt(JSON.parse(await required("analysis", `foundry-job-v3-training:v1:${binding.sourceJob.jobHash}`)));
  const champion = parseTearPolicyArtifact(JSON.parse(await required("analysis", `policy-artifact:v1:${binding.sourceJob.inputs.champion.id}`)));
  if (champion.artifactHash !== binding.sourceJob.inputs.champion.artifactHash) throw new RangeError("V5 completion champion changed");
  const candidate = training.evidence.candidate.artifact;
  const trainingEvent = training.job.events.at(-1);
  if (trainingEvent === undefined) throw new RangeError("V5 completion training event is unavailable");
  guards.push({ store: "analysis", key: `policy-artifact:v1:${candidate.id}`, expected: JSON.stringify(candidate) },
    { store: "analysis", key: `foundry-job-event:v1:${training.job.id}:${String(trainingEvent.sequence)}:${trainingEvent.eventHash}`, expected: JSON.stringify(trainingEvent) },
    { store: "indexes", key: `policy-artifact:${champion.id}`, expected: JSON.stringify({ artifactHash: champion.artifactHash, createdAt: champion.createdAt }) },
    { store: "indexes", key: `policy-artifact:${candidate.id}`, expected: JSON.stringify({ artifactHash: candidate.artifactHash, createdAt: candidate.createdAt }) },
    { store: "indexes", key: `foundry-job-v3-training:${training.job.id}:${training.receiptHash}`, expected: JSON.stringify({ jobHash: training.job.jobHash, artifactHash: candidate.artifactHash }) });
  let output: Readonly<{ receiptHash: string; job: TearFoundryJobV1 }> = training;
  if (binding.step !== "train") {
    const admission = parseTrainingOperationsV3EvaluationAdmission(JSON.parse(await required("analysis", `foundry-job-v3-evaluation-admission:v1:${binding.sourceJob.jobHash}`)), training, champion);
    output = admission;
    if (binding.step === "execute" || binding.step === "decide") {
      const execution = parseTrainingOperationsV3EvaluationExecution(JSON.parse(await required("analysis", `foundry-job-v3-evaluation-execution:v1:${binding.sourceJob.jobHash}`)), admission, training, champion);
      output = binding.step === "execute" ? execution : parseTrainingOperationsV3Decision(JSON.parse(await required("analysis", `training-operations-v3-decision:v1:${binding.sourceJob.jobHash}`)), execution, admission, training, champion);
    }
  }
  if (!same(training.sourceJob, binding.sourceJob) || output.receiptHash !== attempt.outputReceiptHash || output.job.jobHash !== attempt.resultJobHash) throw new RangeError("V5 completion native receipt changed");
  const current = await jobs.get(output.job.id), event = output.job.events.at(-1), latest = current?.events.at(-1);
  if (current === undefined || event === undefined || latest === undefined || !same(current.inputs, output.job.inputs)
    || current.events.length < output.job.events.length || output.job.events.some((entry, index) => entry.eventHash !== current.events[index]?.eventHash)) throw new RangeError("V5 completion current job lineage changed");
  const schedule = parseTearFoundryJobSchedule(JSON.parse(await required("analysis", `foundry-job-schedule:v1:${binding.schedule.id}`)));
  const latestPointer = await required("analysis", currentKey(schedule, binding.schemaVersion));
  const latestBinding = parseTrainingOperationsExecutionBinding(JSON.parse(await required("analysis", bindingKey(latestPointer, binding.schemaVersion))));
  if (schedule.jobHash !== current.jobHash || latestBinding.bindingHash !== latestPointer || latestBinding.job.jobHash !== current.jobHash
    || latestBinding.schedule.scheduleHash !== schedule.scheduleHash || !same(latestBinding.sourceJob, binding.sourceJob)) throw new RangeError("V5 completion current schedule binding changed");
  for (const write of bindingWrites(schedule, latestBinding).filter((entry) => entry.store === "indexes")) {
    if (await required(write.store, write.key) !== write.value) throw new RangeError("V5 completion current index changed");
  }
  guards.push({ store: "analysis", key: `foundry-job:v1:${current.id}`, expected: JSON.stringify(current) },
    { store: "analysis", key: `foundry-job-event:v1:${current.id}:${String(event.sequence)}:${event.eventHash}`, expected: JSON.stringify(event) },
    { store: "analysis", key: `foundry-job-event:v1:${current.id}:${String(latest.sequence)}:${latest.eventHash}`, expected: JSON.stringify(latest) },
    { store: "indexes", key: `foundry-job-current:${current.id}`, expected: JSON.stringify({ jobHash: current.jobHash, phase: current.phase }) });
  const dataset = binding.request.dataset, manifest = await services.corpus.getManifest(dataset.manifestId, { kind: "trainer", id: dataset.trainerId }, dataset.version);
  if (manifest?.manifestHash !== binding.request.manifestHash || manifest.rootHash !== binding.request.manifestRootHash) throw new RangeError("V5 completion corpus changed");
  guards.push({ store: "analysis", key: `academy-corpus-manifest:v1:trainer:${dataset.trainerId}:${dataset.manifestId}:${String(dataset.version)}`, expected: JSON.stringify(manifest) });
  const held = await services.custody.held(at), curated = await services.curation.active(at);
  for (const entry of manifest.entries) {
    const custody = held.find((row) => row.recordHash === entry.custodyRecordHash && row.candidateHash === entry.candidateHash);
    const approval = curated.find((row) => row.decisionHash === entry.curationDecisionHash && row.candidateHash === entry.candidateHash && row.disposition === "curation-approved");
    if (custody === undefined || approval === undefined || !custody.privacyRetention.authorizedActorIds.includes(binding.request.actor) || custody.consent.modelTraining === "no-training") throw new RangeError("V5 completion custody changed");
    guards.push(...await services.custody.sourceGuards(custody),
      { store: "analysis", key: `academy-candidate-custody:v1:${entry.candidateHash}`, expected: JSON.stringify(custody) },
      { store: "analysis", key: `academy-candidate-curation:v1:${entry.candidateHash}`, expected: JSON.stringify(approval) });
    await required("analysis", `academy-reviewed-sample:v1:${entry.candidateHash}`);
  }
  const loaded = await services.loader.load(binding.request.dataset);
  if (loaded.datasetHash !== training.evidence.lineage.datasetHash || loaded.manifest.manifestHash !== manifest.manifestHash
    || loaded.manifest.rootHash !== manifest.rootHash) throw new RangeError("V5 completion reviewed dataset changed");
  const authority = await trainingOperationsJobBudgetAuthority(backend, current);
  if (binding.schemaVersion === 6 && (authority.budget === undefined || !same(authority.budget.declaration, binding.budget))) throw new RangeError("scheduled completion budget is unavailable");
  await commitTrainingOperationsJobWrites(backend, current, guards, []);
  return Object.freeze({ bindingHash: attempt.bindingHash, phase: attempt.resultPhase, receiptHash: attempt.attemptHash,
    job: Object.freeze({ id: binding.sourceJob.id, schemaVersion: binding.sourceJob.schemaVersion, inputs: Object.freeze({ budgetHash: binding.sourceJob.inputs.budgetHash }) }) });
}

/** Shared scheduler route; it does not author requests, curate data, or authorize promotion. */
export class TrainingOperationsV3ScheduledCycle {
  readonly #jobs: TearFoundryJobVault;
  readonly #schedules: TearFoundryJobScheduleVault;
  readonly #services: Services | undefined;
  constructor(jobs: TearFoundryJobVault, schedules: TearFoundryJobScheduleVault, services?: Services) {
    if (schedules.backend() !== jobs.backend() || services !== undefined && [services.custody.backend(), services.curation.backend(), services.corpus.backend(), services.loader.backend()].some((backend) => backend !== jobs.backend())) {
      throw new TypeError("V5 scheduled cycle must share one governed Vault");
    }
    this.#jobs = jobs; this.#schedules = schedules; this.#services = services;
  }

  async current(scheduleInput: TearFoundryJobScheduleV1): Promise<TrainingOperationsExecutionBinding | undefined> {
    const schedule = parseTearFoundryJobSchedule(scheduleInput), backend = this.#jobs.backend();
    const owner = await backend.get("analysis", `${OWNER}${schedule.id}`);
    const [legacyPointer, budgetPointer] = await Promise.all([backend.get("analysis", currentKey(schedule)), backend.get("analysis", currentKey(schedule, 6))]);
    if (legacyPointer !== undefined && budgetPointer !== undefined) throw new RangeError("Training Operations current binding is ambiguous");
    const pointer = budgetPointer ?? legacyPointer, version = budgetPointer === undefined ? 5 : 6;
    if (pointer === undefined) {
      if (owner !== undefined) throw new RangeError("V5 owned schedule current binding pointer is missing");
      return undefined;
    }
    if (!hash(owner)) throw new RangeError("V5 schedule ownership is missing or corrupt");
    if (!hash(pointer)) throw new RangeError("V5 current binding pointer is corrupt");
    const raw = await backend.get("analysis", bindingKey(pointer, version));
    if (raw === undefined) throw new RangeError("V5 current binding is missing");
    const binding = parseTrainingOperationsExecutionBinding(JSON.parse(raw));
    if (binding.schemaVersion !== version || binding.sourceJob.jobHash !== owner || binding.bindingHash !== pointer || binding.schedule.id !== schedule.id || binding.schedule.revision !== schedule.revision
      || binding.schedule.scheduleHash !== schedule.scheduleHash || binding.job.id !== schedule.jobId || binding.job.jobHash !== schedule.jobHash) {
      throw new RangeError("V5 current binding is stale");
    }
    const budget = (await trainingOperationsJobBudgetAuthority(backend, binding.sourceJob)).budget;
    if (binding.schemaVersion === 6) {
      if (budget === undefined || !same(budget.declaration, binding.budget)) throw new RangeError("budgeted binding authority is unavailable");
      requireScheduleBudget(schedule, binding.budget);
    } else if (budget !== undefined) throw new RangeError("budgeted job cannot use an unmetered binding");
    const job = await this.#jobs.get(schedule.jobId), event = job?.events.at(-1);
    if (job?.jobHash !== binding.job.jobHash || job.phase !== binding.job.phase || event === undefined) throw new RangeError("V5 current job changed");
    const guards: TrainingOperationsV3Guard[] = [
      { store: "analysis", key: scheduleKey(schedule), expected: JSON.stringify(schedule) },
      { store: "analysis", key: `${OWNER}${schedule.id}`, expected: owner },
      { store: "analysis", key: currentKey(schedule, version), expected: pointer },
      { store: "analysis", key: bindingKey(pointer, version), expected: raw },
      { store: "analysis", key: `foundry-job:v1:${job.id}`, expected: JSON.stringify(job) },
      { store: "analysis", key: `foundry-job-event:v1:${job.id}:${String(event.sequence)}:${event.eventHash}`, expected: JSON.stringify(event) },
      { store: "indexes", key: `foundry-job-current:${job.id}`, expected: JSON.stringify({ jobHash: job.jobHash, phase: job.phase }) },
      ...bindingWrites(schedule, binding).filter((write) => write.store === "indexes")
        .map((write) => ({ store: write.store, key: write.key, ...(write.value === undefined ? {} : { expected: write.value }) })),
    ];
    if (binding.admittedTraining !== undefined) {
      const key = `foundry-job-v3-training:v1:${binding.sourceJob.jobHash}`, trainingRaw = await backend.get("analysis", key);
      if (trainingRaw === undefined) throw new RangeError("V5 adopted receipt is unavailable");
      const training = parseTrainingOperationsV3TrainingReceipt(JSON.parse(trainingRaw));
      if (training.receiptHash !== binding.admittedTraining.receiptHash || training.job.jobHash !== binding.admittedTraining.jobHash
        || !same(training.sourceJob, binding.sourceJob)) throw new RangeError("V5 adopted receipt changed");
      const { at: trainingAt, ...request } = training.evidence.request; void trainingAt;
      if (!same(request, binding.request)) throw new RangeError("V5 adopted request changed");
      guards.push({ store: "analysis", key, expected: trainingRaw });
    }
    await commitTrainingOperationsJobWrites(backend, job, guards, []);
    return binding;
  }

  /** Pure derived records for the sole promotion executor's atomic continuation. */
  promotionContinuation(schedule: TearFoundryJobScheduleV1, binding: TrainingOperationsExecutionBinding,
    promotion: NonNullable<TrainingOperationsExecutionBinding["promotion"]>, retry = false) {
    if (binding.step !== "awaiting-promotion" || schedule.state !== "disabled" || binding.schedule.scheduleHash !== schedule.scheduleHash) throw new RangeError("native promotion requires disabled awaiting-promotion schedule");
    const next = createBudgetBinding({ schedule: binding.schedule, sourceJob: binding.sourceJob, job: binding.job,
      request: binding.request, evaluationCases: binding.evaluationCases, previousBindingHash: binding.bindingHash,
      boundAt: binding.boundAt, ...(binding.admittedTraining === undefined ? {} : { admittedTraining: binding.admittedTraining }), promotion },
      binding.schemaVersion === 6 ? binding.budget : undefined);
    const writes = bindingWrites(schedule, next);
    const guards: TrainingOperationsV3Guard[] = [
      { store: "analysis", key: scheduleKey(schedule), expected: JSON.stringify(schedule) },
      { store: "analysis", key: `${OWNER}${schedule.id}`, expected: binding.sourceJob.jobHash },
      { store: "analysis", key: bindingKey(binding.bindingHash, binding.schemaVersion), expected: JSON.stringify(binding) },
      ...bindingWrites(schedule, binding).filter((write) => write.store === "indexes").map((write) => ({ store: write.store, key: write.key, expected: write.value ?? "" })),
      ...writes.map((write) => ({ store: write.store, key: write.key, ...(retry ? { expected: write.value ?? "" }
        : write.key === currentKey(schedule, binding.schemaVersion) ? { expected: binding.bindingHash } : {}) })),
    ];
    return { binding: next, guards, writes };
  }

  /** Changes cadence without changing the frozen experiment; undefined means no V5-owned current schedule. */
  async setEnabledByHash(scheduleHash: string, enabled: boolean, at: string): Promise<TearFoundryJobScheduleV1 | undefined> {
    if (!hash(scheduleHash) || !time(at) || typeof enabled !== "boolean") throw new TypeError("invalid V5 schedule control");
    const schedule = (await this.#schedules.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (schedule === undefined) return undefined;
    const binding = await this.current(schedule);
    if (binding === undefined) return undefined;
    const backend = this.#jobs.backend(), job = await this.#jobs.get(schedule.jobId);
    if (job?.jobHash !== binding.job.jobHash || job.phase !== binding.job.phase || !same(job.inputs, binding.sourceJob.inputs)
      || Date.parse(at) < Date.parse(binding.boundAt) || Date.parse(at) < Date.parse(job.events.at(-1)?.at ?? "")) {
      throw new RangeError("V5 schedule control requires current job lineage and time");
    }
    if (enabled && (binding.step === "awaiting-promotion" || binding.step === "promoted" || binding.step === "rejected")) throw new RangeError("V5 cycle has no authorized next training step");
    const guards: TrainingOperationsV3Guard[] = [
      { store: "analysis", key: scheduleKey(schedule), expected: JSON.stringify(schedule) },
      { store: "analysis", key: `${OWNER}${schedule.id}`, expected: binding.sourceJob.jobHash },
      { store: "analysis", key: currentKey(schedule, binding.schemaVersion), expected: binding.bindingHash },
      { store: "analysis", key: bindingKey(binding.bindingHash, binding.schemaVersion), expected: JSON.stringify(binding) },
      { store: "analysis", key: `foundry-job:v1:${job.id}`, expected: JSON.stringify(job) },
    ];
    if (enabled) {
      const services = this.#services;
      if (services === undefined) throw new RangeError("V5 resume requires governed services");
      const held = await services.custody.held(at), curated = await services.curation.active(at);
      for (const recordHash of binding.sourceJob.inputs.corpusRecordHashes) {
        const record = held.find((entry) => entry.recordHash === recordHash);
        const approval = curated.find((entry) => entry.custodyRecordHash === recordHash && entry.disposition === "curation-approved");
        if (record === undefined || approval?.candidateHash !== record.candidateHash || !record.privacyRetention.authorizedActorIds.includes(binding.request.actor)
          || record.consent.modelTraining === "no-training") throw new RangeError("V5 resume custody or curation is unavailable");
        guards.push(...await services.custody.sourceGuards(record));
        guards.push({ store: "analysis", key: `academy-candidate-custody:v1:${record.candidateHash}`, expected: JSON.stringify(record) },
          { store: "analysis", key: `academy-candidate-curation:v1:${record.candidateHash}`, expected: JSON.stringify(approval) });
      }
    }
    const nextSchedule = setTearFoundryJobScheduleEnabled(schedule, enabled, at);
    if (nextSchedule.scheduleHash === schedule.scheduleHash) {
      await commitTrainingOperationsJobWrites(backend, job, guards, []);
      return schedule;
    }
    const next = createBudgetBinding({ schedule: { id: nextSchedule.id, revision: nextSchedule.revision, scheduleHash: nextSchedule.scheduleHash },
      sourceJob: binding.sourceJob, job: binding.job, request: binding.request, evaluationCases: binding.evaluationCases,
      previousBindingHash: binding.bindingHash, boundAt: binding.boundAt,
      ...(binding.admittedTraining === undefined ? {} : { admittedTraining: binding.admittedTraining }) }, binding.schemaVersion === 6 ? binding.budget : undefined);
    const writes = [...bindingWrites(nextSchedule, next), { store: "indexes" as const,
      key: `foundry-job-schedule:${nextSchedule.id}:${nextSchedule.scheduleHash}`, value: JSON.stringify({ state: nextSchedule.state, jobHash: nextSchedule.jobHash }) }];
    await commitTrainingOperationsJobWrites(backend, job, [...guards, ...writes.map((write) => ({ store: write.store, key: write.key }))],
      [{ store: "analysis", key: scheduleKey(nextSchedule), value: JSON.stringify(nextSchedule) }, ...writes]);
    return nextSchedule;
  }

  async bindAndEnable(scheduleInput: TearFoundryJobScheduleV1, sourceInput: TearFoundryJobV1,
    request: Request, evaluationCases: readonly TearScenarioV1[], at: string, preparationInput?: TrainingOperationsPreparationV1,
    preparationGuards: readonly TrainingOperationsV3Guard[] = []): Promise<Readonly<{ schedule: TearFoundryJobScheduleV1; binding: TrainingOperationsExecutionBinding }>> {
    return this.#bindAndEnable(scheduleInput, sourceInput, request, evaluationCases, at, preparationInput, preparationGuards);
  }

  /** Explicitly adopts an exact retained admission. It neither retrains nor rewrites the job or a legacy binding. */
  async adoptAndEnable(schedule: TearFoundryJobScheduleV1, trainingSourceJobHash: string, trainingReceiptHash: string,
    evaluationCases: readonly TearScenarioV1[], at: string): Promise<Readonly<{ schedule: TearFoundryJobScheduleV1; binding: TrainingOperationsExecutionBinding }>> {
    if (!hash(trainingSourceJobHash) || !hash(trainingReceiptHash)) throw new TypeError("invalid V3 adoption receipt identity");
    const key = `foundry-job-v3-training:v1:${trainingSourceJobHash}`, raw = await this.#jobs.backend().get("analysis", key);
    if (raw === undefined) throw new RangeError("V3 adoption training receipt is unavailable");
    const training = parseTrainingOperationsV3TrainingReceipt(JSON.parse(raw));
    if (training.sourceJob.jobHash !== trainingSourceJobHash || training.receiptHash !== trainingReceiptHash) throw new RangeError("V3 adoption training receipt changed");
    const { at: trainingAt, ...request } = training.evidence.request; void trainingAt;
    return this.#bindAndEnable(schedule, training.sourceJob, request, evaluationCases, at, undefined,
      [{ store: "analysis", key, expected: raw }], training);
  }

  async #bindAndEnable(scheduleInput: TearFoundryJobScheduleV1, sourceInput: TearFoundryJobV1,
    request: Request, evaluationCases: readonly TearScenarioV1[], at: string, preparationInput?: TrainingOperationsPreparationV1,
    preparationGuards: readonly TrainingOperationsV3Guard[] = [], training?: TrainingOperationsV3TrainingReceiptV1): Promise<Readonly<{ schedule: TearFoundryJobScheduleV1; binding: TrainingOperationsExecutionBinding }>> {
    const before = parseTearFoundryJobSchedule(scheduleInput), source = parseTearFoundryJob(sourceInput), services = this.#services;
    const target = training?.job ?? source;
    if (services === undefined || before.state !== "disabled" || before.jobId !== source.id || before.jobHash !== target.jobHash
      || Date.parse(at) < Date.parse(target.events.at(-1)?.at ?? "")
      || before.stopConditionsHash !== source.inputs.stopConditionsHash) throw new RangeError("V5 binding requires an exact disabled governed schedule");
    const preparation = preparationInput === undefined ? undefined : parseTrainingOperationsPreparation(preparationInput);
    if (preparation !== undefined && (preparation.scheduleId !== before.id || preparation.jobId !== source.id
      || preparation.inputsHash !== stableVerificationHash(source.inputs) || preparation.requestHash !== stableVerificationHash(request)
      || preparation.evaluationPlanHash !== stableVerificationHash(evaluationCases) || preparation.actor !== request.actor
      || Date.parse(preparation.preparedAt) > Date.parse(at))) throw new RangeError("V5 binding preparation lineage changed");
    const schedule = setTearFoundryJobScheduleEnabled(before, true, at);
    const backend = this.#jobs.backend();
    const beforeRaw = await backend.get("analysis", scheduleKey(before));
    if (beforeRaw === undefined ? before.revision !== 1 : beforeRaw !== JSON.stringify(before)
      && beforeRaw !== JSON.stringify(schedule)) throw new RangeError("V5 source schedule changed");
    const budget = (await trainingOperationsJobBudgetAuthority(backend, source)).budget;
    if (budget !== undefined) requireScheduleBudget(schedule, budget.declaration);
    const binding = createBudgetBinding({ schedule: { id: schedule.id, revision: schedule.revision, scheduleHash: schedule.scheduleHash },
      sourceJob: source, job: { id: target.id, jobHash: target.jobHash, phase: target.phase }, request, evaluationCases, previousBindingHash: null, boundAt: at,
      ...(training === undefined ? {} : { admittedTraining: { receiptHash: training.receiptHash, jobHash: training.job.jobHash } }) }, budget?.declaration);
    const manifest = await services.corpus.getManifest(request.dataset.manifestId, { kind: "trainer", id: request.dataset.trainerId }, request.dataset.version);
    if (manifest?.manifestHash !== request.manifestHash || manifest.rootHash !== request.manifestRootHash
      || !same([...source.inputs.corpusRecordHashes].sort(), manifest.entries.map((entry) => entry.custodyRecordHash).sort())) throw new RangeError("V5 binding corpus changed");
    const guards: TrainingOperationsV3Guard[] = [
      ...preparationGuards,
      { store: "analysis", key: trainingOperationsPreparationKey(before.id), ...(preparation === undefined ? {} : { expected: JSON.stringify(preparation) }) },
      { store: "analysis", key: `${OWNER}${schedule.id}` },
      { store: "analysis", key: scheduleKey(before), ...(beforeRaw === undefined ? {} : { expected: JSON.stringify(before) }) },
      { store: "analysis", key: `foundry-job:v1:${source.id}`, expected: JSON.stringify(target) },
      { store: "analysis", key: `academy-corpus-manifest:v1:trainer:${request.dataset.trainerId}:${request.dataset.manifestId}:${String(request.dataset.version)}`, expected: JSON.stringify(manifest) },
      { store: "analysis", key: `policy-artifact:v1:${request.artifact.id}`, ...(training === undefined ? {} : { expected: JSON.stringify(training.evidence.candidate.artifact) }) },
      { store: "indexes", key: `policy-artifact:${request.artifact.id}`, ...(training === undefined ? {} : { expected: JSON.stringify({ artifactHash: training.evidence.candidate.artifact.artifactHash, createdAt: training.evidence.candidate.artifact.createdAt }) }) },
    ];
    if (training !== undefined) {
      const event = target.events.at(-1);
      if (event === undefined) throw new RangeError("V3 adoption event is unavailable");
      guards.push({ store: "analysis", key: `foundry-job-event:v1:${target.id}:${String(event.sequence)}:${event.eventHash}`, expected: JSON.stringify(event) },
        { store: "indexes", key: `foundry-job-current:${target.id}`, expected: JSON.stringify({ jobHash: target.jobHash, phase: target.phase }) },
        { store: "indexes", key: `foundry-job-v3-training:${target.id}:${training.receiptHash}`, expected: JSON.stringify({ jobHash: target.jobHash, artifactHash: training.evidence.candidate.artifact.artifactHash }) });
    }
    const held = await services.custody.held(at), curated = await services.curation.active(at);
    for (const entry of manifest.entries) {
      const custody = held.find((record) => record.recordHash === entry.custodyRecordHash && record.candidateHash === entry.candidateHash);
      const approval = curated.find((decision) => decision.decisionHash === entry.curationDecisionHash && decision.candidateHash === entry.candidateHash && decision.disposition === "curation-approved");
      if (custody === undefined || approval === undefined || !custody.privacyRetention.authorizedActorIds.includes(request.actor)
        || custody.consent.modelTraining === "no-training") throw new RangeError("V5 binding actor or custody is unavailable");
      guards.push(...await services.custody.sourceGuards(custody));
      guards.push({ store: "analysis", key: `academy-candidate-custody:v1:${entry.candidateHash}`, expected: JSON.stringify(custody) },
        { store: "analysis", key: `academy-candidate-curation:v1:${entry.candidateHash}`, expected: JSON.stringify(approval) });
      const sampleKey = `academy-reviewed-sample:v1:${entry.candidateHash}`, sampleRaw = await backend.get("analysis", sampleKey);
      if (sampleRaw === undefined) throw new RangeError("V5 binding reviewed sample is unavailable");
      guards.push({ store: "analysis", key: sampleKey, expected: sampleRaw });
    }
    const championKey = `policy-artifact:v1:${source.inputs.champion.id}`, championRaw = await backend.get("analysis", championKey);
    if (championRaw === undefined || parseTearPolicyArtifact(JSON.parse(championRaw)).artifactHash !== source.inputs.champion.artifactHash) throw new RangeError("V5 binding champion changed");
    guards.push({ store: "analysis", key: championKey, expected: championRaw });
    const activeRaw = await backend.get("analysis", "policy-active:v1");
    if (activeRaw !== undefined) {
      const active = parseTearPolicyActivation(JSON.parse(activeRaw));
      if (active.artifactId !== source.inputs.champion.id || active.artifactHash !== source.inputs.champion.artifactHash) throw new RangeError("V5 binding active champion changed");
    }
    guards.push({ store: "analysis", key: "policy-active:v1", ...(activeRaw === undefined ? {} : { expected: activeRaw }) });
    const writes = bindingWrites(schedule, binding);
    const launch = preparation === undefined ? undefined : createTrainingOperationsLaunchReceipt({ actionHash: preparation.actionHash,
      preparationHash: preparation.preparationHash, scheduleId: schedule.id, scheduleHash: schedule.scheduleHash,
      jobHash: source.jobHash, bindingHash: binding.bindingHash, enabledAt: at });
    if (launch !== undefined) guards.push({ store: "analysis", key: trainingOperationsLaunchReceiptKey(launch.actionHash) });
    const output: readonly GhostVaultWrite[] = [
      ...(launch === undefined ? [] : [{ store: "analysis" as const, key: trainingOperationsLaunchReceiptKey(launch.actionHash), value: JSON.stringify(launch) }]),
      ...(preparation === undefined ? [] : [{ store: "analysis" as const, key: trainingOperationsPreparationKey(before.id) }]),
      { store: "analysis", key: `${OWNER}${schedule.id}`, value: source.jobHash },
      { store: "analysis", key: scheduleKey(schedule), value: JSON.stringify(schedule) }, ...writes,
    ];
    const finalGuards = [...guards, ...writes.map((write) => ({ store: write.store, key: write.key }))];
    try { await commitTrainingOperationsJobWrites(backend, target, finalGuards, output); }
    catch {
      // Response loss or an identical caller is success only with every exact
      // output and all unchanged input authority, without another storage charge.
      const changed = new Set(output.map((write) => `${write.store}:${write.key}`));
      await commitTrainingOperationsJobWrites(backend, target, [
        ...finalGuards.filter((guard) => !changed.has(`${guard.store}:${guard.key}`)),
        ...output.map((write) => ({ store: write.store, key: write.key, ...(write.value === undefined ? {} : { expected: write.value }) })),
      ], []);
    }
    return Object.freeze({ schedule, binding });
  }

  /** Returns undefined only when this schedule is not owned by V5. Invalid V5 state never falls through to legacy dispatch. */
  async runIfBound(scheduleHash: string, at: string, leaseId: string): Promise<TrainingOperationsScheduledResultV1 | undefined> {
    if (!hash(scheduleHash) || !time(at) || !text(leaseId)) throw new TypeError("invalid V5 scheduled invocation");
    const backend = this.#jobs.backend(), attemptKey = `${ATTEMPT}${scheduleHash}`, previousRaw = await backend.get("analysis", attemptKey);
    const previous = previousRaw === undefined ? undefined : parseAttempt(JSON.parse(previousRaw));
    if (previous !== undefined && previous.scheduleHash !== scheduleHash) throw new RangeError("V5 attempt key mismatch");
    // Historical completion is read-only: never repeat work because the outer scheduler lost its response.
    if (previous?.status === "completed") return completedResult(this.#jobs, previous, at, this.#services);
    if (previous !== undefined && Date.parse(previous.expiresAt) > Date.parse(at)) throw new RangeError("V5 scheduled step already has a live lease");
    const schedule = (await this.#schedules.list()).find((entry) => entry.scheduleHash === scheduleHash);
    if (schedule === undefined) {
      if (previous !== undefined) throw new RangeError("V5 leased schedule is no longer current");
      return undefined;
    }
    const binding = await this.current(schedule);
    if (binding === undefined) return undefined;
    const services = this.#services, dueAt = dueAtFoundryJobSchedule(schedule);
    if (services === undefined || schedule.state !== "enabled" || dueAt === null || Date.parse(at) < Date.parse(dueAt)) throw new RangeError("V5 execution requires shared services and a due enabled schedule");
    if (binding.step === "awaiting-promotion" || binding.step === "promoted" || binding.step === "rejected") throw new RangeError("V5 cycle has no authorized next training step");
    const job = await this.#jobs.get(schedule.jobId);
    if (job?.jobHash !== binding.job.jobHash || job.phase !== binding.job.phase
      || !same(job.inputs, binding.sourceJob.inputs) || job.events.length < binding.sourceJob.events.length
      || binding.sourceJob.events.some((event, index) => event.eventHash !== job.events[index]?.eventHash)) throw new RangeError("V5 scheduled job lineage changed");
    const dataset = binding.request.dataset;
    const [held, curated, manifest] = await Promise.all([services.custody.held(at), services.curation.active(at),
      services.corpus.getManifest(dataset.manifestId, { kind: "trainer", id: dataset.trainerId }, dataset.version)]);
    if (manifest?.manifestHash !== binding.request.manifestHash || manifest.rootHash !== binding.request.manifestRootHash
      || !same([...binding.sourceJob.inputs.corpusRecordHashes].sort(), manifest.entries.map((entry) => entry.custodyRecordHash).sort())) {
      throw new RangeError("V5 scheduled corpus is unavailable or changed");
    }
    const corpusGuards: TrainingOperationsV3Guard[] = [{ store: "analysis",
      key: `academy-corpus-manifest:v1:trainer:${dataset.trainerId}:${dataset.manifestId}:${String(dataset.version)}`, expected: JSON.stringify(manifest) }];
    for (const entry of manifest.entries) {
      const record = held.find((value) => value.recordHash === entry.custodyRecordHash && value.candidateHash === entry.candidateHash);
      if (record === undefined || !record.privacyRetention.authorizedActorIds.includes(binding.request.actor) || record.consent.modelTraining === "no-training") throw new RangeError("V5 scheduled custody is unavailable");
      const approval = curated.find((value) => value.candidateHash === entry.candidateHash && value.custodyRecordHash === entry.custodyRecordHash
        && value.decisionHash === entry.curationDecisionHash && value.disposition === "curation-approved");
      if (approval === undefined) throw new RangeError("V5 scheduled curation is unavailable or changed");
      corpusGuards.push(...await services.custody.sourceGuards(record));
      corpusGuards.push({ store: "analysis", key: `academy-candidate-custody:v1:${record.candidateHash}`, expected: JSON.stringify(record) },
        { store: "analysis", key: `academy-candidate-curation:v1:${entry.candidateHash}`, expected: JSON.stringify(approval) });
    }
    const claimed = createAttempt({ format: "training-operations-scheduled-attempt", schemaVersion: 1,
      scheduleHash, bindingHash: binding.bindingHash, sourceJobHash: job.jobHash, leaseId, attemptedAt: at,
      expiresAt: new Date(Date.parse(at) + 60_000).toISOString(), status: "running",
      outputReceiptHash: null, nextBindingHash: null, resultJobHash: null, resultPhase: null });
    const claimRaw = JSON.stringify(claimed);
    const authority: TrainingOperationsV3Guard[] = [
      { store: "analysis", key: `${OWNER}${schedule.id}`, expected: binding.sourceJob.jobHash },
      { store: "analysis", key: scheduleKey(schedule), expected: JSON.stringify(schedule) },
      { store: "analysis", key: `foundry-job:v1:${job.id}`, expected: JSON.stringify(job) },
      { store: "analysis", key: currentKey(schedule, binding.schemaVersion), expected: binding.bindingHash },
      { store: "analysis", key: bindingKey(binding.bindingHash, binding.schemaVersion), expected: JSON.stringify(binding) }, ...corpusGuards,
    ];
    await commitTrainingOperationsJobWrites(backend, job, [...authority, { store: "analysis", key: attemptKey, ...(previousRaw === undefined ? {} : { expected: previousRaw }) }],
      [{ store: "analysis", key: attemptKey, value: claimRaw }]);
    let completed: Attempt | undefined;
    const continuation: TrainingOperationsV3Continuation<{ readonly job: TearFoundryJobV1; readonly receiptHash: string }> = (output) => {
      let nextSchedule = output.job.phase === "rejected" ? concludeTearFoundryJobSchedule(schedule, job, output.job)
        : rebindTearFoundryJobSchedule(schedule, job, output.job, at);
      // Promotion has separate gates. Do not keep waking an unimplemented promotional step.
      if (output.job.phase === "monitoring") nextSchedule = setTearFoundryJobScheduleEnabled(nextSchedule, false, at);
      const next = createBudgetBinding({ schedule: { id: nextSchedule.id, revision: nextSchedule.revision, scheduleHash: nextSchedule.scheduleHash },
        sourceJob: binding.sourceJob, job: { id: output.job.id, jobHash: output.job.jobHash, phase: output.job.phase },
        request: binding.request, evaluationCases: binding.evaluationCases, previousBindingHash: binding.bindingHash, boundAt: binding.boundAt,
        ...(binding.admittedTraining === undefined ? {} : { admittedTraining: binding.admittedTraining }) }, binding.schemaVersion === 6 ? binding.budget : undefined);
      const { attemptHash, ...claimDraft } = claimed; void attemptHash;
      completed = createAttempt({ ...claimDraft, status: "completed", outputReceiptHash: output.receiptHash,
        nextBindingHash: next.bindingHash, resultJobHash: output.job.jobHash, resultPhase: output.job.phase });
      const derived = [...bindingWrites(nextSchedule, next),
        { store: "indexes" as const, key: `foundry-job-schedule:${nextSchedule.id}:${nextSchedule.scheduleHash}`, value: JSON.stringify({ state: nextSchedule.state, jobHash: nextSchedule.jobHash }) }];
      return {
        guards: [...authority, { store: "analysis", key: attemptKey, expected: claimRaw }, ...derived.map((write) => ({ store: write.store, key: write.key }))],
        writes: [{ store: "analysis", key: scheduleKey(nextSchedule), value: JSON.stringify(nextSchedule) }, ...derived,
          { store: "analysis", key: attemptKey, value: JSON.stringify(completed) }],
      };
    };
    try {
      const evaluator = new TrainingOperationsV3EvaluationExecutor(this.#jobs, services);
      if (binding.step === "train") await new TrainingOperationsV3TrainingAdmissionExecutor(this.#jobs, services)
        .start(binding.sourceJob, { ...binding.request, at }, continuation);
      else if (binding.step === "admit") await evaluator.admit(binding.sourceJob.jobHash, at, binding.evaluationCases, continuation);
      else if (binding.step === "execute") await evaluator.execute(binding.sourceJob.jobHash, at, continuation);
      else await evaluator.decide(binding.sourceJob.jobHash, at, continuation);
      if (completed === undefined) throw new RangeError("V5 scheduler did not retain a completion");
      return await completedResult(this.#jobs, completed, at, services);
    } catch (error) {
      // Release only our still-running lease. A completed transaction or newer owner is preserved.
      try { await commitTrainingOperationsJobWrites(backend, job, [{ store: "analysis", key: attemptKey, expected: claimRaw }], [{ store: "analysis", key: attemptKey }]); } catch { /* Another exact owner or completion won. */ }
      throw error;
    }
  }
}
