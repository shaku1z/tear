import { describe, expect, it } from "vitest";

import { SeededRandom } from "../../src/domain/random";
import {
  BoundedArtifactSampler,
  TearHeadlessEnvironmentPool,
  benchmarkHeadlessPool,
  compareHeadlessBrowserParity,
  type TearHeadlessEnvironment,
  type TearHeadlessPolicy,
} from "../../src/tearbench";

interface Scenario { readonly seed: string; readonly targetTicks: number }
interface Observation { readonly tick: number; readonly value: number; readonly rngState: number }
type Action = Readonly<{ amount: number }>;

const buffers = new Set<readonly Action[]>();
const states = new Set<Observation>();

function environment(): TearHeadlessEnvironment<Scenario, Observation, Action> {
  let tick = 0;
  let value = 0;
  let target = 0;
  let random = new SeededRandom(1);
  let disposed = false;
  return {
    reset(scenario) {
      tick = 0;
      value = 0;
      target = scenario.targetTicks;
      random = new SeededRandom(scenario.seed);
      disposed = false;
      const observation = Object.freeze({ tick, value, rngState: random.snapshot().state });
      states.add(observation);
      return observation;
    },
    step(actions) {
      if (disposed) throw new Error("disposed environment was reused");
      buffers.add(actions);
      tick += 1;
      value += actions.reduce((sum, action) => sum + action.amount, 0) + Math.floor(random.next() * 3);
      const observation = Object.freeze({ tick, value, rngState: random.snapshot().state });
      states.add(observation);
      return {
        observation,
        terminated: tick >= target,
        truncated: false,
        metrics: { value },
      };
    },
    dispose() { disposed = true; },
  };
}

const policy: TearHeadlessPolicy<Observation, Action> = {
  decide() {
    return Object.freeze(Array.from({ length: 8 }, () => Object.freeze([{ amount: 1 }])));
  },
};

describe("DOM-free TearBench headless scale", () => {
  it("matches browser-fast semantic outcomes for the golden parity corpus", () => {
    const cases = Array.from({ length: 25 }, (_, index) => ({
      id: `parity-${String(index)}`,
      scenario: { seed: `seed-${String(index)}`, targetTicks: 64 + index },
      maxTicks: 128,
    }));
    const parity = compareHeadlessBrowserParity(cases, environment, environment, () => policy);
    expect(parity).toHaveLength(25);
    expect(parity.every((entry) => entry.equal)).toBe(true);
  });

  it("runs parallel episodes without shared RNG, state, persistence, or action buffers", async () => {
    buffers.clear();
    states.clear();
    const jobs = Array.from({ length: 1_000 }, (_, index) => ({
      id: `episode-${String(index)}`,
      scenario: { seed: `seed-${String(index)}`, targetTicks: 32 },
      maxTicks: 32,
    }));
    const pool = new TearHeadlessEnvironmentPool(8, environment);
    const results = await pool.run(jobs, () => policy);
    expect(results).toHaveLength(1_000);
    expect(new Set(results.map((result) => result.semanticHash)).size).toBeGreaterThan(900);
    expect(results.every((result) => result.ticks === 32 && result.outcome === "terminated")).toBe(true);
    expect(states.size).toBe(33_000);
    expect(buffers.size).toBe(32_000);
  }, 30_000);

  it("batches transport and bounds retained artifact samples", () => {
    const sampler = new BoundedArtifactSampler(7);
    for (let index = 0; index < 10_000; index += 1) {
      sampler.consider({ episodeId: `episode-${String(index)}`, artifact: { failure: index } });
    }
    expect(sampler.samples()).toHaveLength(7);
    expect(sampler.samples()[0]).toMatchObject({ episodeId: "episode-0" });
  });

  it("benchmarks practical deterministic throughput", async () => {
    const jobs = Array.from({ length: 500 }, (_, index) => ({
      id: `benchmark-${String(index)}`,
      scenario: { seed: `benchmark-seed-${String(index)}`, targetTicks: 16 },
      maxTicks: 16,
    }));
    const benchmark = await benchmarkHeadlessPool(
      new TearHeadlessEnvironmentPool(8, environment),
      jobs,
      () => policy,
    );
    expect(benchmark.deterministic).toBe(true);
    expect(benchmark.episodesPerSecond).toBeGreaterThan(100);
  }, 30_000);
});
