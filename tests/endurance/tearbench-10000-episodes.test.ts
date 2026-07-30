import { describe, expect, it } from "vitest";

import { TearHeadlessEnvironmentPool, type TearHeadlessEnvironment } from "../../src/tearbench";

interface Scenario { readonly value: number }
interface Observation { readonly tick: number; readonly value: number }
type Action = Readonly<{ increment: number }>;

function environment(): TearHeadlessEnvironment<Scenario, Observation, Action> {
  let tick = 0;
  let value = 0;
  return {
    reset(scenario) {
      tick = 0;
      value = scenario.value;
      return Object.freeze({ tick, value });
    },
    step(actions) {
      tick += 1;
      value += actions.reduce((sum, action) => sum + action.increment, 0);
      return {
        observation: Object.freeze({ tick, value }),
        terminated: tick === 8,
        truncated: false,
        metrics: { value },
      };
    },
    dispose() { value = 0; },
  };
}

describe("TearBench weekly endurance", () => {
  it("isolates ten thousand deterministic episodes", async () => {
    const jobs = Array.from({ length: 10_000 }, (_, index) => ({
      id: `endurance-${String(index)}`,
      scenario: { value: index },
      maxTicks: 8,
    }));
    const results = await new TearHeadlessEnvironmentPool(16, environment).run(jobs, () => ({
      decide: () => Object.freeze(Array.from({ length: 16 }, () => Object.freeze([{ increment: 1 }]))),
    }));
    expect(results).toHaveLength(10_000);
    expect(results.every((entry) => entry.ticks === 8 && entry.outcome === "terminated")).toBe(true);
    expect(new Set(results.map((entry) => entry.semanticHash))).toHaveLength(10_000);
  }, 60_000);
});
