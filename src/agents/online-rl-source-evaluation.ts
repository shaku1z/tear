import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import {
  evaluateTearOfflineRlRewardTransition,
  parseTearOfflineRlPlan,
  TearOfflineRlTrainingVault,
  type TearOfflineRlPlanV1,
  type TearOfflineRlQValueV1,
  type TearOfflineRlTrajectoryReceiptV1,
  type TearOfflineRlTrainingResultV1,
} from "./offline-rl-training";
import { compileTearOnlineRlCurriculum, parseTearOnlineRlCurriculumPlan, type TearOnlineRlCurriculumPlanV1 } from "./online-rl-curriculum";
import { parseTearOnlineRlCheckpoint, selectTearOnlineRlAction, type TearOnlineRlCheckpointV1 } from "./online-rl-training";

const KEY = "online-rl-source-evaluation:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type Side = "baseline" | "challenger";

export interface TearOnlineRlSourceEvaluationPlanV1 {
  readonly format: "tear-online-rl-source-evaluation-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  /** Both models and every case are frozen before a fresh C30 world starts. */
  readonly lineage: Readonly<{ curriculumPlanHash: string; offlinePlanHash: string; receiptHash: string; baselineTrainingHash: string; challengerCheckpointHash: string }>;
  readonly cases: readonly { scenario: TearScenarioV1; scenarioHash: string; epsilonSeed: number }[];
  readonly thresholds: Readonly<{ minimumRewardGain: number; requireCompletionRateNotLower: boolean; maxTicksPerCase: number; maxAbsoluteRewardPerCase: number }>;
  readonly planHash: string;
}
export interface TearOnlineRlSourceEvaluationTraceV1 {
  readonly side: Side; readonly scenarioHash: string; readonly ticks: number; readonly rewardTotal: number;
  readonly terminal: Readonly<{ semanticHash: string; terminated: boolean; truncated: boolean }>;
  /** Semantic action batches retain model-decision provenance; envelope IDs never select Q values. */
  readonly actions: readonly { semanticActionHash: string; source: "epsilon" | "q" | "fallback"; actions: readonly GameAction[] }[];
  readonly eventHash: string;
}
export interface TearOnlineRlSourceEvaluationResultV1 {
  readonly format: "tear-online-rl-source-evaluation"; readonly schemaVersion: 1; readonly planHash: string;
  readonly baselineTrainingHash: string; readonly challengerCheckpointHash: string;
  readonly traces: readonly TearOnlineRlSourceEvaluationTraceV1[];
  readonly metrics: Readonly<{ baselineReward: number; challengerReward: number; baselineCompletions: number; challengerCompletions: number; passed: boolean }>;
  /** A pass is only retained evaluation evidence. This module cannot promote or activate anything. */
  readonly promotional: false; readonly resultHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positive(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum; }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function seeded(seed: number): () => number { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4_294_967_296; }; }

function freezePlan(draft: Omit<TearOnlineRlSourceEvaluationPlanV1, "planHash">): TearOnlineRlSourceEvaluationPlanV1 {
  if (!text(draft.id) || !record(draft.lineage) || !hash(draft.lineage.curriculumPlanHash) || !hash(draft.lineage.offlinePlanHash) || !hash(draft.lineage.receiptHash) || !hash(draft.lineage.baselineTrainingHash) || !hash(draft.lineage.challengerCheckpointHash)
    || draft.cases.length < 1 || draft.cases.length > 256 || !Number.isFinite(draft.thresholds.minimumRewardGain) || draft.thresholds.minimumRewardGain < 0
    || typeof draft.thresholds.requireCompletionRateNotLower !== "boolean" || !positive(draft.thresholds.maxTicksPerCase, 20_000) || !Number.isFinite(draft.thresholds.maxAbsoluteRewardPerCase) || draft.thresholds.maxAbsoluteRewardPerCase <= 0) throw new TypeError("invalid online RL source evaluation plan");
  const ids = new Set<string>();
  for (const entry of draft.cases) {
    if (!hash(entry.scenarioHash) || entry.scenarioHash !== scenarioHash(entry.scenario) || !Number.isSafeInteger(entry.epsilonSeed) || entry.epsilonSeed < 0 || ids.has(`${entry.scenarioHash}:${String(entry.epsilonSeed)}`)) throw new TypeError("invalid online RL source evaluation case");
    ids.add(`${entry.scenarioHash}:${String(entry.epsilonSeed)}`);
  }
  const value = Object.freeze({ ...draft, lineage: Object.freeze({ ...draft.lineage }), cases: Object.freeze(draft.cases.map(freeze)), thresholds: Object.freeze({ ...draft.thresholds }) });
  return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}

