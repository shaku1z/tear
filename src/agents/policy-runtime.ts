import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearAgentDecision, TearAgentObservation, TearAgentProfileId } from "./contracts";
import type { TearPolicyArtifactRegistry, TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, TEAR_POLICY_FEATURE_WIDTH_V1, projectStructuredPolicyFeatures } from "./policy-feature-vector";
import { TEAR_POLICY_CONDITION_SCHEMA_HASH_V1, TEAR_POLICY_CONDITION_SCHEMA_HASH_V2, TEAR_POLICY_CONDITION_WIDTH_V1, TEAR_POLICY_CONDITION_WIDTH_V2, createTearPolicyConditioningV2, projectStructuredPolicyCondition, projectStructuredPolicyConditionV2, type TearPolicyConditioningV2 } from "./policy-condition-vector";
import { TearAgentOrchestrator } from "./scripted-policy";

interface TablePolicyModel {
  readonly format: "tear-table-policy-model";
  readonly schemaVersion: 1;
  readonly actionsByObservationHash: Readonly<Record<string, readonly unknown[]>>;
}

interface LinearPolicyModel {
  readonly format: "tear-linear-policy-model";
  readonly schemaVersion: 1;
  readonly featureSchemaHash: string;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly classes: readonly Readonly<{ actions: readonly unknown[] }> [];
  readonly weights: readonly (readonly number[])[];
  readonly biases: readonly number[];
}

interface TemporalWindowLinearPolicyModel extends Omit<LinearPolicyModel, "format"> {
  readonly format: "tear-temporal-window-linear-policy-model";
  readonly window: number;
  readonly conditionSchemaHash: string;
  readonly conditionWidth: number;
}

type RuntimePolicyModel = TablePolicyModel | LinearPolicyModel | TemporalWindowLinearPolicyModel;

export interface TearPolicyRuntimeLimits {
  /** Opaque table payloads are data-only and bounded before JSON parsing. */
  readonly maxPayloadBytes: number;
  /** Bound table lookup/validation work; this is not an executable model graph. */
  readonly maxTableEntries: number;
  /** Bound every returned semantic batch before it reaches input routing. */
  readonly maxActionsPerDecision: number;
  /** Post-decision containment for the bounded table backend; future backends need preemptive cancellation too. */
  readonly maxDecisionMilliseconds: number;
}

export interface TearPolicyRuntimeOptions {
  readonly limits?: Partial<TearPolicyRuntimeLimits>;
  /** Injectable clock keeps timeout containment deterministic in contract tests. */
  readonly now?: () => number;
  /** Runtime-owned context selected by the host; omitted values are never inferred from Academy metadata. */
  readonly conditioning?: TearPolicyConditioningV2;
}

export const DEFAULT_TEAR_POLICY_RUNTIME_LIMITS: TearPolicyRuntimeLimits = Object.freeze({
  maxPayloadBytes: 1_048_576,
  maxTableEntries: 16_384,
  maxActionsPerDecision: 16,
  maxDecisionMilliseconds: 8,
});

export interface TearPolicyDecisionReceipt {
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly observationHash: string;
  readonly source: "artifact" | "scripted-fallback";
  readonly reason?: "no-active-artifact" | "invalid-model" | "missing-decision" | "invalid-action" | "decision-budget-exceeded";
}

