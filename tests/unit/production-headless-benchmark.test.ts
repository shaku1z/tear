import { describe, expect, it } from "vitest";

import {
  C30_NATURAL_EPISODE_BENCHMARK_PROFILE,
  measureProductionHeadlessEpisodes,
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
});
