import { describe, expect, it } from "vitest";

import {
  TearAgentFoundry,
  applyHumanAnchors,
  compileTearBotLevel,
  evaluateTearBotLadder,
  validateHumanInformationFirewall,
  type TearBotOrthogonalConfiguration,
  type TearFoundryPolicy,
  type TearScenarioItem,
} from "../../src/agents";

const items: TearScenarioItem[] = Array.from({ length: 100 }, (_, index) => ({
  id: `hidden-${String(index)}`,
  difficulty: 0.2 + index % 10 * 0.065,
  discrimination: {
    mechanicalExecution: 0.4 + index % 3 * 0.1,
    strategicPlanning: 0.3,
    recovery: 0.2,
    perception: 0.25,
  },
  domain: ["movement", "blade", "defense", "boss"][index % 4] ?? "movement",
  weapon: ["sword", "hammer", "spear"][index % 3] ?? "sword",
  mode: ["campaign", "endless"][index % 2] ?? "campaign",
  gameDifficulty: ["normal", "hard"][index % 2] ?? "normal",
}));

const frozen = {
  rewardDefinitionHash: "reward-v1",
  invariantSetHash: "invariants-v1",
  releaseExamHash: "exam-v1",
};

function policy(id: string, scores: Readonly<Record<string, number>>, patch: Partial<TearFoundryPolicy> = {}): TearFoundryPolicy {
  return { id, scores, ...frozen, ...patch };
}

describe("TearBot Ladder and Agent Foundry", () => {
  it("orders nine public levels and separates adjacent levels on hidden holdouts", () => {
    const levels = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(compileTearBotLevel);
    const result = evaluateTearBotLadder(levels, items);
    expect(result.report.monotonic).toBe(true);
    expect(result.report.humanLike).toBe(true);
    expect(result.report.adjacentSeparation).toHaveLength(8);
    expect(Math.min(...result.report.adjacentSeparation)).toBeGreaterThan(0.005);
    expect(Object.keys(result.report.byDomain)).toEqual(["movement", "blade", "defense", "boss"]);
    expect(Object.keys(result.report.byWeapon)).toEqual(["sword", "hammer", "spear"]);
    expect(Object.keys(result.report.byMode)).toEqual(["campaign", "endless"]);
  });

  it("keeps Level 9 human-like and labels Omega unmistakably privileged", () => {
    const level9 = compileTearBotLevel(9);
    expect(validateHumanInformationFirewall(level9)).toEqual([]);
    expect(level9.bounds.reactionMilliseconds).toBeGreaterThanOrEqual(100);
    expect(level9.bounds.observationFields).not.toContain("exact-rng-state");

    const omega = compileTearBotLevel("omega");
    expect(omega).toMatchObject({
      id: "level-omega", public: false, privileged: true,
      label: "OMEGA — PRIVILEGED / NON-HUMAN",
    });
    expect(omega.bounds.observationFields).toContain("exact-rng-state");
  });

  it("keeps game difficulty, skill, strategy, and QA aggression orthogonal", () => {
    const configuration: TearBotOrthogonalConfiguration = {
      gameDifficulty: "extreme",
      mechanicalSkill: 0.3,
      strategicAstuteness: 0.9,
      qaAggression: 1,
    };
    const level = compileTearBotLevel(5);
    expect(configuration.gameDifficulty).toBe("extreme");
    expect(configuration.mechanicalSkill).not.toBe(configuration.strategicAstuteness);
    expect(level.astuteness.mechanicalExecution).not.toBe(configuration.qaAggression);
  });

  it("applies human anchors only with separately consented adequate populations", () => {
    const level = compileTearBotLevel(5);
    expect(() => applyHumanAnchors(level, [{
      dimension: "recovery", value: 0.6, sampleCount: 10, consent: "anonymous-improvement",
    }])).toThrow(/at least 30/u);
    const anchored = applyHumanAnchors(level, [{
      dimension: "recovery", value: 0.6, sampleCount: 30, consent: "public-training",
    }]);
    expect(anchored).toMatchObject({ provisional: false, astuteness: { recovery: 0.6 } });
  });

  it("runs a reproducible Foundry cycle and rolls back monitored regression", () => {
    const active = policy("policy-a", { movement: 0.8, blade: 0.4, defense: 0.7 });
    const challenger = policy("policy-b", { movement: 0.82, blade: 0.75, defense: 0.72 }, { parentId: "policy-a" });
    const inputs = {
      challenger,
      holdoutMinimums: { movement: 0.8, blade: 0.6, defense: 0.7 },
      regressionTolerance: 0.01,
    };
    const foundry = new TearAgentFoundry(active);
    const cycle = foundry.runCycle(inputs);
    expect(cycle).toMatchObject({
      weakness: "blade",
      curriculum: ["blade:foundations", "blade:recovery", "blade:adversarial"],
      teacherId: "policy-a",
      promoted: true,
      regressions: [],
    });
    expect(foundry.active().id).toBe("policy-b");
    expect(new TearAgentFoundry(active).runCycle(inputs).evidenceHash).toBe(cycle.evidenceHash);
    expect(foundry.monitorAndRollback({ movement: 0.82, blade: 0.2 }, { movement: 0.8, blade: 0.6 })).toBe(true);
    expect(foundry.active().id).toBe("policy-a");
  });

  it("rejects challengers that modify frozen trust definitions", () => {
    const foundry = new TearAgentFoundry(policy("active", { movement: 0.5 }));
    const result = foundry.runCycle({
      challenger: policy("tampered", { movement: 1 }, { rewardDefinitionHash: "self-modified" }),
      holdoutMinimums: { movement: 0.4 },
      regressionTolerance: 0,
    });
    expect(result.promoted).toBe(false);
    expect(foundry.active().id).toBe("active");
    expect(foundry.archive().map((entry) => entry.id)).toContain("tampered");
  });
});
