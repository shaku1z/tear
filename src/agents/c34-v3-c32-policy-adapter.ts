import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import {
  TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1,
  TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1,
  canonicalizeTearC34C32ActionVocabulary,
  createTearC34C32RuntimeModel,
  parseTearC34C32RuntimeModel,
  prepareTearReturnRuntimeSelector,
  selectTearC34C32RuntimeAction,
  tearC34C32VocabularyHash,
  type TearC34C32RuntimeModelV1,
  type TearReturnRuntimeSelector,
} from "./c34-c32-runtime-compatibility";
import { createTearPolicyArtifact, parseTearPolicyArtifact, TearPolicyArtifactRegistry, type TearPolicyArtifactDraft, type TearPolicyArtifactV1, type TearPolicyRuntimeCompatibility } from "./policy-artifact-registry";
import { parseTearOfflineRlV3Plan, parseTearOfflineRlV3TrainingResult, type TearOfflineRlV3PlanV1, type TearOfflineRlV3TrainingResultV1 } from "./offline-rl-v3-training";
import { parseTearOnlineRlV3Checkpoint, parseTearOnlineRlV3EvaluationResult, parseTearOnlineRlV3Plan, type TearOnlineRlV3CheckpointV1, type TearOnlineRlV3EvaluationResultV1, type TearOnlineRlV3PlanV1 } from "./online-rl-v3-training";
import { readTearReturnVariant, tearReturnUsesSupportedTies, TEAR_RETURN_PLAYING_MASK } from "./c34-source-feature-state";
import { DEFAULT_TEAR_POLICY_RUNTIME_LIMITS } from "./policy-runtime";

const HASH = /^[a-f0-9]{16}$/u;
const MAX_CANDIDATE_PAYLOAD_BYTES = 1_048_576;
export const TEAR_C34_V3_C32_POLICY_FORMAT_V1 = "c34-v3-c32-tabular-q-policy-v1";
export const TEAR_C34_RETURN_POLICY_FORMAT_V2 = "c34-v3-c32-return-q-policy-v2";
export const TEAR_C34_V3_C32_POLICY_PROTOCOL_V1 = Object.freeze({ id: "tear-c34-v3-c32-candidate.v1", schemaVersion: 1, sourceAdapter: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, sourceAdapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1, selection: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.selection, evaluation: "completed-passed-online-v3-source-evaluation.v1" });
export const TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 = stableVerificationHash(TEAR_C34_V3_C32_POLICY_PROTOCOL_V1);
export const TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({ runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: Object.freeze([TEAR_C34_V3_C32_POLICY_FORMAT_V1]) });
const returnCompatibility: TearPolicyRuntimeCompatibility = Object.freeze({ ...TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY, modelFormats: Object.freeze([TEAR_C34_RETURN_POLICY_FORMAT_V2]) });
export const TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({ ...TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY,
  modelFormats: Object.freeze([TEAR_C34_V3_C32_POLICY_FORMAT_V1, TEAR_C34_RETURN_POLICY_FORMAT_V2]) });
function policyIdentity(adapter: TearC34C32RuntimeModelV1["sourceStateAdapter"]) {
  const variant = readTearReturnVariant(adapter);
  if (variant === undefined) {
    if (adapter.id !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id || adapter.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1) throw new TypeError("unknown policy adapter");
    return { format: TEAR_C34_V3_C32_POLICY_FORMAT_V1, schemaVersion: 1 as const, protocolHash: TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 };
  }
  return { format: TEAR_C34_RETURN_POLICY_FORMAT_V2, schemaVersion: 2 as const,
    protocolHash: stableVerificationHash({ id: tearReturnUsesSupportedTies(variant) ? "tear-c34-v3-return-candidate.v3" : "tear-c34-v3-return-candidate.v2",
      adapter, decisions: "empty-or-one", runtimeBudget: DEFAULT_TEAR_POLICY_RUNTIME_LIMITS.maxDecisionMilliseconds }) };
}

export interface TearC34V3C32PolicyPayloadV1 { readonly format: string; readonly schemaVersion: 1 | 2; readonly protocolHash: string; readonly sourceStateAdapter: Readonly<{ id: string; adapterHash: string }>; readonly lineage: Readonly<{ offlinePlanHash: string; offlineTrainingHash: string; onlinePlanHash: string; onlineCheckpointHash: string; onlineEvaluationHash: string; actionVocabularyHash: string }>; readonly actionVocabulary: readonly GameAction[]; readonly model: TearC34C32RuntimeModelV1; }
export interface TearC34V3C32CandidateReceiptV1 { readonly format: "tear-c34-v3-c32-candidate-receipt"; readonly schemaVersion: 1 | 2; readonly artifactId: string; readonly artifactHash: string; readonly payloadHash: string; readonly protocolHash: string; readonly receiptHash: string; }
export interface TearC32CanonicalSourceObservationV1 { readonly format: "tear-c32-canonical-source-observation"; readonly schemaVersion: 1; readonly state: CanonicalGameplayState; readonly availableActions: readonly GameAction["type"][]; readonly stateHash: string; }
export interface TearC34V3C32Decision { readonly actions: readonly GameAction[]; readonly source: "artifact" | "diagnostic-model" | "model-default" | "scripted-fallback"; readonly reason?: "no-candidate" | "no-legal-action" | "decision-budget-exceeded";
  readonly decisionMilliseconds?: number; readonly support?: Readonly<{ entryPresent: boolean; value: number; stateKey: string; semanticActionHash: string }> }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function payloadHash(value: TearC34V3C32PolicyPayloadV1): string { return stableVerificationHash(value); }

