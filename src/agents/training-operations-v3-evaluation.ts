/** Training Operations evaluation; legacy wire identifiers remain byte-compatible. */
import type { GhostVaultStore } from "../ghost";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { stableVerificationHash } from "../replay/hash";
import { commitTrainingOperationsJobWrites } from "./training-operations-budget";
import { trainingOperationsEvaluationComputeUnits } from "./training-operations-compute-budget";
import type { trainTrainingArchiveV3Candidate } from "./training-archive-v3-candidate-training";
import { assertTrainingOperationsV3JobPayload } from "./training-archive-v3-derived-evidence-contract";
import { trainingOperationsV3CommitParts, verifyTrainingOperationsV3Commit, type TrainingOperationsV3Continuation } from "./training-operations-v3-commit";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { parseTrainingOperationsV3TrainingReceipt, type TrainingOperationsV3TrainingReceiptV1 } from "./training-operations-v3-training";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { createTrainingOperationsV3ChampionEvaluationPlan, evaluateTrainingOperationsV3ChampionInSource, type TrainingOperationsV3ChampionEvaluationPlanV1 } from "./training-operations-v3-champion-evaluation";
import { freezeTrainingOperationsEvidence, parseTrainingOperationsV3ChampionEvaluationResult, type TrainingOperationsV3ChampionEvaluationResultV1 } from "./training-operations-v3-comparison-result";
import { parseTearPolicyActivation, parseTearPolicyArtifact, type TearPolicyArtifactV1 } from "./policy-artifact-registry";

const KEY = "foundry-job-v3-evaluation-admission:v1:";
const REASON = "governed V3 champion evaluation plan retained";
const RESULT_KEY = "foundry-job-v3-evaluation-execution:v1:";
const RESULT_REASON = "governed V3 champion comparison retained";
const DECISION_KEY = "training-operations-v3-decision:v1:";
const decisionReason = (passed: boolean): string => passed
  ? "governed V3 champion comparison passed; monitoring ready, not promotion"
  : "governed V3 champion comparison did not pass";
const HASH = /^[a-f0-9]{16}$/u;
type Services = Parameters<typeof trainTrainingArchiveV3Candidate>[0];
const same = (left: unknown, right: unknown): boolean => stableVerificationHash(left) === stableVerificationHash(right);
function requireUnseenEvaluationCases(training: TrainingOperationsV3TrainingReceiptV1, cases: readonly TearScenarioV1[],
  corpusScenarios?: readonly TearScenarioV1[]): void {
  const online = training.evidence.online.scenarios;
  const exposedSeeds = new Set([...online, ...(corpusScenarios ?? [])].map((scenario) => scenario.seed));
  const exposedHashes = new Set([...training.evidence.reward.environment.scenarioHashes,
    ...online.map((scenario) => stableVerificationHash(scenario))]);
  if (cases.some((scenario) => exposedSeeds.has(scenario.seed) || exposedHashes.has(stableVerificationHash(scenario)))) {
    throw new RangeError("V3 evaluation cases overlap training exposure");
  }
}
function requireEvaluationTime(source: TearFoundryJobV1, at: string): void {
  const latest = source.events.at(-1);
  if (latest === undefined || !Number.isFinite(Date.parse(at)) || Date.parse(at) < Date.parse(latest.at)) {
    throw new RangeError("V3 evaluation time precedes training completion");
  }
}

export interface TrainingOperationsV3EvaluationAdmissionV1 {
  readonly format: "tear-foundry-v3-evaluation-admission";
  readonly schemaVersion: 1;
  readonly trainingSourceJobHash: string;
  readonly trainingReceiptHash: string;
  readonly sourceJob: TearFoundryJobV1;
  readonly job: TearFoundryJobV1;
  readonly admittedAt: string;
  readonly plan: TrainingOperationsV3ChampionEvaluationPlanV1;
  readonly receiptHash: string;
}

