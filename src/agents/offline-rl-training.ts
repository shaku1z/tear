import type { CommandEnvelope } from "../domain/envelopes";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { GameAction } from "../input/game-action";
import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyTrainingDatasetV1, TearAcademyTrainingSequenceV1 } from "./academy-training-dataset";

const HASH = /^[a-f0-9]{16}$/u;
const TRAJECTORY_KEY = "offline-rl-trajectory:v1:";
const CHECKPOINT_KEY = "offline-rl-checkpoint:v1:";
const TRAINING_KEY = "offline-rl-training:v1:";

export type TearOfflineRlRewardSourceV1 = "run.completed" | "run.defeated" | "wave.cleared" | "enemy.defeated" | "score.delta";

/**
 * A frozen C34 reward component. It may read only named source-world facts;
 * arbitrary callbacks and model-supplied reward functions are intentionally
 * unavailable so an optimizer cannot redefine its own objective mid-run.
 */
export interface TearOfflineRlRewardComponentV1 {
  readonly id: string;
  readonly source: TearOfflineRlRewardSourceV1;
  readonly weight: number;
  readonly maximumSourceValue: number;
  readonly perTransitionCap: number;
}

export interface TearOfflineRlRewardDefinitionV1 {
  readonly format: "tear-offline-rl-reward-definition";
  readonly schemaVersion: 1;
  readonly components: readonly TearOfflineRlRewardComponentV1[];
  readonly totalMinimum: number;
  readonly totalMaximum: number;
  readonly rewardHash: string;
}

export interface TearOfflineRlLimitsV1 {
  readonly maxTransitions: number;
  readonly maxEventsPerTransition: number;
  /** A source or reward-bound violation fails extraction rather than clipping hidden evidence. */
  readonly maxRewardViolations: 0;
}

export interface TearOfflineRlPlanV1 {
  readonly format: "tear-offline-rl-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly seed: number;
  readonly dataset: Readonly<{ datasetHash: string; manifestId: string; manifestVersion: number; manifestRootHash: string }>;
  /** C34 uses the same C30 source-owned composition; it may not substitute a simulator. */
  readonly environment: Readonly<{ execution: "production-headless"; scenarioHashes: readonly string[] }>;
  readonly curriculum: Readonly<{ lessonIds: readonly string[]; scenarioHashes: readonly string[] }>;
  readonly trainingSelection: readonly Readonly<{ candidateHash: string; sequenceHash: string; scenarioHash: string }> [];
  readonly reward: TearOfflineRlRewardDefinitionV1;
  readonly limits: TearOfflineRlLimitsV1;
  readonly planHash: string;
}

export interface TearOfflineRlPlanRequestV1 {
  readonly id: string;
  readonly version: number;
  readonly seed: number;
  readonly reward: Omit<TearOfflineRlRewardDefinitionV1, "format" | "schemaVersion" | "rewardHash">;
  readonly limits: TearOfflineRlLimitsV1;
}

export interface TearOfflineRlTransitionRewardV1 {
  readonly id: string;
  readonly source: TearOfflineRlRewardSourceV1;
  readonly sourceValue: number;
  readonly unclamped: number;
  readonly value: number;
}

export interface TearOfflineRlTransitionV1 {
  readonly candidateHash: string;
  readonly sequenceHash: string;
  readonly lessonId: string;
  readonly scenarioHash: string;
  readonly from: CanonicalGameplayState;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly to: CanonicalGameplayState;
  readonly nativeEvents: readonly TearGameplayEvent[];
  readonly reward: Readonly<{ components: readonly TearOfflineRlTransitionRewardV1[]; total: number }>;
  readonly terminal: boolean;
  readonly transitionHash: string;
}

/** A bounded, immutable C34 optimizer input. It is not a fitted policy or a promotion decision. */
export interface TearOfflineRlTrajectoryReceiptV1 {
  readonly format: "tear-offline-rl-trajectory-receipt";
  readonly schemaVersion: 1;
  readonly plan: Readonly<{ id: string; planHash: string; rewardHash: string }>;
  readonly trajectories: readonly TearOfflineRlTransitionV1[];
  readonly metrics: Readonly<{ sequenceCount: number; transitionCount: number; terminalTransitions: number; componentTotals: Readonly<Record<string, number>> }>;
  readonly receiptHash: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}
function finite(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function canonicalNumber(value: number): number { return Object.is(value, -0) ? 0 : value; }
function scenarioHash(sequence: TearAcademyTrainingSequenceV1): string {
  if (sequence.sourceScenario === undefined) throw new RangeError("offline RL requires source-owned Academy scenarios");
  return stableVerificationHash(sequence.sourceScenario);
}
function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}
function cloneState(value: CanonicalGameplayState): CanonicalGameplayState { return Object.freeze(structuredClone(value)); }