function payload(value: unknown): TearC34V3C32PolicyPayloadV1 {
  if (!record(value) || !record(value.sourceStateAdapter) || typeof value.sourceStateAdapter.id !== "string" || typeof value.sourceStateAdapter.adapterHash !== "string" || !record(value.lineage) || !hash(value.lineage.offlinePlanHash) || !hash(value.lineage.offlineTrainingHash) || !hash(value.lineage.onlinePlanHash) || !hash(value.lineage.onlineCheckpointHash) || !hash(value.lineage.onlineEvaluationHash) || !hash(value.lineage.actionVocabularyHash)) throw new TypeError("invalid C34 V3 C32 policy payload");
  const adapter = value.sourceStateAdapter as { id: string; adapterHash: string }, identity = policyIdentity(adapter), variant = readTearReturnVariant(adapter);
  if (value.format !== identity.format || value.schemaVersion !== identity.schemaVersion || value.protocolHash !== identity.protocolHash) throw new TypeError("mixed C34 policy protocol/adapter");
  if (!Array.isArray(value.actionVocabulary)) throw new TypeError("invalid C34 V3 C32 action vocabulary");
  const actionVocabulary = canonicalizeTearC34C32ActionVocabulary(value.actionVocabulary);
  if (actionVocabulary.length < 1 || actionVocabulary.length > (variant === undefined ? 16 : 15) || tearC34C32VocabularyHash(actionVocabulary, variant) !== value.lineage.actionVocabularyHash) throw new TypeError("invalid C34 V3 C32 action vocabulary");
  if (variant !== undefined && actionVocabulary.some(action => !TEAR_RETURN_PLAYING_MASK.includes(action.type as never))) throw new TypeError("return policy vocabulary violates its mask contract");
  const parsedModel = parseTearC34C32RuntimeModel(value.model);
  if (stableVerificationHash(parsedModel.sourceStateAdapter) !== stableVerificationHash(adapter)) throw new TypeError("policy/model adapter mismatch");
  const lineage = value.lineage as unknown as TearC34V3C32PolicyPayloadV1["lineage"];
  return Object.freeze({ ...identity, sourceStateAdapter: Object.freeze({ ...adapter }), lineage: freeze(lineage), actionVocabulary, model: parsedModel });
}

