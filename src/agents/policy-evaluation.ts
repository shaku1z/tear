import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench/contracts";
import type { TearAgentObservation } from "./contracts";
import { TearActivePolicyRuntime, type TearPolicyDecisionReceipt } from "./policy-runtime";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";

const HASH = /^[a-f0-9]{16}$/u;
const MAX_CASES = 128;
const MAX_OBSERVATIONS_PER_CASE = 2_048;

export interface TearPolicyEvaluationExpectation {
  readonly source: "artifact" | "scripted-fallback";
  readonly actionHash: string;
}

/** A frozen structured observation suite tied to a declared Tear scenario identity. */
export interface TearPolicyEvaluationCaseV1 {
  readonly id: string;
  readonly scenario: TearScenarioV1;
  readonly observations: readonly TearAgentObservation[];
  readonly expected: readonly TearPolicyEvaluationExpectation[];
}

export interface TearPolicyEvaluationSuiteV1 {
  readonly format: "tear-policy-evaluation-suite";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly cases: readonly TearPolicyEvaluationCaseV1[];
}

export interface TearPolicyEvaluationDecisionV1 {
  readonly observationHash: string;
  readonly source: TearPolicyDecisionReceipt["source"];
  readonly actionHash: string;
  readonly matched: boolean;
}

export interface TearPolicyEvaluationCaseResultV1 {
  readonly id: string;
  readonly scenarioHash: string;
  readonly decisions: readonly TearPolicyEvaluationDecisionV1[];
  readonly passed: boolean;
}

export interface TearPolicyEvaluationReportV1 {
  readonly format: "tear-policy-evaluation-report";
  readonly schemaVersion: 1;
  readonly suiteId: string;
  readonly suiteHash: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly results: readonly TearPolicyEvaluationCaseResultV1[];
  readonly metrics: Readonly<{ decisions: number; artifactDecisions: number; fallbackDecisions: number; matchedDecisions: number }>;
  readonly passed: boolean;
  readonly reportHash: string;
}

function text(value: string): boolean { return value.trim().length > 0; }
function validExpectation(value: TearPolicyEvaluationExpectation): boolean {
  return HASH.test(value.actionHash);
}

function validateSuite(suite: TearPolicyEvaluationSuiteV1): void {
  if (!text(suite.id) || suite.cases.length < 1 || suite.cases.length > MAX_CASES) throw new TypeError("invalid policy evaluation suite");
  const ids = new Set<string>();
  for (const entry of suite.cases) {
    if (!text(entry.id) || ids.has(entry.id) || entry.observations.length < 1 || entry.observations.length > MAX_OBSERVATIONS_PER_CASE
      || entry.expected.length !== entry.observations.length || !entry.expected.every(validExpectation)) {
      throw new TypeError("invalid policy evaluation case");
    }
    ids.add(entry.id);
  }
}

function freezeResult(value: Omit<TearPolicyEvaluationReportV1, "reportHash">): TearPolicyEvaluationReportV1 {
  const reportHash = stableVerificationHash(value);
  return Object.freeze({ ...value, reportHash });
}

/**
 * Deterministic C32 decision-conformance evaluation. It executes the same
 * active runtime as Watch against a bounded frozen suite; it is intentionally
 * not a trainer, quality score, benchmark, or promotion decision.
 */
export async function evaluateActiveTearPolicy(
  registry: TearPolicyArtifactRegistry,
  suite: TearPolicyEvaluationSuiteV1,
): Promise<TearPolicyEvaluationReportV1> {
  validateSuite(suite);
  const active = await registry.active();
  if (active === undefined) throw new RangeError("policy evaluation requires an active verified artifact");
  const runtime = new TearActivePolicyRuntime(registry);
  await runtime.reset();
  const results: TearPolicyEvaluationCaseResultV1[] = [];
  let decisions = 0, artifactDecisions = 0, fallbackDecisions = 0, matchedDecisions = 0;
  for (const entry of suite.cases) {
    const entries: TearPolicyEvaluationDecisionV1[] = [];
    for (let index = 0; index < entry.observations.length; index += 1) {
      const observation = entry.observations[index];
      const expected = entry.expected[index];
      if (observation === undefined || expected === undefined) throw new Error("validated policy evaluation case changed during execution");
      const decision = runtime.decide(observation);
      const actionHash = stableVerificationHash(decision.actions);
      const matched = decision.receipt.source === expected.source && actionHash === expected.actionHash;
      decisions += 1;
      if (decision.receipt.source === "artifact") artifactDecisions += 1;
      else fallbackDecisions += 1;
      if (matched) matchedDecisions += 1;
      entries.push(Object.freeze({ observationHash: decision.receipt.observationHash, source: decision.receipt.source, actionHash, matched }));
    }
    results.push(Object.freeze({ id: entry.id, scenarioHash: stableVerificationHash(entry.scenario), decisions: Object.freeze(entries),
      passed: entries.every((decision) => decision.matched) }));
  }
  const metrics = Object.freeze({ decisions, artifactDecisions, fallbackDecisions, matchedDecisions });
  return freezeResult({ format: "tear-policy-evaluation-report", schemaVersion: 1, suiteId: suite.id,
    suiteHash: stableVerificationHash(suite), artifactId: active.artifactId, artifactHash: active.artifactHash,
    results: Object.freeze(results), metrics, passed: results.every((result) => result.passed) });
}
