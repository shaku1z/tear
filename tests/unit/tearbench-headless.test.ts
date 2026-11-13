import { describe, expect, it } from "vitest";

import { SeededRandom } from "../../src/domain/random";
import { TearHeadlessRunner } from "../../src/tearbench/headless";
import {
  BoundedArtifactSampler,
  TearHeadlessEnvironmentPool,
  benchmarkHeadlessPool,
  compareHeadlessBrowserParity,
  type TearHeadlessEnvironment,
  type TearHeadlessPolicy,
} from "../../src/tearbench";

interface Scenario {
  readonly seed: string;
  readonly targetTicks: number;
}
interface Observation {
  readonly tick: number;
  readonly value: number;
  readonly rngState: number;
}
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
    dispose() {
      disposed = true;
    },
  };
}

const policy: TearHeadlessPolicy<Observation, Action> = {
  decide() {
    return Object.freeze(Array.from({ length: 8 }, () => Object.freeze([{ amount: 1 }])));
  },
};

describe("cooperative execution owner", () => {
  it("preserves the existing synchronous zero-step caller contract", () => {
    const scenario = { seed: "zero", targetTicks: 6 };
    const episode = new TearHeadlessRunner(environment()).run({ id: "zero", scenario, maxTicks: 0 }, policy);
    expect(episode.ticks).toBe(0);
    expect(episode.observations).toHaveLength(1);
    expect(episode.outcome).toBe("truncated");
  });
  it("awaits acknowledgement without an extra source step and matches unchanged synchronous execution", async () => {
    const scenario = { seed: "cooperative", targetTicks: 6 },
      options = { id: "shared", scenario, maxTicks: 6 };
    const sync = new TearHeadlessRunner(environment()).run(options, policy, 1);
    let release!: () => void, reached!: () => void;
    const barrier = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const steps: number[] = [];
    const runner = new TearHeadlessRunner(environment());
    const pending = runner.runCooperatively(options, policy, {
      yieldToHost: () => Promise.resolve(),
      afterStep: async (progress) => {
        steps.push(progress.endTick);
        if (progress.endTick === 3) {
          reached();
          await held;
        }
      },
    });
    await barrier;
    expect(steps).toEqual([1, 2, 3]);
    expect(() => runner.run(options, policy)).toThrow(/already owns an active execution/);
    await Promise.resolve();
    expect(steps).toEqual([1, 2, 3]);
    release();
    const result = await pending;
    expect(result.episode).toEqual(sync);
    expect(result).toMatchObject({ startTick: 0, endTick: 6, executedTicks: 6 });
  });

  it("initializes restored work once, preserves the absolute horizon and counts only suffix steps", async () => {
    const source = environment(),
      scenario = { seed: "suffix", targetTicks: 6 };
    source.reset(scenario);
    source.step([{ amount: 1 }]);
    const saved = source.step([{ amount: 1 }]).observation;
    const runner = new TearHeadlessRunner({
      ...source,
      reset: () => {
        throw new Error("must not reset restored world");
      },
    });
    const result = await runner.runCooperatively({ id: "suffix", scenario, maxTicks: 6 }, policy, {
      initialize: () => ({ tick: 2, observation: saved }),
      yieldToHost: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ startTick: 2, endTick: 6, executedTicks: 4 });
    expect(result.episode.ticks).toBe(4);
    expect(result.episode.observations[0]).toEqual(saved);
  });

  it("charges acknowledgement wait to the timeout and never advances after rejected custody", async () => {
    let clock = 0;
    const scenario = { seed: "timeout", targetTicks: 10 },
      options = { id: "timeout", scenario, maxTicks: 10 };
    const result = await new TearHeadlessRunner(environment()).runCooperatively(options, policy, {
      now: () => clock,
      timeoutMilliseconds: 5,
      yieldToHost: () => Promise.resolve(),
      afterStep: () => {
        clock = 6;
        return Promise.resolve();
      },
    });
    expect(result.episode.outcome).toBe("timed-out");
    expect(result.executedTicks).toBe(1);
    let steps = 0;
    await expect(
      new TearHeadlessRunner(environment()).runCooperatively(options, policy, {
        yieldToHost: () => Promise.resolve(),
        onStep: () => {
          steps += 1;
        },
        afterStep: () => Promise.reject(new Error("custody unknown")),
      }),
    ).rejects.toThrow("custody unknown");
    expect(steps).toBe(1);
  });

  it("releases the execution owner after initialization, source-step and acknowledgement failures", async () => {
    for (const phase of ["initialization", "step", "acknowledgement"]) {
      const source = environment();
      let fail = true;
      const scenario = { seed: `cleanup-${phase}`, targetTicks: 2 },
        options = { id: phase, scenario, maxTicks: 2 };
      const runner = new TearHeadlessRunner({
        ...source,
        step: (actions: readonly Action[]) => {
          if (phase === "step" && fail) {
            fail = false;
            throw new Error(phase);
          }
          return source.step(actions);
        },
      });
      await expect(
        runner.runCooperatively(options, policy, {
          ...(phase === "initialization"
            ? {
                initialize: () => {
                  throw new Error(phase);
                },
              }
            : {}),
          yieldToHost: () => Promise.resolve(),
          afterStep: () => {
            if (phase === "acknowledgement" && fail) {
              fail = false;
              return Promise.reject(new Error(phase));
            }
            return Promise.resolve();
          },
        }),
      ).rejects.toThrow(phase);
      expect(runner.run(options, policy).ticks).toBe(2);
    }
  });
});

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
    const benchmark = await benchmarkHeadlessPool(new TearHeadlessEnvironmentPool(8, environment), jobs, () => policy);
    expect(benchmark.deterministic).toBe(true);
    expect(benchmark.episodesPerSecond).toBeGreaterThan(100);
  }, 30_000);
});
