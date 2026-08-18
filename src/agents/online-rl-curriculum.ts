import type { GhostVaultBackend } from "../ghost";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import {
  parseTearOfflineRlPlan,
  parseTearOfflineRlTrajectoryReceipt,
  type TearOfflineRlPlanV1,
  type TearOfflineRlTrainingResultV1,
  type TearOfflineRlTrajectoryReceiptV1,
} from "./offline-rl-training";
import {
  createTearOnlineRlRolloutPlan,
  TearOnlineRlHeadlessExecutor,
  type TearOnlineRlRolloutControl,
  type TearOnlineRlRolloutPlanV1,
  type TearOnlineRlRolloutReceiptV1,
} from "./online-rl-headless-executor";

const KEY = "online-rl-curriculum:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type StopStatus = "cancelled" | "timed-out" | "stopped-divergence" | "stopped-budget";

export interface TearOnlineRlCurriculumStageV1 {
  readonly id: string;
  readonly lessonId: string;
  /** Complete C30 source scenarios, never synthetic state or an opponent slot. */
  readonly scenarios: readonly TearScenarioV1[];
  readonly episodeBudget: number;
}
export interface TearOnlineRlCurriculumPlanV1 {
  readonly format: "tear-online-rl-curriculum-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly offline: Readonly<{ planHash: string; receiptHash: string; rewardHash: string; trainingHash: string }>;
  /** Frozen, normalized semantic commands extracted from the governed receipt. */
  readonly actionVocabulary: readonly GameAction[];
  readonly stages: readonly TearOnlineRlCurriculumStageV1[];
  readonly exploration: Readonly<{ seed: number; initialNumerator: number; minimumNumerator: number; denominator: number; decrementEveryEpisodes: number; decrementBy: number }>;
  readonly budgets: Readonly<{ maxEpisodes: number; maxTicksPerEpisode: number; maxTotalTicks: number; maxTotalDecisions: number; maxTotalAbsoluteReward: number }>;
  readonly planHash: string;
}
export interface TearOnlineRlCurriculumResultV1 {
  readonly format: "tear-online-rl-curriculum-result";
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly status: "complete" | StopStatus;
  readonly episodes: readonly Readonly<{ stageId: string; scenarioHash: string; epsilonNumerator: number; rolloutReceiptHash: string; status: TearOnlineRlRolloutReceiptV1["status"]; ticks: number; decisions: number; rewardTotal: number }>[];
  readonly totals: Readonly<{ ticks: number; decisions: number; absoluteReward: number }>;
  /** This is evidence only: it never updates, registers, activates, or promotes a policy. */
  readonly trainable: false;
  readonly resultHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positive(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= maximum; }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }

function vocabulary(receipt: TearOfflineRlTrajectoryReceiptV1): readonly GameAction[] {
  const byHash = new Map<string, GameAction>();
  for (const transition of receipt.trajectories) for (const envelope of transition.actions) {
    const normalized = normalizeGameAction(envelope.command);
    if (!normalized.ok) throw new RangeError(`governed action vocabulary is invalid: ${normalized.reason}`);
    byHash.set(stableVerificationHash(normalized.action), normalized.action);
  }
  const actions = [...byHash.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, action]) => action);
  if (actions.length < 1 || actions.length > 16) throw new RangeError("governed action vocabulary must contain one to sixteen actions");
  return Object.freeze(actions.map(freeze));
}
function canonicalVocabulary(actions: readonly unknown[]): readonly GameAction[] {
  const hashes = new Set<string>();
  const output: GameAction[] = [];
  for (const candidate of actions) {
    const normalized = normalizeGameAction(candidate);
    if (!normalized.ok || stableVerificationHash(candidate) !== stableVerificationHash(normalized.action)) {
      throw new TypeError("curriculum action vocabulary must contain canonical normalized actions");
    }
    const actionHash = stableVerificationHash(normalized.action);
    if (hashes.has(actionHash)) throw new TypeError("curriculum action vocabulary contains a duplicate semantic action");
    hashes.add(actionHash); output.push(normalized.action);
  }
  return Object.freeze(output.map(freeze));
}

