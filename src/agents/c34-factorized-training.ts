import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { parseTearOfflineRlTrajectoryReceipt, type TearOfflineRlTrajectoryReceiptV1 } from "./offline-rl-training";
import {
  advanceFactorizedReturnContext,
  beginFactorizedReturnContext,
  FACTORIZED_RETURN_ADAPTER,
  projectFactorizedReturnFeatures,
  type FactorizedReturnTransition,
} from "./c34-causal-action-features";
import {
  advanceFactorizedQModel,
  createFactorizedQModel,
  factorizedQBatches,
  parseFactorizedQConfig,
  parseFactorizedQModel,
  type FactorizedQConfig,
  type FactorizedQModel,
  type FactorizedQSample,
} from "./c34-factorized-action-q";

export interface FactorizedOfflinePlan {
  readonly format: "tear-factorized-offline-plan.v4";
  readonly schemaVersion: 4;
  readonly id: string;
  readonly receipt: Readonly<{ receiptHash: string; planHash: string; rewardHash: string }>;
  readonly adapter: typeof FACTORIZED_RETURN_ADAPTER;
  readonly actionVocabulary: readonly GameAction[];
  readonly config: FactorizedQConfig;
  readonly epochs: number;
  readonly maxMeanError: number;
  readonly planHash: string;
}
export interface FactorizedOfflineCheckpoint {
  readonly format: "tear-factorized-offline-checkpoint.v4";
  readonly schemaVersion: 4;
  readonly planHash: string;
  readonly epoch: number;
  readonly updates: number;
  readonly status: "running" | "complete" | "stopped-divergence";
  readonly meanError: number;
  readonly model: FactorizedQModel;
  readonly checkpointHash: string;
}
export interface FactorizedOfflineResult {
  readonly format: "tear-factorized-offline-result.v4";
  readonly schemaVersion: 4;
  readonly planHash: string;
  readonly receiptHash: string;
  readonly checkpointHash: string;
  readonly status: "complete" | "stopped-divergence";
  readonly model: FactorizedQModel;
  readonly trainingHash: string;
}
const hash = /^[a-f0-9]{16}$/u;
const mask = Object.freeze(["aim", "move", "weapon"] as const);
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((d) => "value" in d)
  );
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join() === [...keys].sort().join();
}
function freeze<T>(value: T): T {
  const copy = structuredClone(value);
  const visit = (node: unknown): void => {
    if (node !== null && typeof node === "object") {
      Object.values(node).forEach(visit);
      Object.freeze(node);
    }
  };
  visit(copy);
  return copy;
}
function verify<T extends object>(value: T, key: keyof T): void {
  const { [key]: witness, ...draft } = value;
  if (!(typeof witness === "string" && hash.test(witness)) || stableVerificationHash(draft) !== witness)
    throw new TypeError(`factorized ${String(key)} integrity mismatch`);
}
export function createFactorizedOfflinePlan(
  receiptInput: TearOfflineRlTrajectoryReceiptV1,
  input: Readonly<{
    id: string;
    actionVocabulary: readonly GameAction[];
    config: FactorizedQConfig;
    epochs: number;
    maxMeanError: number;
  }>,
): FactorizedOfflinePlan {
  const receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput),
    config = parseFactorizedQConfig(input.config);
  if (
    typeof input.id !== "string" ||
    !input.id.trim() ||
    input.id.length > 256 ||
    !Number.isSafeInteger(input.epochs) ||
    input.epochs < 1 ||
    input.epochs > 256 ||
    !Number.isFinite(input.maxMeanError) ||
    input.maxMeanError <= 0 ||
    input.maxMeanError > config.maxAbsoluteQ
  )
    throw new TypeError("invalid factorized offline request");
  const actionVocabulary = factorizedQBatches(input.actionVocabulary).flatMap((batch) => batch);
  const draft = {
    format: "tear-factorized-offline-plan.v4" as const,
    schemaVersion: 4 as const,
    id: input.id,
    receipt: { receiptHash: receipt.receiptHash, planHash: receipt.plan.planHash, rewardHash: receipt.plan.rewardHash },
    adapter: FACTORIZED_RETURN_ADAPTER,
    actionVocabulary,
    config,
    epochs: input.epochs,
    maxMeanError: input.maxMeanError,
  };
  return freeze({ ...draft, planHash: stableVerificationHash(draft) });
}
export function parseFactorizedOfflinePlan(value: unknown): FactorizedOfflinePlan {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "id",
      "receipt",
      "adapter",
      "actionVocabulary",
      "config",
      "epochs",
      "maxMeanError",
      "planHash",
    ]) ||
    value.format !== "tear-factorized-offline-plan.v4" ||
    value.schemaVersion !== 4 ||
    !record(value.receipt) ||
    !exact(value.receipt, ["receiptHash", "planHash", "rewardHash"]) ||
    ![value.receipt.receiptHash, value.receipt.planHash, value.receipt.rewardHash].every(
      (v) => typeof v === "string" && hash.test(v),
    ) ||
    stableVerificationHash(value.adapter) !== stableVerificationHash(FACTORIZED_RETURN_ADAPTER) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > 256 ||
    !Number.isSafeInteger(value.epochs) ||
    Number(value.epochs) < 1 ||
    Number(value.epochs) > 256 ||
    typeof value.maxMeanError !== "number" ||
    !Number.isFinite(value.maxMeanError) ||
    value.maxMeanError <= 0 ||
    !Array.isArray(value.actionVocabulary)
  )
    throw new TypeError("invalid factorized offline plan");
  const plan = value as unknown as FactorizedOfflinePlan;
  const config = parseFactorizedQConfig(plan.config);
  if (
    plan.maxMeanError > config.maxAbsoluteQ ||
    stableVerificationHash(factorizedQBatches(plan.actionVocabulary).flatMap((batch) => batch)) !==
      stableVerificationHash(plan.actionVocabulary)
  )
    throw new TypeError("factorized offline protocol changed");
  verify(plan, "planHash");
  return freeze(plan);
}
export function factorizedTrainingRows(
  planInput: FactorizedOfflinePlan,
  receiptInput: TearOfflineRlTrajectoryReceiptV1,
): readonly FactorizedQSample[] {
  const plan = parseFactorizedOfflinePlan(planInput),
    receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput);
  if (
    receipt.receiptHash !== plan.receipt.receiptHash ||
    receipt.plan.planHash !== plan.receipt.planHash ||
    receipt.plan.rewardHash !== plan.receipt.rewardHash
  )
    throw new TypeError("factorized training receipt lineage changed");
  const rows = [...receipt.trajectories].sort(
    (a, b) => a.sequenceHash.localeCompare(b.sequenceHash) || a.from.tick - b.from.tick,
  );
  if (rows.length < 1 || rows.length > 20_000) throw new RangeError("factorized training transition bound exceeded");
  const supported = new Set(factorizedQBatches(plan.actionVocabulary).map((batch) => stableVerificationHash(batch)));
  const output: FactorizedQSample[] = [];
  let sequence: string | undefined, context: ReturnType<typeof beginFactorizedReturnContext> | undefined;
  for (const row of rows) {
    if (sequence !== row.sequenceHash) {
      sequence = row.sequenceHash;
      context = beginFactorizedReturnContext(row.from);
    }
    if (context === undefined) throw new Error("missing causal source context");
    const actions = row.actions.map((entry) => entry.command);
    if (!supported.has(stableVerificationHash(actions)))
      throw new TypeError("factorized training action is outside frozen vocabulary");
    const from = projectFactorizedReturnFeatures(row.from, context);
    const transition: FactorizedReturnTransition = { from: row.from, to: row.to, actions, events: row.nativeEvents };
    context = advanceFactorizedReturnContext(context, transition);
    output.push(
      Object.freeze({
        from,
        to: projectFactorizedReturnFeatures(row.to, context),
        actions: Object.freeze(actions),
        available: mask,
        nextAvailable: mask,
        reward: row.reward.total,
        terminal: row.terminal,
      }),
    );
  }
  return Object.freeze(output);
}
function checkpoint(draft: Omit<FactorizedOfflineCheckpoint, "checkpointHash">): FactorizedOfflineCheckpoint {
  return freeze({ ...draft, checkpointHash: stableVerificationHash(draft) });
}
export function parseFactorizedOfflineCheckpoint(value: unknown): FactorizedOfflineCheckpoint {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "planHash",
      "epoch",
      "updates",
      "status",
      "meanError",
      "model",
      "checkpointHash",
    ]) ||
    value.format !== "tear-factorized-offline-checkpoint.v4" ||
    value.schemaVersion !== 4 ||
    !(typeof value.planHash === "string" && hash.test(value.planHash)) ||
    !Number.isSafeInteger(value.epoch) ||
    Number(value.epoch) < 0 ||
    !Number.isSafeInteger(value.updates) ||
    Number(value.updates) < 0 ||
    !(typeof value.status === "string" && ["running", "complete", "stopped-divergence"].includes(value.status)) ||
    typeof value.meanError !== "number" ||
    !Number.isFinite(value.meanError) ||
    value.meanError < 0
  )
    throw new TypeError("invalid factorized offline checkpoint");
  const c = value as unknown as FactorizedOfflineCheckpoint;
  if (parseFactorizedQModel(c.model).planHash !== c.planHash)
    throw new TypeError("factorized checkpoint model lineage mismatch");
  verify(c, "checkpointHash");
  return freeze(c);
}
export function createFactorizedOfflineCheckpoint(
  planInput: FactorizedOfflinePlan,
  receipt: TearOfflineRlTrajectoryReceiptV1,
): FactorizedOfflineCheckpoint {
  const plan = parseFactorizedOfflinePlan(planInput),
    rows = factorizedTrainingRows(plan, receipt);
  return checkpoint({
    format: "tear-factorized-offline-checkpoint.v4",
    schemaVersion: 4,
    planHash: plan.planHash,
    epoch: 0,
    updates: 0,
    status: "running",
    meanError: 0,
    model: createFactorizedQModel(
      plan.planHash,
      plan.config,
      rows.map((row) => row.from),
      plan.actionVocabulary,
    ),
  });
}
export function advanceFactorizedOfflineCheckpoint(
  planInput: FactorizedOfflinePlan,
  receipt: TearOfflineRlTrajectoryReceiptV1,
  input: FactorizedOfflineCheckpoint,
  epochs: number,
): FactorizedOfflineCheckpoint {
  const plan = parseFactorizedOfflinePlan(planInput),
    prior = parseFactorizedOfflineCheckpoint(input),
    rows = factorizedTrainingRows(plan, receipt);
  if (
    !Number.isSafeInteger(epochs) ||
    epochs < 0 ||
    prior.planHash !== plan.planHash ||
    prior.epoch > plan.epochs ||
    stableVerificationHash(prior.model.config) !== stableVerificationHash(plan.config) ||
    stableVerificationHash(prior.model.heads.map((head) => head.actions)) !==
      stableVerificationHash(factorizedQBatches(plan.actionVocabulary)) ||
    prior.updates !== prior.epoch * rows.length ||
    stableVerificationHash(prior.model.basis) !==
      stableVerificationHash(
        createFactorizedQModel(
          plan.planHash,
          plan.config,
          rows.map((row) => row.from),
          plan.actionVocabulary,
        ).basis,
      )
  )
    throw new TypeError("factorized offline checkpoint request changed");
  if (prior.status !== "running" || epochs === 0) return prior;
  let model = prior.model,
    epoch = prior.epoch,
    updates = prior.updates,
    meanError = prior.meanError;
  let status: FactorizedOfflineCheckpoint["status"] = "running";
  while (epoch < Math.min(plan.epochs, prior.epoch + epochs)) {
    try {
      const result = advanceFactorizedQModel(model, rows);
      model = result.model;
      meanError = result.meanError;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      status = "stopped-divergence";
      break;
    }
    updates += rows.length;
    epoch++;
    if (meanError > plan.maxMeanError) {
      status = "stopped-divergence";
      break;
    }
  }
  if (status === "running" && epoch === plan.epochs) status = "complete";
  return checkpoint({
    format: prior.format,
    schemaVersion: 4,
    planHash: plan.planHash,
    epoch,
    updates,
    status,
    meanError,
    model,
  });
}
export function completeFactorizedOfflineCheckpoint(
  planInput: FactorizedOfflinePlan,
  input: FactorizedOfflineCheckpoint,
): FactorizedOfflineResult {
  const plan = parseFactorizedOfflinePlan(planInput),
    c = parseFactorizedOfflineCheckpoint(input);
  if (c.planHash !== plan.planHash || c.status === "running" || (c.status === "complete" && c.epoch !== plan.epochs))
    throw new TypeError("factorized offline result is incomplete");
  const draft = {
    format: "tear-factorized-offline-result.v4" as const,
    schemaVersion: 4 as const,
    planHash: plan.planHash,
    receiptHash: plan.receipt.receiptHash,
    checkpointHash: c.checkpointHash,
    status: c.status,
    model: c.model,
  };
  return freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}
export function parseFactorizedOfflineResult(value: unknown): FactorizedOfflineResult {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "planHash",
      "receiptHash",
      "checkpointHash",
      "status",
      "model",
      "trainingHash",
    ]) ||
    value.format !== "tear-factorized-offline-result.v4" ||
    value.schemaVersion !== 4 ||
    ![value.planHash, value.receiptHash, value.checkpointHash].every((v) => typeof v === "string" && hash.test(v)) ||
    !(typeof value.status === "string" && ["complete", "stopped-divergence"].includes(value.status))
  )
    throw new TypeError("invalid factorized offline result");
  const result = value as unknown as FactorizedOfflineResult;
  if (parseFactorizedQModel(result.model).planHash !== result.planHash)
    throw new TypeError("factorized result model lineage mismatch");
  verify(result, "trainingHash");
  return freeze(result);
}
