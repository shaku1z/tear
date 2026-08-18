import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type ProductionHeadlessCheckpoint } from "../tearbench";
import {
  evaluateTearOfflineRlRewardTransition,
  parseTearOfflineRlPlan,
  tearSemanticActionBatchHash,
  TearOfflineRlTrainingVault,
  type TearOfflineRlPlanV1,
  type TearOfflineRlQValueV1,
  type TearOfflineRlTrainingResultV1,
  type TearOfflineRlTrajectoryReceiptV1,
} from "./offline-rl-training";
import { compileTearOnlineRlCurriculum, parseTearOnlineRlCurriculumPlan, type TearOnlineRlCurriculumPlanV1 } from "./online-rl-curriculum";
import type { TearOnlineRlRolloutControl } from "./online-rl-headless-executor";
import { encodeTearC34C32SourceState, maskTearC34C32Actions, tearC34C32SemanticActionHash } from "./c34-c32-runtime-compatibility";

const CHECKPOINT_KEY = "online-rl-checkpoint:v1:";
const RESULT_KEY = "online-rl-training:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type Status = "running" | "complete" | "cancelled" | "timed-out" | "stopped-divergence" | "stopped-budget";

export interface TearOnlineRlTrainingConfigV1 {
  readonly learningRate: number;
  readonly gamma: number;
  readonly maxStateActionEntries: number;
  readonly maxAbsoluteQ: number;
  readonly maxTotalUpdates: number;
  readonly maxConsecutiveDivergentUpdates: number;
}
export interface TearOnlineRlActionSelectionV1 { readonly actions: readonly GameAction[]; readonly semanticActionHash: string; readonly source: "epsilon" | "q" | "fallback"; }
export interface TearOnlineRlCheckpointV1 {
  readonly format: "tear-online-rl-checkpoint";
  readonly schemaVersion: 1;
  readonly input: Readonly<{ curriculumPlanHash: string; offlinePlanHash: string; receiptHash: string; trainingHash: string; configHash: string }>;
  readonly episodeCursor: number;
  readonly totalTicks: number;
  readonly updates: number;
  readonly consecutiveDivergentUpdates: number;
  readonly qValues: readonly TearOfflineRlQValueV1[];
  readonly status: Status;
  /** A capture after a valid C30 tick permits exact continuation without a second simulator. */
  readonly resume?: Readonly<{ episodeCursor: number; checkpoint: ProductionHeadlessCheckpoint }>;
  readonly checkpointHash: string;
}
export interface TearOnlineRlTrainingResultV1 {
  readonly format: "tear-online-rl-training";
  readonly schemaVersion: 1;
  readonly checkpointHash: string;
  readonly status: Exclude<Status, "running">;
  readonly updates: number;
  readonly model?: Readonly<{ format: "tear-online-tabular-q-model-v1"; entries: readonly TearOfflineRlQValueV1[]; modelHash: string }>;
  readonly trainable: false;
  readonly resultHash: string;
}
export interface TearOnlineRlAdvanceControl extends TearOnlineRlRolloutControl { readonly maxTicks?: number; }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function positive(value: unknown, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum; }
function finite(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
/** Existing V2 keys remain byte-identical, while future V3 work has one named source-state encoder. */
function stateHash(state: CanonicalGameplayState): string { return encodeTearC34C32SourceState(state).stateHash; }
function key(state: string, action: string): string { return `${state}:${action}`; }
function ordered(values: ReadonlyMap<string, TearOfflineRlQValueV1>): readonly TearOfflineRlQValueV1[] { return Object.freeze([...values.values()].sort((a, b) => a.stateHash.localeCompare(b.stateHash) || a.semanticActionHash.localeCompare(b.semanticActionHash)).map((entry) => Object.freeze({ ...entry }))); }
function configHash(config: TearOnlineRlTrainingConfigV1): string { return stableVerificationHash(config); }
function validConfig(value: TearOnlineRlTrainingConfigV1): boolean { return finite(value.learningRate, 0.000_001, 1) && finite(value.gamma, 0, 1) && positive(value.maxStateActionEntries, 1_000_000) && finite(value.maxAbsoluteQ, 0.000_001, 1_000_000) && positive(value.maxTotalUpdates, 1_000_000) && positive(value.maxConsecutiveDivergentUpdates, 1_000_000); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }

function seeded(seed: number): () => number { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4_294_967_296; }; }
function vocabulary(actions: readonly GameAction[], allowed: readonly GameAction["type"][]): readonly GameAction[] { return maskTearC34C32Actions(actions, allowed); }
/** Selects only a normalized, currently-advertised governed action. Unknown states use a deterministic safe fallback. */
export function selectTearOnlineRlAction(qValues: readonly TearOfflineRlQValueV1[], state: CanonicalGameplayState, actions: readonly GameAction[], available: readonly GameAction["type"][], epsilonNumerator: number, epsilonDenominator: number, random: () => number): TearOnlineRlActionSelectionV1 | undefined {
  if (!positive(epsilonDenominator, 1_000_000) || !Number.isSafeInteger(epsilonNumerator) || epsilonNumerator < 0 || epsilonNumerator > epsilonDenominator) throw new TypeError("invalid online RL epsilon");
  const legal = vocabulary(actions, available); if (legal.length === 0) return undefined;
  if (random() * epsilonDenominator < epsilonNumerator) { const action = legal[Math.floor(random() * legal.length)]; if (action === undefined) throw new Error("online RL vocabulary disappeared"); return Object.freeze({ actions: Object.freeze([action]), semanticActionHash: tearSemanticActionBatchHash([action]), source: "epsilon" }); }
  const current = stateHash(state); let best: Readonly<{ action: GameAction; semantic: string; value: number }> | undefined;
  for (const action of legal) { const semantic = tearC34C32SemanticActionHash([action]), value = qValues.find((entry) => entry.stateHash === current && entry.semanticActionHash === semantic)?.value ?? 0; if (best === undefined || value > best.value || value === best.value && semantic.localeCompare(best.semantic) < 0) best = { action, semantic, value }; }
  if (best === undefined) return undefined;
  return Object.freeze({ actions: Object.freeze([best.action]), semanticActionHash: best.semantic, source: best.value === 0 ? "fallback" : "q" });
}

