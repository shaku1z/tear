import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import { TearActivePolicyRuntime } from "./policy-runtime";
import { parseTearPolicyArtifact, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TearAgentOrchestrator } from "./scripted-policy";
import type { TearAgentProfileId } from "./contracts";
import { validateHumanInformationFirewall, type TearBotLevel } from "./ladder-foundry";

const HASH = /^[a-f0-9]{16}$/u;
type PublicLevelId = `level-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface TearBotLadderBoundedRationalityProfileV1 {
  readonly id: string;
  readonly reactionTicks: number;
  readonly actionErrorEvery: number;
  readonly observationFields: readonly string[];
}
export type TearBotLadderPolicyReferenceV1 =
  | Readonly<{ kind: "academy-artifact"; artifact: TearPolicyArtifactV1 }>
  | Readonly<{ kind: "scripted-profile"; profile: TearAgentProfileId; lineageHash: string }>;
export interface TearBotLadderBenchmarkCaseV1 { readonly id: string; readonly scenario: TearScenarioV1; readonly scenarioHash: string; }
export interface TearBotLadderEvaluationPlanV1 {
  readonly format: "tearbot-ladder-evaluation-plan"; readonly schemaVersion: 1; readonly id: string;
  readonly levels: readonly Readonly<{ level: TearBotLevel; policy: TearBotLadderPolicyReferenceV1; boundedRationality: TearBotLadderBoundedRationalityProfileV1 }>[];
  readonly cases: readonly TearBotLadderBenchmarkCaseV1[]; readonly maxTicksPerCase: number; readonly planHash: string;
}
export interface TearBotLadderEpisodeV1 {
  readonly levelId: TearBotLevel["id"]; readonly caseId: string; readonly scenarioHash: string; readonly policyLineageHash: string;
  readonly startedAtTick: number; readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean }>;
  readonly decisions: readonly Readonly<{ tick: number; semanticActionHash: string; source: "artifact" | "scripted"; actionCount: number }>[];
  readonly eventHash: string;
}
export interface TearBotLadderExecutedReportV1 { readonly format: "tearbot-ladder-executed-report"; readonly schemaVersion: 1; readonly planHash: string; readonly episodes: readonly TearBotLadderEpisodeV1[]; readonly distributions: Readonly<Record<string, Readonly<{ episodes: number; completionRate: number; meanTicks: number }>>>; readonly publicFirewall: readonly Readonly<{ levelId: PublicLevelId; issues: readonly string[] }>[]; readonly omegaExcludedFromHumanComparisons: true; readonly reportHash: string; }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }
function policyLineage(policy: TearBotLadderPolicyReferenceV1): string { return policy.kind === "academy-artifact" ? policy.artifact.artifactHash : policy.lineageHash; }

function planDraft(draft: Omit<TearBotLadderEvaluationPlanV1, "planHash">): TearBotLadderEvaluationPlanV1 {
  if (!text(draft.id) || !Number.isSafeInteger(draft.maxTicksPerCase) || draft.maxTicksPerCase < 1 || draft.maxTicksPerCase > 20_000 || draft.cases.length < 1 || draft.levels.length < 1) throw new TypeError("invalid TearBot ladder evaluation plan");
  const ids = new Set<string>();
  for (const entry of draft.cases) { if (!text(entry.id) || !hash(entry.scenarioHash) || entry.scenarioHash !== scenarioHash(entry.scenario) || ids.has(entry.id)) throw new TypeError("invalid TearBot ladder benchmark case"); ids.add(entry.id); }
  const levelIds = new Set<string>();
  for (const entry of draft.levels) {
    if (levelIds.has(entry.level.id) || !text(entry.boundedRationality.id) || !Number.isSafeInteger(entry.boundedRationality.reactionTicks) || entry.boundedRationality.reactionTicks < 0 || !Number.isSafeInteger(entry.boundedRationality.actionErrorEvery) || entry.boundedRationality.actionErrorEvery < 0) throw new TypeError("invalid TearBot ladder level binding");
    levelIds.add(entry.level.id);
    if (entry.policy.kind === "academy-artifact") parseTearPolicyArtifact(entry.policy.artifact); else if (!hash(entry.policy.lineageHash)) throw new TypeError("invalid TearBot ladder scripted policy lineage");
    if (entry.level.public && validateHumanInformationFirewall(entry.level).length > 0) throw new RangeError("public TearBot level violates the human information firewall");
    if (entry.level.id === "level-omega" && (!entry.level.privileged || entry.level.public)) throw new RangeError("Omega must remain privileged and non-public");
  }
  const value = freeze({ ...draft, cases: draft.cases.map(freeze), levels: draft.levels.map(freeze) });
  return freeze({ ...value, planHash: stableVerificationHash(value) });
}
export function createTearBotLadderEvaluationPlan(input: Omit<TearBotLadderEvaluationPlanV1, "format" | "schemaVersion" | "planHash">): TearBotLadderEvaluationPlanV1 { return planDraft({ format: "tearbot-ladder-evaluation-plan", schemaVersion: 1, ...input }); }
export function parseTearBotLadderEvaluationPlan(value: unknown): TearBotLadderEvaluationPlanV1 { if (!record(value) || value.format !== "tearbot-ladder-evaluation-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid TearBot ladder evaluation plan"); const typed = value as unknown as TearBotLadderEvaluationPlanV1, { planHash, ...draft } = typed, parsed = planDraft(draft); if (parsed.planHash !== planHash) throw new TypeError("TearBot ladder evaluation plan integrity mismatch"); return parsed; }

function policyFor(ref: TearBotLadderPolicyReferenceV1): Readonly<{ reset(): Promise<void>; decide(observation: unknown): Readonly<{ actions: readonly unknown[]; source: "artifact" | "scripted" }> }> {
  if (ref.kind === "academy-artifact") { const runtime = new TearActivePolicyRuntime(parseTearPolicyArtifact(ref.artifact)); return { reset: () => runtime.reset(), decide: (observation) => { const result = runtime.decide({ state: observation as never, ui: { screen: "playing" } }); return { actions: result.actions, source: "artifact" }; } }; }
  const runtime = new TearAgentOrchestrator(ref.profile); return { reset: () => Promise.resolve(), decide: (observation) => ({ actions: runtime.decide({ state: observation as never, ui: { screen: "playing" } }).actions, source: "scripted" }) };
}
function execute(entry: TearBotLadderEvaluationPlanV1["levels"][number], item: TearBotLadderBenchmarkCaseV1, maximum: number): Promise<TearBotLadderEpisodeV1> { return (async () => { const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true }); try { const policy = policyFor(entry.policy); await policy.reset(); let state: CanonicalGameplayState = environment.reset(item.scenario), waited = 0, terminated = false, truncated = false; const decisions: { tick: number; semanticActionHash: string; source: "artifact" | "scripted"; actionCount: number }[] = []; while (!terminated && !truncated && state.tick < Math.min(item.scenario.maxTicks, maximum)) { if (waited++ < entry.boundedRationality.reactionTicks) { state = environment.step([]).observation; continue; } waited = 0; const selected = policy.decide(environment.policyObservation()); const actions = entry.boundedRationality.actionErrorEvery > 0 && decisions.length > 0 && decisions.length % entry.boundedRationality.actionErrorEvery === 0 ? [] : selected.actions; const transition = environment.step(actions as never); decisions.push(freeze({ tick: state.tick, semanticActionHash: stableVerificationHash(actions), source: selected.source, actionCount: actions.length })); state = transition.observation; terminated = transition.terminated; truncated = transition.truncated; } const events = environment.sourceTracks().nativeEvents; return freeze({ levelId: entry.level.id, caseId: item.id, scenarioHash: item.scenarioHash, policyLineageHash: policyLineage(entry.policy), startedAtTick: 0, terminal: freeze({ tick: state.tick, semanticHash: stableVerificationHash(state), terminated, truncated: truncated || state.tick >= Math.min(item.scenario.maxTicks, maximum) }), decisions: freeze(decisions), eventHash: stableVerificationHash(events) }); } finally { environment.dispose(); } })(); }

/** Executes only declared adapters through fresh C30 worlds. It neither activates nor promotes a policy. */
export async function executeTearBotLadderEvaluation(input: TearBotLadderEvaluationPlanV1): Promise<TearBotLadderExecutedReportV1> { const plan = parseTearBotLadderEvaluationPlan(input), episodes: TearBotLadderEpisodeV1[] = []; for (const level of plan.levels) for (const item of plan.cases) episodes.push(await execute(level, item, plan.maxTicksPerCase)); const distributions = Object.fromEntries(plan.levels.map((binding) => { const runs = episodes.filter((episode) => episode.levelId === binding.level.id), completed = runs.filter((episode) => episode.terminal.terminated).length; return [binding.level.id, freeze({ episodes: runs.length, completionRate: completed / runs.length, meanTicks: runs.reduce((sum, episode) => sum + episode.terminal.tick, 0) / runs.length })]; })); const publicFirewall = plan.levels.filter((entry): entry is typeof entry & { level: TearBotLevel & { id: PublicLevelId } } => entry.level.public).map((entry) => freeze({ levelId: entry.level.id, issues: validateHumanInformationFirewall(entry.level) })); const draft = { format: "tearbot-ladder-executed-report" as const, schemaVersion: 1 as const, planHash: plan.planHash, episodes: freeze(episodes), distributions: freeze(distributions), publicFirewall: freeze(publicFirewall), omegaExcludedFromHumanComparisons: true as const }; return freeze({ ...draft, reportHash: stableVerificationHash(draft) }); }