function freezePlan(draft: Omit<TearOnlineRlCurriculumPlanV1, "planHash">): TearOnlineRlCurriculumPlanV1 {
  if (!text(draft.id) || !record(draft.offline) || !hash(draft.offline.planHash) || !hash(draft.offline.receiptHash) || !hash(draft.offline.rewardHash) || !hash(draft.offline.trainingHash)
    || draft.actionVocabulary.length < 1 || draft.actionVocabulary.length > 16 || draft.stages.length < 1 || draft.stages.length > 32
    || !Number.isSafeInteger(draft.exploration.seed) || draft.exploration.seed < 0 || !positive(draft.exploration.denominator, 1_000_000)
    || !Number.isSafeInteger(draft.exploration.initialNumerator) || !Number.isSafeInteger(draft.exploration.minimumNumerator)
    || draft.exploration.minimumNumerator < 0 || draft.exploration.initialNumerator < draft.exploration.minimumNumerator || draft.exploration.initialNumerator > draft.exploration.denominator
    || !positive(draft.exploration.decrementEveryEpisodes, 10_000) || !positive(draft.exploration.decrementBy, draft.exploration.denominator)
    || !positive(draft.budgets.maxEpisodes, 10_000) || !positive(draft.budgets.maxTicksPerEpisode, 20_000)
    || !positive(draft.budgets.maxTotalTicks, 1_000_000) || !positive(draft.budgets.maxTotalDecisions, 1_000_000)
    || !Number.isFinite(draft.budgets.maxTotalAbsoluteReward) || draft.budgets.maxTotalAbsoluteReward <= 0) throw new TypeError("invalid online RL curriculum plan");
  const actions = canonicalVocabulary(draft.actionVocabulary), ids = new Set<string>(), scenarioIds = new Set<string>(); let episodes = 0;
  for (const stage of draft.stages) {
    if (!text(stage.id) || !text(stage.lessonId) || ids.has(stage.id) || !positive(stage.episodeBudget, 1_000)
      || stage.scenarios.length < 1 || stage.scenarios.length > 32) throw new TypeError("invalid online RL curriculum stage");
    ids.add(stage.id); episodes += stage.episodeBudget;
    for (const scenario of stage.scenarios) { const id = scenarioHash(scenario); if (scenarioIds.has(id)) throw new RangeError("curriculum source scenarios must be unique"); scenarioIds.add(id); }
  }
  if (episodes > draft.budgets.maxEpisodes) throw new RangeError("curriculum episode budget exceeds global bound");
  const worstCaseDecisions = episodes * draft.budgets.maxTicksPerEpisode;
  if (worstCaseDecisions > draft.budgets.maxTotalTicks || worstCaseDecisions > draft.budgets.maxTotalDecisions) {
    throw new RangeError("curriculum global tick or decision budget cannot cover every declared episode");
  }
  const value = Object.freeze({ ...draft, offline: Object.freeze({ ...draft.offline }), actionVocabulary: actions,
    stages: Object.freeze(draft.stages.map((stage) => Object.freeze({ ...stage, scenarios: Object.freeze(stage.scenarios.map(freeze)) }))), exploration: Object.freeze({ ...draft.exploration }), budgets: Object.freeze({ ...draft.budgets }) });
  return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}