export interface TearActivePolicyDecision extends TearAgentDecision {
  readonly receipt: TearPolicyDecisionReceipt;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stable structured feature identity. It contains only typed simulation/UI observations, never DOM or device state. */
export function encodeTearPolicyObservation(observation: TearAgentObservation): string {
  const state = observation.state;
  return stableVerificationHash({
    observationClass: state.observationClass, screen: observation.ui?.screen ?? "playing", tick: state.tick,
    player: { x: Math.round(state.player.x), y: Math.round(state.player.y), hp: Math.round(state.player.hp), maxHp: Math.round(state.player.maxHp), grounded: state.player.grounded, dashCharges: state.player.dashCharges },
    blade: { state: state.blade.state, tipSpeed: Math.round(state.blade.tipSpeed) },
    run: { mode: state.run.mode, difficulty: state.run.difficulty, weapon: state.run.weapon, wave: state.run.wave },
    entities: state.entities.map((entity) => ({ kind: entity.kind, state: entity.state ?? "", ...(entity.hpRatio === undefined ? {} : { hpRatio: Math.round(entity.hpRatio * 100) }) })).sort((left, right) => `${left.kind}:${left.state}`.localeCompare(`${right.kind}:${right.state}`)),
    availableActions: [...state.availableActions].sort(), ...(observation.boss === undefined ? {} : { boss: observation.boss }),
  });
}

function validLimit(value: number): boolean { return Number.isFinite(value) && value >= 0; }

function limits(options: TearPolicyRuntimeOptions): TearPolicyRuntimeLimits {
  const value = { ...DEFAULT_TEAR_POLICY_RUNTIME_LIMITS, ...options.limits };
  if (!Number.isSafeInteger(value.maxPayloadBytes) || value.maxPayloadBytes < 1
    || !Number.isSafeInteger(value.maxTableEntries) || value.maxTableEntries < 1
    || !Number.isSafeInteger(value.maxActionsPerDecision) || value.maxActionsPerDecision < 1
    || !validLimit(value.maxDecisionMilliseconds)) throw new TypeError("invalid policy runtime limits");
  return Object.freeze(value);
}

function parseTableModel(artifact: TearPolicyArtifactV1, runtimeLimits: TearPolicyRuntimeLimits): TablePolicyModel | undefined {
  if (artifact.model.format !== "table-policy-v1") return undefined;
  if (new TextEncoder().encode(artifact.model.payload).byteLength > runtimeLimits.maxPayloadBytes) return undefined;
  try {
    const parsed: unknown = JSON.parse(artifact.model.payload);
    if (!record(parsed) || parsed.format !== "tear-table-policy-model" || parsed.schemaVersion !== 1 || !record(parsed.actionsByObservationHash)
      || Object.keys(parsed.actionsByObservationHash).length > runtimeLimits.maxTableEntries
      || !Object.values(parsed.actionsByObservationHash).every(Array.isArray)) return undefined;
    return Object.freeze({ format: "tear-table-policy-model", schemaVersion: 1,
      actionsByObservationHash: Object.freeze(Object.fromEntries(Object.entries(parsed.actionsByObservationHash).map(([key, value]) => [key, Object.freeze(Array.isArray(value) ? Array.from(value, (entry): unknown => entry) : [])]))),
    });
  } catch { return undefined; }
}

function finiteNumbers(value: unknown, length: number): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
function parseLinearModel(artifact: TearPolicyArtifactV1, runtimeLimits: TearPolicyRuntimeLimits): LinearPolicyModel | undefined {
  if (artifact.model.format !== "linear-policy-v1" || new TextEncoder().encode(artifact.model.payload).byteLength > runtimeLimits.maxPayloadBytes) return undefined;
  try {
    const parsed: unknown = JSON.parse(artifact.model.payload), width = TEAR_POLICY_FEATURE_WIDTH_V1;
    if (!record(parsed) || parsed.format !== "tear-linear-policy-model" || parsed.schemaVersion !== 1 || parsed.featureSchemaHash !== TEAR_POLICY_FEATURE_SCHEMA_HASH_V1
      || !finiteNumbers(parsed.mean, width) || !finiteNumbers(parsed.scale, width) || parsed.scale.some((entry) => entry <= 0)
      || !Array.isArray(parsed.classes) || parsed.classes.length < 1 || parsed.classes.length > runtimeLimits.maxTableEntries
      || !parsed.classes.every((entry) => record(entry) && Array.isArray(entry.actions)) || !Array.isArray(parsed.weights)
      || parsed.weights.length !== parsed.classes.length || !parsed.weights.every((entry) => finiteNumbers(entry, width))
      || !finiteNumbers(parsed.biases, parsed.classes.length)) return undefined;
    return Object.freeze({ format: "tear-linear-policy-model", schemaVersion: 1, featureSchemaHash: parsed.featureSchemaHash,
      mean: Object.freeze([...parsed.mean]), scale: Object.freeze([...parsed.scale]),
      classes: Object.freeze(parsed.classes.map((entry) => Object.freeze({ actions: Object.freeze([...(entry as { actions: unknown[] }).actions]) }))),
      weights: Object.freeze(parsed.weights.map((entry) => Object.freeze([...entry]))), biases: Object.freeze([...parsed.biases]) });
  } catch { return undefined; }
}
function parseTemporalWindowLinearModel(artifact: TearPolicyArtifactV1, runtimeLimits: TearPolicyRuntimeLimits): TemporalWindowLinearPolicyModel | undefined {
  if (artifact.model.format !== "temporal-window-linear-policy-v1" || new TextEncoder().encode(artifact.model.payload).byteLength > runtimeLimits.maxPayloadBytes) return undefined;
  try {
    const parsed: unknown = JSON.parse(artifact.model.payload), width = TEAR_POLICY_FEATURE_WIDTH_V1;
    if (!record(parsed)) return undefined;
    const candidateWindow = parsed.window;
    const v1 = parsed.conditionSchemaHash === TEAR_POLICY_CONDITION_SCHEMA_HASH_V1 && parsed.conditionWidth === TEAR_POLICY_CONDITION_WIDTH_V1;
    const v2 = parsed.conditionSchemaHash === TEAR_POLICY_CONDITION_SCHEMA_HASH_V2 && parsed.conditionWidth === TEAR_POLICY_CONDITION_WIDTH_V2;
    if (parsed.format !== "tear-temporal-window-linear-policy-model" || parsed.schemaVersion !== 1 || parsed.featureSchemaHash !== TEAR_POLICY_FEATURE_SCHEMA_HASH_V1
      || typeof candidateWindow !== "number" || !Number.isSafeInteger(candidateWindow) || candidateWindow < 1 || candidateWindow > 64 || (!v1 && !v2) || !finiteNumbers(parsed.mean, width) || !finiteNumbers(parsed.scale, width) || parsed.scale.some((entry) => entry <= 0)
      || !Array.isArray(parsed.classes) || parsed.classes.length < 1 || parsed.classes.length > runtimeLimits.maxTableEntries || !parsed.classes.every((entry) => record(entry) && Array.isArray(entry.actions))
      || !Array.isArray(parsed.weights) || parsed.weights.length !== parsed.classes.length || !parsed.weights.every((entry) => finiteNumbers(entry, candidateWindow * width + Number(parsed.conditionWidth)))
      || !finiteNumbers(parsed.biases, parsed.classes.length)) return undefined;
    const window = candidateWindow;
    return Object.freeze({ format: "tear-temporal-window-linear-policy-model", schemaVersion: 1, featureSchemaHash: parsed.featureSchemaHash, window, conditionSchemaHash: parsed.conditionSchemaHash as string, conditionWidth: Number(parsed.conditionWidth),
      mean: Object.freeze([...parsed.mean]), scale: Object.freeze([...parsed.scale]), classes: Object.freeze(parsed.classes.map((entry) => Object.freeze({ actions: Object.freeze([...(entry as { actions: unknown[] }).actions]) }))),
      weights: Object.freeze(parsed.weights.map((entry) => Object.freeze([...entry]))), biases: Object.freeze([...parsed.biases]) });
  } catch { return undefined; }
}
function parseModel(artifact: TearPolicyArtifactV1, runtimeLimits: TearPolicyRuntimeLimits): RuntimePolicyModel | undefined {
  return parseTableModel(artifact, runtimeLimits) ?? parseLinearModel(artifact, runtimeLimits) ?? parseTemporalWindowLinearModel(artifact, runtimeLimits);
}
function linearActions(model: LinearPolicyModel, features: readonly number[]): readonly unknown[] {
  let selected = 0, best = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < model.classes.length; index += 1) {
    const row = model.weights[index], bias = model.biases[index];
    if (row === undefined || bias === undefined) throw new Error("validated linear policy changed during decision");
    const score = row.reduce((total, weight, featureIndex) => total + weight * ((features[featureIndex] ?? 0) - (model.mean[featureIndex] ?? 0)) / (model.scale[featureIndex] ?? 1), bias);
    if (score > best) { best = score; selected = index; }
  }
  return model.classes[selected]?.actions ?? [];
}
function temporalWindowFeatures(model: TemporalWindowLinearPolicyModel, observation: TearAgentObservation, history: readonly (readonly number[])[], conditioning: TearPolicyConditioningV2): readonly number[] {
  const normalized = projectStructuredPolicyFeatures(observation).map((value, index) => (value - (model.mean[index] ?? 0)) / (model.scale[index] ?? 1));
  const frames = [...history, normalized].slice(-model.window);
  const features: number[] = [];
  for (let index = 0; index < model.window - frames.length; index += 1) features.push(...Array<number>(TEAR_POLICY_FEATURE_WIDTH_V1).fill(0));
  for (const frame of frames) features.push(...frame);
  const condition = model.conditionSchemaHash === TEAR_POLICY_CONDITION_SCHEMA_HASH_V1 ? projectStructuredPolicyCondition(observation) : projectStructuredPolicyConditionV2(observation, conditioning);
  return Object.freeze([...features, ...condition]);
}
function temporalActions(model: TemporalWindowLinearPolicyModel, features: readonly number[]): readonly unknown[] {
  let selected = 0, best = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < model.classes.length; index += 1) {
    const row = model.weights[index], bias = model.biases[index];
    if (row === undefined || bias === undefined) throw new Error("validated temporal policy changed during decision");
    const score = row.reduce((total, weight, featureIndex) => total + weight * (features[featureIndex] ?? 0), bias);
    if (score > best) { best = score; selected = index; }
  }
  return model.classes[selected]?.actions ?? [];
}

