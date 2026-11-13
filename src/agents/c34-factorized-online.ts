import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { stableVerificationHash } from "../replay/hash";
import {
  createProductionHeadlessEnvironment,
  validateProductionHeadlessCheckpoint,
  validateProductionHeadlessScenario,
  type ProductionHeadlessCheckpoint,
} from "../tearbench/production-headless-environment";
import type { TearScenarioV1 } from "../tearbench/contracts";
import {
  advanceFactorizedReturnContext,
  beginFactorizedReturnContext,
  projectFactorizedReturnFeatures,
  restoreFactorizedReturnPrefix,
  requireFactorizedReturnFrontier,
  parseFactorizedReturnContext,
  type FactorizedReturnContext,
  type FactorizedReturnTransition,
} from "./c34-causal-action-features";
import {
  advanceFactorizedQModel,
  factorizedQBatches,
  parseFactorizedQModel,
  prepareFactorizedQSelector,
  type FactorizedQModel,
  type FactorizedQSupport,
} from "./c34-factorized-action-q";
import {
  parseFactorizedOfflinePlan,
  parseFactorizedOfflineResult,
  type FactorizedOfflinePlan,
  type FactorizedOfflineResult,
} from "./c34-factorized-training";
import {
  evaluateTearOfflineRlRewardTransition,
  measureTearNativeReturns,
  parseTearOfflineRlPlan,
  type TearOfflineRlPlanV1,
} from "./offline-rl-training";

