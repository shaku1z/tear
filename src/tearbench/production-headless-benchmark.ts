import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { BoundedArtifactSampler, type TearHeadlessEpisode } from "./headless";
import {
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessJob,
} from "./production-headless-environment";
import {
  ProductionHeadlessAcademyIntake,
  type ProductionHeadlessAcademyIntakeSnapshot,
} from "./production-headless-academy-intake";

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

export const C30_LONG_RUN_LEAK_PROFILE = Object.freeze({
  id: "c30-long-run-natural-v1",
  cycles: 5,
  episodesPerCycle: 32,
  maxTicks: 600,
  poolSize: 4,
  batchSize: 4,
  artifactSampleLimit: 8,
  developerHardwareBudget: Object.freeze({
    minimumEpisodesPerMinute: 500,
    maximumP95EpisodeMilliseconds: 1_500,
    maximumRetainedHeapBytes: 64 * 1024 * 1024,
  }),
});

export interface ProductionHeadlessHardwareProfile {
  /** Caller-declared label; this portable module cannot prove physical hardware identity. */
  readonly id: string;
  readonly classification: "developer" | "target";
  readonly declaredBy: string;
  readonly operatingSystem: string;
  readonly processor: string;
  readonly physicalMemoryBytes: number;
}

export interface ProductionHeadlessBenchmarkOptions {
  readonly now?: () => number;
  /** Optional host measurement, so the portable simulation never imports Node process APIs. */
  readonly heapUsedBytes?: () => number | undefined;
}

