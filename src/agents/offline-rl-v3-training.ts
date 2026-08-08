import type { GhostVaultBackend } from "../ghost";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import {
  TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1,
  TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1,
  canonicalizeTearC34C32ActionVocabulary,
  createTearC34C32RuntimeModel,
  encodeTearC34C32SourceState,
  parseTearC34C32RuntimeModel,
  tearC34C32SemanticActionHash,
  type TearC34C32RuntimeModelV1,
} from "./c34-c32-runtime-compatibility";
import {
  parseTearOfflineRlTrajectoryReceipt,
  type TearOfflineRlQValueV1,
  type TearOfflineRlTrainingConfigV1,
  type TearOfflineRlTrajectoryReceiptV1,
} from "./offline-rl-training";

const HASH = /^[a-f0-9]{16}$/u;
const CHECKPOINT_KEY = "offline-rl-v3-checkpoint:v1:";
const RESULT_KEY = "offline-rl-v3-training:v1:";
type Status = "running" | "complete" | "stopped-divergence";

export interface TearOfflineRlV3PlanV1 {
  readonly format: "tear-offline-rl-v3-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly receipt: Readonly<{ receiptHash: string; planHash: string; rewardHash: string }>;
  readonly sourceStateAdapter: Readonly<{ id: typeof TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id; adapterHash: string }>;
  readonly actionVocabulary: readonly GameAction[];
  readonly actionVocabularyHash: string;
  readonly config: TearOfflineRlTrainingConfigV1;
  readonly planHash: string;
}

export interface TearOfflineRlV3CheckpointV1 {
  readonly format: "tear-offline-rl-v3-checkpoint";
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly epoch: number;
  readonly updates: number;
  readonly consecutiveDivergentEpochs: number;
  readonly status: Status;
  readonly qValues: readonly TearOfflineRlQValueV1[];
  readonly metrics: Readonly<{ lastMeanAbsoluteTdError: number; maximumAbsoluteQ: number }>;
  readonly checkpointHash: string;
}