/** Reject unknown/unshaped facts before a reward source can observe them. */
function validNativeEvent(value: unknown): value is TearGameplayEvent {
  if (!record(value)) return false;
  const tick = value.tick;
  if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 0 || !text(value.kind)) return false;
  switch (value.kind) {
    case "run": return ["started", "paused", "resumed", "completed", "defeated", "abandoned"].includes(String(value.transition))
      && text(value.runId) && text(value.mode) && text(value.difficulty) && text(value.weaponId)
      && Number.isSafeInteger(value.wave) && Number.isFinite(value.score) && Number.isFinite(value.runTimeSeconds);
    case "stage": return Number.isSafeInteger(value.stage);
    case "wave": return Number.isSafeInteger(value.wave) && text(value.event);
    case "spawn": return text(value.actorId) && text(value.actorKind) && Number.isFinite(value.x) && Number.isFinite(value.y);
    case "death": return text(value.actorId) && text(value.cause);
    case "loadout": return text(value.choiceId) && Number.isSafeInteger(value.tier) && Number.isSafeInteger(value.wave);
    case "effect": return text(value.effect) && Number.isFinite(value.x) && Number.isFinite(value.y);
    default: return false;
  }
}

function freezeReward(value: Omit<TearOfflineRlRewardDefinitionV1, "format" | "schemaVersion" | "rewardHash">): TearOfflineRlRewardDefinitionV1 {
  if (value.components.length < 1 || value.components.length > 16
    || !finite(value.totalMinimum, -10_000, 0) || !finite(value.totalMaximum, 0, 10_000) || value.totalMinimum > value.totalMaximum) {
    throw new TypeError("invalid offline RL reward definition");
  }
  const ids = new Set<string>();
  const components = value.components.map((component) => {
    if (!text(component.id) || component.id.length > 64 || ids.has(component.id)
      || !["run.completed", "run.defeated", "wave.cleared", "enemy.defeated", "score.delta"].includes(component.source)
      || !finite(component.weight, -1_000, 1_000) || !finite(component.maximumSourceValue, 0, 1_000_000)
      || !finite(component.perTransitionCap, 0.000_001, 10_000)) {
      throw new TypeError("invalid offline RL reward component");
    }
    ids.add(component.id);
    return Object.freeze({ ...component });
  });
  const draft = { format: "tear-offline-rl-reward-definition" as const, schemaVersion: 1 as const,
    components: Object.freeze(components), totalMinimum: value.totalMinimum, totalMaximum: value.totalMaximum };
  return Object.freeze({ ...draft, rewardHash: stableVerificationHash(draft) });
}

function validateLimits(value: TearOfflineRlLimitsV1): TearOfflineRlLimitsV1 {
  if (!positiveInteger(value.maxTransitions, 1_000_000) || !positiveInteger(value.maxEventsPerTransition, 10_000)) {
    throw new TypeError("invalid offline RL extraction limits");
  }
  return Object.freeze({ ...value });
}

function datasetTrainingSequences(dataset: TearAcademyTrainingDatasetV1): readonly TearAcademyTrainingSequenceV1[] {
  if (!hash(dataset.datasetHash) || !text(dataset.manifest.id) || !positiveInteger(dataset.manifest.version, Number.MAX_SAFE_INTEGER)
    || !hash(dataset.manifest.rootHash)) throw new TypeError("invalid governed Academy dataset");
  const sequences = dataset.sequences.filter((sequence) => sequence.split === "training");
  if (sequences.length < 1) throw new RangeError("offline RL requires a governed training split");
  if (sequences.some((sequence) => !hash(sequence.candidateHash) || !hash(sequence.sequenceHash) || !text(sequence.lessonId))) {
    throw new TypeError("offline RL dataset sequence identity is invalid");
  }
  return Object.freeze([...sequences].sort((left, right) => left.sequenceHash.localeCompare(right.sequenceHash)));
}

function freezePlan(value: Omit<TearOfflineRlPlanV1, "planHash">): TearOfflineRlPlanV1 {
  if (!text(value.id) || !positiveInteger(value.version, Number.MAX_SAFE_INTEGER)
    || !Number.isSafeInteger(value.seed) || value.seed < 0 || !hash(value.dataset.datasetHash)
    || !text(value.dataset.manifestId) || !positiveInteger(value.dataset.manifestVersion, Number.MAX_SAFE_INTEGER) || !hash(value.dataset.manifestRootHash)
    ) {
    throw new TypeError("invalid offline RL plan");
  }
  const scenarioHashes = sortedUnique(value.environment.scenarioHashes);
  const curriculumHashes = sortedUnique(value.curriculum.scenarioHashes);
  const lessonIds = sortedUnique(value.curriculum.lessonIds);
  if (scenarioHashes.length < 1 || scenarioHashes.some((entry) => !hash(entry)) || stableVerificationHash(scenarioHashes) !== stableVerificationHash(curriculumHashes)
    || lessonIds.length < 1 || lessonIds.some((entry) => !text(entry)) || value.trainingSelection.length < 1
    || new Set(value.trainingSelection.map((entry) => entry.sequenceHash)).size !== value.trainingSelection.length
    || value.trainingSelection.some((entry) => !hash(entry.candidateHash) || !hash(entry.sequenceHash) || !hash(entry.scenarioHash))) {
    throw new TypeError("offline RL plan has invalid governed selection");
  }
  const selection = [...value.trainingSelection].sort((left, right) => left.sequenceHash.localeCompare(right.sequenceHash)).map((entry) => Object.freeze({ ...entry }));
  if (stableVerificationHash(sortedUnique(selection.map((entry) => entry.scenarioHash))) !== stableVerificationHash(scenarioHashes)) {
    throw new RangeError("offline RL plan curriculum does not match its training selection");
  }
  const reward = freezeReward(value.reward), limits = validateLimits(value.limits);
  const draft = { format: value.format, schemaVersion: value.schemaVersion, id: value.id, version: value.version, seed: value.seed,
    dataset: Object.freeze({ ...value.dataset }), environment: Object.freeze({ execution: "production-headless" as const, scenarioHashes }),
    curriculum: Object.freeze({ lessonIds, scenarioHashes: curriculumHashes }), trainingSelection: Object.freeze(selection), reward, limits };
  return Object.freeze({ ...draft, planHash: stableVerificationHash(draft) });
}