export interface ProductionHeadlessLongRunOptions extends ProductionHeadlessBenchmarkOptions {
  /** A host declaration is recorded, not inferred by the simulation. */
  readonly hardware: ProductionHeadlessHardwareProfile;
  /** Optional host-side collection boundary; required before interpreting heap retention as a leak signal. */
  readonly collectGarbage?: () => void;
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
    academyIntake: ProductionHeadlessAcademyIntakeSnapshot;
  }>;
  readonly repeat: Readonly<{
    elapsedMilliseconds: number;
    episodesPerMinute: number;
    semanticHashes: readonly string[];
    academyIntake: ProductionHeadlessAcademyIntakeSnapshot;
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

export interface ProductionHeadlessLongRunArtifact {
  readonly format: "tearbench-production-headless-long-run";
  readonly schemaVersion: 1;
  readonly profile: typeof C30_LONG_RUN_LEAK_PROFILE;
  readonly hardware: ProductionHeadlessHardwareProfile;
  readonly cycles: readonly Readonly<{
    index: number;
    episodes: number;
    completed: number;
    elapsedMilliseconds: number;
    episodesPerMinute: number;
    p95EpisodeMilliseconds: number;
    maxEpisodeMilliseconds: number;
    semanticHashes: readonly string[];
    sampledArtifacts: number;
    academyIntake: ProductionHeadlessAcademyIntakeSnapshot;
  }>[];
  readonly deterministic: boolean;
  readonly aggregate: Readonly<{
    episodes: number;
    completed: number;
    elapsedMilliseconds: number;
    episodesPerMinute: number;
    p95EpisodeMilliseconds: number;
    maxEpisodeMilliseconds: number;
    sampledArtifacts: number;
    academyIntake: Readonly<{
      accepted: number;
      backpressured: number;
      closed: number;
      maximumQueued: number;
    }>;
  }>;
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

interface ProductionHeadlessWorkload {
  readonly id: string;
  readonly episodes: number;
  readonly maxTicks: number;
  readonly poolSize: number;
  readonly batchSize: number;
  readonly artifactSampleLimit: number;
}

function jobs(profile: ProductionHeadlessWorkload, cycle?: number): readonly ProductionHeadlessJob[] {
  const cycleSuffix = cycle === undefined ? "" : `-cycle-${String(cycle).padStart(2, "0")}`;
  return Object.freeze(Array.from({ length: profile.episodes }, (_, index) =>
    Object.freeze({
      id: `${profile.id}${cycleSuffix}-${String(index + 1).padStart(2, "0")}`,
      scenario: Object.freeze({
        format: "tear-contract", kind: "scenario", schemaVersion: 1,
        id: `${profile.id}${cycleSuffix}-${String(index + 1).padStart(2, "0")}`, version: 1,
        description: "C30 natural production benchmark episode",
        stateClass: "recorded-canonical", executionClass: "training",
        // Cycle identifiers keep artifacts distinct; identical source seeds make
        // repeat hashes a real determinism check rather than a new workload.
        seed: `${profile.id}-seed-${String(index + 1)}`,
        start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
        maxTicks: profile.maxTicks,
        assertions: Object.freeze(["runtime.finite-state"] as const),
        tags: Object.freeze(["c30", "benchmark", "natural-opening", profile.id] as const),
      }),
      maxTicks: profile.maxTicks,
    }) satisfies ProductionHeadlessJob,
  ));
}

function policyForEpisode(profile: Pick<ProductionHeadlessWorkload, "batchSize">): Readonly<{
  decide(): readonly (readonly GameAction[])[];
}> {
  let tick = 0;
  return Object.freeze({
    decide: () => Object.freeze(Array.from({ length: profile.batchSize }, () => {
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

async function runProductionWorkload(
  profile: ProductionHeadlessWorkload,
  now: () => number,
  sampleMemory: () => void,
  retainArtifacts: boolean,
  academyIntake: ProductionHeadlessAcademyIntake,
  cycle?: number,
) {
  const sampler = new BoundedArtifactSampler(profile.artifactSampleLimit);
  const latencies: number[] = [];
  const startedAt = now();
  const episodes = await createProductionHeadlessEpisodePool(profile.poolSize).run(
    jobs(profile, cycle),
    () => policyForEpisode(profile),
    {
      batchSize: profile.batchSize,
      now,
      ...(retainArtifacts ? { artifactSampler: sampler } : {}),
      artifactConsumer: (sample) => { academyIntake.offer(sample); },
      onCompleted: (_job, _episode, elapsedMilliseconds) => {
        latencies.push(elapsedMilliseconds);
        sampleMemory();
      },
    },
  );
  return Object.freeze({
    ...summarize(episodes, Math.max(0, now() - startedAt), latencies, sampler.samples().length),
    academyIntake: academyIntake.snapshot(),
  });
}

function hardwareProfile(value: ProductionHeadlessHardwareProfile): ProductionHeadlessHardwareProfile {
  const classifications: ReadonlySet<string> = new Set(["developer", "target"]);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.id)
    || !classifications.has(value.classification)
    || value.declaredBy.trim().length === 0 || value.operatingSystem.trim().length === 0
    || value.processor.trim().length === 0 || !Number.isSafeInteger(value.physicalMemoryBytes)
    || value.physicalMemoryBytes < 1) {
    throw new TypeError("production headless hardware profile is invalid");
  }
  return Object.freeze({ ...value });
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
  const execute = (retainArtifacts: boolean) => runProductionWorkload(
    C30_NATURAL_EPISODE_BENCHMARK_PROFILE, now, sampleMemory, retainArtifacts,
    new ProductionHeadlessAcademyIntake(C30_NATURAL_EPISODE_BENCHMARK_PROFILE.artifactSampleLimit),
  );
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
      academyIntake: repeat.academyIntake,
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

/**
 * Executes five bounded production-pool cycles under a caller-declared host
 * profile. It records observed retained heap; it does not infer that a host is
 * target hardware or claim release-scale endurance from this developer run.
 */
export async function measureProductionHeadlessLongRun(
  options: ProductionHeadlessLongRunOptions,
): Promise<ProductionHeadlessLongRunArtifact> {
  const now = options.now ?? (() => performance.now());
  const hardware = hardwareProfile(options.hardware);
  const memorySamples: number[] = [];
  const sampleMemory = (): void => {
    const value = options.heapUsedBytes?.();
    if (value !== undefined && Number.isFinite(value) && value >= 0) memorySamples.push(value);
  };
  options.collectGarbage?.();
  sampleMemory();
  const workload: ProductionHeadlessWorkload = Object.freeze({
    id: C30_LONG_RUN_LEAK_PROFILE.id,
    episodes: C30_LONG_RUN_LEAK_PROFILE.episodesPerCycle,
    maxTicks: C30_LONG_RUN_LEAK_PROFILE.maxTicks,
    poolSize: C30_LONG_RUN_LEAK_PROFILE.poolSize,
    batchSize: C30_LONG_RUN_LEAK_PROFILE.batchSize,
    artifactSampleLimit: C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit,
  });
  const cycles = [] as Awaited<ReturnType<typeof runProductionWorkload>>[];
  for (let index = 1; index <= C30_LONG_RUN_LEAK_PROFILE.cycles; index += 1) {
    cycles.push(await runProductionWorkload(
      workload, now, sampleMemory, index === 1,
      new ProductionHeadlessAcademyIntake(C30_LONG_RUN_LEAK_PROFILE.artifactSampleLimit), index,
    ));
    options.collectGarbage?.();
    sampleMemory();
  }
  const first = cycles[0];
  const deterministic = first !== undefined && cycles.every((cycle) =>
    cycle.semanticHashes.every((hash, index) => hash === first.semanticHashes[index]));
  const elapsedMilliseconds = cycles.reduce((total, cycle) => total + cycle.elapsedMilliseconds, 0);
  const episodes = cycles.reduce((total, cycle) => total + cycle.episodes, 0);
  const completed = cycles.reduce((total, cycle) => total + cycle.completed, 0);
  const latencies = cycles.flatMap((cycle) => [cycle.p95EpisodeMilliseconds, cycle.maxEpisodeMilliseconds]);
  const beforeBytes = memorySamples[0];
  const afterBytes = memorySamples.at(-1);
  const peakBytes = memorySamples.length === 0 ? undefined : Math.max(...memorySamples);
  const retainedDeltaBytes = beforeBytes === undefined || afterBytes === undefined ? undefined : afterBytes - beforeBytes;
  const budget = C30_LONG_RUN_LEAK_PROFILE.developerHardwareBudget;
  return Object.freeze({
    format: "tearbench-production-headless-long-run", schemaVersion: 1,
    profile: C30_LONG_RUN_LEAK_PROFILE, hardware,
    cycles: Object.freeze(cycles.map((cycle, index) => Object.freeze({ index: index + 1, ...cycle }))),
    deterministic,
    aggregate: Object.freeze({
      episodes, completed, elapsedMilliseconds,
      episodesPerMinute: episodes / Math.max(0.001, elapsedMilliseconds) * 60_000,
      p95EpisodeMilliseconds: percentile(latencies, 0.95),
      maxEpisodeMilliseconds: Math.max(0, ...latencies),
      sampledArtifacts: cycles.reduce((total, cycle) => total + cycle.sampledArtifacts, 0),
      academyIntake: Object.freeze({
        accepted: cycles.reduce((total, cycle) => total + cycle.academyIntake.accepted, 0),
        backpressured: cycles.reduce((total, cycle) => total + cycle.academyIntake.backpressured, 0),
        closed: cycles.reduce((total, cycle) => total + cycle.academyIntake.closed, 0),
        maximumQueued: Math.max(0, ...cycles.map((cycle) => cycle.academyIntake.queued)),
      }),
    }),
    budget: Object.freeze({
      episodesPerMinute: episodes / Math.max(0.001, elapsedMilliseconds) * 60_000 >= budget.minimumEpisodesPerMinute
        ? "met" : "below",
      p95EpisodeLatency: percentile(latencies, 0.95) <= budget.maximumP95EpisodeMilliseconds ? "met" : "above",
      retainedHeap: options.collectGarbage === undefined || retainedDeltaBytes === undefined ? "not-measured"
        : retainedDeltaBytes <= budget.maximumRetainedHeapBytes ? "met" : "above",
    }),
    heap: Object.freeze({
      ...(beforeBytes === undefined ? {} : { beforeBytes }),
      ...(afterBytes === undefined ? {} : { afterBytes }),
      ...(peakBytes === undefined ? {} : { peakBytes }),
      ...(retainedDeltaBytes === undefined ? {} : { retainedDeltaBytes }),
    }),
  });
}