export interface TearOfflineRlV3TrainingResultV1 {
  readonly format: "tear-offline-rl-v3-training";
  readonly schemaVersion: 1;
  readonly plan: Readonly<{ planHash: string; receiptHash: string; adapterHash: string; actionVocabularyHash: string }>;
  readonly disposition: Exclude<Status, "running">;
  readonly checkpoint: Readonly<{ checkpointHash: string; epoch: number; updates: number }>;
  readonly metrics: Readonly<{ lastMeanAbsoluteTdError: number; maximumAbsoluteQ: number; stateActionEntries: number }>;
  readonly model?: TearC34C32RuntimeModelV1;
  readonly trainingHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positive(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum; }
function finite(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }

function validConfig(value: unknown): value is TearOfflineRlTrainingConfigV1 {
  return record(value) && positive(value.epochs, 256) && finite(value.learningRate, 0.000_001, 1) && finite(value.gamma, 0, 1)
    && positive(value.maxStateActionEntries, 1_000_000) && finite(value.maxAbsoluteQ, 0.000_001, 1_000_000)
    && finite(value.maxMeanAbsoluteTdError, 0.000_001, 1_000_000) && positive(value.maxConsecutiveDivergentEpochs, 256);
}
function qKey(stateHash: string, semanticActionHash: string): string { return `${stateHash}:${semanticActionHash}`; }
function ordered(values: readonly TearOfflineRlQValueV1[]): readonly TearOfflineRlQValueV1[] {
  const keys = new Set<string>();
  const output = values.map((entry) => {
    if (!hash(entry.stateHash) || !hash(entry.semanticActionHash) || !hash(entry.actionHash) || !Number.isFinite(entry.value)) throw new TypeError("invalid V3 Q value");
    const key = qKey(entry.stateHash, entry.semanticActionHash); if (keys.has(key)) throw new TypeError("V3 Q values repeat a state/action"); keys.add(key);
    return Object.freeze({ ...entry });
  }).sort((left, right) => left.stateHash.localeCompare(right.stateHash) || left.semanticActionHash.localeCompare(right.semanticActionHash));
  return Object.freeze(output);
}

function freezePlan(draft: Omit<TearOfflineRlV3PlanV1, "planHash" | "actionVocabularyHash">): TearOfflineRlV3PlanV1 {
  const rawAdapter: unknown = draft.sourceStateAdapter;
  if (!text(draft.id) || !positive(draft.version, Number.MAX_SAFE_INTEGER) || !record(draft.receipt)
    || !hash(draft.receipt.receiptHash) || !hash(draft.receipt.planHash) || !hash(draft.receipt.rewardHash)
    || !record(rawAdapter) || rawAdapter.id !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id
    || rawAdapter.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 || !validConfig(draft.config)) {
    throw new TypeError("invalid offline RL V3 plan");
  }
  const actionVocabulary = canonicalizeTearC34C32ActionVocabulary(draft.actionVocabulary);
  if (actionVocabulary.length < 1 || actionVocabulary.length > 16) throw new RangeError("offline RL V3 requires one to sixteen canonical actions");
  const actionVocabularyHash = stableVerificationHash(actionVocabulary);
  const value = Object.freeze({ format: "tear-offline-rl-v3-plan" as const, schemaVersion: 1 as const, id: draft.id, version: draft.version,
    receipt: freeze(draft.receipt), sourceStateAdapter: freeze(draft.sourceStateAdapter), actionVocabulary, actionVocabularyHash, config: freeze(draft.config) });
  return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}

/** Freezes receipt lineage, the exact common source adapter, vocabulary, and Q limits before any V3 update. */
export function createTearOfflineRlV3Plan(receiptInput: TearOfflineRlTrajectoryReceiptV1,
  input: Readonly<{ id: string; version: number; actionVocabulary: readonly unknown[]; config: TearOfflineRlTrainingConfigV1 }>): TearOfflineRlV3PlanV1 {
  const receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput);
  return freezePlan({ format: "tear-offline-rl-v3-plan", schemaVersion: 1, id: input.id, version: input.version,
    receipt: { receiptHash: receipt.receiptHash, planHash: receipt.plan.planHash, rewardHash: receipt.plan.rewardHash },
    sourceStateAdapter: { id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 },
    actionVocabulary: input.actionVocabulary as readonly GameAction[], config: input.config });
}

export function parseTearOfflineRlV3Plan(value: unknown): TearOfflineRlV3PlanV1 {
  if (!record(value) || value.format !== "tear-offline-rl-v3-plan" || value.schemaVersion !== 1 || !hash(value.planHash)
    || !Array.isArray(value.actionVocabulary) || !hash(value.actionVocabularyHash)) throw new TypeError("invalid offline RL V3 plan");
  const typed = value as unknown as TearOfflineRlV3PlanV1, { planHash, actionVocabularyHash, ...draft } = typed;
  const parsed = freezePlan(draft);
  if (planHash !== parsed.planHash || actionVocabularyHash !== parsed.actionVocabularyHash) throw new TypeError("offline RL V3 plan integrity mismatch");
  return parsed;
}

function samples(plan: TearOfflineRlV3PlanV1, receipt: TearOfflineRlTrajectoryReceiptV1) {
  if (plan.receipt.receiptHash !== receipt.receiptHash || plan.receipt.planHash !== receipt.plan.planHash || plan.receipt.rewardHash !== receipt.plan.rewardHash) throw new RangeError("offline RL V3 receipt lineage changed");
  const vocabulary = new Set(plan.actionVocabulary.map((action) => tearC34C32SemanticActionHash([action])));
  const output = receipt.trajectories.flatMap((transition) => {
    if (transition.actions.length === 0) return [];
    if (transition.actions.length !== 1) throw new RangeError("offline RL V3 requires one semantic action per decision transition");
    const action = transition.actions[0]?.command;
    if (action === undefined) throw new Error("validated V3 action disappeared");
    const semanticActionHash = tearC34C32SemanticActionHash([action]);
    if (!vocabulary.has(semanticActionHash)) throw new RangeError("offline RL V3 transition action is outside its frozen vocabulary");
    return [Object.freeze({ transition, stateHash: encodeTearC34C32SourceState(transition.from).stateHash,
      nextStateHash: encodeTearC34C32SourceState(transition.to).stateHash, semanticActionHash,
      actionHash: stableVerificationHash(transition.actions) })];
  }).sort((left, right) => left.transition.sequenceHash.localeCompare(right.transition.sequenceHash) || left.transition.from.tick - right.transition.from.tick);
  if (output.length < 1) throw new RangeError("offline RL V3 receipt has no executable canonical actions");
  return Object.freeze(output);
}

