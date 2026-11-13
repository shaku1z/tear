/** Training Operations result validation; serialized result identity is preserved. */
import { normalizeGameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { requireTearFoundryEvaluationProtocol, type TearFoundryJobV1 } from "./foundry-job-state";
import {
  createTrainingOperationsV3ChampionEvaluationPlan,
  type evaluateTrainingOperationsV3ChampionInSource,
  type TrainingOperationsV3ChampionEvaluationPlanV1,
} from "./training-operations-v3-champion-evaluation";
import type { TearOfflineRlPlanV1 } from "./offline-rl-training";
import type { TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { parseTearC34V3C32PolicyCandidate } from "./c34-v3-c32-policy-adapter";
import { readTearReturnVariant } from "./c34-source-feature-state";
import { DEFAULT_TEAR_POLICY_RUNTIME_LIMITS } from "./policy-runtime";

export type TrainingOperationsV3ChampionEvaluationResultV1 = ReturnType<
  typeof evaluateTrainingOperationsV3ChampionInSource
>;
const HASH = /^[a-f0-9]{16}$/u;
const hash = (value: unknown): boolean => typeof value === "string" && HASH.test(value);
const same = (a: unknown, b: unknown): boolean => stableVerificationHash(a) === stableVerificationHash(b);
/** Freeze an owned evidence clone, including all nested collections. */
export function freezeTrainingOperationsEvidence<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((entry: unknown) => {
      freezeTrainingOperationsEvidence(entry);
    });
    Object.freeze(value);
  }
  return value;
}
function closed(value: unknown, keys: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid V3 comparison result object");
  const allowed = keys.split(" ");
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError("invalid V3 comparison result fields");
  return value as Record<string, unknown>;
}

