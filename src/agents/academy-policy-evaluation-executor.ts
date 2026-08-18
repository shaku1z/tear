import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessStateForgeEvaluation,
  type TearObservationV1,
} from "../tearbench";
import { mapGameplayEventToCausalEvent } from "../tearbench/gameplay-causal-events";
import type { TearAgentProfileId } from "./contracts";
import {
  TearAcademyPolicyEvaluationPlanVault,
  type TearAcademyPolicyEvaluationCaseV1,
  type TearAcademyPolicyEvaluationPlanV1,
} from "./academy-policy-evaluation";
import { parseTearPolicyArtifact, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TearActivePolicyRuntime } from "./policy-runtime";
import { TearAgentOrchestrator } from "./scripted-policy";

const KEY = "academy-policy-evaluation-result:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearAcademyPolicyEvaluationRecoveryLaunchV1 {
  readonly scenarioHash: string;
  readonly evaluation: ProductionHeadlessStateForgeEvaluation;
}

/**
 * A one-shot, hash-bound request to execute an already-persisted protocol.
 * The artifact is passed directly to a local runtime; this request never
 * registers or activates it in the caller's policy registry.
 */
export interface TearAcademyPolicyEvaluationLaunchV1 {
  readonly format: "tear-academy-policy-evaluation-launch";
  readonly schemaVersion: 1;
  readonly plan: Readonly<{ id: string; planHash: string }>;
  readonly candidate: TearPolicyArtifactV1;
  readonly recovery: readonly TearAcademyPolicyEvaluationRecoveryLaunchV1[];
  readonly launchHash: string;
}

export interface TearAcademyPolicyEvaluationCaseRunV1 {
  readonly lessonId: string;
  readonly kind: "unseen" | "recovery";
  readonly scenarioHash: string;
  readonly startedAtTick: number;
  readonly terminal: Readonly<{
    tick: number;
    semanticHash: string;
    terminated: boolean;
    truncated: boolean;
    outcome: "completed" | "defeated" | "none";
    revivals: number;
  }>;
  readonly decisions: number;
  readonly artifactDecisions?: number;
  readonly fallbackDecisions?: number;
}

export interface TearAcademyPolicyEvaluationLessonMetricV1 {
  readonly lessonId: string;
  readonly candidateCompletedRate: number;
  readonly baselineCompletedRate: number;
  readonly threshold: number;
  readonly passed: boolean;
}

/**
 * Durable C33 quality evidence. `passed` is only the predeclared protocol
 * verdict; it is deliberately not registration, activation, or promotion.
 */
export interface TearAcademyPolicyEvaluationResultV1 {
  readonly format: "tear-academy-policy-evaluation-result";
  readonly schemaVersion: 1;
  readonly plan: Readonly<{ id: string; planHash: string }>;
  readonly launchHash: string;
  readonly candidate: Readonly<{ id: string; artifactHash: string; trainingHash: string }>;
  readonly baselineProfile: TearAgentProfileId;
  readonly candidateRuns: readonly TearAcademyPolicyEvaluationCaseRunV1[];
  readonly baselineRuns: readonly TearAcademyPolicyEvaluationCaseRunV1[];
  readonly lessons: readonly TearAcademyPolicyEvaluationLessonMetricV1[];
  readonly passed: boolean;
  readonly resultHash: string;
}