function freezeCheckpoint(draft: Omit<TearOnlineRlCheckpointV1, "checkpointHash">): TearOnlineRlCheckpointV1 {
  if (!record(draft.input) || !hash(draft.input.curriculumPlanHash) || !hash(draft.input.offlinePlanHash) || !hash(draft.input.receiptHash) || !hash(draft.input.trainingHash) || !hash(draft.input.configHash)
    || !Number.isSafeInteger(draft.episodeCursor) || draft.episodeCursor < 0 || !Number.isSafeInteger(draft.totalTicks) || draft.totalTicks < 0 || !Number.isSafeInteger(draft.updates) || draft.updates < 0 || !Number.isSafeInteger(draft.consecutiveDivergentUpdates) || draft.consecutiveDivergentUpdates < 0 || !["running", "complete", "cancelled", "timed-out", "stopped-divergence", "stopped-budget"].includes(draft.status)
    || draft.qValues.length > 1_000_000 || draft.qValues.some((entry) => !hash(entry.stateHash) || !hash(entry.semanticActionHash) || !hash(entry.actionHash) || !Number.isFinite(entry.value))) throw new TypeError("invalid online RL checkpoint");
  const values = ordered(new Map(draft.qValues.map((entry) => [key(entry.stateHash, entry.semanticActionHash), entry])));
  if (values.length !== draft.qValues.length || draft.resume !== undefined && (draft.resume.episodeCursor !== draft.episodeCursor || !record(draft.resume.checkpoint))) throw new TypeError("invalid online RL checkpoint");
  const { checkpointHash: priorHash, ...withoutPriorHash } = draft as Omit<TearOnlineRlCheckpointV1, "checkpointHash"> & Readonly<{ checkpointHash?: unknown }>;
  void priorHash;
  const value = Object.freeze({ ...withoutPriorHash, input: Object.freeze({ ...draft.input }), qValues: values, ...(draft.resume === undefined ? {} : { resume: freeze(draft.resume) }) });
  return Object.freeze({ ...value, checkpointHash: stableVerificationHash(value) });
}
export function parseTearOnlineRlCheckpoint(value: unknown): TearOnlineRlCheckpointV1 { if (!record(value) || value.format !== "tear-online-rl-checkpoint" || value.schemaVersion !== 1 || !hash(value.checkpointHash)) throw new TypeError("invalid online RL checkpoint"); const typed = value as unknown as TearOnlineRlCheckpointV1, { checkpointHash, ...draft } = typed, parsed = freezeCheckpoint(draft); if (checkpointHash !== parsed.checkpointHash) throw new TypeError("online RL checkpoint integrity mismatch"); return parsed; }

