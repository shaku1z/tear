import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import { FACTORIZED_RETURN_ADAPTER, advanceFactorizedReturnContext, beginFactorizedReturnContext, parseFactorizedReturnContext,
  projectFactorizedReturnFeatures, requireFactorizedReturnFrontier, restoreFactorizedReturnPrefix,
  type FactorizedReturnContext, type FactorizedReturnTransition } from "./c34-causal-action-features";
import { factorizedQBatches, parseFactorizedQModel, prepareFactorizedQSelector, type FactorizedQModel, type FactorizedQSelection } from "./c34-factorized-action-q";
import { parseFactorizedOfflinePlan, parseFactorizedOfflineResult, type FactorizedOfflinePlan, type FactorizedOfflineResult } from "./c34-factorized-training";
import { parseFactorizedOnlinePlan, parseFactorizedOnlineCheckpoint, parseFactorizedOnlineEvaluation,
  type FactorizedOnlinePlan, type FactorizedOnlineCheckpoint, type FactorizedOnlineEvaluation } from "./c34-factorized-online";
import { createTearPolicyArtifact, parseTearPolicyArtifact, TearPolicyArtifactRegistry, type TearPolicyArtifactDraft, type TearPolicyArtifactV1, type TearPolicyRuntimeCompatibility } from "./policy-artifact-registry";

export const FACTORIZED_POLICY_FORMAT = "c34-c32-factorized-return-policy-v4";
export const FACTORIZED_POLICY_PROTOCOL = Object.freeze({ id: "tear-factorized-return-candidate.v4", adapter: FACTORIZED_RETURN_ADAPTER,
  cadence: "one-native-120hz-commit", decisions: "literal-empty-or-one", support: "motor-response-and-independent-threat-response",
  recovery: "explicit-model-run-frontier-checkpoint-or-native-replayed-prefix", fallback: "none", activation: "separate-owner-authority" });
export const FACTORIZED_POLICY_PROTOCOL_HASH = stableVerificationHash(FACTORIZED_POLICY_PROTOCOL);
export const FACTORIZED_POLICY_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({ runtime: "tear-policy-runtime.v1",
  observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: Object.freeze([FACTORIZED_POLICY_FORMAT]) });