/** Historical integrity only. Current custody and durable authority are checked by admit(). */
export function parseTrainingOperationsV3EvaluationAdmission(
  value: unknown, trainingInput: TrainingOperationsV3TrainingReceiptV1, championInput: TearPolicyArtifactV1,
): TrainingOperationsV3EvaluationAdmissionV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid V3 evaluation admission");
  const keys = ["format", "schemaVersion", "trainingSourceJobHash", "trainingReceiptHash", "sourceJob", "job", "admittedAt", "plan", "receiptHash"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("invalid V3 evaluation admission fields");
  const typed = value as TrainingOperationsV3EvaluationAdmissionV1;
  const envelope = value as Record<string, unknown>;
  const { receiptHash, ...draft } = typed;
  if (envelope.format !== "tear-foundry-v3-evaluation-admission" || envelope.schemaVersion !== 1
    || !HASH.test(receiptHash) || receiptHash !== stableVerificationHash(draft)) throw new TypeError("V3 evaluation admission integrity mismatch");
  const training = parseTrainingOperationsV3TrainingReceipt(trainingInput), source = parseTearFoundryJob(typed.sourceJob), job = parseTearFoundryJob(typed.job);
  assertTrainingOperationsV3JobPayload(typed.sourceJob);
  assertTrainingOperationsV3JobPayload(typed.job);
  requireEvaluationTime(source, typed.admittedAt);
  if (!same(typed.sourceJob, source) || !same(typed.job, job) || source.phase !== "training" || !same(source, training.job)
    || typed.trainingSourceJobHash !== training.sourceJob.jobHash || typed.trainingReceiptHash !== training.receiptHash
    || !same(job, transitionTearFoundryJob(source, "evaluating", typed.admittedAt, REASON))) throw new RangeError("V3 evaluation admission training lineage changed");
  const plan = createTrainingOperationsV3ChampionEvaluationPlan(job, typed.plan.cases,
    training.evidence.reward, championInput, training.evidence.candidate.artifact);
  requireUnseenEvaluationCases(training, plan.cases);
  if (!same(plan, typed.plan)) throw new RangeError("V3 evaluation admission plan lineage changed");
  return freezeTrainingOperationsEvidence(structuredClone(typed));
}

export interface TrainingOperationsV3EvaluationExecutionV1 {
  readonly format: "tear-foundry-v3-evaluation-execution";
  readonly schemaVersion: 1;
  readonly trainingSourceJobHash: string;
  readonly admissionReceiptHash: string;
  readonly sourceJobHash: string;
  readonly job: TearFoundryJobV1;
  readonly recordedAt: string;
  readonly result: TrainingOperationsV3ChampionEvaluationResultV1;
  readonly receiptHash: string;
}

/** Retained integrity is not current authority and does not certify promotion. */
export function parseTrainingOperationsV3EvaluationExecution(
  value: unknown, admissionInput: TrainingOperationsV3EvaluationAdmissionV1,
  training: TrainingOperationsV3TrainingReceiptV1, champion: TearPolicyArtifactV1,
): TrainingOperationsV3EvaluationExecutionV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid V3 evaluation execution");
  const keys = ["format", "schemaVersion", "trainingSourceJobHash", "admissionReceiptHash", "sourceJobHash", "job", "recordedAt", "result", "receiptHash"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("invalid V3 evaluation execution fields");
  const raw = value as Record<string, unknown>, typed = value as TrainingOperationsV3EvaluationExecutionV1;
  const { receiptHash, ...draft } = typed;
  if (raw.format !== "tear-foundry-v3-evaluation-execution" || raw.schemaVersion !== 1 || typeof receiptHash !== "string"
    || !HASH.test(receiptHash) || stableVerificationHash(draft) !== receiptHash) throw new TypeError("V3 evaluation execution integrity mismatch");
  const admission = parseTrainingOperationsV3EvaluationAdmission(admissionInput, training, champion);
  assertTrainingOperationsV3JobPayload(typed.job);
  requireEvaluationTime(admission.job, typed.recordedAt);
  if (typed.trainingSourceJobHash !== admission.trainingSourceJobHash || typed.admissionReceiptHash !== admission.receiptHash
    || typed.sourceJobHash !== admission.job.jobHash
    || !same(typed.job, parseTearFoundryJob(typed.job))
    || !same(typed.job, transitionTearFoundryJob(admission.job, "deciding", typed.recordedAt, RESULT_REASON))) {
    throw new RangeError("V3 evaluation execution admission lineage changed");
  }
  parseTrainingOperationsV3ChampionEvaluationResult(typed.result, admission.plan, admission.job,
    training.evidence.reward, champion, training.evidence.candidate.artifact);
  return freezeTrainingOperationsEvidence(structuredClone(typed));
}

