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
  selectTearC34C32RuntimeAction,
  type TearC34C32RuntimeModelV1,
} from "./c34-c32-runtime-compatibility";
import { createTearPolicyArtifact, parseTearPolicyArtifact, TearPolicyArtifactRegistry, type TearPolicyArtifactDraft, type TearPolicyArtifactV1, type TearPolicyRuntimeCompatibility } from "./policy-artifact-registry";
import { parseTearOfflineRlV3Plan, parseTearOfflineRlV3TrainingResult, type TearOfflineRlV3PlanV1, type TearOfflineRlV3TrainingResultV1 } from "./offline-rl-v3-training";
import { parseTearOnlineRlV3Checkpoint, parseTearOnlineRlV3EvaluationResult, parseTearOnlineRlV3Plan, type TearOnlineRlV3CheckpointV1, type TearOnlineRlV3EvaluationResultV1, type TearOnlineRlV3PlanV1 } from "./online-rl-v3-training";

const HASH = /^[a-f0-9]{16}$/u;
const MAX_CANDIDATE_PAYLOAD_BYTES = 1_048_576;
export const TEAR_C34_V3_C32_POLICY_FORMAT_V1 = "c34-v3-c32-tabular-q-policy-v1";
export const TEAR_C34_V3_C32_POLICY_PROTOCOL_V1 = Object.freeze({ id: "tear-c34-v3-c32-candidate.v1", schemaVersion: 1, sourceAdapter: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, sourceAdapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1, selection: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.selection, evaluation: "completed-passed-online-v3-source-evaluation.v1" });
export const TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 = stableVerificationHash(TEAR_C34_V3_C32_POLICY_PROTOCOL_V1);
export const TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({ runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: Object.freeze([TEAR_C34_V3_C32_POLICY_FORMAT_V1]) });

export interface TearC34V3C32PolicyPayloadV1 { readonly format: typeof TEAR_C34_V3_C32_POLICY_FORMAT_V1; readonly schemaVersion: 1; readonly protocolHash: string; readonly sourceStateAdapter: Readonly<{ id: string; adapterHash: string }>; readonly lineage: Readonly<{ offlinePlanHash: string; offlineTrainingHash: string; onlinePlanHash: string; onlineCheckpointHash: string; onlineEvaluationHash: string; actionVocabularyHash: string }>; readonly actionVocabulary: readonly GameAction[]; readonly model: TearC34C32RuntimeModelV1; }
export interface TearC34V3C32CandidateReceiptV1 { readonly format: "tear-c34-v3-c32-candidate-receipt"; readonly schemaVersion: 1; readonly artifactId: string; readonly artifactHash: string; readonly payloadHash: string; readonly protocolHash: string; readonly receiptHash: string; }
export interface TearC32CanonicalSourceObservationV1 { readonly format: "tear-c32-canonical-source-observation"; readonly schemaVersion: 1; readonly state: CanonicalGameplayState; readonly availableActions: readonly GameAction["type"][]; readonly stateHash: string; }
export interface TearC34V3C32Decision { readonly actions: readonly GameAction[]; readonly source: "artifact" | "scripted-fallback"; readonly reason?: "no-candidate" | "no-legal-action"; }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function payloadHash(value: TearC34V3C32PolicyPayloadV1): string { return stableVerificationHash(value); }

function payload(value: unknown): TearC34V3C32PolicyPayloadV1 {
  if (!record(value) || value.format !== TEAR_C34_V3_C32_POLICY_FORMAT_V1 || value.schemaVersion !== 1 || value.protocolHash !== TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 || !record(value.sourceStateAdapter) || value.sourceStateAdapter.id !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id || value.sourceStateAdapter.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 || !record(value.lineage) || !hash(value.lineage.offlinePlanHash) || !hash(value.lineage.offlineTrainingHash) || !hash(value.lineage.onlinePlanHash) || !hash(value.lineage.onlineCheckpointHash) || !hash(value.lineage.onlineEvaluationHash) || !hash(value.lineage.actionVocabularyHash)) throw new TypeError("invalid C34 V3 C32 policy payload");
  if (!Array.isArray(value.actionVocabulary)) throw new TypeError("invalid C34 V3 C32 action vocabulary");
  const actionVocabulary = canonicalizeTearC34C32ActionVocabulary(value.actionVocabulary);
  if (actionVocabulary.length < 1 || stableVerificationHash(actionVocabulary) !== value.lineage.actionVocabularyHash) throw new TypeError("invalid C34 V3 C32 action vocabulary");
  const parsedModel = parseTearC34C32RuntimeModel(value.model);
  const lineage = value.lineage as unknown as TearC34V3C32PolicyPayloadV1["lineage"];
  return Object.freeze({ format: TEAR_C34_V3_C32_POLICY_FORMAT_V1, schemaVersion: 1, protocolHash: TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1, sourceStateAdapter: Object.freeze({ id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 }), lineage: freeze(lineage), actionVocabulary, model: parsedModel });
}