function checkpoint(draft: Omit<TearOfflineRlV3CheckpointV1, "checkpointHash">): TearOfflineRlV3CheckpointV1 {
  if (!hash(draft.planHash) || !Number.isSafeInteger(draft.epoch) || draft.epoch < 0 || !Number.isSafeInteger(draft.updates) || draft.updates < 0
    || !Number.isSafeInteger(draft.consecutiveDivergentEpochs) || draft.consecutiveDivergentEpochs < 0 || !["running", "complete", "stopped-divergence"].includes(draft.status)
    || !Number.isFinite(draft.metrics.lastMeanAbsoluteTdError) || draft.metrics.lastMeanAbsoluteTdError < 0 || !Number.isFinite(draft.metrics.maximumAbsoluteQ) || draft.metrics.maximumAbsoluteQ < 0) throw new TypeError("invalid offline RL V3 checkpoint");
  const value = Object.freeze({ format: "tear-offline-rl-v3-checkpoint" as const, schemaVersion: 1 as const, planHash: draft.planHash, epoch: draft.epoch,
    updates: draft.updates, consecutiveDivergentEpochs: draft.consecutiveDivergentEpochs, status: draft.status, qValues: ordered(draft.qValues), metrics: freeze(draft.metrics) });
  return Object.freeze({ ...value, checkpointHash: stableVerificationHash(value) });
}

export function parseTearOfflineRlV3Checkpoint(value: unknown): TearOfflineRlV3CheckpointV1 {
  if (!record(value) || value.format !== "tear-offline-rl-v3-checkpoint" || value.schemaVersion !== 1 || !hash(value.checkpointHash) || !Array.isArray(value.qValues) || !record(value.metrics)) throw new TypeError("invalid offline RL V3 checkpoint");
  const typed = value as unknown as TearOfflineRlV3CheckpointV1, { checkpointHash, ...draft } = typed, parsed = checkpoint(draft);
  if (checkpointHash !== parsed.checkpointHash) throw new TypeError("offline RL V3 checkpoint integrity mismatch"); return parsed;
}

export function createTearOfflineRlV3Checkpoint(planInput: TearOfflineRlV3PlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1): TearOfflineRlV3CheckpointV1 {
  const plan = parseTearOfflineRlV3Plan(planInput), rows = samples(plan, parseTearOfflineRlTrajectoryReceipt(receiptInput));
  const qValues = rows.map((row) => Object.freeze({ stateHash: row.stateHash, semanticActionHash: row.semanticActionHash, actionHash: row.actionHash, value: 0 }));
  if (qValues.length > plan.config.maxStateActionEntries) throw new RangeError("offline RL V3 state/action budget exceeded");
  return checkpoint({ format: "tear-offline-rl-v3-checkpoint", schemaVersion: 1, planHash: plan.planHash, epoch: 0, updates: 0,
    consecutiveDivergentEpochs: 0, status: "running", qValues, metrics: { lastMeanAbsoluteTdError: 0, maximumAbsoluteQ: 0 } });
}

function maxQ(values: ReadonlyMap<string, TearOfflineRlQValueV1>, stateHash: string): number {
  let maximum = 0; for (const entry of values.values()) if (entry.stateHash === stateHash) maximum = Math.max(maximum, entry.value); return maximum;
}