export interface TrainingOperationsV3DecisionV1 {
  readonly format: "training-operations-v3-decision";
  readonly schemaVersion: 1;
  readonly trainingSourceJobHash: string;
  readonly evaluationReceiptHash: string;
  readonly evaluationResultHash: string;
  readonly sourceJobHash: string;
  readonly job: TearFoundryJobV1;
  readonly disposition: "monitoring-ready" | "rejected";
  readonly decidedAt: string;
  readonly receiptHash: string;
}

/** Historical integrity only; the executor separately verifies current authority. */
export function parseTrainingOperationsV3Decision(
  value: unknown, evaluationInput: TrainingOperationsV3EvaluationExecutionV1,
  admission: TrainingOperationsV3EvaluationAdmissionV1,
  training: TrainingOperationsV3TrainingReceiptV1, champion: TearPolicyArtifactV1,
): TrainingOperationsV3DecisionV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid V3 decision");
  const keys = ["format", "schemaVersion", "trainingSourceJobHash", "evaluationReceiptHash", "evaluationResultHash", "sourceJobHash", "job", "disposition", "decidedAt", "receiptHash"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("invalid V3 decision fields");
  const raw = value as Record<string, unknown>, typed = value as TrainingOperationsV3DecisionV1;
  const { receiptHash, ...draft } = typed;
  if (raw.format !== "training-operations-v3-decision" || raw.schemaVersion !== 1 || typeof receiptHash !== "string"
    || !HASH.test(receiptHash) || stableVerificationHash(draft) !== receiptHash) throw new TypeError("V3 decision integrity mismatch");
  const evaluation = parseTrainingOperationsV3EvaluationExecution(evaluationInput, admission, training, champion);
  assertTrainingOperationsV3JobPayload(typed.job);
  requireEvaluationTime(evaluation.job, typed.decidedAt);
  const passed = evaluation.result.metrics.passed;
  if (typed.trainingSourceJobHash !== evaluation.trainingSourceJobHash || typed.evaluationReceiptHash !== evaluation.receiptHash
    || typed.evaluationResultHash !== evaluation.result.resultHash || typed.sourceJobHash !== evaluation.job.jobHash
    || typed.disposition !== (passed ? "monitoring-ready" : "rejected")
    || !same(typed.job, parseTearFoundryJob(typed.job))
    || !same(typed.job, transitionTearFoundryJob(evaluation.job, passed ? "monitoring" : "rejected", typed.decidedAt, decisionReason(passed)))) {
    throw new RangeError("V3 decision evaluation lineage or disposition changed");
  }
  return freezeTrainingOperationsEvidence(structuredClone(typed));
}

/** Local evaluation and decision owner; never activates, promotes, or schedules a policy. */
export class TrainingOperationsV3EvaluationExecutor {
  readonly #jobs: TearFoundryJobVault;
  readonly #services: Services;
  constructor(jobs: TearFoundryJobVault, services: Services) {
    const backend = jobs.backend();
    if ([services.custody.backend(), services.curation.backend(), services.corpus.backend(), services.loader.backend()].some((entry) => entry !== backend)) {
      throw new TypeError("V3 evaluation admission must share one C31 Vault");
    }
    this.#jobs = jobs; this.#services = services;
  }