/** Derives the complete paired case list from the immutable curriculum; callers cannot cherry-pick a winner. */
export function createTearOnlineRlSourceEvaluationPlan(curriculumInput: TearOnlineRlCurriculumPlanV1, offlineInput: TearOfflineRlPlanV1, receipt: TearOfflineRlTrajectoryReceiptV1, baseline: TearOfflineRlTrainingResultV1, challengerInput: TearOnlineRlCheckpointV1, input: Readonly<{ id: string; thresholds: TearOnlineRlSourceEvaluationPlanV1["thresholds"] }>): TearOnlineRlSourceEvaluationPlanV1 {
  const curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), offline = parseTearOfflineRlPlan(offlineInput), challenger = parseTearOnlineRlCheckpoint(challengerInput);
  if (baseline.disposition !== "completed" || baseline.model?.format !== "tear-offline-tabular-q-model-v2" || challenger.status !== "complete" || curriculum.offline.planHash !== offline.planHash || curriculum.offline.receiptHash !== receipt.receiptHash || curriculum.offline.trainingHash !== baseline.trainingHash || challenger.input.curriculumPlanHash !== curriculum.planHash || challenger.input.offlinePlanHash !== offline.planHash || challenger.input.receiptHash !== receipt.receiptHash || challenger.input.trainingHash !== baseline.trainingHash) throw new RangeError("source evaluation lineage is unavailable or incomplete");
  const cases = compileTearOnlineRlCurriculum(curriculum).map((entry, index) => { const scenario = entry.rollout.scenarios[0]; if (scenario === undefined) throw new Error("compiled curriculum scenario disappeared"); return Object.freeze({ scenario, scenarioHash: scenarioHash(scenario), epsilonSeed: (curriculum.exploration.seed + index) >>> 0 }); });
  return freezePlan({ format: "tear-online-rl-source-evaluation-plan", schemaVersion: 1, id: input.id, lineage: { curriculumPlanHash: curriculum.planHash, offlinePlanHash: offline.planHash, receiptHash: receipt.receiptHash, baselineTrainingHash: baseline.trainingHash, challengerCheckpointHash: challenger.checkpointHash }, cases, thresholds: input.thresholds });
}
export function parseTearOnlineRlSourceEvaluationPlan(value: unknown): TearOnlineRlSourceEvaluationPlanV1 { if (!record(value) || value.format !== "tear-online-rl-source-evaluation-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid online RL source evaluation plan"); const typed = value as unknown as TearOnlineRlSourceEvaluationPlanV1, { planHash, ...draft } = typed, parsed = freezePlan(draft); if (planHash !== parsed.planHash) throw new TypeError("online RL source evaluation plan integrity mismatch"); return parsed; }

function runCase(side: Side, values: readonly TearOfflineRlQValueV1[], plan: TearOnlineRlSourceEvaluationPlanV1, curriculum: TearOnlineRlCurriculumPlanV1, offline: TearOfflineRlPlanV1, entry: TearOnlineRlSourceEvaluationPlanV1["cases"][number]): TearOnlineRlSourceEvaluationTraceV1 {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }); const actions: TearOnlineRlSourceEvaluationTraceV1["actions"][number][] = []; let rewardTotal = 0, eventCursor = 0;
  try {
    let current: CanonicalGameplayState = environment.reset(entry.scenario);
    while (current.tick < Math.min(entry.scenario.maxTicks, plan.thresholds.maxTicksPerCase)) {
      const selection = selectTearOnlineRlAction(values, current, curriculum.actionVocabulary, environment.policyObservation().availableActions, 0, 1, seeded(entry.epsilonSeed + current.tick));
      if (selection === undefined) throw new RangeError("source evaluation has no governed available action");
      const transition = environment.step(selection.actions), tracks = environment.sourceTracks(), events = tracks.nativeEvents.slice(eventCursor); eventCursor = tracks.nativeEvents.length;
      rewardTotal += evaluateTearOfflineRlRewardTransition(offline, current, transition.observation, events).total;
      if (!Number.isFinite(rewardTotal) || Math.abs(rewardTotal) > plan.thresholds.maxAbsoluteRewardPerCase) throw new RangeError("source evaluation reward guard stopped case");
      actions.push(Object.freeze({ semanticActionHash: selection.semanticActionHash, source: selection.source, actions: Object.freeze(selection.actions.map(freeze)) })); current = transition.observation;
      if (transition.terminated || transition.truncated) break;
    }
    const tracks = environment.sourceTracks();
    return Object.freeze({ side, scenarioHash: entry.scenarioHash, ticks: current.tick, rewardTotal, terminal: Object.freeze({ semanticHash: stableVerificationHash(current), terminated: tracks.nativeEvents.some((event) => event.kind === "run" && (event.transition === "completed" || event.transition === "defeated")), truncated: current.tick >= Math.min(entry.scenario.maxTicks, plan.thresholds.maxTicksPerCase) }), actions: Object.freeze(actions), eventHash: stableVerificationHash(tracks.nativeEvents) });
  } finally { environment.dispose(); }
}
function result(draft: Omit<TearOnlineRlSourceEvaluationResultV1, "resultHash">): TearOnlineRlSourceEvaluationResultV1 { const value = Object.freeze({ ...draft, traces: Object.freeze(draft.traces.map(freeze)), metrics: Object.freeze({ ...draft.metrics }) }); return Object.freeze({ ...value, resultHash: stableVerificationHash(value) }); }

