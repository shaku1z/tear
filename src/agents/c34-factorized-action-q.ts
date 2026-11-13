import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { FACTORIZED_RETURN_ADAPTER, type FactorizedReturnFeatures } from "./c34-causal-action-features";

export interface FactorizedQConfig {
  readonly maxCentres: number;
  readonly bandwidthMultiplier: number;
  readonly linearScale: number;
  readonly ridge: number;
  readonly learningRate: number;
  readonly gamma: number;
  readonly maxAbsoluteQ: number;
  readonly maxWeights: number;
  readonly maxBytes: number;
  readonly maxDecisionMilliseconds: number;
}
/** Basis rule and optimization limits are declared before examining fitted values. */
export const DEFAULT_FACTORIZED_Q_CONFIG: FactorizedQConfig = Object.freeze({
  maxCentres: 512,
  bandwidthMultiplier: 1,
  linearScale: 0.01,
  ridge: 0.0001,
  learningRate: 0.5,
  gamma: 0.99,
  maxAbsoluteQ: 100,
  maxWeights: 24_000,
  maxBytes: 1_048_576,
  maxDecisionMilliseconds: 8,
});
interface BasisBlock {
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly centres: readonly (readonly number[])[];
  readonly widths: readonly number[];
}
export interface FactorizedQModel {
  readonly format: "tear-factorized-action-q.v4";
  readonly schemaVersion: 4;
  readonly adapter: typeof FACTORIZED_RETURN_ADAPTER;
  readonly planHash: string;
  readonly config: FactorizedQConfig;
  readonly basis: Readonly<{ motor: BasisBlock; threat: BasisBlock }>;
  readonly heads: readonly Readonly<{
    actions: readonly GameAction[];
    actionHash: string;
    weights: readonly number[];
    samples: number;
  }>[];
  readonly modelHash: string;
}
export interface FactorizedQSample {
  readonly from: FactorizedReturnFeatures;
  readonly to: FactorizedReturnFeatures;
  readonly actions: readonly GameAction[];
  readonly available: readonly GameAction["type"][];
  readonly nextAvailable: readonly GameAction["type"][];
  readonly reward: number;
  readonly terminal: boolean;
}
export interface FactorizedQSupport {
  readonly kind: "observed-motor" | "generalized" | "unknown";
  readonly motorResponse: number;
  readonly threatResponse: number;
  readonly headUpdates: number;
}
export interface FactorizedQSelection {
  readonly actions: readonly GameAction[];
  readonly actionHash: string;
  readonly value: number;
  readonly support: FactorizedQSupport;
}
const hash = /^[a-f0-9]{16}$/u;
function record(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((item) => "value" in item)
  );
}
function exact(value: Record<string, unknown>, names: readonly string[]): boolean {
  return Object.keys(value).sort().join() === [...names].sort().join();
}
function numbers(value: unknown, max: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12)
  );
}
function integer(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
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
export function parseFactorizedQConfig(value: unknown): FactorizedQConfig {
  if (!record(value) || !exact(value, Object.keys(DEFAULT_FACTORIZED_Q_CONFIG)))
    throw new TypeError("invalid factorized Q configuration");
  const c = value as unknown as FactorizedQConfig;
  if (
    !integer(c.maxCentres, 1, 512) ||
    !integer(c.maxWeights, 1, 24_000) ||
    !integer(c.maxBytes, 1024, 1_048_576) ||
    ![
      c.bandwidthMultiplier,
      c.linearScale,
      c.ridge,
      c.learningRate,
      c.gamma,
      c.maxAbsoluteQ,
      c.maxDecisionMilliseconds,
    ].every(Number.isFinite) ||
    c.bandwidthMultiplier < 0.1 ||
    c.bandwidthMultiplier > 10 ||
    c.linearScale < 0 ||
    c.linearScale > 1 ||
    c.ridge < 0.000001 ||
    c.ridge > 1 ||
    c.learningRate <= 0 ||
    c.learningRate > 1 ||
    c.gamma < 0 ||
    c.gamma > 1 ||
    c.maxAbsoluteQ <= 0 ||
    c.maxAbsoluteQ > 1_000_000 ||
    c.maxDecisionMilliseconds <= 0 ||
    c.maxDecisionMilliseconds > 8
  )
    throw new RangeError("factorized Q configuration exceeds its frozen bounds");
  return freeze(c);
}
function canonicalBatch(value: readonly GameAction[]): readonly GameAction[] {
  if (!Array.isArray(value) || value.length > 1)
    throw new TypeError("factorized Q requires literal empty-or-one-command batches");
  return Object.freeze(
    (value as readonly unknown[]).map((action) => {
      const parsed = normalizeGameAction(action);
      if (
        !parsed.ok ||
        !["aim", "move", "weapon"].includes(parsed.action.type) ||
        stableVerificationHash(parsed.action) !== stableVerificationHash(action)
      )
        throw new TypeError("invalid factorized Q literal action");
      return freeze(parsed.action);
    }),
  );
}
export function factorizedQBatches(vocabulary: readonly GameAction[]): readonly (readonly GameAction[])[] {
  if (!Array.isArray(vocabulary) || vocabulary.length < 1 || vocabulary.length > 15)
    throw new TypeError("invalid factorized action vocabulary");
  const batches = [Object.freeze([]) as readonly GameAction[], ...vocabulary.map((action) => canonicalBatch([action]))];
  const byHash = new Map(batches.map((actions) => [stableVerificationHash(actions), actions]));
  if (byHash.size !== batches.length) throw new TypeError("factorized action vocabulary repeats an action");
  return Object.freeze([...byHash].sort(([a], [b]) => a.localeCompare(b)).map(([, actions]) => actions));
}
function required<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new TypeError("factorized vector width changed");
  return value;
}
function distance(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - required(b, i)) ** 2, 0));
}
function normalize(values: readonly number[], block: Pick<BasisBlock, "mean" | "scale">): readonly number[] {
  if (!numbers(values, 96) || values.length !== block.mean.length)
    throw new TypeError("factorized feature width or value changed");
  return values.map((value, i) => (value - required(block.mean, i)) / required(block.scale, i));
}
function basis(samples: readonly (readonly number[])[], config: FactorizedQConfig): BasisBlock {
  const width = samples[0]?.length ?? 0;
  if (width < 1 || width > 96 || samples.some((row) => row.length !== width || !numbers(row, 96)))
    throw new TypeError("invalid training-only feature basis");
  const mean = Array.from(
    { length: width },
    (_, i) => samples.reduce((sum, row) => sum + required(row, i), 0) / samples.length,
  );
  const scale = mean.map((value, i) =>
    Math.max(
      0.000001,
      Math.sqrt(samples.reduce((sum, row) => sum + (required(row, i) - value) ** 2, 0) / samples.length),
    ),
  );
  const distinct = [...new Map(samples.map((row) => [JSON.stringify(row), row])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
  const selected =
    distinct.length <= config.maxCentres
      ? distinct
      : Array.from({ length: config.maxCentres }, (_, i) =>
          required(distinct, Math.floor((i * (distinct.length - 1)) / Math.max(1, config.maxCentres - 1))),
        );
  const centres = selected.map((row) => normalize(row, { mean, scale }));
  const widths = centres.map((row, i) => {
    let nearest = Infinity;
    centres.forEach((other, j) => {
      if (j !== i) nearest = Math.min(nearest, distance(row, other));
    });
    return Math.max(0.000001, (Number.isFinite(nearest) ? nearest : 1) * config.bandwidthMultiplier);
  });
  return freeze({ mean, scale, centres, widths });
}
function vector(features: FactorizedReturnFeatures, model: Pick<FactorizedQModel, "basis" | "config">) {
  const block = (values: readonly number[], b: BasisBlock) => {
    const z = normalize(values, b),
      radial = b.centres.map((centre, i) => Math.exp(-0.5 * (distance(z, centre) / required(b.widths, i)) ** 2));
    return {
      values: [...z.map((v) => v * model.config.linearScale), ...radial],
      response: Math.max(0, ...radial),
      observed: b.centres.some((centre) => centre.every((value, index) => value === z[index])),
    };
  };
  const motor = block(features.motor, model.basis.motor),
    threat = block(features.threat, model.basis.threat);
  return {
    values: [1, ...motor.values, ...threat.values],
    motorResponse: motor.response,
    threatResponse: threat.response,
    observedMotor: motor.observed,
  };
}
function seal(draft: Omit<FactorizedQModel, "modelHash">): FactorizedQModel {
  const value = freeze({ ...draft, modelHash: stableVerificationHash(draft) });
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > value.config.maxBytes)
    throw new RangeError("factorized Q model exceeds byte budget");
  return value;
}
export function createFactorizedQModel(
  planHash: string,
  configInput: FactorizedQConfig,
  trainingOnly: readonly FactorizedReturnFeatures[],
  vocabulary: readonly GameAction[],
): FactorizedQModel {
  if (!hash.test(planHash) || trainingOnly.length < 1 || trainingOnly.length > 20_000)
    throw new TypeError("factorized model needs bounded training lineage");
  const config = parseFactorizedQConfig(configInput),
    b = {
      motor: basis(
        trainingOnly.map((row) => row.motor),
        config,
      ),
      threat: basis(
        trainingOnly.map((row) => row.threat),
        config,
      ),
    };
  const width = 1 + b.motor.mean.length + b.motor.centres.length + b.threat.mean.length + b.threat.centres.length;
  const heads = factorizedQBatches(vocabulary).map((actions) => ({
    actions,
    actionHash: stableVerificationHash(actions),
    weights: Array.from({ length: width }, () => 0),
    samples: 0,
  }));
  if (heads.length * width > config.maxWeights) throw new RangeError("factorized Q parameter budget exceeded");
  return seal({
    format: "tear-factorized-action-q.v4",
    schemaVersion: 4,
    adapter: FACTORIZED_RETURN_ADAPTER,
    planHash,
    config,
    basis: b,
    heads,
  });
}
export function parseFactorizedQModel(value: unknown): FactorizedQModel {
  if (
    !record(value) ||
    !exact(value, ["format", "schemaVersion", "adapter", "planHash", "config", "basis", "heads", "modelHash"]) ||
    value.format !== "tear-factorized-action-q.v4" ||
    value.schemaVersion !== 4 ||
    !(typeof value.planHash === "string" && hash.test(value.planHash)) ||
    !(typeof value.modelHash === "string" && hash.test(value.modelHash)) ||
    stableVerificationHash(value.adapter) !== stableVerificationHash(FACTORIZED_RETURN_ADAPTER) ||
    !record(value.basis) ||
    !exact(value.basis, ["motor", "threat"]) ||
    !Array.isArray(value.heads) ||
    value.heads.length < 2 ||
    value.heads.length > 16
  )
    throw new TypeError("invalid factorized Q model identity");
  const config = parseFactorizedQConfig(value.config);
  for (const key of ["motor", "threat"] as const) {
    const b = value.basis[key];
    if (
      !record(b) ||
      !exact(b, ["mean", "scale", "centres", "widths"]) ||
      !numbers(b.mean, 96) ||
      b.mean.length < 1 ||
      !numbers(b.scale, 96) ||
      b.scale.length !== b.mean.length ||
      b.scale.some((v) => v <= 0) ||
      !Array.isArray(b.centres) ||
      b.centres.length < 1 ||
      b.centres.length > config.maxCentres ||
      b.centres.some((row) => !numbers(row, 96) || row.length !== (b.mean as number[]).length) ||
      !numbers(b.widths, config.maxCentres) ||
      b.widths.length !== b.centres.length ||
      b.widths.some((v) => v <= 0)
    )
      throw new TypeError("invalid factorized training basis");
  }
  const model = value as unknown as FactorizedQModel;
  const width =
    1 +
    model.basis.motor.mean.length +
    model.basis.motor.centres.length +
    model.basis.threat.mean.length +
    model.basis.threat.centres.length;
  const seen = new Set<string>();
  for (const head of model.heads) {
    if (
      !record(head) ||
      !exact(head, ["actions", "actionHash", "weights", "samples"]) ||
      !Array.isArray(head.actions) ||
      !numbers(head.weights, config.maxWeights) ||
      head.weights.length !== width ||
      !integer(head.samples, 0, 100_000_000)
    )
      throw new TypeError("invalid factorized action head");
    const actionHash = stableVerificationHash(canonicalBatch(head.actions));
    if (head.actionHash !== actionHash || seen.has(actionHash))
      throw new TypeError("factorized action identity mismatch");
    seen.add(actionHash);
  }
  if (!model.heads.some((head) => head.actions.length === 0) || model.heads.length * width > config.maxWeights)
    throw new RangeError("factorized vocabulary or parameter budget changed");
  const { modelHash, ...draft } = model;
  if (stableVerificationHash(draft) !== modelHash) throw new TypeError("factorized model integrity mismatch");
  return seal(draft);
}
function score(weights: readonly number[], features: readonly number[], maximum: number): number {
  const result = weights.reduce((sum, value, i) => sum + value * required(features, i), 0);
  if (!Number.isFinite(result) || Math.abs(result) > maximum) throw new RangeError("factorized value diverged");
  return result;
}
/** Prepared inference never clones/hashes the complete model per decision. */
export function prepareFactorizedQSelector(input: FactorizedQModel) {
  const model = parseFactorizedQModel(input);
  return (
    features: FactorizedReturnFeatures,
    available: readonly GameAction["type"][],
  ): FactorizedQSelection | undefined => {
    if (!available.some((type) => ["aim", "move", "weapon"].includes(type))) return undefined;
    const projected = vector(features, model);
    let best: FactorizedQSelection | undefined;
    for (const head of model.heads) {
      if (head.samples === 0 || head.actions.some((action) => !available.includes(action.type))) continue;
      const value = score(head.weights, projected.values, model.config.maxAbsoluteQ);
      if (
        best === undefined ||
        value > best.value ||
        (value === best.value && head.actionHash.localeCompare(best.actionHash) < 0)
      )
        best = Object.freeze({
          actions: head.actions,
          actionHash: head.actionHash,
          value,
          support: Object.freeze({
            kind: projected.observedMotor
              ? "observed-motor"
              : projected.motorResponse > 1e-6
                ? "generalized"
                : "unknown",
            motorResponse: projected.motorResponse,
            threatResponse: projected.threatResponse,
            headUpdates: head.samples,
          }),
        });
    }
    return best;
  };
}
/** Normalized semi-gradient TD over shared smooth motor/threat bases; no state lookup. */
export function advanceFactorizedQModel(
  input: FactorizedQModel,
  samples: readonly FactorizedQSample[],
): Readonly<{ model: FactorizedQModel; meanError: number }> {
  const model = parseFactorizedQModel(input);
  if (samples.length < 1 || samples.length > 20_000) throw new RangeError("invalid factorized update budget");
  const heads = model.heads.map((head) => ({ ...head, weights: [...head.weights] }));
  let error = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.reward) || typeof sample.terminal !== "boolean")
      throw new TypeError("invalid native TD sample");
    const actionHash = stableVerificationHash(canonicalBatch(sample.actions)),
      head = heads.find((candidate) => candidate.actionHash === actionHash);
    if (!head || sample.actions.some((action) => !sample.available.includes(action.type)))
      throw new TypeError("TD sample violates frozen literal vocabulary or source mask");
    const from = vector(sample.from, model).values,
      next = vector(sample.to, model).values;
    const nextValues = heads
      .filter(
        (candidate) =>
          candidate.samples > 0 && candidate.actions.every((action) => sample.nextAvailable.includes(action.type)),
      )
      .map((candidate) => score(candidate.weights, next, model.config.maxAbsoluteQ));
    const target =
      sample.reward + (sample.terminal || nextValues.length === 0 ? 0 : model.config.gamma * Math.max(...nextValues));
    const delta = target - score(head.weights, from, model.config.maxAbsoluteQ);
    if (!Number.isFinite(target) || Math.abs(target) > model.config.maxAbsoluteQ)
      throw new RangeError("factorized TD target diverged");
    const norm = model.config.ridge + from.reduce((sum, value) => sum + value * value, 0);
    head.weights = head.weights.map(
      (value, i) =>
        value * (1 - model.config.learningRate * model.config.ridge) +
        (model.config.learningRate * delta * required(from, i)) / norm,
    );
    head.samples++;
    error += Math.abs(delta);
  }
  const { modelHash: _oldHash, ...draft } = model;
  void _oldHash;
  return Object.freeze({ model: seal({ ...draft, heads }), meanError: error / samples.length });
}