/** Only a completed, passed V3 source evaluation can form an inactive C32 candidate. */
export function createTearC34V3C32PolicyCandidate(offlineInput: TearOfflineRlV3PlanV1, trainingInput: TearOfflineRlV3TrainingResultV1, onlineInput: TearOnlineRlV3PlanV1, checkpointInput: TearOnlineRlV3CheckpointV1, evaluationInput: TearOnlineRlV3EvaluationResultV1, artifact: Omit<TearPolicyArtifactDraft, "model" | "compatibility" | "extensions">): Readonly<{ artifact: TearPolicyArtifactV1; receipt: TearC34V3C32CandidateReceiptV1 }> {
  const offline = parseTearOfflineRlV3Plan(offlineInput), training = parseTearOfflineRlV3TrainingResult(trainingInput), online = parseTearOnlineRlV3Plan(onlineInput), checkpoint = parseTearOnlineRlV3Checkpoint(checkpointInput), evaluation = parseTearOnlineRlV3EvaluationResult(evaluationInput);
  if (training.disposition !== "complete" || training.model === undefined || training.plan.planHash !== offline.planHash || training.plan.adapterHash !== offline.sourceStateAdapter.adapterHash || training.plan.actionVocabularyHash !== offline.actionVocabularyHash || online.offline.v3PlanHash !== offline.planHash || online.offline.trainingHash !== training.trainingHash || online.offline.actionVocabularyHash !== offline.actionVocabularyHash || checkpoint.status !== "complete" || checkpoint.planHash !== online.planHash || !evaluation.metrics.passed || evaluation.planHash !== online.planHash || evaluation.baselineTrainingHash !== training.trainingHash || evaluation.challengerCheckpointHash !== checkpoint.checkpointHash) throw new RangeError("C34 V3 candidate requires one completed passed exact evaluation lineage");
  const variant = readTearReturnVariant(offline.sourceStateAdapter), identity = policyIdentity(offline.sourceStateAdapter);
  if (variant !== undefined && (artifact.encoder.id !== offline.sourceStateAdapter.id || artifact.encoder.schemaVersion !== 2
    || artifact.encoder.normalizationHash !== offline.sourceStateAdapter.adapterHash || evaluation.traces.some(trace => trace.returnEvidence === undefined))) {
    throw new TypeError("return candidate requires its exact encoder and return evaluation evidence");
  }
  const body = payload({ ...identity, sourceStateAdapter: offline.sourceStateAdapter,
    lineage: { offlinePlanHash: offline.planHash, offlineTrainingHash: training.trainingHash, onlinePlanHash: online.planHash,
      onlineCheckpointHash: checkpoint.checkpointHash, onlineEvaluationHash: evaluation.resultHash, actionVocabularyHash: offline.actionVocabularyHash },
    actionVocabulary: offline.actionVocabulary, model: createTearC34C32RuntimeModel(checkpoint.qValues, variant) });
  const artifactValue = createTearPolicyArtifact({ ...artifact, model: { format: identity.format, payload: JSON.stringify(body) },
    compatibility: variant === undefined ? TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY : returnCompatibility,
    extensions: { c34V3C32ProtocolHash: identity.protocolHash, candidateOnly: true } });
  const receiptDraft = { format: "tear-c34-v3-c32-candidate-receipt" as const, schemaVersion: identity.schemaVersion,
    artifactId: artifactValue.id, artifactHash: artifactValue.artifactHash, payloadHash: payloadHash(body), protocolHash: identity.protocolHash };
  return Object.freeze({ artifact: artifactValue, receipt: Object.freeze({ ...receiptDraft, receiptHash: stableVerificationHash(receiptDraft) }) });
}

export function parseTearC34V3C32PolicyCandidate(input: TearPolicyArtifactV1): TearC34V3C32PolicyPayloadV1 {
  const artifact = parseTearPolicyArtifact(input);
  if (new TextEncoder().encode(artifact.model.payload).byteLength > MAX_CANDIDATE_PAYLOAD_BYTES) throw new RangeError("C34 V3 C32 candidate payload exceeds its bound");
  let parsed: unknown; try { parsed = JSON.parse(artifact.model.payload); } catch { throw new TypeError("C34 V3 C32 candidate payload is not JSON"); }
  const body = payload(parsed);
  if (body.schemaVersion === 2 && (artifact.encoder.id !== body.sourceStateAdapter.id || artifact.encoder.schemaVersion !== 2
    || artifact.encoder.normalizationHash !== body.sourceStateAdapter.adapterHash)) throw new TypeError("return artifact encoder identity mismatch");
  if (artifact.model.format !== body.format || artifact.compatibility.modelFormats.length !== 1
    || artifact.compatibility.modelFormats[0] !== body.format || artifact.extensions.c34V3C32ProtocolHash !== body.protocolHash
    || artifact.extensions.candidateOnly !== true) throw new RangeError("policy artifact is not an exact C34 candidate");
  return body;
}

