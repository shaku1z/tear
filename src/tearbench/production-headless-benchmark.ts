import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { BoundedArtifactSampler, type TearHeadlessEpisode } from "./headless";
import {
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessJob,
} from "./production-headless-environment";

export const C30_NATURAL_EPISODE_BENCHMARK_PROFILE = Object.freeze({
  id: "c30-natural-opening-v1",
  episodes: 32,
  maxTicks: 120,
  poolSize: 4,
  batchSize: 4,
  artifactSampleLimit: 8,
  developerHardwareBudget: Object.freeze({
    minimumEpisodesPerMinute: 500,
    maximumP95EpisodeMilliseconds: 1_500,
    maximumRetainedHeapBytes: 64 * 1024 * 1024,
  }),
});

export interface ProductionHeadlessBenchmarkOptions {
  readonly now?: () => number;
  /** Optional host measurement, so the portable simulation never imports Node process APIs. */
  readonly heapUsedBytes?: () => number | undefined;
}

export interface ProductionHeadlessBenchmarkArtifact {
  readonly format: "tearbench-production-headless-benchmark";
  readonly schemaVersion: 1;
  readonly profile: typeof C30_NATURAL_EPISODE_BENCHMARK_PROFILE;
  readonly firstPass: Readonly<{
    episodes: number;
    completed: number;
    elapsedMilliseconds: number;
    episodesPerMinute: number;
    p95EpisodeMilliseconds: number;
    maxEpisodeMilliseconds: number;
    semanticHashes: readonly string[];
    sampledArtifacts: number;
  }>;
  readonly repeat: Readonly<{
    elapsedMilliseconds: number;
    episodesPerMinute: number;
    semanticHashes: readonly string[];
  }>;
  readonly deterministic: boolean;
  readonly budget: Readonly<{
    episodesPerMinute: "met" | "below";
    p95EpisodeLatency: "met" | "above";
    retainedHeap: "met" | "above" | "not-measured";
  }>;
  readonly heap: Readonly<{
    beforeBytes?: number;
    afterBytes?: number;
    peakBytes?: number;
    retainedDeltaBytes?: number;
  }>;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function jobs(): readonly ProductionHeadlessJob[] {
  return Object.freeze(Array.from({ length: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.episodes }, (_, index) =>
    Object.freeze({
      id: `c30-natural-${String(index + 1).padStart(2, "0")}`,
      scenario: Object.freeze({
        format: "tear-contract", kind: "scenario", schemaVersion: 1,
        id: `c30-natural-${String(index + 1).padStart(2, "0")}`, version: 1,
        description: "C30 natural production benchmark episode",
        stateClass: "recorded-canonical", executionClass: "training",
        seed: `c30-natural-benchmark-${String(index + 1)}`,
        start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
        maxTicks: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.maxTicks,
        assertions: Object.freeze(["runtime.finite-state"] as const),
        tags: Object.freeze(["c30", "benchmark", "natural-opening"] as const),
      }),
      maxTicks: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.maxTicks,
    }) satisfies ProductionHeadlessJob,
  ));
}

function policyForEpisode(): Readonly<{ decide(): readonly (readonly GameAction[])[] }> {
  let tick = 0;
  return Object.freeze({
    decide: () => Object.freeze(Array.from({ length: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.batchSize }, () => {
      tick += 1;
      if (tick === 1) return Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }]);
      if (tick === 24) return Object.freeze([{ type: "jump" as const, phase: "pressed" as const }]);
      if (tick === 48) return Object.freeze([{ type: "dash" as const, x: 1_000, y: 0 }]);
      return Object.freeze([]);
    })),
  });
}