export interface FactorizedPolicyPayload {
  readonly format: typeof FACTORIZED_POLICY_FORMAT; readonly schemaVersion: 4; readonly protocolHash: string;
  readonly lineage: Readonly<{ offlinePlanHash: string; trainingHash: string; onlinePlanHash: string; checkpointHash: string; evaluationHash: string }>;
  readonly model: FactorizedQModel;
}
export interface FactorizedRuntimeCheckpoint {
  readonly format: "tear-factorized-runtime-context.v4"; readonly schemaVersion: 4;
  readonly modelHash: string; readonly runId: string; readonly context: FactorizedReturnContext; readonly checkpointHash: string;
}
export interface FactorizedRuntimeDecision {
  readonly source: "artifact" | "refused"; readonly actions: readonly GameAction[];
  readonly reason?: "missing-causal-context" | "invalid-causal-frontier" | "no-legal-action" | "decision-budget-exceeded";
  readonly selection?: FactorizedQSelection; readonly decisionMilliseconds: number;
}
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{16}$/u.test(v);
function record(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v) && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => "value" in d); }
function exact(v: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(v).sort().join() === [...keys].sort().join(); }
function freeze<T>(value: T): T { const copy = structuredClone(value); const visit = (node: unknown): void => { if (node !== null && typeof node === "object") { Object.values(node).forEach(visit); Object.freeze(node); } }; visit(copy); return copy; }
function parsePayload(input: unknown): FactorizedPolicyPayload {
  if (!record(input) || !exact(input, ["format", "schemaVersion", "protocolHash", "lineage", "model"]) || input.format !== FACTORIZED_POLICY_FORMAT
    || input.schemaVersion !== 4 || input.protocolHash !== FACTORIZED_POLICY_PROTOCOL_HASH || !record(input.lineage)
    || !exact(input.lineage, ["offlinePlanHash", "trainingHash", "onlinePlanHash", "checkpointHash", "evaluationHash"])
    || !Object.values(input.lineage).every(hash)) throw new TypeError("invalid factorized candidate protocol/lineage");
  const body = input as unknown as FactorizedPolicyPayload;
  if (parseFactorizedQModel(body.model).planHash !== body.lineage.offlinePlanHash) throw new TypeError("factorized candidate model lineage mismatch");
  return freeze(body);
}
/** Produces an INACTIVE candidate; an evaluation pass is not an activation or a C33/C34 quality claim. */
export function createFactorizedPolicyCandidate(offlineInput: FactorizedOfflinePlan, trainingInput: FactorizedOfflineResult,
  onlineInput: FactorizedOnlinePlan, checkpointInput: FactorizedOnlineCheckpoint, evaluationInput: FactorizedOnlineEvaluation,
  draft: Omit<TearPolicyArtifactDraft, "model" | "compatibility" | "extensions">): TearPolicyArtifactV1 {
  const offline = parseFactorizedOfflinePlan(offlineInput), training = parseFactorizedOfflineResult(trainingInput), online = parseFactorizedOnlinePlan(onlineInput);
  const c = parseFactorizedOnlineCheckpoint(checkpointInput), e = parseFactorizedOnlineEvaluation(evaluationInput);
  if (training.status !== "complete" || training.planHash !== offline.planHash || training.receiptHash !== offline.receipt.receiptHash
    || online.offlinePlanHash !== offline.planHash || online.trainingHash !== training.trainingHash || c.planHash !== online.planHash || c.status !== "complete"
    || c.cursor !== online.cases.length || e.planHash !== online.planHash || e.trainingHash !== training.trainingHash || e.checkpointHash !== c.checkpointHash || !e.passed
    || stableVerificationHash(c.model.basis) !== stableVerificationHash(training.model.basis) || stableVerificationHash(c.model.config) !== stableVerificationHash(offline.config)
    || stableVerificationHash(c.model.heads.map(head => head.actions)) !== stableVerificationHash(factorizedQBatches(offline.actionVocabulary))
    || draft.encoder.id !== FACTORIZED_RETURN_ADAPTER.id || draft.encoder.schemaVersion !== 4 || draft.encoder.normalizationHash !== FACTORIZED_RETURN_ADAPTER.adapterHash) throw new TypeError("factorized candidate requires exact completed training/evaluation and encoder lineage");
  const body = parsePayload({ format: FACTORIZED_POLICY_FORMAT, schemaVersion: 4, protocolHash: FACTORIZED_POLICY_PROTOCOL_HASH,
    lineage: { offlinePlanHash: offline.planHash, trainingHash: training.trainingHash, onlinePlanHash: online.planHash, checkpointHash: c.checkpointHash, evaluationHash: e.evaluationHash }, model: c.model });
  return createTearPolicyArtifact({ ...draft, model: { format: FACTORIZED_POLICY_FORMAT, payload: JSON.stringify(body) }, compatibility: FACTORIZED_POLICY_COMPATIBILITY,
    extensions: { candidateOnly: true, factorizedProtocolHash: FACTORIZED_POLICY_PROTOCOL_HASH } });
}
export function parseFactorizedPolicyCandidate(input: TearPolicyArtifactV1): FactorizedPolicyPayload {
  const artifact = parseTearPolicyArtifact(input);
  if (new TextEncoder().encode(artifact.model.payload).byteLength > 1_048_576) throw new RangeError("factorized candidate exceeds byte budget");
  const body = parsePayload(JSON.parse(artifact.model.payload) as unknown);
  if (artifact.model.format !== body.format || artifact.compatibility.modelFormats.length !== 1 || artifact.compatibility.modelFormats[0] !== body.format
    || artifact.extensions.candidateOnly !== true || artifact.extensions.factorizedProtocolHash !== FACTORIZED_POLICY_PROTOCOL_HASH
    || artifact.encoder.id !== FACTORIZED_RETURN_ADAPTER.id || artifact.encoder.schemaVersion !== 4 || artifact.encoder.normalizationHash !== FACTORIZED_RETURN_ADAPTER.adapterHash) throw new TypeError("factorized artifact compatibility mismatch");
  return body;
}
/** Deliberately has no activate() method. */
export class FactorizedPolicyCandidateRegistry {
  readonly #registry: TearPolicyArtifactRegistry;
  constructor(backend: GhostVaultBackend) { this.#registry = new TearPolicyArtifactRegistry(backend, FACTORIZED_POLICY_COMPATIBILITY); }
  async register(candidate: TearPolicyArtifactV1): Promise<TearPolicyArtifactV1> { parseFactorizedPolicyCandidate(candidate); return this.#registry.register(candidate); }
  async get(id: string): Promise<TearPolicyArtifactV1 | undefined> { const candidate = await this.#registry.get(id); if (!candidate) return undefined; try { parseFactorizedPolicyCandidate(candidate); return candidate; } catch { return undefined; } }
}
export class FactorizedReturnPolicyRuntime {
  readonly #model: FactorizedQModel; readonly #select: ReturnType<typeof prepareFactorizedQSelector>; readonly #now: () => number;
  #context: FactorizedReturnContext | undefined; #runId: string | undefined;
  constructor(model: FactorizedQModel, options: Readonly<{ now?: () => number }> = {}) { this.#model = parseFactorizedQModel(model); this.#select = prepareFactorizedQSelector(this.#model); this.#now = options.now ?? (() => performance.now()); }
  clearContext(): void { this.#context = undefined; this.#runId = undefined; }
  begin(state: CanonicalGameplayState, runId: string): void {
    if (typeof runId !== "string" || !runId.trim() || runId.length > 256 || this.#context !== undefined) throw new TypeError("factorized runtime requires one explicit genuine origin");
    this.#context = beginFactorizedReturnContext(state); this.#runId = runId;
  }
  observeCommitted(transition: FactorizedReturnTransition, runId: string): void {
    if (!this.#context || runId !== this.#runId) throw new TypeError("factorized runtime missing matching run context");
    this.#context = advanceFactorizedReturnContext(this.#context, transition);
  }
  captureContext(): FactorizedRuntimeCheckpoint {
    if (!this.#context || !this.#runId) throw new TypeError("factorized context is unavailable");
    const draft = { format: "tear-factorized-runtime-context.v4" as const, schemaVersion: 4 as const, modelHash: this.#model.modelHash, runId: this.#runId, context: this.#context };
    return freeze({ ...draft, checkpointHash: stableVerificationHash(draft) });
  }
  /** Expected hash/run come from the accepted enclosing checkpoint authority, NOT the untrusted restored body. */
  restoreContext(state: CanonicalGameplayState, input: unknown, authority: Readonly<{ expectedCheckpointHash: string; runId: string }>): void {
    if (!record(input) || !exact(input, ["format", "schemaVersion", "modelHash", "runId", "context", "checkpointHash"])
      || input.format !== "tear-factorized-runtime-context.v4" || input.schemaVersion !== 4 || input.modelHash !== this.#model.modelHash
      || !hash(authority.expectedCheckpointHash) || input.checkpointHash !== authority.expectedCheckpointHash || typeof input.runId !== "string" || input.runId !== authority.runId || !input.runId.trim()) throw new TypeError("factorized context authority mismatch");
    const { checkpointHash, ...draft } = input;
    if (stableVerificationHash(draft) !== checkpointHash) throw new TypeError("factorized context integrity mismatch");
    const context = parseFactorizedReturnContext(input.context); requireFactorizedReturnFrontier(context, state);
    this.#context = context; this.#runId = input.runId;
  }
  restorePrefix(state: CanonicalGameplayState, runId: string, anchor: CanonicalGameplayState, transitions: readonly FactorizedReturnTransition[], expectedPrefixHash: string): void {
    if (!runId.trim() || runId.length > 256) throw new TypeError("factorized prefix requires actual run binding");
    const context = restoreFactorizedReturnPrefix(anchor, transitions, expectedPrefixHash); requireFactorizedReturnFrontier(context, state);
    this.#context = context; this.#runId = runId;
  }
  decide(state: CanonicalGameplayState, available: readonly GameAction["type"][]): FactorizedRuntimeDecision {
    const started = this.#now(), refuse = (reason: NonNullable<FactorizedRuntimeDecision["reason"]>): FactorizedRuntimeDecision => Object.freeze({ source: "refused", actions: Object.freeze([]), reason, decisionMilliseconds: Math.max(0, this.#now() - started) });
    if (!this.#context) return refuse("missing-causal-context");
    let selection: FactorizedQSelection | undefined;
    try { selection = this.#select(projectFactorizedReturnFeatures(state, this.#context), available); } catch { return refuse("invalid-causal-frontier"); }
    const elapsed = this.#now() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > this.#model.config.maxDecisionMilliseconds) return refuse("decision-budget-exceeded");
    if (!selection) return refuse("no-legal-action");
    return Object.freeze({ source: "artifact", actions: selection.actions, selection, decisionMilliseconds: elapsed });
  }
}
