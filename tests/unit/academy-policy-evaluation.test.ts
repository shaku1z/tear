import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  createTearAcademyPolicyEvaluationPlan,
  parseTearAcademyPolicyEvaluationPlan,
  TearAcademyPolicyEvaluationPlanVault,
  type TearAcademyTrainingDatasetV1,
} from "../../src/agents";
import type { TearScenarioV1 } from "../../src/tearbench";

function scenario(id: string, seed: string): TearScenarioV1 {
  return Object.freeze({ format: "tear-contract", kind: "scenario", schemaVersion: 1, id, version: 1, description: "C33 immutable evaluation case",
    stateClass: "recorded-canonical", executionClass: "training", seed, start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
    maxTicks: 60, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c33", "evaluation"] as const) });
}

function dataset(source = scenario("governed-training", "governed-seed")): TearAcademyTrainingDatasetV1 {
  return Object.freeze({ format: "tear-academy-training-dataset", schemaVersion: 1, manifest: Object.freeze({ id: "c33", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }),
    sequences: Object.freeze([Object.freeze({ candidateHash: "c".repeat(16), split: "training", lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: Object.freeze([]), sourceScenario: source, tracks: {} as never, sequenceHash: "d".repeat(16) })]), observationCount: 1, actionCount: 1, datasetHash: "e".repeat(16) });
}

function planInput(overrides: Partial<Parameters<typeof createTearAcademyPolicyEvaluationPlan>[0]> = {}) {
  return {
    id: "movement-evaluation", version: 1, dataset: dataset(), artifactTrainingHash: "f".repeat(16), baselineProfile: "competent" as const,
    primaryMetric: "completed-rate" as const, minimumBaselineMargin: 0.01, daggerSourceScenarioHashes: ["1".repeat(16)],
    cases: Object.freeze([
      Object.freeze({ lessonId: "movement-foundations", kind: "recovery" as const, scenario: scenario("movement-unseen-one", "m-91") }),
      Object.freeze({ lessonId: "movement-foundations", kind: "unseen" as const, scenario: scenario("movement-unseen-two", "m-92") }),
    ]), ...overrides,
  };
}

describe("Academy policy evaluation plan", () => {
  it("binds canonical unseen and recovery coverage, full governed exclusions, and a deterministic hash", () => {
    const first = createTearAcademyPolicyEvaluationPlan(planInput());
    const second = createTearAcademyPolicyEvaluationPlan(planInput());
    expect(second).toEqual(first);
    expect(first.lessonThresholds).toEqual([{ id: "movement-foundations", domain: "movement", passThreshold: 0.8 }]);
    expect(first.excludedScenarioHashes).toHaveLength(2);
    expect(parseTearAcademyPolicyEvaluationPlan(first)).toEqual(first);
  });

  it("rejects missing canonical unseen/recovery coverage, duplicate cases, and governed overlap", () => {
    const input = planInput();
    const [firstCase, secondCase] = input.cases;
    if (firstCase === undefined || secondCase === undefined) throw new Error("evaluation fixture cases missing");
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, cases: input.cases.slice(0, 1) })).toThrow(/cover/u);
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, cases: Object.freeze([firstCase, firstCase, secondCase]) })).toThrow(/suite repeats/u);
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, dataset: dataset(firstCase.scenario) })).toThrow(/overlaps/u);
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, cases: Object.freeze([
      Object.freeze({ ...firstCase, scenario: scenario("movement-invalid", "not-a-canonical-seed") }), secondCase,
    ]) })).toThrow(/canonical unseen/u);
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, minimumBaselineMargin: 0 })).toThrow(/invalid/u);
    const sourceSequence = input.dataset.sequences[0];
    if (sourceSequence === undefined) throw new Error("evaluation fixture sequence missing");
    const { sourceScenario, ...sequenceWithoutSource } = sourceSequence;
    void sourceScenario;
    expect(() => createTearAcademyPolicyEvaluationPlan({ ...input, dataset: Object.freeze({ ...input.dataset,
      sequences: Object.freeze([Object.freeze(sequenceWithoutSource)]) }) })).toThrow(/source scenario/u);
  });

  it("retains an immutable plan and quarantines corrupt durable bytes", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearAcademyPolicyEvaluationPlanVault(backend);
    const plan = createTearAcademyPolicyEvaluationPlan(planInput());
    expect(await vault.persist(plan)).toEqual(plan);
    expect(await vault.persist(plan)).toEqual(plan);
    await expect(vault.persist(createTearAcademyPolicyEvaluationPlan({ ...planInput(), minimumBaselineMargin: 0.02 }))).rejects.toThrow(/already exists/u);
    await backend.put("analysis", "academy-policy-evaluation-plan:v1:corrupt", "not-json");
    expect(await vault.get("corrupt")).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key.endsWith(":corrupt"))).toBe(true);
  });
});