  async #capture(trainingSourceJobHash: string, at: string, expectedJob?: TearFoundryJobV1, casesInput?: readonly TearScenarioV1[]) {
    if (!HASH.test(trainingSourceJobHash) || !Number.isFinite(Date.parse(at))) throw new TypeError("invalid V3 evaluation admission request");
    const backend = this.#jobs.backend();
    const guards: Readonly<{ store: GhostVaultStore; key: string; expected?: string }>[] = [];
    const pin = async (store: GhostVaultStore, key: string): Promise<string | undefined> => {
      const raw = await backend.get(store, key);
      guards.push({ store, key, ...(raw === undefined ? {} : { expected: raw }) });
      return raw;
    };
    const required = async (store: GhostVaultStore, key: string): Promise<string> => {
      const raw = await pin(store, key);
      if (raw === undefined) throw new RangeError("V3 evaluation admission dependency unavailable");
      return raw;
    };
    const pinCommittedRecord = async (key: string, field: string, expected: string): Promise<void> => {
      const value: unknown = JSON.parse(await required("analysis", key));
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid V3 evaluation source record");
      const record = value as Record<string, unknown>, draft = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
      if (record[field] !== expected || stableVerificationHash(draft) !== expected) throw new RangeError("V3 evaluation committed source record changed");
    };
    // Training receipts are keyed by the curating source hash, not the successor.
    const training = parseTrainingOperationsV3TrainingReceipt(JSON.parse(await required("analysis", `foundry-job-v3-training:v1:${trainingSourceJobHash}`)));
    if (training.sourceJob.jobHash !== trainingSourceJobHash) throw new RangeError("V3 evaluation training receipt key changed");
    const source = training.job, data = training.evidence, request = data.request;
    const trainingIndex = await required("indexes", `foundry-job-v3-training:${source.id}:${training.receiptHash}`);
    if (trainingIndex !== JSON.stringify({ jobHash: source.jobHash, artifactHash: data.candidate.artifact.artifactHash })) {
      throw new RangeError("V3 evaluation training index changed");
    }
    const trainingEvent = source.events.at(-1);
    if (trainingEvent === undefined || await required("analysis", `foundry-job-event:v1:${source.id}:${String(trainingEvent.sequence)}:${trainingEvent.eventHash}`)
      !== JSON.stringify(trainingEvent)) throw new RangeError("V3 evaluation training event changed");
    requireEvaluationTime(source, at);
    const current = parseTearFoundryJob(JSON.parse(await required("analysis", `foundry-job:v1:${source.id}`)));
    const rawPrevious = await pin("analysis", `${KEY}${trainingSourceJobHash}`);
    const champion = parseTearPolicyArtifact(JSON.parse(await required("analysis", `policy-artifact:v1:${source.inputs.champion.id}`)));
    if (await required("indexes", `policy-artifact:${champion.id}`) !== JSON.stringify({
      artifactHash: champion.artifactHash, createdAt: champion.createdAt })) throw new RangeError("V3 evaluation champion index changed");
    const candidateRaw = await required("analysis", `policy-artifact:v1:${data.candidate.artifact.id}`);
    const candidateIndex = await required("indexes", `policy-artifact:${data.candidate.artifact.id}`);
    if (candidateRaw !== JSON.stringify(data.candidate.artifact) || candidateIndex !== JSON.stringify({
      artifactHash: data.candidate.artifact.artifactHash, createdAt: data.candidate.artifact.createdAt })) throw new RangeError("V3 evaluation candidate authority changed");
    const activeRaw = await pin("analysis", "policy-active:v1");
    if (activeRaw !== undefined) {
      const active = parseTearPolicyActivation(JSON.parse(activeRaw));
      if (active.artifactId !== champion.id || active.artifactHash !== champion.artifactHash) throw new RangeError("V3 evaluation active champion changed");
    }
    const previous = rawPrevious === undefined ? undefined : parseTrainingOperationsV3EvaluationAdmission(JSON.parse(rawPrevious), training, champion);
    if (!same(current, expectedJob ?? previous?.job ?? source) || previous !== undefined && Date.parse(at) < Date.parse(previous.admittedAt)) {
      throw new RangeError("V3 evaluation current job changed");
    }
    const job = previous?.job ?? transitionTearFoundryJob(source, "evaluating", at, REASON);
    const manifestKey = `academy-corpus-manifest:v1:trainer:${request.dataset.trainerId}:${request.dataset.manifestId}:${String(request.dataset.version)}`;
    const manifestRaw = await required("analysis", manifestKey);
    const manifest = await this.#services.corpus.getManifest(request.dataset.manifestId, { kind: "trainer", id: request.dataset.trainerId }, request.dataset.version);
    if (manifest === undefined || manifestRaw !== JSON.stringify(manifest) || manifest.manifestHash !== request.manifestHash
      || manifest.rootHash !== request.manifestRootHash || !same([...source.inputs.corpusRecordHashes].sort(), manifest.entries.map((entry) => entry.custodyRecordHash).sort())) {
      throw new RangeError("V3 evaluation frozen corpus changed");
    }
    // Validate at the evaluation invocation time, not the historical training time.
    for (const entry of manifest.entries) {
      await required("analysis", `academy-candidate-custody:v1:${entry.candidateHash}`);
      await required("analysis", `academy-candidate-curation:v1:${entry.candidateHash}`);
      await pinCommittedRecord(`academy-reviewed-sample:v1:${entry.candidateHash}`, "sampleHash", entry.reviewedSampleHash);
      await pinCommittedRecord(`academy-candidate-split:v1:${entry.candidateHash}`, "assignmentHash", entry.splitAssignmentHash);
      await pinCommittedRecord(`academy-corpus-entry:v1:${entry.candidateHash}`, "entryHash", entry.entryHash);
    }
    const held = await this.#services.custody.held(at), curated = await this.#services.curation.active(at);
    if (!manifest.entries.every((entry) => held.some((record) => record.recordHash === entry.custodyRecordHash
      && record.candidateHash === entry.candidateHash && record.privacyRetention.authorizedActorIds.includes(request.actor)
      && record.consent.modelTraining !== "no-training" && guards.some((guard) => guard.key === `academy-candidate-custody:v1:${entry.candidateHash}` && guard.expected === JSON.stringify(record)))
      && curated.some((decision) => decision.decisionHash === entry.curationDecisionHash && decision.candidateHash === entry.candidateHash
        && decision.disposition === "curation-approved" && guards.some((guard) => guard.key === `academy-candidate-curation:v1:${entry.candidateHash}` && guard.expected === JSON.stringify(decision))))) {
      throw new RangeError("V3 evaluation current custody or approval unavailable");
    }
    for (const entry of manifest.entries) {
      const record = held.find((value) => value.recordHash === entry.custodyRecordHash && value.candidateHash === entry.candidateHash);
      if (record === undefined) throw new RangeError("V3 evaluation source custody unavailable");
      guards.push(...await this.#services.custody.sourceGuards(record));
    }
    const dataset = await this.#services.loader.load(request.dataset);
    if (dataset.datasetHash !== data.lineage.datasetHash || dataset.manifest.manifestHash !== request.manifestHash
      || dataset.manifest.rootHash !== request.manifestRootHash) throw new RangeError("V3 evaluation reviewed dataset changed");
    const cases = casesInput ?? previous?.plan.cases;
    if (cases === undefined) throw new RangeError("V3 evaluation requires retained admission or explicit frozen holdout cases");
    const plan = createTrainingOperationsV3ChampionEvaluationPlan(job, cases, data.reward, champion, data.candidate.artifact);
    const corpusScenarios = dataset.sequences.map((sequence) => {
      if (sequence.sourceScenario === undefined) throw new RangeError("V3 evaluation cannot verify corpus training exposure");
      return sequence.sourceScenario;
    });
    requireUnseenEvaluationCases(training, plan.cases, corpusScenarios);
    const draft = { format: "tear-foundry-v3-evaluation-admission" as const, schemaVersion: 1 as const,
      trainingSourceJobHash, trainingReceiptHash: training.receiptHash, sourceJob: source, job, admittedAt: previous?.admittedAt ?? at, plan };
    const receipt = parseTrainingOperationsV3EvaluationAdmission({ ...draft, receiptHash: stableVerificationHash(draft) }, training, champion);
    return { receipt, training, champion, current, previous, guards };
  }