interface EvaluationPolicy {
  readonly reset: () => Promise<void>;
  readonly decide: (observation: TearObservationV1) => Readonly<{ actions: readonly unknown[]; receipt?: Readonly<{ source: "artifact" | "scripted-fallback" }> }>;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function scenarioHash(entry: TearAcademyPolicyEvaluationCaseV1): string { return stableVerificationHash(entry.scenario); }
function requiredAt<T>(entries: readonly T[], index: number, reason: string): T {
  const entry = entries[index];
  if (entry === undefined) throw new TypeError(reason);
  return entry;
}

function freezeLaunch(draft: Omit<TearAcademyPolicyEvaluationLaunchV1, "launchHash">): TearAcademyPolicyEvaluationLaunchV1 {
  if (!record(draft.plan) || !text(draft.plan.id) || !hash(draft.plan.planHash)) {
    throw new TypeError("invalid Academy policy evaluation launch");
  }
  const candidate = parseTearPolicyArtifact(draft.candidate);
  if (candidate.lineage.trainingRunId.length !== 16 || !hash(candidate.lineage.trainingRunId)) {
    throw new TypeError("Academy policy evaluation candidate training lineage is invalid");
  }
  const recovery = draft.recovery.map((entry) => {
    if (!hash(entry.scenarioHash)) throw new TypeError("invalid Academy recovery evaluation launch");
    return Object.freeze({ scenarioHash: entry.scenarioHash, evaluation: structuredClone(entry.evaluation) });
  });
  if (new Set(recovery.map((entry) => entry.scenarioHash)).size !== recovery.length) throw new RangeError("Academy recovery evaluation launch repeats a scenario");
  const value = Object.freeze({ format: "tear-academy-policy-evaluation-launch" as const, schemaVersion: 1 as const,
    plan: Object.freeze({ id: draft.plan.id, planHash: draft.plan.planHash }), candidate,
    recovery: Object.freeze(recovery) });
  return Object.freeze({ ...value, launchHash: stableVerificationHash(value) });
}

/** Creates a hash-bound request for a persisted C33 evaluation plan. */
export function createTearAcademyPolicyEvaluationLaunch(input: Omit<TearAcademyPolicyEvaluationLaunchV1, "format" | "schemaVersion" | "launchHash">): TearAcademyPolicyEvaluationLaunchV1 {
  return freezeLaunch({ format: "tear-academy-policy-evaluation-launch", schemaVersion: 1, ...input });
}

export function parseTearAcademyPolicyEvaluationLaunch(value: unknown): TearAcademyPolicyEvaluationLaunchV1 {
  if (!record(value) || value.format !== "tear-academy-policy-evaluation-launch" || value.schemaVersion !== 1 || !hash(value.launchHash)) {
    throw new TypeError("invalid Academy policy evaluation launch");
  }
  const typed = value as unknown as TearAcademyPolicyEvaluationLaunchV1, { launchHash, ...draft } = typed;
  const parsed = freezeLaunch(draft);
  if (parsed.launchHash !== launchHash) throw new TypeError("Academy policy evaluation launch integrity mismatch");
  return parsed;
}

function freezeRun(value: TearAcademyPolicyEvaluationCaseRunV1): TearAcademyPolicyEvaluationCaseRunV1 {
  return Object.freeze({ ...value, terminal: Object.freeze({ ...value.terminal }) });
}

function resultDraft(value: Omit<TearAcademyPolicyEvaluationResultV1, "resultHash">): TearAcademyPolicyEvaluationResultV1 {
  if (!record(value.plan) || !text(value.plan.id) || !hash(value.plan.planHash) || !hash(value.launchHash)
    || !record(value.candidate) || !text(value.candidate.id) || !hash(value.candidate.artifactHash) || !hash(value.candidate.trainingHash)
    || !text(value.baselineProfile) || value.candidateRuns.length < 1 || value.candidateRuns.length !== value.baselineRuns.length
    || value.lessons.length < 1 || typeof value.passed !== "boolean") throw new TypeError("invalid Academy policy evaluation result");
  const candidateRuns = value.candidateRuns;
  const baselineRuns = value.baselineRuns;
  const lessons = value.lessons;
  const runs = [...candidateRuns, ...baselineRuns];
  if (runs.some((run) => !text(run.lessonId) || !["unseen", "recovery"].includes(run.kind) || !hash(run.scenarioHash)
    || !integer(run.startedAtTick) || run.startedAtTick < 0 || !integer(run.terminal.tick) || run.terminal.tick < run.startedAtTick
    || !hash(run.terminal.semanticHash) || typeof run.terminal.terminated !== "boolean" || typeof run.terminal.truncated !== "boolean"
    || !["completed", "defeated", "none"].includes(run.terminal.outcome)
    || !integer(run.terminal.revivals) || run.terminal.revivals < 0 || !integer(run.decisions) || run.decisions < 0
    || (run.artifactDecisions !== undefined && (!integer(run.artifactDecisions) || run.artifactDecisions < 0))
    || (run.fallbackDecisions !== undefined && (!integer(run.fallbackDecisions) || run.fallbackDecisions < 0)))) throw new TypeError("invalid Academy policy evaluation run");
  if (candidateRuns.some((run, index) => {
    const baseline = requiredAt(baselineRuns, index, "Academy policy evaluation baseline case is missing");
    return run.lessonId !== baseline.lessonId || run.kind !== baseline.kind || run.scenarioHash !== baseline.scenarioHash
      || run.artifactDecisions === undefined || run.fallbackDecisions === undefined || run.artifactDecisions + run.fallbackDecisions !== run.decisions
      || baseline.artifactDecisions !== undefined || baseline.fallbackDecisions !== undefined;
  })) throw new TypeError("Academy policy evaluation candidate/baseline cases do not match");
  if (lessons.some((lesson) => !text(lesson.lessonId) || !Number.isFinite(lesson.candidateCompletedRate) || lesson.candidateCompletedRate < 0 || lesson.candidateCompletedRate > 1
    || !Number.isFinite(lesson.baselineCompletedRate) || lesson.baselineCompletedRate < 0 || lesson.baselineCompletedRate > 1
    || !Number.isFinite(lesson.threshold) || lesson.threshold <= 0 || lesson.threshold > 1 || typeof lesson.passed !== "boolean")) throw new TypeError("invalid Academy policy evaluation lesson result");
  if (new Set(lessons.map((lesson) => lesson.lessonId)).size !== lessons.length || lessons.some((lesson) => {
    const candidate = candidateRuns.filter((run) => run.lessonId === lesson.lessonId);
    const baseline = baselineRuns.filter((run) => run.lessonId === lesson.lessonId);
    return candidate.length < 1 || candidate.length !== baseline.length
      || lesson.candidateCompletedRate !== candidate.filter((run) => run.terminal.outcome === "completed").length / candidate.length
      || lesson.baselineCompletedRate !== baseline.filter((run) => run.terminal.outcome === "completed").length / baseline.length;
  }) || value.passed !== lessons.every((lesson) => lesson.passed)) throw new TypeError("Academy policy evaluation verdict does not match its runs");
  const draft = Object.freeze({ ...value, plan: Object.freeze({ ...value.plan }), candidate: Object.freeze({ ...value.candidate }),
    candidateRuns: Object.freeze(candidateRuns.map(freezeRun)), baselineRuns: Object.freeze(baselineRuns.map(freezeRun)),
    lessons: Object.freeze(lessons.map((lesson) => Object.freeze({ ...lesson }))) });
  return Object.freeze({ ...draft, resultHash: stableVerificationHash(draft) });
}

export function parseTearAcademyPolicyEvaluationResult(value: unknown): TearAcademyPolicyEvaluationResultV1 {
  if (!record(value) || value.format !== "tear-academy-policy-evaluation-result" || value.schemaVersion !== 1 || !hash(value.resultHash)) {
    throw new TypeError("invalid Academy policy evaluation result");
  }
  const typed = value as unknown as TearAcademyPolicyEvaluationResultV1, { resultHash, ...draft } = typed;
  const parsed = resultDraft(draft);
  if (parsed.resultHash !== resultHash) throw new TypeError("Academy policy evaluation result integrity mismatch");
  return parsed;
}

/** Local immutable custody for C33 plan verdicts; no active-policy consumer exists. */
export class TearAcademyPolicyEvaluationResultVault {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async persist(input: TearAcademyPolicyEvaluationResultV1): Promise<TearAcademyPolicyEvaluationResultV1> {
    const result = parseTearAcademyPolicyEvaluationResult(input), key = `${KEY}${result.resultHash}`;
    const existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parseTearAcademyPolicyEvaluationResult(JSON.parse(existing));
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(result) },
      { store: "indexes", key: `academy-policy-evaluation-result:${result.plan.id}:${result.resultHash}`,
        value: JSON.stringify({ planHash: result.plan.planHash, candidateHash: result.candidate.artifactHash, passed: result.passed }) },
    ]));
    return result;
  }

  async get(resultHash: string): Promise<TearAcademyPolicyEvaluationResultV1 | undefined> {
    if (!hash(resultHash)) throw new TypeError("Academy policy evaluation result hash is invalid");
    const key = `${KEY}${resultHash}`, raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parseTearAcademyPolicyEvaluationResult(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "academy-policy-evaluation-result-quarantine", schemaVersion: 1,
        key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}

function recoveryFor(launch: TearAcademyPolicyEvaluationLaunchV1, entry: TearAcademyPolicyEvaluationCaseV1): ProductionHeadlessStateForgeEvaluation | undefined {
  const identity = scenarioHash(entry);
  return launch.recovery.find((recovery) => recovery.scenarioHash === identity)?.evaluation;
}

async function runCase(entry: TearAcademyPolicyEvaluationCaseV1, recovery: ProductionHeadlessStateForgeEvaluation | undefined,
  policy: EvaluationPolicy, candidate: boolean): Promise<TearAcademyPolicyEvaluationCaseRunV1> {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    await policy.reset();
    const scenarioIdentity = scenarioHash(entry);
    let terminal = entry.kind === "recovery"
      ? (() => {
        if (recovery === undefined || stableVerificationHash(recovery.source.scenario) !== scenarioIdentity) {
          throw new RangeError("Academy recovery evaluation source scenario does not match its plan case");
        }
        if (recovery.source.checkpoint.tick >= entry.scenario.maxTicks) throw new RangeError("Academy recovery evaluation has no remaining case ticks");
        return environment.restoreStateForgeEvaluation(recovery);
      })()
      : environment.reset(entry.scenario);
    const startedAtTick = terminal.tick;
    let terminated = false, truncated = false, decisions = 0, artifactDecisions = 0, fallbackDecisions = 0;
    while (!terminated && !truncated && terminal.tick < entry.scenario.maxTicks) {
      const decision = policy.decide(environment.policyObservation());
      const transition = environment.step(decision.actions as never);
      terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated; decisions += 1;
      if (candidate) {
        if (decision.receipt?.source === "artifact") artifactDecisions += 1;
        else fallbackDecisions += 1;
      }
    }
    const events = environment.sourceTracks().nativeEvents.map(mapGameplayEventToCausalEvent);
    const completed = events.some((event) => event.type === "run.completed"), defeated = events.some((event) => event.type === "run.defeated");
    if (completed && defeated) throw new Error("Academy policy evaluation observed contradictory terminal facts");
    return freezeRun({ lessonId: entry.lessonId, kind: entry.kind, scenarioHash: scenarioIdentity, startedAtTick,
      terminal: Object.freeze({ tick: terminal.tick, semanticHash: stableVerificationHash(terminal), terminated, truncated,
        outcome: completed ? "completed" as const : defeated ? "defeated" as const : "none" as const,
        revivals: events.filter((event) => event.type === "player.revived").length }), decisions,
      ...(candidate ? { artifactDecisions, fallbackDecisions } : {}) });
  } finally { environment.dispose(); }
}