/** Prefix bytes are declared in the plan, then independently replayed in the real source world. */
export interface FactorizedSourceCase {
  readonly scenario: TearScenarioV1;
  readonly prefix?: Readonly<{
    anchor: CanonicalGameplayState;
    transitions: readonly FactorizedReturnTransition[];
    prefixHash: string;
  }>;
}
export interface FactorizedOnlinePlan {
  readonly format: "tear-factorized-online-plan.v4";
  readonly schemaVersion: 4;
  readonly id: string;
  readonly offlinePlanHash: string;
  readonly trainingHash: string;
  readonly rewardPlanHash: string;
  readonly cases: readonly FactorizedSourceCase[];
  readonly maxUpdates: number;
  readonly maxTicksPerCase: number;
  readonly cadence: "one-native-120hz-commit";
  readonly planHash: string;
}
export interface FactorizedOnlineCheckpoint {
  readonly format: "tear-factorized-online-checkpoint.v4";
  readonly schemaVersion: 4;
  readonly planHash: string;
  readonly cursor: number;
  readonly ticks: number;
  readonly updates: number;
  readonly status: "running" | "complete" | "cancelled" | "timed-out" | "refused" | "stopped-divergence";
  readonly model: FactorizedQModel;
  readonly resume?: Readonly<{
    cursor: number;
    caseHash: string;
    originFrontier: string;
    world: ProductionHeadlessCheckpoint;
    context: FactorizedReturnContext;
  }>;
  readonly checkpointHash: string;
}
export interface FactorizedEvaluationTrace {
  readonly side: "baseline" | "challenger";
  readonly caseHash: string;
  readonly originTick: number;
  readonly ticks: number;
  readonly reward: number;
  readonly terminalHash: string;
  readonly support: Readonly<Record<FactorizedQSupport["kind"], number>>;
  readonly refused: boolean;
  readonly terminated: boolean;
  readonly censored: boolean;
  readonly nativeReturns: ReturnType<typeof measureTearNativeReturns>;
  readonly returnGoal: ReturnType<typeof measureFactorizedReturnGoal>;
}
export interface FactorizedOnlineEvaluation {
  readonly format: "tear-factorized-online-evaluation.v4";
  readonly schemaVersion: 4;
  readonly planHash: string;
  readonly trainingHash: string;
  readonly checkpointHash: string;
  readonly casesHash: string;
  readonly traces: readonly FactorizedEvaluationTrace[];
  readonly minimumRewardGain: number;
  readonly passed: boolean;
  readonly promotional: false;
  readonly evaluationHash: string;
}
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{16}$/u.test(value);
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((d) => !("get" in d || "set" in d))
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
function digest(value: object, key: string): void {
  const { [key]: witness, ...draft } = value as Record<string, unknown>;
  if (!hash(witness) || stableVerificationHash(draft) !== witness) throw new TypeError(`factorized ${key} mismatch`);
}
/** Original R14 rule, expressed over the same native facts: request alone is never an accepted recall. */
export function measureFactorizedReturnGoal(
  steps: readonly FactorizedReturnTransition[],
  prefix: readonly TearGameplayEvent[] = [],
) {
  const suffix = steps.flatMap((step) => step.events),
    launches = [...prefix, ...suffix].filter(
      (event) =>
        event.kind === "weapon" &&
        event.event === "throw-launch" &&
        event.weaponId === "sword" &&
        Number.isSafeInteger(event.throwId) &&
        event.throwId > 0,
    );
  const recalls = steps.filter(
    (step) =>
      step.actions.some(
        (action) => action.type === "weapon" && action.intent === "recall" && action.phase === "pressed",
      ) &&
      step.from.blade?.state === "flying" &&
      step.to.blade?.state === "returning",
  );
  const matches: { thrownAt: number; recalledAt: number; caughtAt: number; throwId: number }[] = [];
  for (const recall of recalls) {
    const launch = launches.filter((event) => event.tick < recall.to.tick).at(-1);
    if (launch?.kind !== "weapon") continue;
    const caught = suffix.find(
      (event) =>
        event.kind === "weapon" &&
        event.event === "catch" &&
        event.tick >= recall.to.tick &&
        event.weaponId === launch.weaponId &&
        event.throwId === launch.throwId,
    );
    if (caught)
      matches.push({
        thrownAt: launch.tick,
        recalledAt: recall.to.tick,
        caughtAt: caught.tick,
        throwId: launch.throwId,
      });
  }
  return freeze({
    success: matches.length > 0,
    matches,
    actualThrows: launches.length,
    acceptedRecalls: recalls.length,
    actualCatches: suffix.filter((event) => event.kind === "weapon" && event.event === "catch").length,
  });
}
function sourceCase(input: FactorizedSourceCase, maximum: number): FactorizedSourceCase {
  if (!record(input) || !exact(input, input.prefix === undefined ? ["scenario"] : ["scenario", "prefix"]))
    throw new TypeError("invalid factorized source case");
  validateProductionHeadlessScenario(input.scenario);
  if (input.scenario.maxTicks > maximum) throw new RangeError("source scenario exceeds declared tick budget");
  if (input.prefix !== undefined) {
    if (
      !record(input.prefix) ||
      !exact(input.prefix, ["anchor", "transitions", "prefixHash"]) ||
      !Array.isArray(input.prefix.transitions) ||
      input.prefix.transitions.length < 1 ||
      input.prefix.transitions.length >= input.scenario.maxTicks
    )
      throw new TypeError("invalid source recovery prefix");
    restoreFactorizedReturnPrefix(input.prefix.anchor, input.prefix.transitions, input.prefix.prefixHash);
  }
  return freeze(input);
}
export function createFactorizedOnlinePlan(
  offlineInput: FactorizedOfflinePlan,
  trainingInput: FactorizedOfflineResult,
  rewardInput: TearOfflineRlPlanV1,
  input: Readonly<{ id: string; cases: readonly FactorizedSourceCase[]; maxUpdates: number; maxTicksPerCase: number }>,
): FactorizedOnlinePlan {
  const offline = parseFactorizedOfflinePlan(offlineInput),
    training = parseFactorizedOfflineResult(trainingInput),
    reward = parseTearOfflineRlPlan(rewardInput);
  if (
    training.status !== "complete" ||
    training.planHash !== offline.planHash ||
    training.receiptHash !== offline.receipt.receiptHash ||
    reward.planHash !== offline.receipt.planHash ||
    reward.reward.rewardHash !== offline.receipt.rewardHash
  )
    throw new TypeError("factorized online training lineage changed");
  const draft = {
    format: "tear-factorized-online-plan.v4" as const,
    schemaVersion: 4 as const,
    id: input.id,
    offlinePlanHash: offline.planHash,
    trainingHash: training.trainingHash,
    rewardPlanHash: reward.planHash,
    cases: input.cases,
    maxUpdates: input.maxUpdates,
    maxTicksPerCase: input.maxTicksPerCase,
    cadence: "one-native-120hz-commit" as const,
  };
  return parseFactorizedOnlinePlan({ ...draft, planHash: stableVerificationHash(draft) });
}
export function parseFactorizedOnlinePlan(value: unknown): FactorizedOnlinePlan {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "id",
      "offlinePlanHash",
      "trainingHash",
      "rewardPlanHash",
      "cases",
      "maxUpdates",
      "maxTicksPerCase",
      "cadence",
      "planHash",
    ]) ||
    value.format !== "tear-factorized-online-plan.v4" ||
    value.schemaVersion !== 4 ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > 256 ||
    ![value.offlinePlanHash, value.trainingHash, value.rewardPlanHash].every(hash) ||
    value.cadence !== "one-native-120hz-commit" ||
    !Number.isSafeInteger(value.maxUpdates) ||
    Number(value.maxUpdates) < 1 ||
    Number(value.maxUpdates) > 1_000_000 ||
    !Number.isSafeInteger(value.maxTicksPerCase) ||
    Number(value.maxTicksPerCase) < 1 ||
    Number(value.maxTicksPerCase) > 20_000 ||
    !Array.isArray(value.cases) ||
    value.cases.length < 1 ||
    value.cases.length > 64
  )
    throw new TypeError("invalid factorized online plan");
  const typed = value as unknown as FactorizedOnlinePlan;
  typed.cases.forEach((entry) => sourceCase(entry, typed.maxTicksPerCase));
  digest(typed, "planHash");
  return freeze(typed);
}
function checkpoint(draft: Omit<FactorizedOnlineCheckpoint, "checkpointHash">): FactorizedOnlineCheckpoint {
  return freeze({ ...draft, checkpointHash: stableVerificationHash(draft) });
}
export function parseFactorizedOnlineCheckpoint(value: unknown): FactorizedOnlineCheckpoint {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "planHash",
      "cursor",
      "ticks",
      "updates",
      "status",
      "model",
      "checkpointHash",
      ...(value.resume === undefined ? [] : ["resume"]),
    ]) ||
    value.format !== "tear-factorized-online-checkpoint.v4" ||
    value.schemaVersion !== 4 ||
    !hash(value.planHash) ||
    ![value.cursor, value.ticks, value.updates].every((v) => Number.isSafeInteger(v) && Number(v) >= 0) ||
    typeof value.status !== "string" ||
    !["running", "complete", "cancelled", "timed-out", "refused", "stopped-divergence"].includes(value.status)
  )
    throw new TypeError("invalid factorized online checkpoint");
  const typed = value as unknown as FactorizedOnlineCheckpoint;
  parseFactorizedQModel(typed.model);
  if (
    typed.resume !== undefined &&
    (!record(typed.resume) ||
      !exact(typed.resume, ["cursor", "caseHash", "originFrontier", "world", "context"]) ||
      typed.resume.cursor !== typed.cursor ||
      !hash(typed.resume.caseHash) ||
      !hash(typed.resume.originFrontier))
  )
    throw new TypeError("invalid source/context recovery pair");
  digest(typed, "checkpointHash");
  return freeze(typed);
}
export function createFactorizedOnlineCheckpoint(
  planInput: FactorizedOnlinePlan,
  resultInput: FactorizedOfflineResult,
): FactorizedOnlineCheckpoint {
  const plan = parseFactorizedOnlinePlan(planInput),
    training = parseFactorizedOfflineResult(resultInput);
  if (training.trainingHash !== plan.trainingHash || training.status !== "complete")
    throw new TypeError("factorized baseline unavailable");
  return checkpoint({
    format: "tear-factorized-online-checkpoint.v4",
    schemaVersion: 4,
    planHash: plan.planHash,
    cursor: 0,
    ticks: 0,
    updates: 0,
    status: "running",
    model: training.model,
  });
}
/** A declared prefix must match real replay states AND native effects; supplied observations cannot fabricate memory. */
export function materializeFactorizedOrigin(
  environment: ReturnType<typeof createProductionHeadlessEnvironment>,
  input: FactorizedSourceCase,
) {
  let state = environment.reset(input.scenario),
    context = beginFactorizedReturnContext(state);
  if (input.prefix !== undefined) {
    const prefix = input.prefix;
    if (stableVerificationHash(state) !== stableVerificationHash(prefix.anchor))
      throw new TypeError("source prefix has a foreign origin");
    restoreFactorizedReturnPrefix(prefix.anchor, prefix.transitions, prefix.prefixHash);
    for (const expected of prefix.transitions) {
      if (stableVerificationHash(state) !== stableVerificationHash(expected.from))
        throw new TypeError("source prefix frontier mismatch");
      const step = environment.step(expected.actions),
        to = step.observation;
      const events = environment.sourceTracks().nativeEvents.filter((event) => event.tick === to.tick);
      if (
        stableVerificationHash(to) !== stableVerificationHash(expected.to) ||
        stableVerificationHash(events) !== stableVerificationHash(expected.events)
      )
        throw new TypeError("source prefix native replay mismatch");
      context = advanceFactorizedReturnContext(context, { from: state, to, actions: expected.actions, events });
      state = to;
      if (step.terminated || step.truncated) throw new TypeError("source prefix crossed terminal boundary");
    }
  }
  return { state, context };
}
export function advanceFactorizedOnlineCheckpoint(
  planInput: FactorizedOnlinePlan,
  offlineInput: FactorizedOfflinePlan,
  trainingInput: FactorizedOfflineResult,
  rewardInput: TearOfflineRlPlanV1,
  priorInput: FactorizedOnlineCheckpoint,
  control: Readonly<{
    maxTicks?: number;
    cancelled?: () => boolean;
    now?: () => number;
    timeoutMilliseconds?: number;
  }> = {},
): FactorizedOnlineCheckpoint {
  const plan = parseFactorizedOnlinePlan(planInput),
    prior = parseFactorizedOnlineCheckpoint(priorInput),
    offline = parseFactorizedOfflinePlan(offlineInput);
  const training = parseFactorizedOfflineResult(trainingInput),
    reward = parseTearOfflineRlPlan(rewardInput);
  if (
    createFactorizedOnlinePlan(offline, training, reward, plan).planHash !== plan.planHash ||
    prior.planHash !== plan.planHash ||
    prior.model.planHash !== offline.planHash ||
    stableVerificationHash(prior.model.basis) !== stableVerificationHash(training.model.basis) ||
    stableVerificationHash(prior.model.config) !== stableVerificationHash(training.model.config) ||
    prior.cursor > plan.cases.length ||
    prior.updates !== prior.ticks ||
    prior.updates > plan.maxUpdates ||
    stableVerificationHash(prior.model.heads.map((head) => head.actions)) !==
      stableVerificationHash(factorizedQBatches(offline.actionVocabulary))
  )
    throw new TypeError("factorized online checkpoint lineage changed");
  if (prior.status !== "running") return prior;
  const now = control.now ?? (() => performance.now()),
    started = now();
  let cursor = prior.cursor,
    ticks = prior.ticks,
    updates = prior.updates,
    model = prior.model,
    resume = prior.resume;
  const finish = (status: FactorizedOnlineCheckpoint["status"]) =>
    checkpoint({
      format: prior.format,
      schemaVersion: 4,
      planHash: plan.planHash,
      cursor,
      ticks,
      updates,
      model,
      status,
      ...(resume === undefined ? {} : { resume }),
    });
  while (cursor < plan.cases.length) {
    const entry = plan.cases[cursor];
    if (!entry) throw new Error("validated factorized case disappeared");
    const caseHash = stableVerificationHash(entry);
    const resumedWorld = resume === undefined ? undefined : validateProductionHeadlessCheckpoint(resume.world);
    if (
      resume !== undefined &&
      (resume.cursor !== cursor ||
        resume.caseHash !== caseHash ||
        !resumedWorld ||
        stableVerificationHash(resumedWorld.scenario) !== stableVerificationHash(entry.scenario))
    )
      throw new TypeError("factorized resume case/scenario mismatch");
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
    try {
      let state: CanonicalGameplayState, context: FactorizedReturnContext, originFrontier: string;
      if (resume !== undefined && resumedWorld !== undefined) {
        const initial = environment.reset(entry.scenario),
          origin = entry.prefix?.transitions.at(-1)?.to ?? initial;
        originFrontier = stableVerificationHash(origin);
        context = parseFactorizedReturnContext(resume.context);
        const prefixActions =
          entry.prefix?.transitions.flatMap((row) => row.actions.map((command) => ({ tick: row.to.tick, command }))) ??
          [];
        const retainedPrefix = resumedWorld.actions
          .filter((action) => action.tick <= origin.tick)
          .map((action) => ({ tick: action.tick, command: action.command }));
        if (
          resume.originFrontier !== originFrontier ||
          context.tick < origin.tick ||
          context.tick >= entry.scenario.maxTicks ||
          context.tick !== resumedWorld.checkpoint.tick ||
          context.frontier !== resumedWorld.checkpoint.semanticHash ||
          stableVerificationHash(resumedWorld.bootstrap) !==
            stableVerificationHash(environment.captureCheckpoint().bootstrap) ||
          stableVerificationHash(prefixActions) !== stableVerificationHash(retainedPrefix)
        )
          throw new TypeError("factorized resume source origin/frontier mismatch");
        // No prefix is stepped/relearned on resume, and every join precedes foreign-world adoption.
        state = environment.restoreCheckpoint(resumedWorld);
        requireFactorizedReturnFrontier(context, state);
      } else {
        ({ state, context } = materializeFactorizedOrigin(environment, entry));
        originFrontier = stableVerificationHash(state);
      }
      while (state.tick < Math.min(entry.scenario.maxTicks, plan.maxTicksPerCase)) {
        if (control.cancelled?.() === true) return finish("cancelled");
        if (control.timeoutMilliseconds !== undefined && now() - started >= control.timeoutMilliseconds)
          return finish("timed-out");
        if (control.maxTicks !== undefined && ticks - prior.ticks >= control.maxTicks) return finish("running");
        if (updates >= plan.maxUpdates) return finish("stopped-divergence");
        const available = environment.policyObservation().availableActions,
          from = projectFactorizedReturnFeatures(state, context);
        const selection = prepareFactorizedQSelector(model)(from, available);
        if (!selection) return finish("refused");
        const step = environment.step(selection.actions),
          to = step.observation,
          events = environment.sourceTracks().nativeEvents.filter((event) => event.tick === to.tick);
        const nextContext = advanceFactorizedReturnContext(context, {
          from: state,
          to,
          actions: selection.actions,
          events,
        });
        const sample = {
          from,
          to: projectFactorizedReturnFeatures(to, nextContext),
          actions: selection.actions,
          available,
          nextAvailable: environment.policyObservation().availableActions,
          reward: evaluateTearOfflineRlRewardTransition(reward, state, to, events).total,
          terminal: step.terminated || step.truncated,
        };
        try {
          model = advanceFactorizedQModel(model, [sample]).model;
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          return finish("stopped-divergence");
        }
        state = to;
        context = nextContext;
        ticks++;
        updates++;
        if (sample.terminal) {
          resume = undefined;
          break;
        }
        resume = { cursor, caseHash, originFrontier, world: environment.captureCheckpoint(), context };
      }
      cursor++;
      resume = undefined;
    } finally {
      environment.dispose();
    }
  }
  return finish("complete");
}
function execute(
  model: FactorizedQModel,
  cases: readonly FactorizedSourceCase[],
  reward: TearOfflineRlPlanV1,
  side: "baseline" | "challenger",
): readonly FactorizedEvaluationTrace[] {
  const select = prepareFactorizedQSelector(model);
  return cases.map((entry) => {
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
    try {
      let { state, context } = materializeFactorizedOrigin(environment, entry);
      const originTick = state.tick,
        support = { "observed-motor": 0, generalized: 0, unknown: 0 };
      const steps: FactorizedReturnTransition[] = [],
        prefixEvents = [...environment.sourceTracks().nativeEvents];
      let total = 0,
        terminated = false,
        censored = false,
        refused = false;
      while (state.tick < entry.scenario.maxTicks) {
        const selection = select(
          projectFactorizedReturnFeatures(state, context),
          environment.policyObservation().availableActions,
        );
        if (!selection) {
          refused = true;
          break;
        }
        support[selection.support.kind]++;
        const step = environment.step(selection.actions),
          events = environment.sourceTracks().nativeEvents.filter((event) => event.tick === step.observation.tick);
        const committed = { from: state, to: step.observation, actions: selection.actions, events };
        steps.push(committed);
        context = advanceFactorizedReturnContext(context, committed);
        total += evaluateTearOfflineRlRewardTransition(reward, state, step.observation, events).total;
        state = step.observation;
        terminated = step.terminated;
        censored = step.truncated;
        if (terminated || censored) break;
      }
      return freeze({
        side,
        caseHash: stableVerificationHash(entry),
        originTick,
        ticks: state.tick - originTick,
        reward: total,
        terminalHash: stableVerificationHash(state),
        support,
        refused,
        terminated,
        censored: censored || (!terminated && state.tick >= entry.scenario.maxTicks),
        nativeReturns: measureTearNativeReturns(environment.sourceTracks().nativeEvents),
        returnGoal: measureFactorizedReturnGoal(steps, prefixEvents),
      });
    } finally {
      environment.dispose();
    }
  });
}
/** Same cases, actual fixed-step budget and goal matcher for both sides, including fresh AND prefix origins. */
export function evaluateFactorizedOnlineInSource(
  planInput: FactorizedOnlinePlan,
  offlineInput: FactorizedOfflinePlan,
  trainingInput: FactorizedOfflineResult,
  rewardInput: TearOfflineRlPlanV1,
  checkpointInput: FactorizedOnlineCheckpoint,
  casesInput: readonly FactorizedSourceCase[],
  minimumRewardGain: number,
): FactorizedOnlineEvaluation {
  const plan = parseFactorizedOnlinePlan(planInput),
    offline = parseFactorizedOfflinePlan(offlineInput),
    training = parseFactorizedOfflineResult(trainingInput);
  const reward = parseTearOfflineRlPlan(rewardInput),
    c = parseFactorizedOnlineCheckpoint(checkpointInput);
  if (
    createFactorizedOnlinePlan(offline, training, reward, plan).planHash !== plan.planHash ||
    c.planHash !== plan.planHash ||
    c.status !== "complete" ||
    c.model.planHash !== offline.planHash ||
    stableVerificationHash(c.model.basis) !== stableVerificationHash(training.model.basis) ||
    stableVerificationHash(c.model.config) !== stableVerificationHash(training.model.config) ||
    stableVerificationHash(c.model.heads.map((head) => head.actions)) !==
      stableVerificationHash(factorizedQBatches(offline.actionVocabulary)) ||
    c.cursor !== plan.cases.length ||
    casesInput.length < 1 ||
    casesInput.length > 64 ||
    !Number.isFinite(minimumRewardGain)
  )
    throw new TypeError("factorized evaluation lineage or case contract changed");
  const cases = casesInput.map((entry) => sourceCase(entry, plan.maxTicksPerCase));
  const traces = [
    ...execute(training.model, cases, reward, "baseline"),
    ...execute(c.model, cases, reward, "challenger"),
  ];
  const sum = (side: "baseline" | "challenger") =>
    traces.filter((t) => t.side === side).reduce((total, t) => total + t.reward, 0);
  const passed = traces.every((t) => !t.refused) && sum("challenger") - sum("baseline") >= minimumRewardGain;
  const draft = {
    format: "tear-factorized-online-evaluation.v4" as const,
    schemaVersion: 4 as const,
    planHash: plan.planHash,
    trainingHash: training.trainingHash,
    checkpointHash: c.checkpointHash,
    casesHash: stableVerificationHash(cases),
    traces,
    minimumRewardGain,
    passed,
    promotional: false as const,
  };
  return freeze({ ...draft, evaluationHash: stableVerificationHash(draft) });
}
export function parseFactorizedOnlineEvaluation(value: unknown): FactorizedOnlineEvaluation {
  if (
    !record(value) ||
    !exact(value, [
      "format",
      "schemaVersion",
      "planHash",
      "trainingHash",
      "checkpointHash",
      "casesHash",
      "traces",
      "minimumRewardGain",
      "passed",
      "promotional",
      "evaluationHash",
    ]) ||
    value.format !== "tear-factorized-online-evaluation.v4" ||
    value.schemaVersion !== 4 ||
    ![value.planHash, value.trainingHash, value.checkpointHash, value.casesHash].every(hash) ||
    !Array.isArray(value.traces) ||
    value.traces.length < 2 ||
    value.traces.length > 128 ||
    value.traces.length % 2 !== 0 ||
    typeof value.passed !== "boolean" ||
    value.promotional !== false ||
    !Number.isFinite(value.minimumRewardGain)
  )
    throw new TypeError("invalid factorized evaluation");
  const typed = value as unknown as FactorizedOnlineEvaluation;
  digest(typed, "evaluationHash");
  for (const t of typed.traces)
    if (
      !record(t) ||
      !exact(t, [
        "side",
        "caseHash",
        "originTick",
        "ticks",
        "reward",
        "terminalHash",
        "support",
        "refused",
        "terminated",
        "censored",
        "nativeReturns",
        "returnGoal",
      ]) ||
      !["baseline", "challenger"].includes(t.side) ||
      !hash(t.caseHash) ||
      !hash(t.terminalHash) ||
      !Number.isFinite(t.reward) ||
      !Number.isSafeInteger(t.ticks) ||
      t.ticks < 0 ||
      !Number.isSafeInteger(t.originTick) ||
      t.originTick < 0 ||
      typeof t.refused !== "boolean" ||
      typeof t.terminated !== "boolean" ||
      typeof t.censored !== "boolean" ||
      !record(t.support) ||
      !exact(t.support, ["observed-motor", "generalized", "unknown"]) ||
      !Object.values(t.support).every((v) => Number.isSafeInteger(v) && v >= 0) ||
      Object.values(t.support).reduce((sum, v) => sum + v, 0) !== t.ticks ||
      !record(t.nativeReturns) ||
      !Number.isSafeInteger(t.nativeReturns.matchedCatches) ||
      !Array.isArray(t.nativeReturns.matches) ||
      t.nativeReturns.matches.length !== t.nativeReturns.matchedCatches ||
      !record(t.returnGoal) ||
      typeof t.returnGoal.success !== "boolean" ||
      !Array.isArray(t.returnGoal.matches) ||
      t.returnGoal.success !== t.returnGoal.matches.length > 0
    )
      throw new TypeError("invalid factorized evaluation trace");
  const half = typed.traces.length / 2;
  for (let i = 0; i < half; i++) {
    const a = typed.traces[i],
      b = typed.traces[i + half];
    if (
      !a ||
      !b ||
      a.side !== "baseline" ||
      b.side !== "challenger" ||
      a.caseHash !== b.caseHash ||
      a.originTick !== b.originTick
    )
      throw new TypeError("factorized paired cases mismatch");
  }
  const sum = (side: "baseline" | "challenger") =>
    typed.traces.filter((t) => t.side === side).reduce((total, t) => total + t.reward, 0);
  if (
    typed.passed !==
    (typed.traces.every((t) => !t.refused) && sum("challenger") - sum("baseline") >= typed.minimumRewardGain)
  )
    throw new TypeError("factorized reward criterion mismatch");
  return freeze(typed);
}