/** Deterministically advances whole V3 epochs. It never reads V2 checkpoints/results or writes C32 state. */
export function advanceTearOfflineRlV3Checkpoint(planInput: TearOfflineRlV3PlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1,
  checkpointInput: TearOfflineRlV3CheckpointV1, epochs: number): TearOfflineRlV3CheckpointV1 {
  const plan = parseTearOfflineRlV3Plan(planInput), receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput), initial = createTearOfflineRlV3Checkpoint(plan, receipt), checkpointInputParsed = parseTearOfflineRlV3Checkpoint(checkpointInput);
  if (!Number.isSafeInteger(epochs) || epochs < 0 || checkpointInputParsed.planHash !== plan.planHash || checkpointInputParsed.epoch > plan.config.epochs || checkpointInputParsed.qValues.length > plan.config.maxStateActionEntries) throw new RangeError("offline RL V3 checkpoint lineage is invalid");
  if (checkpointInputParsed.status !== "running" || epochs === 0) return checkpointInputParsed;
  const rows = samples(plan, receipt), values = new Map(checkpointInputParsed.qValues.map((entry) => [qKey(entry.stateHash, entry.semanticActionHash), entry]));
  if (initial.qValues.length !== checkpointInputParsed.qValues.length) throw new RangeError("offline RL V3 checkpoint action space changed");
  let epoch = checkpointInputParsed.epoch, updates = checkpointInputParsed.updates, divergent = checkpointInputParsed.consecutiveDivergentEpochs, status: Status = "running";
  let lastMeanAbsoluteTdError = checkpointInputParsed.metrics.lastMeanAbsoluteTdError, maximumAbsoluteQ = checkpointInputParsed.metrics.maximumAbsoluteQ;
  const targetEpoch = Math.min(plan.config.epochs, epoch + epochs);
  while (epoch < targetEpoch && status === "running") {
    let total = 0, count = 0;
    for (const row of rows) {
      const key = qKey(row.stateHash, row.semanticActionHash), current = values.get(key);
      if (current === undefined) throw new Error("offline RL V3 checkpoint lost a frozen decision");
      const target = row.transition.reward.total + (row.transition.terminal ? 0 : plan.config.gamma * maxQ(values, row.nextStateHash));
      const next = current.value + plan.config.learningRate * (target - current.value);
      if (!Number.isFinite(next) || Math.abs(next) > plan.config.maxAbsoluteQ) { status = "stopped-divergence"; break; }
      values.set(key, Object.freeze({ ...current, value: next })); total += Math.abs(target - current.value); count += 1; updates += 1; maximumAbsoluteQ = Math.max(maximumAbsoluteQ, Math.abs(next));
    }
    if (status !== "running") break;
    lastMeanAbsoluteTdError = total / Math.max(1, count); divergent = lastMeanAbsoluteTdError > plan.config.maxMeanAbsoluteTdError ? divergent + 1 : 0; epoch += 1;
    if (divergent >= plan.config.maxConsecutiveDivergentEpochs) status = "stopped-divergence";
  }
  if (status === "running" && epoch === plan.config.epochs) status = "complete";
  return checkpoint({ format: "tear-offline-rl-v3-checkpoint", schemaVersion: 1, planHash: plan.planHash, epoch, updates, consecutiveDivergentEpochs: divergent,
    status, qValues: [...values.values()], metrics: { lastMeanAbsoluteTdError, maximumAbsoluteQ } });
}