function candidatePolicy(artifact: TearPolicyArtifactV1): EvaluationPolicy {
  const runtime = new TearActivePolicyRuntime(artifact);
  return Object.freeze({ reset: () => runtime.reset(), decide: (observation: TearObservationV1) => runtime.decide({ state: observation, ui: { screen: "playing" } }) });
}

function baselinePolicy(profile: TearAgentProfileId): EvaluationPolicy {
  const runtime = new TearAgentOrchestrator(profile);
  return Object.freeze({ reset: () => Promise.resolve(), decide: (observation: TearObservationV1) => runtime.decide({ state: observation, ui: { screen: "playing" } }) });
}

function lessonMetrics(plan: TearAcademyPolicyEvaluationPlanV1, candidateRuns: readonly TearAcademyPolicyEvaluationCaseRunV1[],
  baselineRuns: readonly TearAcademyPolicyEvaluationCaseRunV1[]): readonly TearAcademyPolicyEvaluationLessonMetricV1[] {
  return Object.freeze(plan.lessonThresholds.map((lesson) => {
    const candidate = candidateRuns.filter((run) => run.lessonId === lesson.id), baseline = baselineRuns.filter((run) => run.lessonId === lesson.id);
    if (candidate.length < 1 || candidate.length !== baseline.length) throw new Error("Academy policy evaluation case execution is incomplete");
    const candidateCompletedRate = candidate.filter((run) => run.terminal.outcome === "completed").length / candidate.length;
    const baselineCompletedRate = baseline.filter((run) => run.terminal.outcome === "completed").length / baseline.length;
    return Object.freeze({ lessonId: lesson.id, candidateCompletedRate, baselineCompletedRate, threshold: lesson.passThreshold,
      passed: candidateCompletedRate >= lesson.passThreshold && candidateCompletedRate >= baselineCompletedRate + plan.minimumBaselineMargin });
  }));
}