/** Candidate-only registry boundary: it never reads or writes C32's active pointer. */
export class TearC34V3C32CandidateRegistry {
  readonly #backend: GhostVaultBackend;
  readonly #registry: TearPolicyArtifactRegistry;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; this.#registry = new TearPolicyArtifactRegistry(backend, TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY); }
  async register(candidate: TearPolicyArtifactV1): Promise<TearPolicyArtifactV1> { parseTearC34V3C32PolicyCandidate(candidate); return this.#registry.register(candidate); }
  async get(id: string): Promise<TearPolicyArtifactV1 | undefined> {
    const candidate = await this.#registry.get(id); if (candidate === undefined) return undefined;
    try { parseTearC34V3C32PolicyCandidate(candidate); return candidate; }
    catch (error) { await this.#backend.put("quarantine", `policy-artifact:v1:${id}`, JSON.stringify({ format: "tear-c34-v3-c32-candidate-quarantine", schemaVersion: 1, id, reason: error instanceof Error ? error.message : String(error) })); return undefined; }
  }
}

/** The C32 adapter receives the exact source state, never a reconstructed structured observation. */
export function createTearC32CanonicalSourceObservation(state: CanonicalGameplayState, availableActions: readonly GameAction["type"][]): TearC32CanonicalSourceObservationV1 {
  const unique = [...new Set(availableActions)].sort();
  if (unique.length > 32) throw new RangeError("C32 canonical source observation has too many available actions");
  return Object.freeze({ format: "tear-c32-canonical-source-observation", schemaVersion: 1, state: freeze(state), availableActions: Object.freeze(unique), stateHash: stableVerificationHash(state) });
}

/** Incompatible candidate bytes throw at construction; fallback is reserved for no candidate or no legal candidate action. */
export class TearC34V3C32PolicyRuntime {
  readonly #candidate: TearC34V3C32PolicyPayloadV1 | undefined;
  readonly #selector: TearReturnRuntimeSelector | undefined;
  readonly #fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[];
  readonly #now: () => number;
  constructor(candidate: TearPolicyArtifactV1 | undefined, fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[], options: Readonly<{ now?: () => number }> = {}) {
    this.#candidate = candidate === undefined ? undefined : parseTearC34V3C32PolicyCandidate(candidate);
    this.#selector = this.#candidate !== undefined && readTearReturnVariant(this.#candidate.sourceStateAdapter) !== undefined
      ? prepareTearReturnRuntimeSelector(this.#candidate.model, this.#candidate.actionVocabulary) : undefined;
    this.#fallback = fallback; this.#now = options.now ?? (() => performance.now());
  }
  decide(source: TearC32CanonicalSourceObservationV1): TearC34V3C32Decision {
    if (this.#selector !== undefined) {
      return boundedReturnDecision(this.#selector, source, this.#fallback, this.#now, "artifact");
    }
    if (source.stateHash !== stableVerificationHash(source.state)) throw new TypeError("invalid C32 canonical source observation");
    const selected = this.#candidate === undefined ? undefined : selectTearC34C32RuntimeAction(this.#candidate.model, source.state, this.#candidate.actionVocabulary, source.availableActions);
    if (selected !== undefined) return Object.freeze({ actions: selected.actions, source: "artifact" });
    return Object.freeze({ actions: Object.freeze([...this.#fallback(source)]), source: "scripted-fallback", reason: this.#candidate === undefined ? "no-candidate" : "no-legal-action" });
  }
}

function boundedReturnDecision(select: TearReturnRuntimeSelector, source: TearC32CanonicalSourceObservationV1,
  fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[], now: () => number, modelSource: "artifact" | "diagnostic-model"): TearC34V3C32Decision {
  const start = now();
  if (source.stateHash !== stableVerificationHash(source.state)) throw new TypeError("invalid C32 canonical source observation");
  const selected = select(source.state, source.availableActions), elapsed = now() - start;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("return runtime clock regressed");
  if (selected === undefined || elapsed > DEFAULT_TEAR_POLICY_RUNTIME_LIMITS.maxDecisionMilliseconds) return Object.freeze({
    actions: Object.freeze([...fallback(source)]), source: "scripted-fallback", decisionMilliseconds: elapsed,
    reason: selected === undefined ? "no-legal-action" : "decision-budget-exceeded" });
  if (selected.entryPresent === undefined || selected.value === undefined || selected.stateKey === undefined) throw new Error("return selection omitted support evidence");
  return Object.freeze({ actions: selected.actions, source: selected.entryPresent ? modelSource : "model-default", decisionMilliseconds: elapsed,
    support: Object.freeze({ entryPresent: selected.entryPresent, value: selected.value, stateKey: selected.stateKey, semanticActionHash: selected.semanticActionHash }) });
}

/** Opt-in diagnostic owner for unadmitted offline/default return models; it confers no candidate authority. */
export class TearC34ReturnModelRuntime {
  readonly #selector: TearReturnRuntimeSelector;
  readonly #fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[];
  readonly #now: () => number;
  constructor(model: TearC34C32RuntimeModelV1, vocabulary: readonly GameAction[], fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[], options: Readonly<{ now?: () => number }> = {}) {
    const parsed = parseTearC34C32RuntimeModel(model);
    if (readTearReturnVariant(parsed.sourceStateAdapter) === undefined || parsed.entries.length > DEFAULT_TEAR_POLICY_RUNTIME_LIMITS.maxTableEntries) throw new TypeError("return diagnostic model is incompatible or oversized");
    if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > DEFAULT_TEAR_POLICY_RUNTIME_LIMITS.maxPayloadBytes) throw new RangeError("return model payload exceeds its bound");
    const normalized = canonicalizeTearC34C32ActionVocabulary(vocabulary); this.#fallback = fallback; this.#now = options.now ?? (() => performance.now());
    if (normalized.length < 1 || normalized.length > 15 || normalized.some(action => !TEAR_RETURN_PLAYING_MASK.includes(action.type as never))) throw new TypeError("return diagnostic vocabulary violates its mask contract");
    this.#selector = prepareTearReturnRuntimeSelector(parsed, normalized);
  }
  decide(source: TearC32CanonicalSourceObservationV1): TearC34V3C32Decision {
    return boundedReturnDecision(this.#selector, source, this.#fallback, this.#now, "diagnostic-model");
  }
}
