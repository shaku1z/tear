import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import { TearC32CanonicalActivePolicyRuntime } from "./c32-canonical-active-policy-runtime";
import { parseTearC34V3C32PolicyCandidate, TearC34V3C32CandidateRegistry, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY } from "./c34-v3-c32-policy-adapter";
import { parseTearFoundryV3PromotionReceipt } from "./foundry-job-v3-promotion";
import { TearPolicyArtifactRegistry } from "./policy-artifact-registry";

const HASH = /^[a-f0-9]{16}$/u;
const PROMOTION_KEY = "foundry-job-v3-promotion-receipt:v1:";

export interface TearBotV3CanonicalEvaluationCaseV1 { readonly id: string; readonly scenario: TearScenarioV1; readonly scenarioHash: string; }
export interface TearBotV3CanonicalEvaluationPlanV1 {
  readonly format: "tearbot-v3-canonical-evaluation-plan"; readonly schemaVersion: 1; readonly id: string;
  /** Frozen promotion identity. The evaluator refuses any different active head. */
  readonly candidate: Readonly<{ approvalHash: string; artifactId: string; artifactHash: string; activationHash: string }>;
  readonly cases: readonly TearBotV3CanonicalEvaluationCaseV1[]; readonly maxTicksPerCase: number; readonly planHash: string;
}
export interface TearBotV3CanonicalEvaluationEpisodeV1 {
  readonly caseId: string; readonly scenarioHash: string; readonly freshWorldOrdinal: number; readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean }>;
  readonly decisions: readonly Readonly<{ tick: number; stateHash: string; semanticActionHash: string; actionCount: number; source: "artifact"; artifactId: string; artifactHash: string; activationHash: string }>[];
  readonly eventHash: string;
}
export interface TearBotV3CanonicalEvaluationReportV1 {
  readonly format: "tearbot-v3-canonical-evaluation-report"; readonly schemaVersion: 1; readonly planHash: string;
  /** Candidate, C32 activation, and C36 promotion receipt are retained separately. */
  readonly provenance: Readonly<{ approvalHash: string; promotionReceiptHash: string; artifactId: string; artifactHash: string; activationHash: string; candidatePayloadHash: string }>;
  readonly episodes: readonly TearBotV3CanonicalEvaluationEpisodeV1[];
  readonly distribution: Readonly<{ episodes: number; completionRate: number; meanTicks: number; maxTicksPerCase: number }>;
  readonly placement: "unassigned"; readonly humanCalibration: "not-compared"; readonly reportHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function scenarioHash(scenario: TearScenarioV1): string { return stableVerificationHash(scenario); }

function plan(draft: Omit<TearBotV3CanonicalEvaluationPlanV1, "planHash">): TearBotV3CanonicalEvaluationPlanV1 {
  if (!text(draft.id) || !hash(draft.candidate.approvalHash) || !text(draft.candidate.artifactId) || !hash(draft.candidate.artifactHash) || !hash(draft.candidate.activationHash)
    || !Number.isSafeInteger(draft.maxTicksPerCase) || draft.maxTicksPerCase < 1 || draft.maxTicksPerCase > 20_000 || draft.cases.length < 1 || draft.cases.length > 256) throw new TypeError("invalid C35 V3 canonical evaluation plan");
  const ids = new Set<string>();
  for (const entry of draft.cases) {
    if (!text(entry.id) || !hash(entry.scenarioHash) || entry.scenarioHash !== scenarioHash(entry.scenario) || ids.has(entry.id)) throw new TypeError("invalid C35 V3 canonical evaluation case");
    ids.add(entry.id);
  }
  const value = freeze({ ...draft, candidate: freeze(draft.candidate), cases: draft.cases.map(freeze) });
  return freeze({ ...value, planHash: stableVerificationHash(value) });
}
export function createTearBotV3CanonicalEvaluationPlan(input: Omit<TearBotV3CanonicalEvaluationPlanV1, "format" | "schemaVersion" | "planHash">): TearBotV3CanonicalEvaluationPlanV1 { return plan({ format: "tearbot-v3-canonical-evaluation-plan", schemaVersion: 1, ...input }); }
export function parseTearBotV3CanonicalEvaluationPlan(value: unknown): TearBotV3CanonicalEvaluationPlanV1 {
  if (!record(value) || value.format !== "tearbot-v3-canonical-evaluation-plan" || value.schemaVersion !== 1 || !hash(value.planHash)) throw new TypeError("invalid C35 V3 canonical evaluation plan");
  const typed = value as unknown as TearBotV3CanonicalEvaluationPlanV1, { planHash, ...draft } = typed, parsed = plan(draft);
  if (planHash !== parsed.planHash) throw new TypeError("C35 V3 canonical evaluation plan integrity mismatch"); return parsed;
}

async function provenCandidate(backend: GhostVaultBackend, planInput: TearBotV3CanonicalEvaluationPlanV1): Promise<Readonly<{ artifactId: string; artifactHash: string; activationHash: string; approvalHash: string; promotionReceiptHash: string; candidatePayloadHash: string }>> {
  const plan = parseTearBotV3CanonicalEvaluationPlan(planInput), raw = await backend.get("analysis", `${PROMOTION_KEY}${plan.candidate.approvalHash}`);
  if (raw === undefined) throw new RangeError("C35 V3 canonical evaluation requires an exact retained C36 promotion receipt");
  let receipt; try { receipt = parseTearFoundryV3PromotionReceipt(JSON.parse(raw)); } catch { await backend.put("quarantine", `${PROMOTION_KEY}${plan.candidate.approvalHash}`, raw); throw new RangeError("C35 V3 canonical promotion receipt is corrupt"); }
  if (receipt.approvalHash !== plan.candidate.approvalHash || receipt.artifactId !== plan.candidate.artifactId || receipt.artifactHash !== plan.candidate.artifactHash || receipt.activationHash !== plan.candidate.activationHash) throw new RangeError("C35 V3 canonical promotion provenance mismatch");
  const active = await new TearPolicyArtifactRegistry(backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY).active();
  if (active?.artifactId !== receipt.artifactId || active.artifactHash !== receipt.artifactHash || active.activationHash !== receipt.activationHash) throw new RangeError("C35 V3 canonical candidate is not the exact active promoted head");
  const candidate = await new TearC34V3C32CandidateRegistry(backend).get(receipt.artifactId);
  if (candidate?.artifactHash !== receipt.artifactHash) throw new RangeError("C35 V3 canonical promoted candidate is unavailable");
  const payload = parseTearC34V3C32PolicyCandidate(candidate);
  return freeze({ approvalHash: receipt.approvalHash, promotionReceiptHash: receipt.receiptHash, artifactId: candidate.id, artifactHash: candidate.artifactHash, activationHash: active.activationHash, candidatePayloadHash: stableVerificationHash(payload) });
}

async function executeCase(backend: GhostVaultBackend, entry: TearBotV3CanonicalEvaluationCaseV1, maximum: number, ordinal: number, provenance: Awaited<ReturnType<typeof provenCandidate>>): Promise<TearBotV3CanonicalEvaluationEpisodeV1> {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    const runtime = new TearC32CanonicalActivePolicyRuntime(backend, () => [], true); await runtime.reset();
    let state: CanonicalGameplayState = environment.reset(entry.scenario), terminated = false, truncated = false;
    const decisions: TearBotV3CanonicalEvaluationEpisodeV1["decisions"][number][] = [];
    while (!terminated && !truncated && state.tick < Math.min(entry.scenario.maxTicks, maximum)) {
      const decision = runtime.decide(state, environment.policyObservation().availableActions);
      if (decision.source !== "artifact" || decision.artifactId !== provenance.artifactId || decision.artifactHash !== provenance.artifactHash || decision.activationHash !== provenance.activationHash) throw new RangeError("C35 V3 canonical evaluation refused a non-artifact decision");
      const actions = decision.actions as readonly GameAction[], transition = environment.step(actions);
      decisions.push(freeze({ tick: state.tick, stateHash: decision.stateHash, semanticActionHash: stableVerificationHash(actions), actionCount: actions.length, source: "artifact" as const, artifactId: decision.artifactId, artifactHash: decision.artifactHash, activationHash: decision.activationHash }));
      state = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
    }
    const events = environment.sourceTracks().nativeEvents;
    return freeze({ caseId: entry.id, scenarioHash: entry.scenarioHash, freshWorldOrdinal: ordinal, terminal: freeze({ tick: state.tick, semanticHash: stableVerificationHash(state), terminated, truncated: truncated || state.tick >= Math.min(entry.scenario.maxTicks, maximum) }), decisions: freeze(decisions), eventHash: stableVerificationHash(events) });
  } finally { environment.dispose(); }
}