/** Creates a V2-semantic checkpoint; V1 envelope-only offline models are deliberately unusable online. */
export function createTearOnlineRlCheckpoint(curriculumInput: TearOnlineRlCurriculumPlanV1, offlineInput: TearOfflineRlPlanV1, receipt: TearOfflineRlTrajectoryReceiptV1, training: TearOfflineRlTrainingResultV1, config: TearOnlineRlTrainingConfigV1): TearOnlineRlCheckpointV1 {
  const curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), offline = parseTearOfflineRlPlan(offlineInput), entries = training.model?.entries;
  const modelFormat = (training.model as unknown as { format?: unknown } | undefined)?.format;
  if (!validConfig(config) || training.disposition !== "completed" || entries === undefined || modelFormat !== "tear-offline-tabular-q-model-v2" || entries.some((entry) => !Number.isFinite(entry.value) || Math.abs(entry.value) > config.maxAbsoluteQ) || curriculum.offline.planHash !== offline.planHash || curriculum.offline.receiptHash !== receipt.receiptHash || curriculum.offline.trainingHash !== training.trainingHash) throw new RangeError("online RL requires a completed bounded V2 offline model and exact curriculum lineage");
  return freezeCheckpoint({ format: "tear-online-rl-checkpoint", schemaVersion: 1, input: { curriculumPlanHash: curriculum.planHash, offlinePlanHash: offline.planHash, receiptHash: receipt.receiptHash, trainingHash: training.trainingHash, configHash: configHash(config) }, episodeCursor: 0, totalTicks: 0, updates: 0, consecutiveDivergentUpdates: 0, qValues: entries, status: "running" });
}

function maxQ(values: ReadonlyMap<string, TearOfflineRlQValueV1>, state: CanonicalGameplayState): number { const hash = stateHash(state); let maximum = 0; for (const value of values.values()) if (value.stateHash === hash) maximum = Math.max(maximum, value.value); return maximum; }
/** Advances only valid post-C30-tick transitions and records a resumable source checkpoint after each one. */
export async function advanceTearOnlineRlCheckpoint(backend: GhostVaultBackend, curriculumInput: TearOnlineRlCurriculumPlanV1, offlineInput: TearOfflineRlPlanV1, receipt: TearOfflineRlTrajectoryReceiptV1, trainingInput: TearOfflineRlTrainingResultV1, config: TearOnlineRlTrainingConfigV1, checkpointInput: TearOnlineRlCheckpointV1, control: TearOnlineRlAdvanceControl = {}): Promise<TearOnlineRlCheckpointV1> {
  const curriculum = parseTearOnlineRlCurriculumPlan(curriculumInput), offline = parseTearOfflineRlPlan(offlineInput), checkpoint = parseTearOnlineRlCheckpoint(checkpointInput), training = await new TearOfflineRlTrainingVault(backend).get(trainingInput.trainingHash);
  if (!validConfig(config) || training?.trainingHash !== trainingInput.trainingHash || checkpoint.status !== "running" || checkpoint.input.curriculumPlanHash !== curriculum.planHash || checkpoint.input.offlinePlanHash !== offline.planHash || checkpoint.input.receiptHash !== receipt.receiptHash || checkpoint.input.trainingHash !== trainingInput.trainingHash || checkpoint.input.configHash !== configHash(config)) throw new RangeError("online RL checkpoint lineage is unavailable or changed");
  const episodes = compileTearOnlineRlCurriculum(curriculum), now = control.now ?? (() => performance.now()), started = now();
  const values = new Map(checkpoint.qValues.map((entry) => [key(entry.stateHash, entry.semanticActionHash), entry])); let cursor = checkpoint.episodeCursor, ticks = checkpoint.totalTicks, updates = checkpoint.updates, divergent = checkpoint.consecutiveDivergentUpdates, resume = checkpoint.resume;
  while (cursor < episodes.length) {
    const compiled = episodes[cursor]; if (compiled === undefined) throw new Error("online RL compiled episode disappeared"); const scenario = compiled.rollout.scenarios[0]; if (scenario === undefined) throw new Error("online RL scenario disappeared");
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }); let current: CanonicalGameplayState; let eventCursor = 0;
    try {
      current = resume === undefined ? environment.reset(scenario) : environment.restoreCheckpoint(resume.checkpoint);
      while (current.tick < Math.min(scenario.maxTicks, compiled.rollout.budgets.maxTicksPerEpisode)) {
        if (control.isCancelled?.() === true) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "cancelled", ...(resume === undefined ? {} : { resume }) });
        if (control.timeoutMilliseconds !== undefined && now() - started >= control.timeoutMilliseconds) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "timed-out", ...(resume === undefined ? {} : { resume }) });
        if (control.maxTicks !== undefined && ticks - checkpoint.totalTicks >= control.maxTicks) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "running", ...(resume === undefined ? {} : { resume }) });
        if (updates >= config.maxTotalUpdates || ticks >= curriculum.budgets.maxTotalTicks) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "stopped-budget", ...(resume === undefined ? {} : { resume }) });
        const selection = selectTearOnlineRlAction(ordered(values), current, curriculum.actionVocabulary, environment.policyObservation().availableActions, compiled.epsilonNumerator, compiled.rollout.exploration.denominator, seeded(curriculum.exploration.seed + ticks));
        if (selection === undefined) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "stopped-divergence", ...(resume === undefined ? {} : { resume }) });
        const transition = environment.step(selection.actions); const tracks = environment.sourceTracks(), events = tracks.nativeEvents.slice(eventCursor); eventCursor = tracks.nativeEvents.length; const reward = evaluateTearOfflineRlRewardTransition(offline, current, transition.observation, events).total;
        const identity = stateHash(current), previous = values.get(key(identity, selection.semanticActionHash)) ?? Object.freeze({ stateHash: identity, semanticActionHash: selection.semanticActionHash, actionHash: stableVerificationHash(selection.actions), value: 0 });
        if (values.size >= config.maxStateActionEntries && !values.has(key(identity, selection.semanticActionHash))) return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "stopped-budget", ...(resume === undefined ? {} : { resume }) });
        const next = previous.value + config.learningRate * (reward + (transition.terminated || transition.truncated ? 0 : config.gamma * maxQ(values, transition.observation)) - previous.value);
        ticks += 1; updates += 1; current = transition.observation;
        if (!Number.isFinite(next) || Math.abs(next) > config.maxAbsoluteQ || !Number.isFinite(reward)) { divergent += 1; return freezeCheckpoint({ ...checkpoint, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "stopped-divergence" }); }
        values.set(key(identity, selection.semanticActionHash), Object.freeze({ ...previous, value: next })); divergent = 0;
        resume = transition.terminated || transition.truncated ? undefined : Object.freeze({ episodeCursor: cursor, checkpoint: environment.captureCheckpoint() });
        if (transition.terminated || transition.truncated) { cursor += 1; resume = undefined; break; }
      }
      if (current.tick >= Math.min(scenario.maxTicks, compiled.rollout.budgets.maxTicksPerEpisode)) { cursor += 1; resume = undefined; }
    } finally { environment.dispose(); }
  }
  const { resume: savedResume, checkpointHash: priorHash, ...complete } = checkpoint;
  void savedResume; void priorHash;
  return freezeCheckpoint({ ...complete, episodeCursor: cursor, totalTicks: ticks, updates, consecutiveDivergentUpdates: divergent, qValues: ordered(values), status: "complete" });
}

export class TearOnlineRlCheckpointVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; } async persist(value: TearOnlineRlCheckpointV1): Promise<TearOnlineRlCheckpointV1> { const parsed = parseTearOnlineRlCheckpoint(value), key = `${CHECKPOINT_KEY}${parsed.checkpointHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return parseTearOnlineRlCheckpoint(JSON.parse(existing)); await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(parsed) }])); return parsed; } async get(checkpointHash: string): Promise<TearOnlineRlCheckpointV1 | undefined> { if (!hash(checkpointHash)) throw new TypeError("online RL checkpoint hash is invalid"); const key = `${CHECKPOINT_KEY}${checkpointHash}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { return parseTearOnlineRlCheckpoint(JSON.parse(raw)); } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify({ key, raw, reason: error instanceof Error ? error.message : String(error) })); return undefined; } }
}
/** Builds the immutable terminal result without writing it, for guarded Foundry transactions. */
export function createTearOnlineRlTrainingResult(checkpointInput: TearOnlineRlCheckpointV1): TearOnlineRlTrainingResultV1 { const checkpoint = parseTearOnlineRlCheckpoint(checkpointInput); if (checkpoint.status === "running") throw new RangeError("online RL result requires a terminal checkpoint"); const model = checkpoint.status === "complete" ? (() => { const draft = { format: "tear-online-tabular-q-model-v1" as const, entries: checkpoint.qValues }; return Object.freeze({ ...draft, modelHash: stableVerificationHash(draft) }); })() : undefined; const draft = { format: "tear-online-rl-training" as const, schemaVersion: 1 as const, checkpointHash: checkpoint.checkpointHash, status: checkpoint.status, updates: checkpoint.updates, ...(model === undefined ? {} : { model }), trainable: false as const }; return Object.freeze({ ...draft, resultHash: stableVerificationHash(draft) }); }
function result(checkpoint: TearOnlineRlCheckpointV1): TearOnlineRlTrainingResultV1 { return createTearOnlineRlTrainingResult(checkpoint); }
export class TearOnlineRlTrainingVault { readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; } async persist(checkpoint: TearOnlineRlCheckpointV1): Promise<TearOnlineRlTrainingResultV1> { const value = result(checkpoint), key = `${RESULT_KEY}${value.resultHash}`, existing = await this.#backend.get("analysis", key); if (existing !== undefined) return JSON.parse(existing) as TearOnlineRlTrainingResultV1; await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(value) }, { store: "indexes", key: `online-rl-training:${value.checkpointHash}`, value: JSON.stringify({ status: value.status, trainable: false }) }])); return value; } }
