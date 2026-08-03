import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { TearActivePolicyRuntime, type TearPolicyDecisionReceipt } from "./policy-runtime";

export interface TearProductionPolicyEvaluationDecisionV1 {
  readonly tick: number;
  readonly observationHash: string;
  readonly actionHash: string;
  readonly receipt: TearPolicyDecisionReceipt;
}

export interface TearProductionPolicyEvaluationReportV1 {
  readonly format: "tear-production-policy-evaluation";
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly scenario: Readonly<{ id: string; version: number; seed: string; hash: string }>;
  readonly decisions: readonly TearProductionPolicyEvaluationDecisionV1[];
  readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean }>;
  readonly reportHash: string;
}

/**
 * Runs the active policy against the C29/C30 source-owned production world.
 * This is evidence of shared-composition execution, not a quality score or a
 * training/promotion decision.
 */
export async function evaluateActiveTearPolicyInProduction(
  registry: TearPolicyArtifactRegistry,
  scenario: TearScenarioV1,
): Promise<TearProductionPolicyEvaluationReportV1> {
  const active = await registry.active();
  if (active === undefined) throw new RangeError("production policy evaluation requires an active verified artifact");
  const runtime = new TearActivePolicyRuntime(registry);
  await runtime.reset();
  const environment = createProductionHeadlessEnvironment();
  const decisions: TearProductionPolicyEvaluationDecisionV1[] = [];
  try {
    let terminal = environment.reset(scenario);
    let terminated = false, truncated = false;
    while (!terminated && !truncated && decisions.length < scenario.maxTicks) {
      const observation = environment.policyObservation(), decision = runtime.decide({ state: observation, ui: { screen: "playing" } });
      decisions.push(Object.freeze({ tick: observation.tick, observationHash: decision.receipt.observationHash,
        actionHash: stableVerificationHash(decision.actions), receipt: decision.receipt }));
      const transition = environment.step(decision.actions);
      terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
    }
    const report = { format: "tear-production-policy-evaluation" as const, schemaVersion: 1 as const,
      artifactId: active.artifactId, artifactHash: active.artifactHash,
      scenario: Object.freeze({ id: scenario.id, version: scenario.version, seed: scenario.seed, hash: stableVerificationHash(scenario) }),
      decisions: Object.freeze(decisions), terminal: Object.freeze({ tick: terminal.tick, semanticHash: stableVerificationHash(terminal), terminated, truncated }) };
    return Object.freeze({ ...report, reportHash: stableVerificationHash(report) });
  } finally { environment.dispose(); }
}