/** Binds offline RL to one immutable, training-only C31 dataset and source-world curriculum. */
export function createTearOfflineRlPlan(dataset: TearAcademyTrainingDatasetV1, request: TearOfflineRlPlanRequestV1): TearOfflineRlPlanV1 {
  const training = datasetTrainingSequences(dataset);
  const selection = training.map((sequence) => Object.freeze({ candidateHash: sequence.candidateHash, sequenceHash: sequence.sequenceHash, scenarioHash: scenarioHash(sequence) }));
  if (new Set(selection.map((entry) => entry.scenarioHash)).size !== selection.length) {
    throw new RangeError("offline RL rejects duplicate source scenarios in a training run");
  }
  return freezePlan({ format: "tear-offline-rl-plan", schemaVersion: 1, id: request.id, version: request.version, seed: request.seed,
    dataset: Object.freeze({ datasetHash: dataset.datasetHash, manifestId: dataset.manifest.id, manifestVersion: dataset.manifest.version, manifestRootHash: dataset.manifest.rootHash }),
    environment: Object.freeze({ execution: "production-headless", scenarioHashes: sortedUnique(selection.map((entry) => entry.scenarioHash)) }),
    curriculum: Object.freeze({ lessonIds: sortedUnique(training.map((entry) => entry.lessonId)), scenarioHashes: sortedUnique(selection.map((entry) => entry.scenarioHash)) }),
    trainingSelection: Object.freeze(selection), reward: freezeReward(request.reward), limits: request.limits });
}

/** Parses a persisted C34 plan and rejects altered reward, curriculum, or split selection bytes. */
export function parseTearOfflineRlPlan(value: unknown): TearOfflineRlPlanV1 {
  if (!record(value) || !hash(value.planHash)) throw new TypeError("invalid offline RL plan");
  const typed = value as unknown as TearOfflineRlPlanV1, { planHash, ...draft } = typed;
  const plan = freezePlan(draft);
  if (planHash !== plan.planHash) throw new TypeError("offline RL plan integrity mismatch");
  return plan;
}

function assertTrackAlignment(sequence: TearAcademyTrainingSequenceV1): void {
  const { tracks } = sequence;
  if (tracks.observations.length < 2 || !Number.isSafeInteger(tracks.terminal.tick)
    || tracks.terminal.tick < 1 || !hash(tracks.terminal.semanticHash)) {
    throw new TypeError("offline RL requires complete aligned Academy tracks");
  }
  const observations = tracks.observations;
  if (observations.some((entry, index) => !Number.isSafeInteger(entry.tick) || entry.tick < 0 || (index > 0 && entry.tick !== (observations[index - 1]?.tick ?? -2) + 1))) {
    throw new RangeError("offline RL observations must be contiguous fixed ticks");
  }
  if (observations.at(-1)?.tick !== tracks.terminal.tick || stableVerificationHash(observations.at(-1)) !== tracks.terminal.semanticHash
    || tracks.rewardComponents.length !== observations.length || tracks.rewardComponents.some((entry, index) => entry.tick !== observations[index]?.tick)) {
    throw new RangeError("offline RL tracks do not align with their sealed terminal");
  }
  let actionId = 0, actionTick = observations[0]?.tick ?? 0;
  for (const action of tracks.actions) {
    if (!Number.isSafeInteger(action.id) || action.id <= actionId || !Number.isSafeInteger(action.tick)
      || action.tick < actionTick || action.tick <= (observations[0]?.tick ?? -1) || action.tick > tracks.terminal.tick) {
      throw new RangeError("offline RL action trace is not monotonic and bounded");
    }
    actionId = action.id; actionTick = action.tick;
  }
  let eventTick = observations[0]?.tick ?? 0;
  for (const event of tracks.nativeEvents) {
    if (!validNativeEvent(event) || event.tick < eventTick || event.tick < (observations[0]?.tick ?? 0) || event.tick > tracks.terminal.tick) {
      throw new RangeError("offline RL native event trace is not monotonic and bounded");
    }
    eventTick = event.tick;
  }
}