/** Creates a bounded C30 curriculum from the same immutable C31 source as offline RL. */
export function createTearOnlineRlCurriculumPlan(dataset: TearAcademyTrainingDatasetV1, offlineInput: TearOfflineRlPlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1,
  input: Omit<TearOnlineRlCurriculumPlanV1, "format" | "schemaVersion" | "planHash" | "offline" | "actionVocabulary"> & Readonly<{ trainingHash: string }>): TearOnlineRlCurriculumPlanV1 {
  const offline = parseTearOfflineRlPlan(offlineInput), receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput);
  if (!hash(input.trainingHash) || offline.dataset.datasetHash !== dataset.datasetHash || receipt.plan.planHash !== offline.planHash || receipt.plan.rewardHash !== offline.reward.rewardHash) throw new RangeError("curriculum lineage is unavailable or changed");
  const governed = new Map(dataset.sequences.filter((sequence) => sequence.split === "training" && sequence.sourceScenario !== undefined)
    .map((sequence) => [scenarioHash(sequence.sourceScenario ?? (() => { throw new Error("curriculum source scenario disappeared"); })()), sequence]));
  if (governed.size !== offline.environment.scenarioHashes.length) throw new RangeError("curriculum source scenarios no longer match the offline plan");
  for (const stage of input.stages) for (const scenario of stage.scenarios) {
    const sequence = governed.get(scenarioHash(scenario));
    if (sequence?.lessonId !== stage.lessonId || !offline.environment.scenarioHashes.includes(scenarioHash(scenario))) {
      throw new RangeError("curriculum stage must use its governed C30 training scenario and lesson");
    }
  }
  return freezePlan({ format: "tear-online-rl-curriculum-plan", schemaVersion: 1, id: input.id,
    offline: { planHash: offline.planHash, receiptHash: receipt.receiptHash, rewardHash: offline.reward.rewardHash, trainingHash: input.trainingHash },
    actionVocabulary: vocabulary(receipt), stages: input.stages, exploration: input.exploration, budgets: input.budgets });
}

export function parseTearOnlineRlCurriculumPlan(value: unknown): TearOnlineRlCurriculumPlanV1 {
  if (!record(value) || value.format !== "tear-online-rl-curriculum-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid online RL curriculum plan");
  const typed = value as unknown as TearOnlineRlCurriculumPlanV1, { planHash, ...draft } = typed, parsed = freezePlan(draft);
  if (planHash !== parsed.planHash) throw new TypeError("online RL curriculum plan integrity mismatch"); return parsed;
}

function epsilon(plan: TearOnlineRlCurriculumPlanV1, episode: number): number {
  return Math.max(plan.exploration.minimumNumerator, plan.exploration.initialNumerator - Math.floor(episode / plan.exploration.decrementEveryEpisodes) * plan.exploration.decrementBy);
}
export interface TearOnlineRlCurriculumEpisodeV1 { readonly stageId: string; readonly epsilonNumerator: number; readonly rollout: TearOnlineRlRolloutPlanV1; }
/** Deterministic stage order and epsilon decay. Callers cannot inject an ungoverned action. */
export function compileTearOnlineRlCurriculum(planInput: TearOnlineRlCurriculumPlanV1): readonly TearOnlineRlCurriculumEpisodeV1[] {
  const plan = parseTearOnlineRlCurriculumPlan(planInput), output: TearOnlineRlCurriculumEpisodeV1[] = []; let ordinal = 0;
  for (const stage of plan.stages) for (let index = 0; index < stage.episodeBudget; index += 1) {
    const remainingTicks = plan.budgets.maxTotalTicks - ordinal * plan.budgets.maxTicksPerEpisode;
    const remainingDecisions = plan.budgets.maxTotalDecisions - ordinal * plan.budgets.maxTicksPerEpisode;
    if (remainingTicks < 1 || remainingDecisions < 1) break;
    const maxTicks = Math.min(plan.budgets.maxTicksPerEpisode, remainingTicks, remainingDecisions);
    const scenario = stage.scenarios[index % stage.scenarios.length];
    if (scenario === undefined) throw new Error("curriculum scenario disappeared");
    output.push(Object.freeze({ stageId: stage.id, epsilonNumerator: epsilon(plan, ordinal), rollout: createTearOnlineRlRolloutPlan({ id: `${plan.id}:episode-${String(ordinal)}`, offline: plan.offline, scenarios: [scenario], exploration: { seed: (plan.exploration.seed + ordinal) >>> 0, numerator: epsilon(plan, ordinal), denominator: plan.exploration.denominator, actions: plan.actionVocabulary }, budgets: { maxTicksPerEpisode: maxTicks, maxTotalTicks: maxTicks, maxTotalAbsoluteReward: plan.budgets.maxTotalAbsoluteReward } }) }));
    ordinal += 1;
  }
  return Object.freeze(output);
}