/** Only a completed, passed V3 source evaluation can form an inactive C32 candidate. */
export function createTearC34V3C32PolicyCandidate(offlineInput: TearOfflineRlV3PlanV1, trainingInput: TearOfflineRlV3TrainingResultV1, onlineInput: TearOnlineRlV3PlanV1, checkpointInput: TearOnlineRlV3CheckpointV1, evaluationInput: TearOnlineRlV3EvaluationResultV1, artifact: Omit<TearPolicyArtifactDraft, "model" | "compatibility" | "extensions">): Readonly<{ artifact: TearPolicyArtifactV1; receipt: TearC34V3C32CandidateReceiptV1 }> {
  const offline = parseTearOfflineRlV3Plan(offlineInput), training = parseTearOfflineRlV3TrainingResult(trainingInput), online = parseTearOnlineRlV3Plan(onlineInput), checkpoint = parseTearOnlineRlV3Checkpoint(checkpointInput), evaluation = parseTearOnlineRlV3EvaluationResult(evaluationInput);
  if (training.disposition !== "complete" || training.model === undefined || training.plan.planHash !== offline.planHash || training.plan.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 || training.plan.actionVocabularyHash !== offline.actionVocabularyHash || online.offline.v3PlanHash !== offline.planHash || online.offline.trainingHash !== training.trainingHash || online.offline.actionVocabularyHash !== offline.actionVocabularyHash || checkpoint.status !== "complete" || checkpoint.planHash !== online.planHash || !evaluation.metrics.passed || evaluation.planHash !== online.planHash || evaluation.baselineTrainingHash !== training.trainingHash || evaluation.challengerCheckpointHash !== checkpoint.checkpointHash) throw new RangeError("C34 V3 candidate requires one completed passed exact evaluation lineage");
  const body = payload({ format: TEAR_C34_V3_C32_POLICY_FORMAT_V1, schemaVersion: 1, protocolHash: TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1, sourceStateAdapter: { id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 }, lineage: { offlinePlanHash: offline.planHash, offlineTrainingHash: training.trainingHash, onlinePlanHash: online.planHash, onlineCheckpointHash: checkpoint.checkpointHash, onlineEvaluationHash: evaluation.resultHash, actionVocabularyHash: offline.actionVocabularyHash }, actionVocabulary: offline.actionVocabulary, model: createTearC34C32RuntimeModel(checkpoint.qValues) });
  const artifactValue = createTearPolicyArtifact({ ...artifact, model: { format: TEAR_C34_V3_C32_POLICY_FORMAT_V1, payload: JSON.stringify(body) }, compatibility: TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY, extensions: { c34V3C32ProtocolHash: TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1, candidateOnly: true } });
  const receiptDraft = { format: "tear-c34-v3-c32-candidate-receipt" as const, schemaVersion: 1 as const, artifactId: artifactValue.id, artifactHash: artifactValue.artifactHash, payloadHash: payloadHash(body), protocolHash: TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 };
  return Object.freeze({ artifact: artifactValue, receipt: Object.freeze({ ...receiptDraft, receiptHash: stableVerificationHash(receiptDraft) }) });
}

export function parseTearC34V3C32PolicyCandidate(input: TearPolicyArtifactV1): TearC34V3C32PolicyPayloadV1 {
  const artifact = parseTearPolicyArtifact(input);
  if (artifact.model.format !== TEAR_C34_V3_C32_POLICY_FORMAT_V1 || artifact.compatibility.modelFormats.length !== 1 || artifact.compatibility.modelFormats[0] !== TEAR_C34_V3_C32_POLICY_FORMAT_V1 || artifact.extensions.c34V3C32ProtocolHash !== TEAR_C34_V3_C32_POLICY_PROTOCOL_HASH_V1 || artifact.extensions.candidateOnly !== true) throw new RangeError("policy artifact is not a C34 V3 C32 candidate");
  if (new TextEncoder().encode(artifact.model.payload).byteLength > MAX_CANDIDATE_PAYLOAD_BYTES) throw new RangeError("C34 V3 C32 candidate payload exceeds its bound");
  let parsed: unknown; try { parsed = JSON.parse(artifact.model.payload); } catch { throw new TypeError("C34 V3 C32 candidate payload is not JSON"); }
  return payload(parsed);
}

/** Candidate-only registry boundary: it never reads or writes C32's active pointer. */
export class TearC34V3C32CandidateRegistry {
  readonly #backend: GhostVaultBackend;
  readonly #registry: TearPolicyArtifactRegistry;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; this.#registry = new TearPolicyArtifactRegistry(backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY); }
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
  readonly #fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[];
  constructor(candidate: TearPolicyArtifactV1 | undefined, fallback: (source: TearC32CanonicalSourceObservationV1) => readonly GameAction[]) { this.#candidate = candidate === undefined ? undefined : parseTearC34V3C32PolicyCandidate(candidate); this.#fallback = fallback; }
  decide(source: TearC32CanonicalSourceObservationV1): TearC34V3C32Decision {
    if (source.stateHash !== stableVerificationHash(source.state)) throw new TypeError("invalid C32 canonical source observation");
    const selected = this.#candidate === undefined ? undefined : selectTearC34C32RuntimeAction(this.#candidate.model, source.state, this.#candidate.actionVocabulary, source.availableActions);
    if (selected !== undefined) return Object.freeze({ actions: selected.actions, source: "artifact" });
    return Object.freeze({ actions: Object.freeze([...this.#fallback(source)]), source: "scripted-fallback", reason: this.#candidate === undefined ? "no-candidate" : "no-legal-action" });
  }
}
