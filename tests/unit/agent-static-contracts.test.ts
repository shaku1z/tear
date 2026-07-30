import { describe, expect, it } from "vitest";

import {
  TEAR_DIFFICULTY_EXPECTATIONS,
  TEAR_DIFFICULTY_FAIRNESS_METRICS,
  TEAR_DIFFICULTY_IDENTITY_FAILURES,
  difficultyExpectation,
} from "../../src/agents/difficulty-expectations";
import {
  TEAR_MODE_COMPLETION_CONTRACTS,
  modeCompletionContract,
} from "../../src/agents/mode-completion-contracts";
import {
  TEAR_AGENT_PERSONA_CONTRACTS,
  agentPersonaContract,
} from "../../src/agents/persona-contracts";

describe("C24 static agent contracts", () => {
  it("defines every required core, hardware, performance, behavioral, and QA persona honestly", () => {
    const categoryCount = (category: (typeof TEAR_AGENT_PERSONA_CONTRACTS)[number]["category"]): number =>
      TEAR_AGENT_PERSONA_CONTRACTS.filter((entry) => entry.category === category).length;
    expect(categoryCount("core")).toBe(7);
    expect(categoryCount("hardware")).toBe(13);
    expect(categoryCount("performance")).toBe(10);
    expect(categoryCount("behavioral")).toBe(11);
    expect(categoryCount("qa-adversary")).toBe(7);
    expect(new Set(TEAR_AGENT_PERSONA_CONTRACTS.map((entry) => entry.id)).size)
      .toBe(TEAR_AGENT_PERSONA_CONTRACTS.length);
    expect(TEAR_AGENT_PERSONA_CONTRACTS.every((entry) =>
      entry.behaviorDirectives.length > 0
      && entry.requiredMetrics.length > 0)).toBe(true);
    expect(TEAR_AGENT_PERSONA_CONTRACTS[0]).toMatchObject({ status: "contract-defined-uncertified" });
    expect(agentPersonaContract("competent")?.objective).toContain("representative content");
    expect(agentPersonaContract("qa-softlock-hunter")?.requiredMetrics).toContain("softlocks");
    expect(agentPersonaContract("hardware-controller-additional-presets")?.behaviorDirectives)
      .toContain("fail on an untested published preset");
  });

  it("defines all seven production mode contracts without pretending they are certified", () => {
    expect(TEAR_MODE_COMPLETION_CONTRACTS.map((entry) => entry.mode)).toEqual([
      "tutorial", "campaign", "endless", "gauntlet", "playground", "bossonly", "sandbox",
    ]);
    expect(TEAR_MODE_COMPLETION_CONTRACTS.every((entry) =>
      entry.journey[0] === "main-menu"
      && entry.journey.at(-1) === "main-menu"
      && entry.requiredEvidence.length > 0
      && entry.assertions.length > 0)).toBe(true);
    expect(TEAR_MODE_COMPLETION_CONTRACTS[0])
      .toMatchObject({ status: "contract-defined-no-live-certification" });
    expect(modeCompletionContract("tutorial").requiredEvidence).toEqual(expect.arrayContaining([
      "valid-cuts", "launch", "juggle", "slam", "power-slam", "updraft",
      "throw-hit", "recall", "deflect-or-perfect-parry",
    ]));
    expect(modeCompletionContract("campaign").assertions).toContain("easy-and-normal-are-required-baselines");
    expect(modeCompletionContract("endless")).toMatchObject({
      completionKind: "endurance-milestone",
      milestoneWaves: [10, 25, 50, 100],
    });
    expect(modeCompletionContract("bossonly").requiredEvidence).toContain("all-bosses-consecutive");
    expect(modeCompletionContract("sandbox").requiredEvidence).toContain("every-attack-grammar");
  });

  it("conditions behavior and drafting on every difficulty without inventing success thresholds", () => {
    expect(TEAR_DIFFICULTY_EXPECTATIONS.map((entry) => entry.difficulty)).toEqual([
      "easy", "normal", "hard", "extreme", "onehit",
    ]);
    expect(TEAR_DIFFICULTY_EXPECTATIONS.map((entry) => entry.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(TEAR_DIFFICULTY_EXPECTATIONS.every((entry) =>
      entry.behaviorDirectives.length > 0
      && entry.draftPriorities.length > 0)).toBe(true);
    expect(TEAR_DIFFICULTY_EXPECTATIONS[0]).toMatchObject({
      numericCompletionTarget: null,
      targetStatus: "unmeasured-requires-consented-human-data",
    });
    expect(difficultyExpectation("onehit")).toMatchObject({
      riskPosture: "no-contact",
      numericCompletionTarget: null,
    });
    expect(difficultyExpectation("extreme").draftPriorities).toContain("crowd-control");
    expect(TEAR_DIFFICULTY_FAIRNESS_METRICS).toHaveLength(17);
    expect(TEAR_DIFFICULTY_IDENTITY_FAILURES).toEqual(expect.arrayContaining([
      "easy-equivalent-to-normal",
      "onehit-hidden-or-unreadable-damage",
      "selected-difficulty-does-not-match-live-modifiers",
    ]));
  });
});
