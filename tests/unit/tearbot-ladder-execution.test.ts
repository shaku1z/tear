import { describe, expect, it } from "vitest";
import { compileTearBotLevel, createTearBotLadderEvaluationPlan, executeTearBotLadderEvaluation } from "../../src/agents";
import type { TearScenarioV1 } from "../../src/tearbench";
import { stableVerificationHash } from "../../src/replay/hash";

const scenario: TearScenarioV1 = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const, id: "ladder-movement", version: 1, description: "C35 executed ladder fixture", stateClass: "recorded-canonical" as const, executionClass: "training" as const, seed: "c35-ladder", start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 3, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c35"] as const) });
const profile = { id: "human-window", reactionTicks: 1, actionErrorEvery: 0, observationFields: ["player-position"] };
describe("executed TearBot ladder evaluation", () => {
  it("runs hash-bound policy bindings through fresh C30 worlds and retains semantic evidence", async () => {
    const plan = createTearBotLadderEvaluationPlan({ id: "fixture", maxTicksPerCase: 3, cases: [{ id: "movement", scenario, scenarioHash: stableVerificationHash(scenario) }], levels: [1, 2].map((number) => ({ level: compileTearBotLevel(number as 1 | 2), policy: { kind: "scripted-profile" as const, profile: "competent", lineageHash: "a".repeat(16) }, boundedRationality: profile })) });
    const first = await executeTearBotLadderEvaluation(plan), again = await executeTearBotLadderEvaluation(plan);
    expect(again).toEqual(first); expect(first.episodes).toHaveLength(2); expect(first.episodes.every((episode) => episode.decisions.length > 0 && episode.eventHash.length === 16)).toBe(true); expect(first.omegaExcludedFromHumanComparisons).toBe(true);
  });
  it("fails closed on a public information-firewall violation or a tampered plan", () => {
    expect(() => createTearBotLadderEvaluationPlan({ id: "bad", maxTicksPerCase: 3, cases: [{ id: "movement", scenario, scenarioHash: stableVerificationHash(scenario) }], levels: [{ level: { ...compileTearBotLevel(9), bounds: { ...compileTearBotLevel(9).bounds, reactionMilliseconds: 0 } }, policy: { kind: "scripted-profile", profile: "competent", lineageHash: "a".repeat(16) }, boundedRationality: profile }] })).toThrow(/firewall/u);
  });
});