export function completeTearOfflineRlV3Checkpoint(planInput: TearOfflineRlV3PlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1,
  checkpointInput: TearOfflineRlV3CheckpointV1): TearOfflineRlV3TrainingResultV1 {
  const plan = parseTearOfflineRlV3Plan(planInput), checkpointInputParsed = advanceTearOfflineRlV3Checkpoint(plan, receiptInput, checkpointInput, 0);
  if (checkpointInputParsed.status === "running") throw new RangeError("offline RL V3 checkpoint is incomplete");
  const disposition = checkpointInputParsed.status, metrics = Object.freeze({ lastMeanAbsoluteTdError: checkpointInputParsed.metrics.lastMeanAbsoluteTdError,
    maximumAbsoluteQ: checkpointInputParsed.metrics.maximumAbsoluteQ, stateActionEntries: checkpointInputParsed.qValues.length });
  const model = disposition === "complete" ? createTearC34C32RuntimeModel(checkpointInputParsed.qValues) : undefined;
  const draft = { format: "tear-offline-rl-v3-training" as const, schemaVersion: 1 as const,
    plan: Object.freeze({ planHash: plan.planHash, receiptHash: plan.receipt.receiptHash, adapterHash: plan.sourceStateAdapter.adapterHash, actionVocabularyHash: plan.actionVocabularyHash }),
    disposition, checkpoint: Object.freeze({ checkpointHash: checkpointInputParsed.checkpointHash, epoch: checkpointInputParsed.epoch, updates: checkpointInputParsed.updates }), metrics,
    ...(model === undefined ? {} : { model }) };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

export function parseTearOfflineRlV3TrainingResult(value: unknown): TearOfflineRlV3TrainingResultV1 {
  if (!record(value) || value.format !== "tear-offline-rl-v3-training" || value.schemaVersion !== 1 || !record(value.plan) || !hash(value.plan.planHash)
    || !hash(value.plan.receiptHash) || value.plan.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 || !hash(value.plan.actionVocabularyHash)
    || !["complete", "stopped-divergence"].includes(String(value.disposition)) || !record(value.checkpoint) || !hash(value.checkpoint.checkpointHash)
    || !Number.isSafeInteger(value.checkpoint.epoch) || !Number.isSafeInteger(value.checkpoint.updates) || !record(value.metrics) || !hash(value.trainingHash)) throw new TypeError("invalid offline RL V3 result");
  const typed = value as unknown as Omit<TearOfflineRlV3TrainingResultV1, "trainingHash"> & { trainingHash: string };
  const model = typed.model === undefined ? undefined : parseTearC34C32RuntimeModel(typed.model);
  if (typed.disposition === "complete" && model === undefined) throw new TypeError("completed offline RL V3 result requires a compatible model");
  if (typed.disposition === "stopped-divergence" && model !== undefined) throw new TypeError("stopped offline RL V3 result cannot expose a model");
  const draft = { ...typed, ...(model === undefined ? {} : { model }) }; delete (draft as { trainingHash?: string }).trainingHash;
  if (typed.trainingHash !== stableVerificationHash(draft)) throw new TypeError("offline RL V3 result integrity mismatch");
  return freeze({ ...draft, trainingHash: typed.trainingHash });
}

export class TearOfflineRlV3CheckpointVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOfflineRlV3CheckpointV1): Promise<TearOfflineRlV3CheckpointV1> { const value = parseTearOfflineRlV3Checkpoint(input), key = `${CHECKPOINT_KEY}${value.checkpointHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return parseTearOfflineRlV3Checkpoint(JSON.parse(existing)); await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }])); return value; }
  async get(checkpointHash: string): Promise<TearOfflineRlV3CheckpointV1 | undefined> { if (!hash(checkpointHash)) throw new TypeError("offline RL V3 checkpoint hash is invalid"); const key = `${CHECKPOINT_KEY}${checkpointHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { return parseTearOfflineRlV3Checkpoint(JSON.parse(raw)); } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify({ key, raw, reason: error instanceof Error ? error.message : String(error) })); return undefined; } }
}

/** Separate durable V3 result custody; no V2 key, policy registry, or active pointer is touched. */
export class TearOfflineRlV3TrainingVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOfflineRlV3TrainingResultV1): Promise<TearOfflineRlV3TrainingResultV1> { const value = parseTearOfflineRlV3TrainingResult(input), key = `${RESULT_KEY}${value.trainingHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return parseTearOfflineRlV3TrainingResult(JSON.parse(existing)); await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }])); return value; }
  async get(trainingHash: string): Promise<TearOfflineRlV3TrainingResultV1 | undefined> { if (!hash(trainingHash)) throw new TypeError("offline RL V3 training hash is invalid"); const key = `${RESULT_KEY}${trainingHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { return parseTearOfflineRlV3TrainingResult(JSON.parse(raw)); } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify({ key, raw, reason: error instanceof Error ? error.message : String(error) })); return undefined; } }
}
