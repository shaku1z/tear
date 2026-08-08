import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import {
  evaluateTearOfflineRlRewardTransition,
  parseTearOfflineRlPlan,
  parseTearOfflineRlTrajectoryReceipt,
  TearOfflineRlTrainingVault,
  type TearOfflineRlPlanV1,
  type TearOfflineRlTrainingResultV1,
  type TearOfflineRlTrajectoryReceiptV1,
} from "./offline-rl-training";

const KEY = "online-rl-rollout:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type Status = "terminated" | "truncated" | "cancelled" | "timed-out" | "stopped-divergence";

export interface TearOnlineRlRolloutPlanV1 {
  readonly format: "tear-online-rl-rollout-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly offline: Readonly<{ planHash: string; receiptHash: string; rewardHash: string; trainingHash: string }>;
  readonly scenarios: readonly TearScenarioV1[];
  readonly exploration: Readonly<{ seed: number; numerator: number; denominator: number; actions: readonly GameAction[] }>;
  readonly budgets: Readonly<{ maxTicksPerEpisode: number; maxTotalTicks: number; maxTotalAbsoluteReward: number }>;
  readonly planHash: string;
}
export interface TearOnlineRlRolloutControl { readonly isCancelled?: () => boolean; readonly now?: () => number; readonly timeoutMilliseconds?: number; }
export interface TearOnlineRlEpisodeReceiptV1 {
  readonly scenarioHash: string; readonly status: Status; readonly ticks: number; readonly semanticHash: string;
  readonly actions: readonly (readonly GameAction[])[]; readonly rewardTotal: number; readonly eventHash: string;
}
export interface TearOnlineRlRolloutReceiptV1 {
  readonly format: "tear-online-rl-rollout"; readonly schemaVersion: 1; readonly planHash: string;
  readonly trainingHash: string; readonly episodes: readonly TearOnlineRlEpisodeReceiptV1[]; readonly status: Status | "complete";
  readonly trainable: false; readonly receiptHash: string;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positive(value: unknown, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max; }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }
function freezePlan(draft: Omit<TearOnlineRlRolloutPlanV1, "planHash">): TearOnlineRlRolloutPlanV1 {
  if (!text(draft.id) || !record(draft.offline) || !hash(draft.offline.planHash) || !hash(draft.offline.receiptHash) || !hash(draft.offline.rewardHash) || !hash(draft.offline.trainingHash)
    || draft.scenarios.length < 1 || draft.scenarios.length > 32 || new Set(draft.scenarios.map(scenarioHash)).size !== draft.scenarios.length
    || !Number.isSafeInteger(draft.exploration.seed) || draft.exploration.seed < 0 || !positive(draft.exploration.denominator, 1_000_000)
    || !Number.isSafeInteger(draft.exploration.numerator) || draft.exploration.numerator < 0 || draft.exploration.numerator > draft.exploration.denominator
    || draft.exploration.actions.length < 1 || draft.exploration.actions.length > 16 || !positive(draft.budgets.maxTicksPerEpisode, 20_000)
    || !positive(draft.budgets.maxTotalTicks, 1_000_000) || draft.budgets.maxTotalTicks < draft.budgets.maxTicksPerEpisode || !Number.isFinite(draft.budgets.maxTotalAbsoluteReward) || draft.budgets.maxTotalAbsoluteReward <= 0) throw new TypeError("invalid online RL rollout plan");
  const value = Object.freeze({ ...draft, offline: Object.freeze({ ...draft.offline }), scenarios: Object.freeze(draft.scenarios.map((scenario) => Object.freeze(structuredClone(scenario)))),
    exploration: Object.freeze({ ...draft.exploration, actions: Object.freeze(draft.exploration.actions.map((action) => Object.freeze(structuredClone(action)))) }), budgets: Object.freeze({ ...draft.budgets }) });
  return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}