function sourceValue(source: TearOfflineRlRewardSourceV1, from: CanonicalGameplayState, to: CanonicalGameplayState, events: readonly TearGameplayEvent[]): number {
  switch (source) {
    case "run.completed": return events.filter((event) => event.kind === "run" && event.transition === "completed").length;
    case "run.defeated": return events.filter((event) => event.kind === "run" && event.transition === "defeated").length;
    case "wave.cleared": return events.filter((event) => event.kind === "wave" && (event.event === "clear" || event.event === "cleared")).length;
    case "enemy.defeated": return events.filter((event) => event.kind === "death").length;
    case "score.delta": return (to.run?.score ?? 0) - (from.run?.score ?? 0);
  }
}

function rewardForTransition(plan: TearOfflineRlPlanV1, from: CanonicalGameplayState, to: CanonicalGameplayState, events: readonly TearGameplayEvent[]) {
  if (events.length > plan.limits.maxEventsPerTransition) throw new RangeError("offline RL transition exceeds event budget");
  const components = plan.reward.components.map((definition) => {
    const observed = sourceValue(definition.source, from, to, events);
    if (!Number.isFinite(observed) || Math.abs(observed) > definition.maximumSourceValue) {
      throw new RangeError(`offline RL reward source bound exceeded: ${definition.id}`);
    }
    const unclamped = canonicalNumber(observed * definition.weight);
    return Object.freeze({ id: definition.id, source: definition.source, sourceValue: observed, unclamped,
      value: canonicalNumber(Math.max(-definition.perTransitionCap, Math.min(definition.perTransitionCap, unclamped))) });
  });
  const rawTotal = components.reduce((sum, component) => sum + component.value, 0);
  if (rawTotal < plan.reward.totalMinimum || rawTotal > plan.reward.totalMaximum) {
    throw new RangeError("offline RL total reward bound exceeded");
  }
  return Object.freeze({ components: Object.freeze(components), total: rawTotal });
}

/**
 * Projects only frozen C31 training tracks into C34 `(state, action, next
 * state, reward)` transitions. The result deliberately contains no optimizer,
 * policy artifact, registry write, activation, or promotion semantics.
 */
export function extractTearOfflineRlTrajectories(dataset: TearAcademyTrainingDatasetV1, input: TearOfflineRlPlanV1): TearOfflineRlTrajectoryReceiptV1 {
  const plan = parseTearOfflineRlPlan(input), training = datasetTrainingSequences(dataset);
  if (plan.dataset.datasetHash !== dataset.datasetHash || plan.dataset.manifestId !== dataset.manifest.id
    || plan.dataset.manifestVersion !== dataset.manifest.version || plan.dataset.manifestRootHash !== dataset.manifest.rootHash) {
    throw new RangeError("offline RL plan does not match the governed dataset");
  }
  const bySequence = new Map(training.map((sequence) => [sequence.sequenceHash, sequence]));
  if (bySequence.size !== training.length || bySequence.size !== plan.trainingSelection.length) throw new RangeError("offline RL training selection changed");
  const transitions: TearOfflineRlTransitionV1[] = [];
  const componentTotals: Record<string, number> = Object.fromEntries(plan.reward.components.map((component) => [component.id, 0]));
  for (const selected of plan.trainingSelection) {
    const sequence = bySequence.get(selected.sequenceHash);
    if (sequence === undefined) throw new RangeError("offline RL selection no longer matches its governed source");
    if (sequence.candidateHash !== selected.candidateHash || scenarioHash(sequence) !== selected.scenarioHash) {
      throw new RangeError("offline RL selection no longer matches its governed source");
    }
    assertTrackAlignment(sequence);
    const observations = sequence.tracks.observations;
    for (let index = 0; index < observations.length - 1; index += 1) {
      const from = observations[index], to = observations[index + 1];
      if (from === undefined || to === undefined) throw new Error("offline RL observation disappeared during extraction");
      const actions = sequence.tracks.actions.filter((entry) => entry.tick === to.tick);
      const events = sequence.tracks.nativeEvents.filter((entry) => entry.tick === to.tick);
      const reward = rewardForTransition(plan, from, to, events);
      for (const component of reward.components) componentTotals[component.id] = (componentTotals[component.id] ?? 0) + component.value;
      const draft = { candidateHash: sequence.candidateHash, sequenceHash: sequence.sequenceHash, lessonId: sequence.lessonId,
        scenarioHash: selected.scenarioHash, from: cloneState(from), actions: Object.freeze(actions.map((entry) => Object.freeze(structuredClone(entry)))),
        to: cloneState(to), nativeEvents: Object.freeze(events.map((entry) => Object.freeze(structuredClone(entry)))), reward,
        terminal: to.tick === sequence.tracks.terminal.tick };
      transitions.push(Object.freeze({ ...draft, transitionHash: stableVerificationHash(draft) }));
      if (transitions.length > plan.limits.maxTransitions) throw new RangeError("offline RL transition budget exceeded");
    }
  }
  if (transitions.length < 1 || transitions.filter((entry) => entry.terminal).length !== plan.trainingSelection.length) {
    throw new RangeError("offline RL extraction did not retain one terminal per governed sequence");
  }
  const metrics = Object.freeze({ sequenceCount: plan.trainingSelection.length, transitionCount: transitions.length,
    terminalTransitions: transitions.filter((entry) => entry.terminal).length, componentTotals: Object.freeze({ ...componentTotals }) });
  const draft = { format: "tear-offline-rl-trajectory-receipt" as const, schemaVersion: 1 as const,
    plan: Object.freeze({ id: plan.id, planHash: plan.planHash, rewardHash: plan.reward.rewardHash }), trajectories: Object.freeze(transitions), metrics };
  return Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
}

