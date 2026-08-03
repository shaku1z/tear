import { describe, expect, it } from "vitest";

import {
  C30_LONG_RUN_LEAK_PROFILE,
  C30_NATURAL_EPISODE_BENCHMARK_PROFILE,
  measureProductionHeadlessEpisodes,
  measureProductionHeadlessLongRun,
} from "../../src/tearbench";

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
});
