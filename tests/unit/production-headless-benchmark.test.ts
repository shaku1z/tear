import { describe, expect, it } from "vitest";

import {
  C30_LONG_RUN_LEAK_PROFILE,
  C30_NATURAL_EPISODE_BENCHMARK_PROFILE,
  createC30TrainingCapacityDeclaration,
  measureProductionHeadlessEpisodes,
  measureProductionHeadlessLongRun,
  measureProductionHeadlessTrainingCapacity,
  parseC30TrainingCapacityDeclaration,
} from "../../src/tearbench";

function targetCapacityDeclaration() {
  return createC30TrainingCapacityDeclaration({
    format: "tearbench-production-training-capacity-declaration", schemaVersion: 1,
    id: "c30-unit-target-capacity", declaredAt: "2026-08-08T00:00:00.000Z",
    hardware: Object.freeze({
      id: "target-unit-host", classification: "target" as const, declaredBy: "unit-test",
      operatingSystem: process.platform, processor: process.arch, physicalMemoryBytes: 1_024 * 1_024 * 1_024,
    }),
    workloads: Object.freeze((["bc", "dagger", "rl"] as const).map((kind) => Object.freeze({
      kind, episodes: 1, maxTicks: 1, poolSize: 1, batchSize: 1, artifactSampleLimit: 1,
      budget: Object.freeze({
        minimumEpisodesPerMinute: 1, maximumP95EpisodeMilliseconds: 3_600_000, maximumRetainedHeapBytes: 0,
      }),
    }))),
  });
}