export interface TearOfflineRlTrainingConfigV1 {
  readonly epochs: number;
  readonly learningRate: number;
  readonly gamma: number;
  readonly maxStateActionEntries: number;
  readonly maxAbsoluteQ: number;
  readonly maxMeanAbsoluteTdError: number;
  readonly maxConsecutiveDivergentEpochs: number;
}

export type TearOfflineRlTrainingStatusV1 = "running" | "stopped-divergence" | "complete";

export interface TearOfflineRlQValueV1 {
  readonly stateHash: string;
  readonly actionHash: string;
  readonly value: number;
}

/** Content-addressed resume state for an offline-only fitted Q run. */
export interface TearOfflineRlCheckpointV1 {
  readonly format: "tear-offline-rl-checkpoint";
  readonly schemaVersion: 1;
  readonly inputHash: string;
  readonly epoch: number;
  readonly updates: number;
  readonly consecutiveDivergentEpochs: number;
  readonly status: TearOfflineRlTrainingStatusV1;
  readonly qValues: readonly TearOfflineRlQValueV1[];
  readonly metrics: Readonly<{ lastMeanAbsoluteTdError: number; maximumAbsoluteQ: number }>;
  readonly checkpointHash: string;
}

export interface TearOfflineRlTrainingResultV1 {
  readonly format: "tear-offline-rl-training";
  readonly schemaVersion: 1;
  readonly receipt: Readonly<{ receiptHash: string; planHash: string; rewardHash: string }>;
  readonly config: TearOfflineRlTrainingConfigV1;
  readonly disposition: "completed" | "stopped-divergence";
  readonly checkpoint: Readonly<{ checkpointHash: string; epoch: number; updates: number }>;
  readonly metrics: Readonly<{ lastMeanAbsoluteTdError: number; maximumAbsoluteQ: number; stateActionEntries: number }>;
  /** Present only after all planned bounded epochs completed without a guard trip. */
  readonly model?: Readonly<{ format: "tear-offline-tabular-q-model"; entries: readonly TearOfflineRlQValueV1[]; modelHash: string }>;
  readonly trainingHash: string;
}

function validTrainingConfig(value: TearOfflineRlTrainingConfigV1): boolean {
  return positiveInteger(value.epochs, 256) && finite(value.learningRate, 0.000_001, 1) && finite(value.gamma, 0, 1)
    && positiveInteger(value.maxStateActionEntries, 1_000_000) && finite(value.maxAbsoluteQ, 0.000_001, 1_000_000)
    && finite(value.maxMeanAbsoluteTdError, 0.000_001, 1_000_000) && positiveInteger(value.maxConsecutiveDivergentEpochs, 256);
}

function inputHash(receipt: TearOfflineRlTrajectoryReceiptV1, config: TearOfflineRlTrainingConfigV1): string {
  return stableVerificationHash({ receiptHash: receipt.receiptHash, planHash: receipt.plan.planHash, rewardHash: receipt.plan.rewardHash, config });
}

function qKey(stateHash: string, actionHash: string): string { return `${stateHash}:${actionHash}`; }
function orderedQValues(values: ReadonlyMap<string, TearOfflineRlQValueV1>): readonly TearOfflineRlQValueV1[] {
  return Object.freeze([...values.values()].sort((left, right) => left.stateHash.localeCompare(right.stateHash) || left.actionHash.localeCompare(right.actionHash))
    .map((entry) => Object.freeze({ ...entry })));
}
function receiptTransitions(receipt: TearOfflineRlTrajectoryReceiptV1): readonly TearOfflineRlTransitionV1[] {
  return Object.freeze([...receipt.trajectories].sort((left, right) => left.sequenceHash.localeCompare(right.sequenceHash)
    || left.from.tick - right.from.tick || left.transitionHash.localeCompare(right.transitionHash)));
}