/** Validates retained facts and their joins, not authenticity or promotion authority. */
export function parseTrainingOperationsV3ChampionEvaluationResult(
  value: unknown,
  planInput: TrainingOperationsV3ChampionEvaluationPlanV1,
  job: TearFoundryJobV1,
  reward: TearOfflineRlPlanV1,
  champion: TearPolicyArtifactV1,
  challenger: TearPolicyArtifactV1,
): TrainingOperationsV3ChampionEvaluationResultV1 {
  const raw = closed(value, "format schemaVersion plan traces metrics promotional resultHash");
  const typed = value as TrainingOperationsV3ChampionEvaluationResultV1;
  const { resultHash, ...draft } = typed;
  if (
    raw.format !== "tear-foundry-v3-champion-evaluation" ||
    raw.schemaVersion !== 1 ||
    raw.promotional !== false ||
    !hash(resultHash) ||
    stableVerificationHash(draft) !== resultHash
  )
    throw new TypeError("V3 comparison result integrity mismatch");
  const plan = createTrainingOperationsV3ChampionEvaluationPlan(job, planInput.cases, reward, champion, challenger);
  if (!same(plan, planInput) || !same(plan, typed.plan)) throw new RangeError("V3 comparison result plan changed");
  const thresholds = requireTearFoundryEvaluationProtocol(job).thresholds;
  if (!Array.isArray(raw.traces) || raw.traces.length !== plan.cases.length * 2)
    throw new RangeError("V3 comparison result case coverage changed");
  typed.traces.forEach((trace, index) => {
    const scenario = plan.cases[Math.floor(index / 2)],
      side = index % 2 === 0 ? "champion" : "challenger";
    const artifact = side === "champion" ? champion : challenger;
    const model = parseTearC34V3C32PolicyCandidate(artifact).model,
      variant = readTearReturnVariant(model.sourceStateAdapter);
    closed(
      trace,
      `side artifactId artifactHash scenarioHash freshWorldOrdinal build decisions totalReward terminal eventHash${variant === undefined ? "" : " returnEvidence"}`,
    );
    if (
      scenario === undefined ||
      trace.side !== side ||
      trace.artifactId !== artifact.id ||
      trace.artifactHash !== artifact.artifactHash ||
      trace.scenarioHash !== stableVerificationHash(scenario) ||
      trace.freshWorldOrdinal !== index + 1 ||
      !Number.isFinite(trace.totalReward) ||
      Math.abs(trace.totalReward) > thresholds.maxAbsoluteRewardPerCase ||
      !hash(trace.eventHash)
    )
      throw new RangeError("V3 comparison result trace identity changed");
    const build = closed(trace.build, "version revision target rulesetVersion contentHash configHash");
    if (Object.values(build).some((entry) => typeof entry !== "string" || entry.trim().length === 0))
      throw new TypeError("invalid V3 comparison source build");
    const terminal = closed(trace.terminal, "tick semanticHash terminated truncated completed defeated");
    if (
      !Number.isSafeInteger(terminal.tick) ||
      !hash(terminal.semanticHash) ||
      [terminal.terminated, terminal.truncated, terminal.completed, terminal.defeated].some(
        (entry) => typeof entry !== "boolean",
      )
    )
      throw new TypeError("invalid V3 comparison terminal");
    if (
      trace.terminal.terminated === trace.terminal.truncated ||
      (!trace.terminal.terminated && (trace.terminal.completed || trace.terminal.defeated)) ||
      (trace.terminal.completed && trace.terminal.defeated)
    )
      throw new RangeError("V3 comparison terminal facts conflict");
    const maximumTicks = Math.min(scenario.maxTicks, thresholds.maxTicksPerCase);
    if (
      !Array.isArray(trace.decisions) ||
      trace.decisions.length < 1 ||
      trace.decisions.length > maximumTicks ||
      trace.terminal.tick !== trace.decisions.length ||
      (!trace.terminal.terminated && !trace.terminal.truncated) ||
      (!trace.terminal.terminated && trace.terminal.tick !== maximumTicks)
    )
      throw new RangeError("V3 comparison result tick coverage changed");
    trace.decisions.forEach(
      (decision: TrainingOperationsV3ChampionEvaluationResultV1["traces"][number]["decisions"][number], tick) => {
        closed(decision, `tick stateHash actions actionHash${variant === undefined ? "" : " returnDecision"}`);
        if (
          decision.tick !== tick ||
          !hash(decision.stateHash) ||
          !Array.isArray(decision.actions) ||
          (variant === undefined ? decision.actions.length !== 1 : decision.actions.length > 1) ||
          decision.actionHash !== stableVerificationHash(decision.actions)
        )
          throw new RangeError("V3 comparison result decision changed");
        if (variant !== undefined) {
          const returned = decision.returnDecision;
          closed(returned, "actions source decisionMilliseconds support");
          if (returned?.support === undefined) throw new TypeError("return decision support is missing");
          closed(returned.support, "entryPresent value stateKey semanticActionHash");
          const support = returned.support,
            entry = model.entries.find(
              (row) => row.stateHash === support.stateKey && row.semanticActionHash === support.semanticActionHash,
            );
          if (
            typeof support.entryPresent !== "boolean" ||
            !hash(support.stateKey) ||
            support.semanticActionHash !== stableVerificationHash(decision.actions) ||
            support.entryPresent !== (entry !== undefined) ||
            support.value !== (entry?.value ?? 0) ||
            returned.source !== (support.entryPresent ? "artifact" : "model-default") ||
            !same(returned.actions, decision.actions) ||
            returned.decisionMilliseconds === undefined ||
            !Number.isFinite(returned.decisionMilliseconds) ||
            returned.decisionMilliseconds < 0 ||
            returned.decisionMilliseconds > DEFAULT_TEAR_POLICY_RUNTIME_LIMITS.maxDecisionMilliseconds
          )
            throw new RangeError("return decision support or budget changed");
        }
        for (const action of decision.actions) {
          const normalized = normalizeGameAction(action);
          if (!normalized.ok || !same(normalized.action, action)) throw new TypeError("invalid V3 comparison action");
        }
      },
    );
    if (variant !== undefined) {
      const evidence = trace.returnEvidence;
      const rawEvidence = closed(
        evidence,
        "entryDecisions entryZeroDecisions defaultDecisions scriptedFallbackDecisions nativeReturns",
      );
      if (evidence === undefined) throw new TypeError("return evidence is missing");
      const entries = trace.decisions.filter(
        (decision: TrainingOperationsV3ChampionEvaluationResultV1["traces"][number]["decisions"][number]) =>
          decision.returnDecision?.support?.entryPresent === true,
      );
      if (
        evidence.entryDecisions !== entries.length ||
        evidence.entryZeroDecisions !==
          entries.filter(
            (decision: TrainingOperationsV3ChampionEvaluationResultV1["traces"][number]["decisions"][number]) =>
              decision.returnDecision?.support?.value === 0,
          ).length ||
        evidence.defaultDecisions !== trace.decisions.length - entries.length ||
        rawEvidence.scriptedFallbackDecisions !== 0
      )
        throw new RangeError("return support counts changed");
      const native = evidence.nativeReturns;
      closed(native, "thrown catches matchedCatches matches");
      if (
        ![native.thrown, native.catches, native.matchedCatches].every(
          (count) => Number.isSafeInteger(count) && count >= 0,
        ) ||
        !Array.isArray(native.matches) ||
        native.matchedCatches !== native.matches.length ||
        native.matchedCatches > Math.min(native.thrown, native.catches)
      )
        throw new RangeError("return witness counts changed");
      const identities = new Set<string>();
      for (const matchInput of native.matches as readonly unknown[]) {
        const match = closed(matchInput, "weaponId throwId thrownAt caughtAt");
        if (
          typeof match.weaponId !== "string" ||
          match.weaponId.length === 0 ||
          typeof match.throwId !== "number" ||
          !Number.isSafeInteger(match.throwId) ||
          match.throwId <= 0 ||
          typeof match.thrownAt !== "number" ||
          !Number.isSafeInteger(match.thrownAt) ||
          typeof match.caughtAt !== "number" ||
          !Number.isSafeInteger(match.caughtAt) ||
          match.thrownAt < 0 ||
          match.caughtAt <= match.thrownAt ||
          match.caughtAt > trace.terminal.tick
        )
          throw new RangeError("return witness identity changed");
        const key = `${match.weaponId}:${String(match.throwId)}`;
        if (identities.has(key)) throw new RangeError("return witness identity changed");
        identities.add(key);
      }
    }
    if (index % 2 === 1 && !same(typed.traces[index - 1]?.build, trace.build))
      throw new RangeError("V3 comparison paired source builds differ");
  });
  const summary = (side: "champion" | "challenger") => {
    const traces = typed.traces.filter((trace) => trace.side === side);
    return {
      reward: traces.reduce((sum, trace) => sum + trace.totalReward, 0),
      completions: traces.filter((trace) => trace.terminal.completed).length,
      defeats: traces.filter((trace) => trace.terminal.defeated).length,
    };
  };
  const baseline = summary("champion"),
    candidate = summary("challenger");
  const metrics = {
    champion: baseline,
    challenger: candidate,
    passed:
      candidate.reward - baseline.reward >= thresholds.minimumRewardGain &&
      (!thresholds.requireCompletionRateNotLower || candidate.completions >= baseline.completions),
  };
  if (!same(typed.metrics, metrics)) throw new RangeError("V3 comparison result metrics changed");
  return freezeTrainingOperationsEvidence(structuredClone(typed));
}