/**
 * Typed C32 execution boundary for the active local artifact. Table models are
 * data, not executable code; any unavailable, malformed, or illegal result
 * delegates to the proven scripted policy.
 */
export class TearActivePolicyRuntime {
  readonly #registry: TearPolicyArtifactRegistry;
  readonly #fallback: TearAgentOrchestrator;
  readonly #limits: TearPolicyRuntimeLimits;
  readonly #now: () => number;
  readonly #conditioning: TearPolicyConditioningV2;
  #artifact: TearPolicyArtifactV1 | undefined;
  #model: RuntimePolicyModel | undefined;
  #temporalHistory: readonly (readonly number[])[] = Object.freeze([]);

  constructor(registry: TearPolicyArtifactRegistry, profile: TearAgentProfileId = "competent", options: TearPolicyRuntimeOptions = {}) {
    this.#registry = registry; this.#fallback = new TearAgentOrchestrator(profile); this.#limits = limits(options);
    this.#now = options.now ?? (() => performance.now()); this.#conditioning = createTearPolicyConditioningV2(options.conditioning ?? { personaId: profile });
  }

  async reset(): Promise<void> {
    this.#artifact = undefined; this.#model = undefined; this.#temporalHistory = Object.freeze([]);
    const active = await this.#registry.active();
    if (active === undefined) return;
    const artifact = await this.#registry.get(active.artifactId);
    if (artifact?.artifactHash !== active.artifactHash) return;
    this.#artifact = artifact; this.#model = parseModel(artifact, this.#limits);
  }