/**
 * Executes a persisted C33 evaluation protocol through fresh source worlds.
 * Candidate and baseline share `runCase`; recovery cases must use the exact
 * lineage-bound State Forge frontier. The executor never touches a policy
 * registry, so it cannot register, activate, or promote the candidate.
 */
export class TearAcademyPolicyEvaluationExecutor {
  readonly #plans: TearAcademyPolicyEvaluationPlanVault;
  readonly #results: TearAcademyPolicyEvaluationResultVault;
  constructor(backend: GhostVaultBackend) { this.#plans = new TearAcademyPolicyEvaluationPlanVault(backend); this.#results = new TearAcademyPolicyEvaluationResultVault(backend); }

  async execute(input: TearAcademyPolicyEvaluationLaunchV1): Promise<TearAcademyPolicyEvaluationResultV1> {
    const launch = parseTearAcademyPolicyEvaluationLaunch(input);
    const plan = await this.#plans.get(launch.plan.id);
    if (plan?.planHash !== launch.plan.planHash) throw new RangeError("Academy policy evaluation plan is unavailable or changed");
    if (launch.candidate.lineage.trainingRunId !== plan.artifactTrainingHash) throw new RangeError("Academy policy evaluation candidate does not match plan training lineage");
    const recoveryHashes = new Set(launch.recovery.map((entry) => entry.scenarioHash));
    for (const entry of plan.cases) {
      const identity = scenarioHash(entry);
      if (entry.kind === "recovery" && !recoveryHashes.has(identity)) throw new RangeError("Academy policy evaluation recovery case lacks a lineage-bound State Forge launch");
      if (entry.kind === "unseen" && recoveryHashes.has(identity)) throw new RangeError("Academy policy evaluation unseen case cannot use a recovery launch");
    }
    if (launch.recovery.some((entry) => !plan.cases.some((item) => item.kind === "recovery" && scenarioHash(item) === entry.scenarioHash))) {
      throw new RangeError("Academy policy evaluation recovery launch is not declared by the plan");
    }
    const candidateRuns: TearAcademyPolicyEvaluationCaseRunV1[] = [], baselineRuns: TearAcademyPolicyEvaluationCaseRunV1[] = [];
    for (const entry of plan.cases) {
      const recovery = recoveryFor(launch, entry);
      candidateRuns.push(await runCase(entry, recovery, candidatePolicy(launch.candidate), true));
      baselineRuns.push(await runCase(entry, recovery, baselinePolicy(plan.baselineProfile), false));
    }
    const lessons = lessonMetrics(plan, candidateRuns, baselineRuns);
    const draft = { format: "tear-academy-policy-evaluation-result" as const, schemaVersion: 1 as const,
      plan: Object.freeze({ id: plan.id, planHash: plan.planHash }), launchHash: launch.launchHash,
      candidate: Object.freeze({ id: launch.candidate.id, artifactHash: launch.candidate.artifactHash, trainingHash: launch.candidate.lineage.trainingRunId }),
      baselineProfile: plan.baselineProfile, candidateRuns: Object.freeze(candidateRuns), baselineRuns: Object.freeze(baselineRuns), lessons,
      passed: lessons.every((lesson) => lesson.passed) };
    return this.#results.persist(resultDraft(draft));
  }
}