  async admit(trainingSourceJobHash: string, at: string, cases?: readonly TearScenarioV1[],
    continuation?: TrainingOperationsV3Continuation<TrainingOperationsV3EvaluationAdmissionV1>): Promise<TrainingOperationsV3EvaluationAdmissionV1> {
    const { receipt, previous, guards } = await this.#capture(trainingSourceJobHash, at, undefined, cases);
    const backend = this.#jobs.backend();
    const parts = trainingOperationsV3CommitParts(receipt, guards, [
      { store: "analysis", key: `${KEY}${trainingSourceJobHash}`, value: JSON.stringify(receipt) },
    ], continuation);
    if (previous !== undefined) {
      if (!same(previous, receipt)) throw new RangeError("V3 evaluation retry evidence changed");
      // The identical-successor branch verifies the budget owner, ledger and
      // durable event/current-index pair without writing or charging again.
      await this.#jobs.persistSuccessorIfMatches(previous.sourceJob, previous.job, parts.guards, parts.writes);
      return previous;
    }
    await this.#jobs.persistSuccessorIfMatches(receipt.sourceJob, receipt.job, parts.guards, parts.writes);
    await verifyTrainingOperationsV3Commit(backend, parts.guards, [...parts.writes,
      { store: "analysis", key: `foundry-job:v1:${receipt.job.id}`, value: JSON.stringify(receipt.job) }]);
    return receipt;
  }

