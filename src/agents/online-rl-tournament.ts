import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment } from "../tearbench";
import { evaluateTearOfflineRlRewardTransition, parseTearOfflineRlPlan, TearOfflineRlTrainingVault, type TearOfflineRlPlanV1, type TearOfflineRlTrajectoryReceiptV1 } from "./offline-rl-training";
import { compileTearOnlineRlCurriculum, parseTearOnlineRlCurriculumPlan, type TearOnlineRlCurriculumPlanV1 } from "./online-rl-curriculum";
import { parseTearOnlineRlCheckpoint, selectTearOnlineRlAction, TearOnlineRlCheckpointVault, type TearOnlineRlAdvanceControl, type TearOnlineRlCheckpointV1 } from "./online-rl-training";

const KEY = "online-rl-tournament:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type Status = "complete" | "cancelled" | "timed-out" | "stopped-budget" | "stopped-divergence";

export interface TearOnlineRlTournamentPlanV1 {
  readonly format: "tear-online-rl-tournament-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly curriculumPlanHash: string;
  readonly competitors: Readonly<{ challengerCheckpointHash: string; defenderCheckpointHash: string }>;
  readonly budgets: Readonly<{ maxEpisodes: number; maxTicksPerEpisode: number; maxTotalTicks: number; maxTotalAbsoluteReward: number }>;
  readonly planHash: string;
}
export interface TearOnlineRlTournamentRunV1 {
  readonly competitor: "challenger" | "defender";
  readonly episode: number;
  readonly scenarioHash: string;
  readonly status: Status | "terminated" | "truncated";
  readonly ticks: number;
  readonly semanticHash: string;
  readonly actions: readonly (readonly unknown[])[];
  readonly rewardTotal: number;
  readonly eventHash: string;
}
export interface TearOnlineRlTournamentReceiptV1 {
  readonly format: "tear-online-rl-tournament";
  readonly schemaVersion: 1;
  readonly planHash: string;
  readonly status: Status;
  readonly runs: readonly TearOnlineRlTournamentRunV1[];
  /** Paired evaluation evidence only; it cannot train, register, activate, or promote either checkpoint. */
  readonly trainable: false;
  readonly receiptHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function positive(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum; }
function seeded(seed: number): () => number { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4_294_967_296; }; }

function freezePlan(draft: Omit<TearOnlineRlTournamentPlanV1, "planHash">): TearOnlineRlTournamentPlanV1 {
  if (!text(draft.id) || !hash(draft.curriculumPlanHash) || !record(draft.competitors) || !hash(draft.competitors.challengerCheckpointHash) || !hash(draft.competitors.defenderCheckpointHash) || draft.competitors.challengerCheckpointHash === draft.competitors.defenderCheckpointHash || !positive(draft.budgets.maxEpisodes, 1_000) || !positive(draft.budgets.maxTicksPerEpisode, 20_000) || !positive(draft.budgets.maxTotalTicks, 1_000_000) || !Number.isFinite(draft.budgets.maxTotalAbsoluteReward) || draft.budgets.maxTotalAbsoluteReward <= 0) throw new TypeError("invalid online RL tournament plan");
  const value = Object.freeze({ ...draft, competitors: Object.freeze({ ...draft.competitors }), budgets: Object.freeze({ ...draft.budgets }) }); return Object.freeze({ ...value, planHash: stableVerificationHash(value) });
}
/** A tournament is an ordered comparison through separate fresh worlds, never simultaneous self-play. */
export function createTearOnlineRlTournamentPlan(curriculumInput: TearOnlineRlCurriculumPlanV1, challenger: TearOnlineRlCheckpointV1, defender: TearOnlineRlCheckpointV1, input: Omit<TearOnlineRlTournamentPlanV1, "format" | "schemaVersion" | "curriculumPlanHash" | "competitors" | "planHash">): TearOnlineRlTournamentPlanV1 {
  const curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), first = parseTearOnlineRlCheckpoint(challenger), second = parseTearOnlineRlCheckpoint(defender);
  if (first.status !== "complete" || second.status !== "complete" || first.input.curriculumPlanHash !== curriculum.planHash || second.input.curriculumPlanHash !== curriculum.planHash || input.budgets.maxEpisodes > compileTearOnlineRlCurriculum(curriculum).length || input.budgets.maxTicksPerEpisode > curriculum.budgets.maxTicksPerEpisode || input.budgets.maxTotalTicks < input.budgets.maxEpisodes * 2 * input.budgets.maxTicksPerEpisode || input.budgets.maxTotalTicks > curriculum.budgets.maxTotalTicks * 2) throw new RangeError("online RL tournament requires two completed checkpoints and bounded governed C30 cases");
  return freezePlan({ format: "tear-online-rl-tournament-plan", schemaVersion: 1, id: input.id, curriculumPlanHash: curriculum.planHash, competitors: { challengerCheckpointHash: first.checkpointHash, defenderCheckpointHash: second.checkpointHash }, budgets: input.budgets });
}
export function parseTearOnlineRlTournamentPlan(value: unknown): TearOnlineRlTournamentPlanV1 { if (!record(value) || value.format !== "tear-online-rl-tournament-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid online RL tournament plan"); const typed = value as unknown as TearOnlineRlTournamentPlanV1, { planHash, ...draft } = typed, parsed = freezePlan(draft); if (planHash !== parsed.planHash) throw new TypeError("online RL tournament plan integrity mismatch"); return parsed; }
function immutableRun(value: TearOnlineRlTournamentRunV1): TearOnlineRlTournamentRunV1 { return Object.freeze({ ...value, actions: Object.freeze(value.actions.map((batch) => Object.freeze(structuredClone(batch)))) }); }
function receipt(draft: Omit<TearOnlineRlTournamentReceiptV1, "receiptHash">): TearOnlineRlTournamentReceiptV1 { const value = Object.freeze({ ...draft, runs: Object.freeze(draft.runs.map(immutableRun)) }); return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) }); }

export class TearOnlineRlTournamentVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(value: TearOnlineRlTournamentReceiptV1): Promise<TearOnlineRlTournamentReceiptV1> { const key = `${KEY}${value.receiptHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearOnlineRlTournamentReceiptV1; await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }, { store: "indexes", key: `online-rl-tournament:${value.planHash}:${value.receiptHash}`, value: JSON.stringify({ status: value.status, trainable: false }) }])); return value; }
}

/** Runs challenger then defender independently against identical frozen C30 cases; their actions are never co-mingled. */
export class TearOnlineRlTournamentExecutor {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async execute(planInput: TearOnlineRlTournamentPlanV1, curriculumInput: TearOnlineRlCurriculumPlanV1, offlineInput: TearOfflineRlPlanV1, receiptInput: TearOfflineRlTrajectoryReceiptV1, control: TearOnlineRlAdvanceControl = {}): Promise<TearOnlineRlTournamentReceiptV1> {
    const plan = parseTearOnlineRlTournamentPlan(planInput), curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), offline = parseTearOfflineRlPlan(offlineInput), checkpoints = new TearOnlineRlCheckpointVault(this.#backend);
    const challenger = await checkpoints.get(plan.competitors.challengerCheckpointHash), defender = await checkpoints.get(plan.competitors.defenderCheckpointHash), training = await new TearOfflineRlTrainingVault(this.#backend).get(curriculum.offline.trainingHash);
    if (plan.curriculumPlanHash !== curriculum.planHash || training?.trainingHash !== curriculum.offline.trainingHash || training.model?.format !== "tear-offline-tabular-q-model-v2" || challenger === undefined || defender === undefined || challenger.status !== "complete" || defender.status !== "complete" || challenger.input.curriculumPlanHash !== curriculum.planHash || defender.input.curriculumPlanHash !== curriculum.planHash || challenger.input.trainingHash !== training.trainingHash || defender.input.trainingHash !== training.trainingHash || challenger.input.offlinePlanHash !== offline.planHash || defender.input.offlinePlanHash !== offline.planHash || challenger.input.receiptHash !== receiptInput.receiptHash || defender.input.receiptHash !== receiptInput.receiptHash) throw new RangeError("online RL tournament checkpoint lineage is unavailable or changed");
    const now = control.now ?? (() => performance.now()), started = now(), runs: TearOnlineRlTournamentRunV1[] = []; let totalTicks = 0, status: Status = "complete";
    const episodes = compileTearOnlineRlCurriculum(curriculum).slice(0, plan.budgets.maxEpisodes);
    outer: for (let episode = 0; episode < episodes.length; episode += 1) for (const [competitor, checkpoint] of [["challenger", challenger], ["defender", defender]] as const) {
      const compiled = episodes[episode]; if (compiled === undefined) throw new Error("online RL tournament episode disappeared"); const scenario = compiled.rollout.scenarios[0]; if (scenario === undefined) throw new Error("online RL tournament scenario disappeared");
      const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }); let current: CanonicalGameplayState = environment.reset(scenario), eventCursor = 0, rewardTotal = 0; const actions: (readonly unknown[])[] = []; let runStatus: TearOnlineRlTournamentRunV1["status"] = "truncated";
      try {
        while (current.tick < Math.min(scenario.maxTicks, plan.budgets.maxTicksPerEpisode)) {
          if (control.isCancelled?.() === true) { status = "cancelled"; runStatus = status; break; }
          if (control.timeoutMilliseconds !== undefined && now() - started >= control.timeoutMilliseconds) { status = "timed-out"; runStatus = status; break; }
          if (control.maxTicks !== undefined && totalTicks >= control.maxTicks || totalTicks >= plan.budgets.maxTotalTicks) { status = "stopped-budget"; runStatus = status; break; }
          const selection = selectTearOnlineRlAction(checkpoint.qValues, current, curriculum.actionVocabulary, environment.policyObservation().availableActions, compiled.epsilonNumerator, compiled.rollout.exploration.denominator, seeded(curriculum.exploration.seed + totalTicks));
          if (selection === undefined) { status = "stopped-divergence"; runStatus = status; break; }
          actions.push(selection.actions); const transition = environment.step(selection.actions); totalTicks += 1; const tracks = environment.sourceTracks(), events = tracks.nativeEvents.slice(eventCursor); eventCursor = tracks.nativeEvents.length; rewardTotal += evaluateTearOfflineRlRewardTransition(offline, current, transition.observation, events).total; current = transition.observation;
          if (!Number.isFinite(rewardTotal) || Math.abs(rewardTotal) > plan.budgets.maxTotalAbsoluteReward) { status = "stopped-divergence"; runStatus = status; break; }
          if (transition.terminated) { runStatus = "terminated"; break; } if (transition.truncated) { runStatus = "truncated"; break; }
        }
        const tracks = environment.sourceTracks(); runs.push(immutableRun({ competitor, episode, scenarioHash: stableVerificationHash(scenario), status: runStatus, ticks: current.tick, semanticHash: stableVerificationHash(current), actions, rewardTotal, eventHash: stableVerificationHash(tracks.nativeEvents) }));
        if (status !== "complete") break outer;
      } finally { environment.dispose(); }
    }
    return new TearOnlineRlTournamentVault(this.#backend).persist(receipt({ format: "tear-online-rl-tournament", schemaVersion: 1, planHash: plan.planHash, status, runs, trainable: false }));
  }
}