function result(draft: Omit<TearOnlineRlCurriculumResultV1, "resultHash">): TearOnlineRlCurriculumResultV1 { const value = Object.freeze({ ...draft, episodes: Object.freeze(draft.episodes.map(freeze)), totals: Object.freeze({ ...draft.totals }) }); return Object.freeze({ ...value, resultHash: stableVerificationHash(value) }); }
export class TearOnlineRlCurriculumVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(value: TearOnlineRlCurriculumResultV1): Promise<TearOnlineRlCurriculumResultV1> { const key = `${KEY}${value.resultHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearOnlineRlCurriculumResultV1; await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }, { store: "indexes", key: `online-rl-curriculum:${value.planHash}:${value.resultHash}`, value: JSON.stringify({ status: value.status, trainable: false }) }])); return value; }
}

/** Runs compiled episodes through the existing C30 executor; it has no model-selection or update path. */
export class TearOnlineRlCurriculumExecutor {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async execute(planInput: TearOnlineRlCurriculumPlanV1, offline: TearOfflineRlPlanV1, receipt: TearOfflineRlTrajectoryReceiptV1, training: TearOfflineRlTrainingResultV1, control: TearOnlineRlRolloutControl = {}): Promise<TearOnlineRlCurriculumResultV1> {
    const plan = parseTearOnlineRlCurriculumPlan(planInput);
    if (plan.offline.trainingHash !== training.trainingHash || plan.offline.planHash !== offline.planHash || plan.offline.receiptHash !== receipt.receiptHash) throw new RangeError("curriculum lineage is unavailable or changed");
    const episodes: TearOnlineRlCurriculumResultV1["episodes"][number][] = []; let ticks = 0, decisions = 0, absoluteReward = 0, status: TearOnlineRlCurriculumResultV1["status"] = "complete";
    const compiledEpisodes = compileTearOnlineRlCurriculum(plan);
    for (let index = 0; index < compiledEpisodes.length; index += 1) {
      const compiled = compiledEpisodes[index];
      if (compiled === undefined) throw new Error("compiled curriculum episode disappeared");
      const rollout = await new TearOnlineRlHeadlessExecutor(this.#backend).execute(compiled.rollout, offline, receipt, training, control);
      const episode = rollout.episodes[0]; if (episode === undefined) throw new Error("online RL rollout retained no episode");
      ticks += episode.ticks; decisions += episode.actions.length; absoluteReward += Math.abs(episode.rewardTotal);
      episodes.push(Object.freeze({ stageId: compiled.stageId, scenarioHash: episode.scenarioHash, epsilonNumerator: compiled.epsilonNumerator, rolloutReceiptHash: rollout.receiptHash, status: rollout.status, ticks: episode.ticks, decisions: episode.actions.length, rewardTotal: episode.rewardTotal }));
      if (rollout.status !== "complete") {
        status = rollout.status === "cancelled" || rollout.status === "timed-out" || rollout.status === "stopped-divergence"
          ? rollout.status
          : "stopped-divergence";
        break;
      }
      if (absoluteReward > plan.budgets.maxTotalAbsoluteReward || ((ticks >= plan.budgets.maxTotalTicks || decisions >= plan.budgets.maxTotalDecisions) && index < compiledEpisodes.length - 1)) { status = "stopped-budget"; break; }
    }
    return new TearOnlineRlCurriculumVault(this.#backend).persist(result({ format: "tear-online-rl-curriculum-result", schemaVersion: 1, planHash: plan.planHash, status, episodes, totals: { ticks, decisions, absoluteReward }, trainable: false }));
  }
}