  async execute(trainingSourceJobHash: string, at: string,
    continuation?: TrainingOperationsV3Continuation<TrainingOperationsV3EvaluationExecutionV1>): Promise<TrainingOperationsV3EvaluationExecutionV1> {
    if (!HASH.test(trainingSourceJobHash)) throw new TypeError("invalid V3 evaluation execution source hash");
    const backend = this.#jobs.backend(), key = `${RESULT_KEY}${trainingSourceJobHash}`, rawPrevious = await backend.get("analysis", key);
    const value: unknown = rawPrevious === undefined ? undefined : JSON.parse(rawPrevious);
    if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) throw new TypeError("invalid retained V3 evaluation execution");
    const expectedJob = value === undefined ? undefined : parseTearFoundryJob((value as Record<string, unknown>).job);
    const { receipt: admission, previous: retainedAdmission, training, champion, guards } = await this.#capture(trainingSourceJobHash, at, expectedJob);
    if (retainedAdmission === undefined) throw new RangeError("V3 evaluation execution requires retained admission");
    requireEvaluationTime(admission.job, at);
    guards.push({ store: "analysis", key, ...(rawPrevious === undefined ? {} : { expected: rawPrevious }) });
    if (value !== undefined) {
      const prior = parseTrainingOperationsV3EvaluationExecution(value, admission, training, champion);
      if (Date.parse(at) < Date.parse(prior.recordedAt)) throw new RangeError("V3 evaluation execution retry precedes its result");
      const parts = trainingOperationsV3CommitParts(prior, guards, [{ store: "analysis", key, value: JSON.stringify(prior) }], continuation);
      await this.#jobs.persistSuccessorIfMatches(admission.job, prior.job, parts.guards, parts.writes);
      return prior;
    }
    await commitTrainingOperationsJobWrites(backend, admission.job, guards, [], trainingOperationsEvaluationComputeUnits(admission.job, admission.plan.cases));
    const result = evaluateTrainingOperationsV3ChampionInSource(admission.plan, admission.job, training.evidence.reward, champion, training.evidence.candidate.artifact);
    const job = transitionTearFoundryJob(admission.job, "deciding", at, RESULT_REASON);
    const draft = { format: "tear-foundry-v3-evaluation-execution" as const, schemaVersion: 1 as const,
      trainingSourceJobHash, admissionReceiptHash: admission.receiptHash, sourceJobHash: admission.job.jobHash, job, recordedAt: at, result };
    const receipt = parseTrainingOperationsV3EvaluationExecution({ ...draft, receiptHash: stableVerificationHash(draft) }, admission, training, champion);
    const parts = trainingOperationsV3CommitParts(receipt, guards, [{ store: "analysis", key, value: JSON.stringify(receipt) }], continuation);
    await this.#jobs.persistSuccessorIfMatches(admission.job, job, parts.guards, parts.writes);
    await verifyTrainingOperationsV3Commit(backend, parts.guards, [...parts.writes,
      { store: "analysis", key: `foundry-job:v1:${job.id}`, value: JSON.stringify(job) }]);
    return receipt;
  }

  async decide(trainingSourceJobHash: string, at: string,
    continuation?: TrainingOperationsV3Continuation<TrainingOperationsV3DecisionV1>): Promise<TrainingOperationsV3DecisionV1> {
    if (!HASH.test(trainingSourceJobHash)) throw new TypeError("invalid V3 decision source hash");
    const backend = this.#jobs.backend(), key = `${DECISION_KEY}${trainingSourceJobHash}`;
    const evaluationKey = `${RESULT_KEY}${trainingSourceJobHash}`;
    const evaluationRaw = await backend.get("analysis", evaluationKey);
    if (evaluationRaw === undefined) throw new RangeError("V3 decision requires retained evaluation execution");
    const evaluationValue: unknown = JSON.parse(evaluationRaw);
    const previousRaw = await backend.get("analysis", key), previousValue: unknown = previousRaw === undefined ? undefined : JSON.parse(previousRaw);
    const headValue = previousValue ?? evaluationValue;
    if (headValue === null || typeof headValue !== "object" || Array.isArray(headValue)) throw new TypeError("invalid V3 decision evidence");
    const expectedJob = parseTearFoundryJob((headValue as Record<string, unknown>).job);
    const { receipt: admission, previous: retainedAdmission, training, champion, guards } = await this.#capture(trainingSourceJobHash, at, expectedJob);
    if (retainedAdmission === undefined) throw new RangeError("V3 decision requires retained admission");
    const evaluation = parseTrainingOperationsV3EvaluationExecution(evaluationValue, admission, training, champion);
    requireEvaluationTime(evaluation.job, at);
    guards.push({ store: "analysis", key: evaluationKey, expected: evaluationRaw },
      { store: "analysis", key, ...(previousRaw === undefined ? {} : { expected: previousRaw }) });
    if (previousValue !== undefined) {
      const previous = parseTrainingOperationsV3Decision(previousValue, evaluation, admission, training, champion);
      if (Date.parse(at) < Date.parse(previous.decidedAt)) throw new RangeError("V3 decision retry precedes its receipt");
      const parts = trainingOperationsV3CommitParts(previous, guards, [{ store: "analysis", key, value: JSON.stringify(previous) }], continuation);
      await this.#jobs.persistSuccessorIfMatches(evaluation.job, previous.job, parts.guards, parts.writes);
      return previous;
    }
    const passed = evaluation.result.metrics.passed;
    const job = transitionTearFoundryJob(evaluation.job, passed ? "monitoring" : "rejected", at, decisionReason(passed));
    const draft = { format: "training-operations-v3-decision" as const, schemaVersion: 1 as const,
      trainingSourceJobHash, evaluationReceiptHash: evaluation.receiptHash, evaluationResultHash: evaluation.result.resultHash,
      sourceJobHash: evaluation.job.jobHash, job, disposition: passed ? "monitoring-ready" as const : "rejected" as const, decidedAt: at };
    const receipt = parseTrainingOperationsV3Decision({ ...draft, receiptHash: stableVerificationHash(draft) }, evaluation, admission, training, champion);
    const parts = trainingOperationsV3CommitParts(receipt, guards, [{ store: "analysis", key, value: JSON.stringify(receipt) }], continuation);
    await this.#jobs.persistSuccessorIfMatches(evaluation.job, job, parts.guards, parts.writes);
    await verifyTrainingOperationsV3Commit(backend, parts.guards, [...parts.writes,
      { store: "analysis", key: `foundry-job:v1:${job.id}`, value: JSON.stringify(job) }]);
    return receipt;
  }
}