export function createTearOnlineRlRolloutPlan(input: Omit<TearOnlineRlRolloutPlanV1, "format" | "schemaVersion" | "planHash">): TearOnlineRlRolloutPlanV1 { return freezePlan({ format: "tear-online-rl-rollout-plan", schemaVersion: 1, ...input }); }
export function parseTearOnlineRlRolloutPlan(value: unknown): TearOnlineRlRolloutPlanV1 {
  if (!record(value) || value.format !== "tear-online-rl-rollout-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid online RL rollout plan");
  const typed = value as unknown as TearOnlineRlRolloutPlanV1, { planHash, ...draft } = typed, parsed = freezePlan(draft);
  if (planHash !== parsed.planHash) throw new TypeError("online RL rollout plan integrity mismatch"); return parsed;
}
function random(seed: number): () => number { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4_294_967_296; }; }
function immutableEpisode(value: TearOnlineRlEpisodeReceiptV1): TearOnlineRlEpisodeReceiptV1 { return Object.freeze({ ...value, actions: Object.freeze(value.actions.map((batch) => Object.freeze(batch.map((action) => Object.freeze(structuredClone(action)))))) }); }
function result(draft: Omit<TearOnlineRlRolloutReceiptV1, "receiptHash">): TearOnlineRlRolloutReceiptV1 { const value = Object.freeze({ ...draft, episodes: Object.freeze(draft.episodes.map(immutableEpisode)) }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) }); }
export class TearOnlineRlRolloutVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(input: TearOnlineRlRolloutReceiptV1): Promise<TearOnlineRlRolloutReceiptV1> { const key = `${KEY}${input.receiptHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearOnlineRlRolloutReceiptV1; await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(input) }, { store: "indexes", key: `online-rl-rollout:${input.planHash}:${input.receiptHash}`, value: JSON.stringify({ trainingHash: input.trainingHash, status: input.status, trainable: false }) }])); return input; }
}
/** Executes only fresh C30 worlds. It records exploration; it does not update, register, activate, or promote a policy. */
export class TearOnlineRlHeadlessExecutor {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async execute(planInput: TearOnlineRlRolloutPlanV1, offlineInput: TearOfflineRlPlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1, trainingInput: TearOfflineRlTrainingResultV1, control: TearOnlineRlRolloutControl = {}): Promise<TearOnlineRlRolloutReceiptV1> {
    const plan = parseTearOnlineRlRolloutPlan(planInput), offline = parseTearOfflineRlPlan(offlineInput), receipt = parseTearOfflineRlTrajectoryReceipt(receiptInput);
    const training = await new TearOfflineRlTrainingVault(this.#backend).get(trainingInput.trainingHash);
    if (training?.trainingHash !== trainingInput.trainingHash || training.disposition !== "completed" || training.model === undefined
      || plan.offline.planHash !== offline.planHash || plan.offline.receiptHash !== receipt.receiptHash || plan.offline.rewardHash !== offline.reward.rewardHash || plan.offline.trainingHash !== training.trainingHash
      || training.receipt.planHash !== offline.planHash || training.receipt.receiptHash !== receipt.receiptHash) throw new RangeError("online RL rollout lineage is unavailable or changed");
    const now = control.now ?? (() => performance.now()), started = now(), rng = random(plan.exploration.seed), episodes: TearOnlineRlEpisodeReceiptV1[] = []; let totalTicks = 0, status: TearOnlineRlRolloutReceiptV1["status"] = "complete";
    for (const scenario of plan.scenarios) {
      const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }); let episodeStatus: Status = "truncated", rewardTotal = 0, eventCursor = 0; const actions: GameAction[][] = [];
      try {
        let current = environment.reset(scenario); let previous: CanonicalGameplayState = current;
        while (current.tick < Math.min(scenario.maxTicks, plan.budgets.maxTicksPerEpisode) && totalTicks < plan.budgets.maxTotalTicks) {
          if (control.isCancelled?.() === true) { episodeStatus = "cancelled"; break; }
          if (control.timeoutMilliseconds !== undefined && now() - started >= control.timeoutMilliseconds) { episodeStatus = "timed-out"; break; }
          const chosen = rng() * plan.exploration.denominator < plan.exploration.numerator ? plan.exploration.actions[Math.floor(rng() * plan.exploration.actions.length)] : undefined;
          if (chosen === undefined) { episodeStatus = "stopped-divergence"; break; }
          const batch = [chosen] as GameAction[]; actions.push(batch); const transition = environment.step(batch); totalTicks += 1;
          const tracks = environment.sourceTracks(), events = tracks.nativeEvents.slice(eventCursor); eventCursor = tracks.nativeEvents.length;
          rewardTotal += evaluateTearOfflineRlRewardTransition(offline, previous, transition.observation, events).total;
          previous = transition.observation; current = transition.observation;
          if (!Number.isFinite(rewardTotal) || Math.abs(rewardTotal) > plan.budgets.maxTotalAbsoluteReward) { episodeStatus = "stopped-divergence"; break; }
          if (transition.terminated) { episodeStatus = "terminated"; break; } if (transition.truncated) { episodeStatus = "truncated"; break; }
        }
        const tracks = environment.sourceTracks(); episodes.push(immutableEpisode({ scenarioHash: scenarioHash(scenario), status: episodeStatus, ticks: current.tick, semanticHash: stableVerificationHash(current), actions, rewardTotal, eventHash: stableVerificationHash(tracks.nativeEvents) }));
        if (episodeStatus === "cancelled" || episodeStatus === "timed-out" || episodeStatus === "stopped-divergence") { status = episodeStatus; break; }
      } finally { environment.dispose(); }
    }
    return new TearOnlineRlRolloutVault(this.#backend).persist(result({ format: "tear-online-rl-rollout", schemaVersion: 1, planHash: plan.planHash, trainingHash: training.trainingHash, episodes, status, trainable: false }));
  }
}