describe("C30 production headless benchmark", () => {
  it("records deterministic production-pool rate, latency, heap, and bounded artifacts", async () => {
    const benchmark = await measureProductionHeadlessEpisodes({
      heapUsedBytes: () => process.memoryUsage().heapUsed,
    });
    expect(benchmark).toMatchObject({
      format: "tearbench-production-headless-benchmark", schemaVersion: 1,
      profile: C30_NATURAL_EPISODE_BENCHMARK_PROFILE,
      deterministic: true,
    });
    expect(benchmark.firstPass).toMatchObject({
      episodes: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.episodes,
      completed: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.episodes,
      sampledArtifacts: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
    });
    expect(benchmark.firstPass.episodesPerMinute).toBeGreaterThan(0);
    expect(benchmark.firstPass.p95EpisodeMilliseconds).toBeGreaterThanOrEqual(0);
    expect(benchmark.firstPass.semanticHashes).toEqual(benchmark.repeat.semanticHashes);
    expect(benchmark.firstPass.academyIntake).toMatchObject({
      capacity: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
      accepted: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
      backpressured: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.episodes
        - C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
      queued: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
    });
    expect(benchmark.repeat.academyIntake.backpressured).toBe(
      C30_NATURAL_EPISODE_BENCHMARK_PROFILE.episodes
        - C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit,
    );
    expect(benchmark.heap.beforeBytes).toBeGreaterThan(0);
    expect(benchmark.heap.afterBytes).toBeGreaterThan(0);
    expect(benchmark.heap.peakBytes).toBeGreaterThan(0);
    expect(benchmark.budget).toEqual({
      episodesPerMinute: "met",
      p95EpisodeLatency: "met",
      retainedHeap: "met",
    });
    console.info("C30 production headless benchmark", JSON.stringify({
      firstPass: {
        episodes: benchmark.firstPass.episodes,
        elapsedMilliseconds: benchmark.firstPass.elapsedMilliseconds,
        episodesPerMinute: benchmark.firstPass.episodesPerMinute,
        p95EpisodeMilliseconds: benchmark.firstPass.p95EpisodeMilliseconds,
        maxEpisodeMilliseconds: benchmark.firstPass.maxEpisodeMilliseconds,
        sampledArtifacts: benchmark.firstPass.sampledArtifacts,
      },
      repeat: {
        elapsedMilliseconds: benchmark.repeat.elapsedMilliseconds,
        episodesPerMinute: benchmark.repeat.episodesPerMinute,
      },
      budget: benchmark.budget,
      heap: benchmark.heap,
    }));
  }, 30_000);

  it("records a bounded five-cycle developer-host leak observation without claiming target hardware", async () => {
    const artifact = await measureProductionHeadlessLongRun({
      hardware: Object.freeze({
        id: "developer-unit-host", classification: "developer" as const, declaredBy: "unit-test",
        operatingSystem: process.platform, processor: process.arch, physicalMemoryBytes: 1_024 * 1_024 * 1_024,
      }),
      heapUsedBytes: () => process.memoryUsage().heapUsed,
      collectGarbage: () => undefined,
    });
    expect(artifact).toMatchObject({
      format: "tearbench-production-headless-long-run", schemaVersion: 1,
      profile: C30_LONG_RUN_LEAK_PROFILE,
      hardware: { id: "developer-unit-host", classification: "developer" },
      deterministic: true,
    });
    expect(artifact.cycles).toHaveLength(C30_LONG_RUN_LEAK_PROFILE.cycles);
    expect(artifact.cycles.every((cycle) => cycle.episodes === C30_LONG_RUN_LEAK_PROFILE.episodesPerCycle
      && cycle.completed === C30_LONG_RUN_LEAK_PROFILE.episodesPerCycle)).toBe(true);
    expect(artifact.aggregate.episodes).toBe(
      C30_LONG_RUN_LEAK_PROFILE.cycles * C30_LONG_RUN_LEAK_PROFILE.episodesPerCycle,
    );
    expect(artifact.aggregate.sampledArtifacts).toBe(C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit);
    expect(artifact.aggregate.academyIntake).toEqual({
      accepted: C30_LONG_RUN_LEAK_PROFILE.cycles * C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit,
      backpressured: C30_LONG_RUN_LEAK_PROFILE.cycles
        * (C30_LONG_RUN_LEAK_PROFILE.episodesPerCycle - C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit),
      closed: 0,
      maximumQueued: C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit,
    });
    expect(artifact.heap.beforeBytes).toBeGreaterThan(0);
    expect(artifact.heap.afterBytes).toBeGreaterThan(0);
    expect(artifact.budget.retainedHeap).not.toBe("not-measured");
    console.info("C30 production headless long run", JSON.stringify({
      hardware: artifact.hardware, aggregate: artifact.aggregate, budget: artifact.budget, heap: artifact.heap,
    }));
  }, 120_000);

  it("requires an integrity-checked target declaration with exact BC, DAgger, and RL workloads", () => {
    const declaration = targetCapacityDeclaration();
    expect(parseC30TrainingCapacityDeclaration(JSON.parse(JSON.stringify(declaration)))).toEqual(declaration);
    expect(() => parseC30TrainingCapacityDeclaration({
      ...declaration, id: "altered-target-capacity",
    })).toThrow("integrity mismatch");
    expect(() => createC30TrainingCapacityDeclaration({
      ...declaration,
      hardware: { ...declaration.hardware, classification: "developer" },
    })).toThrow("hardware profile is invalid");
    expect(() => createC30TrainingCapacityDeclaration({
      ...declaration,
      workloads: declaration.workloads.filter((workload) => workload.kind !== "rl"),
    })).toThrow("exactly BC, DAgger, and RL");
  });

  it("records all declared target workload verdicts without certifying a learning outcome", async () => {
    const artifact = await measureProductionHeadlessTrainingCapacity({
      declaration: targetCapacityDeclaration(),
      heapUsedBytes: () => 1_024,
      collectGarbage: () => undefined,
    });
    expect(artifact).toMatchObject({
      format: "tearbench-production-training-capacity", schemaVersion: 1,
      observation: "declared-target-episode-fabric", allDeclaredBudgetsMet: true,
      declaration: { hardware: { classification: "target" } },
    });
    expect(artifact.workloads.map((workload) => workload.kind)).toEqual(["bc", "dagger", "rl"]);
    expect(artifact.workloads.every((workload) => workload.deterministic
      && workload.firstPass.completed === 1
      && workload.budget.episodesPerMinute === "met"
      && workload.budget.p95EpisodeLatency === "met"
      && workload.budget.retainedHeap === "met")).toBe(true);
  }, 30_000);
});