/** Validates receipt integrity before it can become optimizer input or durable custody. */
export function parseTearOfflineRlTrajectoryReceipt(value: unknown): TearOfflineRlTrajectoryReceiptV1 {
  if (!record(value) || value.format !== "tear-offline-rl-trajectory-receipt" || value.schemaVersion !== 1 || !record(value.plan)
    || !text(value.plan.id) || !hash(value.plan.planHash) || !hash(value.plan.rewardHash) || !Array.isArray(value.trajectories)
    || value.trajectories.length < 1 || !record(value.metrics) || !hash(value.receiptHash)) {
    throw new TypeError("invalid offline RL trajectory receipt");
  }
  const typed = value as unknown as Omit<TearOfflineRlTrajectoryReceiptV1, "receiptHash"> & { receiptHash: string };
  const transitions = typed.trajectories;
  if (transitions.some((entry) => !hash(entry.transitionHash) || !hash(entry.scenarioHash) || !hash(entry.candidateHash)
    || !hash(entry.sequenceHash) || !text(entry.lessonId) || !Number.isSafeInteger(entry.from.tick) || !Number.isSafeInteger(entry.to.tick)
    || entry.to.tick !== entry.from.tick + 1 || !Number.isFinite(entry.reward.total) || !Array.isArray(entry.actions)
    || !Array.isArray(entry.nativeEvents) || !Array.isArray(entry.reward.components))) {
    throw new TypeError("invalid offline RL trajectory transition");
  }
  for (const entry of transitions) {
    const { transitionHash, ...draft } = entry;
    if (transitionHash !== stableVerificationHash(draft)) throw new TypeError("offline RL trajectory transition integrity mismatch");
  }
  const { receiptHash, ...draft } = typed;
  if (receiptHash !== stableVerificationHash(draft)) throw new TypeError("offline RL trajectory receipt integrity mismatch");
  return Object.freeze(structuredClone(typed));
}

function freezeCheckpoint(draft: Omit<TearOfflineRlCheckpointV1, "checkpointHash">): TearOfflineRlCheckpointV1 {
  if (!hash(draft.inputHash) || !Number.isSafeInteger(draft.epoch) || draft.epoch < 0 || !Number.isSafeInteger(draft.updates) || draft.updates < 0
    || !Number.isSafeInteger(draft.consecutiveDivergentEpochs) || draft.consecutiveDivergentEpochs < 0
    || !["running", "stopped-divergence", "complete"].includes(draft.status) || !Number.isFinite(draft.metrics.lastMeanAbsoluteTdError)
    || draft.metrics.lastMeanAbsoluteTdError < 0 || !Number.isFinite(draft.metrics.maximumAbsoluteQ) || draft.metrics.maximumAbsoluteQ < 0
    || draft.qValues.some((entry) => !hash(entry.stateHash) || !hash(entry.actionHash) || !Number.isFinite(entry.value))) {
    throw new TypeError("invalid offline RL checkpoint");
  }
  const values = orderedQValues(new Map(draft.qValues.map((entry) => [qKey(entry.stateHash, entry.actionHash), entry])));
  if (values.length !== draft.qValues.length) throw new TypeError("offline RL checkpoint repeats a state/action value");
  const value = { format: "tear-offline-rl-checkpoint" as const, schemaVersion: 1 as const, inputHash: draft.inputHash, epoch: draft.epoch,
    updates: draft.updates, consecutiveDivergentEpochs: draft.consecutiveDivergentEpochs, status: draft.status,
    qValues: values, metrics: Object.freeze({ ...draft.metrics }) };
  return Object.freeze({ ...value, checkpointHash: stableVerificationHash(value) });
}

function parseCheckpoint(value: unknown): TearOfflineRlCheckpointV1 {
  if (!record(value) || value.format !== "tear-offline-rl-checkpoint" || value.schemaVersion !== 1 || !hash(value.checkpointHash)
    || !Array.isArray(value.qValues) || !record(value.metrics)) throw new TypeError("invalid offline RL checkpoint");
  const typed = value as unknown as TearOfflineRlCheckpointV1, { checkpointHash, ...draft } = typed;
  const checkpoint = freezeCheckpoint(draft);
  if (checkpointHash !== checkpoint.checkpointHash) throw new TypeError("offline RL checkpoint integrity mismatch");
  return checkpoint;
}

function stateHash(state: CanonicalGameplayState): string { return stableVerificationHash(state); }
function actionHash(actions: readonly CommandEnvelope<GameAction>[]): string { return stableVerificationHash(actions); }
function initialValues(receipt: TearOfflineRlTrajectoryReceiptV1, maximum: number): Map<string, TearOfflineRlQValueV1> {
  const values = new Map<string, TearOfflineRlQValueV1>();
  for (const transition of receiptTransitions(receipt)) {
    const state = stateHash(transition.from), action = actionHash(transition.actions), key = qKey(state, action);
    if (!values.has(key)) values.set(key, Object.freeze({ stateHash: state, actionHash: action, value: 0 }));
    if (values.size > maximum) throw new RangeError("offline RL state/action budget exceeded");
  }
  return values;
}

function maximumQ(values: ReadonlyMap<string, TearOfflineRlQValueV1>, state: string): number {
  let maximum = 0;
  for (const value of values.values()) if (value.stateHash === state) maximum = Math.max(maximum, value.value);
  return maximum;
}

/** Starts a real, bounded fitted-Q run from a verified immutable C34 receipt. */
export function createTearOfflineRlCheckpoint(receiptInput: TearOfflineRlTrajectoryReceiptV1, config: TearOfflineRlTrainingConfigV1): TearOfflineRlCheckpointV1 {
  const receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput);
  if (!validTrainingConfig(config)) throw new TypeError("invalid offline RL training configuration");
  const values = initialValues(receipt, config.maxStateActionEntries);
  const draft = { format: "tear-offline-rl-checkpoint" as const, schemaVersion: 1 as const, inputHash: inputHash(receipt, config), epoch: 0,
    updates: 0, consecutiveDivergentEpochs: 0, status: "running" as const, qValues: orderedQValues(values),
    metrics: Object.freeze({ lastMeanAbsoluteTdError: 0, maximumAbsoluteQ: 0 }) };
  return freezeCheckpoint(draft);
}