/** Runs baseline and retained challenger over the same freshly reset C30 cases. It has no registry or promotion dependency. */
export class TearOnlineRlSourceEvaluationExecutor {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async execute(planInput: TearOnlineRlSourceEvaluationPlanV1, curriculumInput: TearOnlineRlCurriculumPlanV1, offlineInput: TearOfflineRlPlanV1, receipt: TearOfflineRlTrajectoryReceiptV1, challengerInput: TearOnlineRlCheckpointV1): Promise<TearOnlineRlSourceEvaluationResultV1> {
    const plan = parseTearOnlineRlSourceEvaluationPlan(planInput), curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), offline = parseTearOfflineRlPlan(offlineInput), challenger = parseTearOnlineRlCheckpoint(challengerInput), baseline = await new TearOfflineRlTrainingVault(this.#backend).get(plan.lineage.baselineTrainingHash);
    if (baseline?.model === undefined || baseline.trainingHash !== plan.lineage.baselineTrainingHash || challenger.status !== "complete" || plan.lineage.curriculumPlanHash !== curriculum.planHash || plan.lineage.offlinePlanHash !== offline.planHash || plan.lineage.receiptHash !== receipt.receiptHash || plan.lineage.challengerCheckpointHash !== challenger.checkpointHash || challenger.input.trainingHash !== baseline.trainingHash) throw new RangeError("source evaluation custody or lineage is unavailable or changed");
    const traces: TearOnlineRlSourceEvaluationTraceV1[] = [];
    for (const entry of plan.cases) { traces.push(runCase("baseline", baseline.model.entries, plan, curriculum, offline, entry)); traces.push(runCase("challenger", challenger.qValues, plan, curriculum, offline, entry)); }
    const baselineTraces = traces.filter((entry) => entry.side === "baseline"), challengerTraces = traces.filter((entry) => entry.side === "challenger"), baselineReward = baselineTraces.reduce((total, entry) => total + entry.rewardTotal, 0), challengerReward = challengerTraces.reduce((total, entry) => total + entry.rewardTotal, 0), baselineCompletions = baselineTraces.filter((entry) => entry.terminal.terminated).length, challengerCompletions = challengerTraces.filter((entry) => entry.terminal.terminated).length;
    const passed = challengerReward >= baselineReward + plan.thresholds.minimumRewardGain && (!plan.thresholds.requireCompletionRateNotLower || challengerCompletions >= baselineCompletions);
    return new TearOnlineRlSourceEvaluationVault(this.#backend).persist(result({ format: "tear-online-rl-source-evaluation", schemaVersion: 1, planHash: plan.planHash, baselineTrainingHash: baseline.trainingHash, challengerCheckpointHash: challenger.checkpointHash, traces, metrics: { baselineReward, challengerReward, baselineCompletions, challengerCompletions, passed }, promotional: false }));
  }
}
export class TearOnlineRlSourceEvaluationVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; } async persist(value: TearOnlineRlSourceEvaluationResultV1): Promise<TearOnlineRlSourceEvaluationResultV1> { const key = `${KEY}${value.resultHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearOnlineRlSourceEvaluationResultV1; await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }, { store: "indexes", key: `online-rl-source-evaluation:${value.planHash}:${value.resultHash}`, value: JSON.stringify({ passed: value.metrics.passed, promotional: false }) }])); return value; } }