  decide(observation: TearAgentObservation): TearActivePolicyDecision {
    const startedAt = this.#now();
    const observationHash = encodeTearPolicyObservation(observation);
    const fallback = (reason: NonNullable<TearPolicyDecisionReceipt["reason"]>): TearActivePolicyDecision => {
      const decision = this.#fallback.decide(observation);
      return Object.freeze({ ...decision, receipt: Object.freeze({ observationHash, source: "scripted-fallback", reason,
        ...(this.#artifact === undefined ? {} : { artifactId: this.#artifact.id, artifactHash: this.#artifact.artifactHash }) }) });
    };
    if (this.#artifact === undefined) return fallback("no-active-artifact");
    if (this.#model === undefined) return fallback("invalid-model");
    const candidate = this.#model.format === "tear-table-policy-model"
      ? this.#model.actionsByObservationHash[observationHash] ?? this.#model.actionsByObservationHash["*"]
      : this.#model.format === "tear-temporal-window-linear-policy-model"
        ? temporalActions(this.#model, temporalWindowFeatures(this.#model, observation, this.#temporalHistory, this.#conditioning))
        : linearActions(this.#model, projectStructuredPolicyFeatures(observation));
    if (this.#model.format === "tear-temporal-window-linear-policy-model") {
      this.#temporalHistory = Object.freeze([...this.#temporalHistory, Object.freeze([...projectStructuredPolicyFeatures(observation)])].slice(-this.#model.window));
    }
    if (candidate === undefined) return fallback("missing-decision");
    if (candidate.length > this.#limits.maxActionsPerDecision) return fallback("invalid-action");
    const actions: GameAction[] = [];
    for (const value of candidate) {
      const normalized = normalizeGameAction(value);
      if (!normalized.ok) return fallback("invalid-action");
      actions.push(normalized.action);
    }
    if (this.#now() - startedAt > this.#limits.maxDecisionMilliseconds) return fallback("decision-budget-exceeded");
    const fallbackTrace = this.#fallback.decide(observation).trace;
    return Object.freeze({ actions: Object.freeze(actions), trace: fallbackTrace,
      receipt: Object.freeze({ artifactId: this.#artifact.id, artifactHash: this.#artifact.artifactHash, observationHash, source: "artifact" }) });
  }
}