/** Advances whole deterministic epochs; a divergence becomes a terminal stopped checkpoint, never a completed model. */
export function advanceTearOfflineRlCheckpoint(checkpointInput: TearOfflineRlCheckpointV1, receiptInput: TearOfflineRlTrajectoryReceiptV1,
  config: TearOfflineRlTrainingConfigV1, epochs: number): TearOfflineRlCheckpointV1 {
  const receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput), checkpoint = parseCheckpoint(checkpointInput);
  if (!validTrainingConfig(config) || !Number.isSafeInteger(epochs) || epochs < 0) throw new TypeError("invalid offline RL checkpoint advance");
  const initial = createTearOfflineRlCheckpoint(receipt, config);
  if (checkpoint.inputHash !== initial.inputHash || checkpoint.epoch > config.epochs || checkpoint.qValues.length > config.maxStateActionEntries) {
    throw new RangeError("offline RL checkpoint lineage is invalid");
  }
  if (checkpoint.status !== "running" || epochs === 0) return checkpoint;
  const values = new Map(checkpoint.qValues.map((entry) => [qKey(entry.stateHash, entry.actionHash), entry]));
  let epoch = checkpoint.epoch, updates = checkpoint.updates, divergent = checkpoint.consecutiveDivergentEpochs;
  let status: TearOfflineRlTrainingStatusV1 = "running";
  let lastMeanAbsoluteTdError = checkpoint.metrics.lastMeanAbsoluteTdError, maximumAbsoluteQ = checkpoint.metrics.maximumAbsoluteQ;
  const targetEpoch = Math.min(config.epochs, epoch + epochs);
  while (epoch < targetEpoch && status === "running") {
    let totalAbsoluteTdError = 0, epochUpdates = 0;
    for (const transition of receiptTransitions(receipt)) {
      const state = stateHash(transition.from), action = actionHash(transition.actions), key = qKey(state, action);
      const current = values.get(key);
      if (current === undefined) throw new Error("offline RL checkpoint lost a governed state/action value");
      const target = transition.reward.total + (transition.terminal ? 0 : config.gamma * maximumQ(values, stateHash(transition.to)));
      const tdError = target - current.value, next = current.value + config.learningRate * tdError;
      if (!Number.isFinite(next) || Math.abs(next) > config.maxAbsoluteQ) { status = "stopped-divergence"; break; }
      values.set(key, Object.freeze({ stateHash: state, actionHash: action, value: next }));
      totalAbsoluteTdError += Math.abs(tdError); epochUpdates += 1; updates += 1; maximumAbsoluteQ = Math.max(maximumAbsoluteQ, Math.abs(next));
    }
    if (status !== "running") break;
    lastMeanAbsoluteTdError = totalAbsoluteTdError / Math.max(1, epochUpdates);
    divergent = lastMeanAbsoluteTdError > config.maxMeanAbsoluteTdError ? divergent + 1 : 0;
    epoch += 1;
    if (divergent >= config.maxConsecutiveDivergentEpochs) status = "stopped-divergence";
  }
  if (status === "running" && epoch === config.epochs) status = "complete";
  return freezeCheckpoint({ format: "tear-offline-rl-checkpoint", schemaVersion: 1, inputHash: checkpoint.inputHash, epoch, updates,
    consecutiveDivergentEpochs: divergent, status, qValues: orderedQValues(values),
    metrics: Object.freeze({ lastMeanAbsoluteTdError, maximumAbsoluteQ }) });
}

/** Emits a result only for a complete or explicitly stopped lineage; it cannot create a C32 artifact. */
export function completeTearOfflineRlCheckpoint(checkpointInput: TearOfflineRlCheckpointV1, receiptInput: TearOfflineRlTrajectoryReceiptV1,
  config: TearOfflineRlTrainingConfigV1): TearOfflineRlTrainingResultV1 {
  const receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput), checkpoint = advanceTearOfflineRlCheckpoint(checkpointInput, receipt, config, 0);
  if (checkpoint.status === "running") throw new RangeError("offline RL checkpoint is incomplete");
  const disposition = checkpoint.status === "complete" ? "completed" as const : "stopped-divergence" as const;
  const metrics = Object.freeze({ lastMeanAbsoluteTdError: checkpoint.metrics.lastMeanAbsoluteTdError,
    maximumAbsoluteQ: checkpoint.metrics.maximumAbsoluteQ, stateActionEntries: checkpoint.qValues.length });
  const model = disposition === "completed" ? (() => {
    const entries = checkpoint.qValues, draft = { format: "tear-offline-tabular-q-model" as const, entries };
    return Object.freeze({ ...draft, modelHash: stableVerificationHash(draft) });
  })() : undefined;
  const draft = { format: "tear-offline-rl-training" as const, schemaVersion: 1 as const,
    receipt: Object.freeze({ receiptHash: receipt.receiptHash, planHash: receipt.plan.planHash, rewardHash: receipt.plan.rewardHash }),
    config: Object.freeze({ ...config }), disposition, checkpoint: Object.freeze({ checkpointHash: checkpoint.checkpointHash, epoch: checkpoint.epoch, updates: checkpoint.updates }),
    metrics, ...(model === undefined ? {} : { model }) };
  return Object.freeze({ ...draft, trainingHash: stableVerificationHash(draft) });
}

