/** Training Operations source comparison; serialized plan identity is preserved. */
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { assertTrainingOperationsV3CasePayload } from "./training-archive-v3-derived-evidence-contract";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import { validateProductionHeadlessScenario } from "../tearbench/production-headless-environment";
import { createTearC32CanonicalSourceObservation, parseTearC34V3C32PolicyCandidate, TearC34V3C32PolicyRuntime } from "./c34-v3-c32-policy-adapter";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol, type TearFoundryJobV1 } from "./foundry-job-state";
import { evaluateTearOfflineRlRewardTransition, parseTearOfflineRlPlan, type TearOfflineRlPlanV1 } from "./offline-rl-training";
import { parseTearPolicyArtifact, type TearPolicyArtifactV1 } from "./policy-artifact-registry";

type Side = "champion" | "challenger";
export interface TrainingOperationsV3ChampionEvaluationPlanV1 {
  readonly format: "tear-foundry-v3-champion-evaluation-plan";
  readonly schemaVersion: 1;
  readonly jobHash: string;
  readonly protocolHash: string;
  readonly champion: Readonly<{ id: string; artifactHash: string }>;
  readonly challenger: Readonly<{ id: string; artifactHash: string }>;
  readonly rewardPlanHash: string;
  readonly caseSetHash: string;
  readonly cases: readonly TearScenarioV1[];
  readonly planHash: string;
}

/** The job must commit to the ordered case set before training, not to a future
 * challenger-bound report. Historical opaque evaluation hashes are not guessed. */
export function createTrainingOperationsV3ChampionEvaluationPlan(
  jobInput: TearFoundryJobV1, casesInput: readonly TearScenarioV1[], rewardInput: TearOfflineRlPlanV1,
  championInput: TearPolicyArtifactV1, challengerInput: TearPolicyArtifactV1,
): TrainingOperationsV3ChampionEvaluationPlanV1 {
  assertTrainingOperationsV3CasePayload(casesInput);
  for (const scenario of casesInput) validateProductionHeadlessScenario(scenario);
  const job = parseTearFoundryJob(jobInput), protocol = requireTearFoundryEvaluationProtocol(job);
  const reward = parseTearOfflineRlPlan(rewardInput), champion = parseTearPolicyArtifact(championInput), challenger = parseTearPolicyArtifact(challengerInput);
  parseTearC34V3C32PolicyCandidate(champion); parseTearC34V3C32PolicyCandidate(challenger);
  const cases = Object.freeze(structuredClone(casesInput)), caseSetHash = stableVerificationHash(cases);
  if (cases.length < 1 || cases.length > 256 || new Set(cases.map((entry) => stableVerificationHash(entry))).size !== cases.length
    || cases.some((entry) => !Number.isSafeInteger(entry.maxTicks) || entry.maxTicks < 1)
    || caseSetHash !== job.inputs.evaluationPlanHash) throw new RangeError("Foundry champion evaluation requires the frozen exact case set");
  if (champion.id !== job.inputs.champion.id || champion.artifactHash !== job.inputs.champion.artifactHash
    || champion.id === challenger.id || champion.artifactHash === challenger.artifactHash) throw new RangeError("Foundry champion evaluation artifact identity changed");
  // A retained champion may have been trained under an older reward/build.
  // Both artifacts are re-evaluated under this job's reward in current source;
  // historical training metadata must not silently change the evaluation rule.
  if (reward.reward.rewardHash !== job.inputs.rewardDefinitionHash || challenger.rewardVersion !== reward.reward.rewardHash) {
    throw new RangeError("Foundry champion evaluation requires the frozen reward definition");
  }
  const draft = Object.freeze({ format: "tear-foundry-v3-champion-evaluation-plan" as const, schemaVersion: 1 as const,
    jobHash: job.jobHash, protocolHash: protocol.protocolHash,
    champion: Object.freeze({ id: champion.id, artifactHash: champion.artifactHash }),
    challenger: Object.freeze({ id: challenger.id, artifactHash: challenger.artifactHash }),
    rewardPlanHash: reward.planHash, caseSetHash, cases });
  return Object.freeze({ ...draft, planHash: stableVerificationHash(draft) });
}