/** Runs one exact C36-promoted C34 V3 candidate only through C32's canonical source-state runtime. It never assigns a level, compares humans, or changes policy state. */
export class TearBotV3CanonicalEvaluationExecutor {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async execute(input: TearBotV3CanonicalEvaluationPlanV1): Promise<TearBotV3CanonicalEvaluationReportV1> {
    const plan = parseTearBotV3CanonicalEvaluationPlan(input), provenance = await provenCandidate(this.#backend, plan), episodes: TearBotV3CanonicalEvaluationEpisodeV1[] = [];
    for (const [index, entry] of plan.cases.entries()) episodes.push(await executeCase(this.#backend, entry, plan.maxTicksPerCase, index + 1, provenance));
    const completed = episodes.filter((episode) => episode.terminal.terminated).length, draft = { format: "tearbot-v3-canonical-evaluation-report" as const, schemaVersion: 1 as const, planHash: plan.planHash, provenance, episodes: freeze(episodes), distribution: freeze({ episodes: episodes.length, completionRate: completed / episodes.length, meanTicks: episodes.reduce((total, episode) => total + episode.terminal.tick, 0) / episodes.length, maxTicksPerCase: plan.maxTicksPerCase }), placement: "unassigned" as const, humanCalibration: "not-compared" as const };
    return freeze({ ...draft, reportHash: stableVerificationHash(draft) });
  }
}