function parseTraining(value: unknown): TearOfflineRlTrainingResultV1 {
  if (!record(value) || value.format !== "tear-offline-rl-training" || value.schemaVersion !== 1 || !record(value.receipt) || !hash(value.receipt.receiptHash)
    || !hash(value.receipt.planHash) || !hash(value.receipt.rewardHash) || !record(value.config) || !validTrainingConfig(value.config as unknown as TearOfflineRlTrainingConfigV1)
    || !["completed", "stopped-divergence"].includes(String(value.disposition)) || !record(value.checkpoint) || !hash(value.checkpoint.checkpointHash)
    || !Number.isSafeInteger(value.checkpoint.epoch) || !Number.isSafeInteger(value.checkpoint.updates) || !record(value.metrics) || !hash(value.trainingHash)) {
    throw new TypeError("invalid offline RL training result");
  }
  const typed = value as unknown as Omit<TearOfflineRlTrainingResultV1, "trainingHash"> & { trainingHash: string };
  if (typed.disposition === "completed" && typed.model === undefined) throw new TypeError("completed offline RL result has no model");
  if (typed.disposition === "stopped-divergence" && typed.model !== undefined) throw new TypeError("stopped offline RL result cannot expose a model");
  const { trainingHash, ...draft } = typed;
  if (trainingHash !== stableVerificationHash(draft)) throw new TypeError("offline RL training integrity mismatch");
  return Object.freeze(structuredClone(typed));
}

/** Immutable local custody for trusted C34 receipt bytes. It has no policy-registry path. */
export class TearOfflineRlTrajectoryVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOfflineRlTrajectoryReceiptV1): Promise<TearOfflineRlTrajectoryReceiptV1> {
    const receipt = parseTearOfflineRlTrajectoryReceipt(input), key = `${TRAJECTORY_KEY}${receipt.receiptHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTearOfflineRlTrajectoryReceipt(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(receipt) },
      { store: "indexes", key: `offline-rl-trajectory:${receipt.plan.planHash}:${receipt.receiptHash}`, value: JSON.stringify({ rewardHash: receipt.plan.rewardHash }) }]));
    return receipt;
  }
  async get(receiptHash: string): Promise<TearOfflineRlTrajectoryReceiptV1 | undefined> {
    if (!hash(receiptHash)) throw new TypeError("offline RL trajectory receipt hash is invalid");
    const key = `${TRAJECTORY_KEY}${receiptHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parseTearOfflineRlTrajectoryReceipt(JSON.parse(raw)); }
    catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "offline-rl-trajectory-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }
}

/** Local custody for resumable C34 optimizer state. It cannot produce an active policy pointer. */
export class TearOfflineRlCheckpointVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOfflineRlCheckpointV1): Promise<TearOfflineRlCheckpointV1> {
    const checkpoint = parseCheckpoint(input), key = `${CHECKPOINT_KEY}${checkpoint.checkpointHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseCheckpoint(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(checkpoint) },
      { store: "indexes", key: `offline-rl-checkpoint:${checkpoint.inputHash}:${checkpoint.checkpointHash}`, value: JSON.stringify({ epoch: checkpoint.epoch, status: checkpoint.status }) }]));
    return checkpoint;
  }
  async get(checkpointHash: string): Promise<TearOfflineRlCheckpointV1 | undefined> {
    if (!hash(checkpointHash)) throw new TypeError("offline RL checkpoint hash is invalid");
    const key = `${CHECKPOINT_KEY}${checkpointHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parseCheckpoint(JSON.parse(raw)); }
    catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "offline-rl-checkpoint-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }
}

/** Durable final C34 training-result custody. It stores no C32 artifact and cannot activate a policy. */
export class TearOfflineRlTrainingVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOfflineRlTrainingResultV1): Promise<TearOfflineRlTrainingResultV1> {
    const training = parseTraining(input), key = `${TRAINING_KEY}${training.trainingHash}`, existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTraining(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(training) },
      { store: "indexes", key: `offline-rl-training:${training.receipt.receiptHash}:${training.trainingHash}`,
        value: JSON.stringify({ disposition: training.disposition, checkpointHash: training.checkpoint.checkpointHash }) }]));
    return training;
  }
  async get(trainingHash: string): Promise<TearOfflineRlTrainingResultV1 | undefined> {
    if (!hash(trainingHash)) throw new TypeError("offline RL training hash is invalid");
    const key = `${TRAINING_KEY}${trainingHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined;
    try { return parseTraining(JSON.parse(raw)); }
    catch (error) { await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "offline-rl-training-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) }))); return undefined; }
  }
}