function executeCase(side: Side, artifact: TearPolicyArtifactV1, scenario: TearScenarioV1,
  reward: TearOfflineRlPlanV1, thresholds: ReturnType<typeof requireTearFoundryEvaluationProtocol>["thresholds"], ordinal: number) {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  const decisions: Readonly<{ tick: number; stateHash: string; actions: readonly GameAction[]; actionHash: string }>[] = [];
  try {
    let state = environment.reset(scenario), totalReward = 0, eventCursor = 0, terminated = false, truncated = false;
    const build = environment.sourceBuild();
    const runtime = new TearC34V3C32PolicyRuntime(artifact, () => []);
    while (!terminated && !truncated && state.tick < Math.min(scenario.maxTicks, thresholds.maxTicksPerCase)) {
      const source = createTearC32CanonicalSourceObservation(state, environment.policyObservation().availableActions);
      const decision = runtime.decide(source);
      if (decision.source !== "artifact") throw new RangeError("Foundry champion evaluation refused fallback actions");
      const actions = Object.freeze(structuredClone(decision.actions));
      decisions.push(Object.freeze({ tick: state.tick, stateHash: source.stateHash, actions, actionHash: stableVerificationHash(actions) }));
      const transition = environment.step(actions), events = environment.sourceTracks().nativeEvents.slice(eventCursor);
      eventCursor += events.length;
      totalReward += evaluateTearOfflineRlRewardTransition(reward, state, transition.observation, events).total;
      if (!Number.isFinite(totalReward) || Math.abs(totalReward) > thresholds.maxAbsoluteRewardPerCase) {
        throw new RangeError("Foundry champion evaluation reward bound exceeded");
      }
      state = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
    }
    const events = environment.sourceTracks().nativeEvents;
    return Object.freeze({ side, artifactId: artifact.id, artifactHash: artifact.artifactHash,
      scenarioHash: stableVerificationHash(scenario), freshWorldOrdinal: ordinal, build,
      decisions: Object.freeze(decisions), totalReward,
      terminal: Object.freeze({ tick: state.tick, semanticHash: stableVerificationHash(state), terminated,
        truncated: truncated || !terminated && state.tick >= Math.min(scenario.maxTicks, thresholds.maxTicksPerCase),
        completed: events.some((event) => event.kind === "run" && event.transition === "completed"),
        defeated: events.some((event) => event.kind === "run" && event.transition === "defeated") }),
      eventHash: stableVerificationHash(events) });
  } finally { environment.dispose(); }
}

/** Fresh source execution of both exact artifact bytes. No registry, activation,
 * storage, or promotion access; a durable caller must guard current authority. */
export function evaluateTrainingOperationsV3ChampionInSource(
  planInput: TrainingOperationsV3ChampionEvaluationPlanV1, jobInput: TearFoundryJobV1,
  rewardInput: TearOfflineRlPlanV1, championInput: TearPolicyArtifactV1, challengerInput: TearPolicyArtifactV1,
) {
  const plan = createTrainingOperationsV3ChampionEvaluationPlan(jobInput, planInput.cases, rewardInput, championInput, challengerInput);
  if (stableVerificationHash(planInput) !== stableVerificationHash(plan)) throw new RangeError("Foundry champion evaluation plan changed");
  const champion = parseTearPolicyArtifact(championInput), challenger = parseTearPolicyArtifact(challengerInput);
  const reward = parseTearOfflineRlPlan(rewardInput), thresholds = requireTearFoundryEvaluationProtocol(jobInput).thresholds;
  const traces = Object.freeze(plan.cases.flatMap((scenario, index) => [
    executeCase("champion", champion, scenario, reward, thresholds, index * 2 + 1),
    executeCase("challenger", challenger, scenario, reward, thresholds, index * 2 + 2),
  ]));
  for (let index = 0; index < traces.length; index += 2) {
    if (stableVerificationHash(traces[index]?.build) !== stableVerificationHash(traces[index + 1]?.build)) {
      throw new RangeError("Foundry champion evaluation paired source builds differ");
    }
  }
  const summary = (side: Side) => {
    const rows = traces.filter((trace) => trace.side === side);
    return Object.freeze({ reward: rows.reduce((sum, trace) => sum + trace.totalReward, 0),
      completions: rows.filter((trace) => trace.terminal.completed).length,
      defeats: rows.filter((trace) => trace.terminal.defeated).length });
  };
  const baseline = summary("champion"), candidate = summary("challenger");
  // This verdict implements only the frozen reward/completion protocol. Defeat
  // remains an explicit fact, not an implicit extra threshold or a promotion.
  const passed = candidate.reward - baseline.reward >= thresholds.minimumRewardGain
    && (!thresholds.requireCompletionRateNotLower || candidate.completions >= baseline.completions);
  const draft = Object.freeze({ format: "tear-foundry-v3-champion-evaluation" as const, schemaVersion: 1 as const,
    plan, traces, metrics: Object.freeze({ champion: baseline, challenger: candidate, passed }), promotional: false as const });
  return Object.freeze({ ...draft, resultHash: stableVerificationHash(draft) });
}