function summarize(
  episodes: readonly TearHeadlessEpisode<unknown, CanonicalGameplayState>[],
  elapsedMilliseconds: number,
  latencies: readonly number[],
  sampledArtifacts: number,
) {
  const elapsed = Math.max(0.001, elapsedMilliseconds);
  return Object.freeze({
    episodes: episodes.length,
    completed: episodes.filter((episode) => episode.outcome === "terminated" || episode.outcome === "truncated").length,
    elapsedMilliseconds,
    episodesPerMinute: episodes.length / elapsed * 60_000,
    p95EpisodeMilliseconds: percentile(latencies, 0.95),
    maxEpisodeMilliseconds: Math.max(0, ...latencies),
    semanticHashes: Object.freeze(episodes.map((episode) => episode.semanticHash)),
    sampledArtifacts,
  });
}

/** Runs the real C30 production pool twice and returns a serializable measurement artifact. */
export async function measureProductionHeadlessEpisodes(
  options: ProductionHeadlessBenchmarkOptions = {},
): Promise<ProductionHeadlessBenchmarkArtifact> {
  const now = options.now ?? (() => performance.now());
  const memorySamples: number[] = [];
  const sampleMemory = (): void => {
    const value = options.heapUsedBytes?.();
    if (value !== undefined && Number.isFinite(value) && value >= 0) memorySamples.push(value);
  };
  sampleMemory();
  const execute = async (retainArtifacts: boolean) => {
    const sampler = new BoundedArtifactSampler(C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit);
    const latencies: number[] = [];
    const startedAt = now();
    const episodes = await createProductionHeadlessEpisodePool(C30_NATURAL_EPISODE_BENCHMARK_PROFILE.poolSize).run(
      jobs(),
      () => policyForEpisode(),
      {
        batchSize: C30_NATURAL_EPISODE_BENCHMARK_PROFILE.batchSize,
        now,
        ...(retainArtifacts ? { artifactSampler: sampler } : {}),
        onCompleted: (_job, _episode, elapsedMilliseconds) => {
          latencies.push(elapsedMilliseconds);
          sampleMemory();
        },
      },
    );
    const elapsedMilliseconds = Math.max(0, now() - startedAt);
    return summarize(episodes, elapsedMilliseconds, latencies, sampler.samples().length);
  };
  const firstPass = await execute(true);
  const repeat = await execute(false);
  sampleMemory();
  const beforeBytes = memorySamples[0];
  const afterBytes = memorySamples.at(-1);
  const peakBytes = memorySamples.length === 0 ? undefined : Math.max(...memorySamples);
  const retainedDeltaBytes = beforeBytes === undefined || afterBytes === undefined ? undefined : afterBytes - beforeBytes;
  return Object.freeze({
    format: "tearbench-production-headless-benchmark", schemaVersion: 1,
    profile: C30_NATURAL_EPISODE_BENCHMARK_PROFILE,
    firstPass,
    repeat: Object.freeze({
      elapsedMilliseconds: repeat.elapsedMilliseconds,
      episodesPerMinute: repeat.episodesPerMinute,
      semanticHashes: repeat.semanticHashes,
    }),
    deterministic: firstPass.semanticHashes.every((hash, index) => hash === repeat.semanticHashes[index]),
    budget: Object.freeze({
      episodesPerMinute: firstPass.episodesPerMinute >= C30_NATURAL_EPISODE_BENCHMARK_PROFILE.developerHardwareBudget.minimumEpisodesPerMinute
        ? "met" : "below",
      p95EpisodeLatency: firstPass.p95EpisodeMilliseconds <= C30_NATURAL_EPISODE_BENCHMARK_PROFILE.developerHardwareBudget.maximumP95EpisodeMilliseconds
        ? "met" : "above",
      retainedHeap: retainedDeltaBytes === undefined ? "not-measured"
        : retainedDeltaBytes <= C30_NATURAL_EPISODE_BENCHMARK_PROFILE.developerHardwareBudget.maximumRetainedHeapBytes ? "met" : "above",
    }),
    heap: Object.freeze({
      ...(beforeBytes === undefined ? {} : { beforeBytes }),
      ...(afterBytes === undefined ? {} : { afterBytes }),
      ...(peakBytes === undefined ? {} : { peakBytes }),
      ...(retainedDeltaBytes === undefined ? {} : { retainedDeltaBytes }),
    }),
  });
}
