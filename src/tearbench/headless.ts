import { stableVerificationHash } from "../replay/hash";

export interface TearHeadlessTransition<TObservation> {
  readonly observation: TObservation;
  readonly terminated: boolean;
  readonly truncated: boolean;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly artifact?: unknown;
}

export interface TearHeadlessEnvironment<TScenario, TObservation, TAction> {
  reset(scenario: TScenario): TObservation;
  step(actions: readonly TAction[]): TearHeadlessTransition<TObservation>;
  dispose(): void;
}

export interface TearHeadlessPolicy<TObservation, TAction> {
  decide(observations: readonly TObservation[]): readonly (readonly TAction[])[];
}

export interface TearHeadlessEpisode<TScenario, TObservation> {
  readonly id: string;
  readonly scenario: TScenario;
  readonly observations: readonly TObservation[];
  readonly outcome: "terminated" | "truncated" | "cancelled" | "timed-out";
  readonly ticks: number;
  readonly semanticHash: string;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface TearHeadlessRunOptions<TScenario> {
  readonly id: string;
  readonly scenario: TScenario;
  readonly maxTicks: number;
}

/** Cooperative limits: a synchronous simulation checks them between fixed ticks. */
export interface TearHeadlessExecutionControl {
  readonly now?: () => number;
  readonly timeoutMilliseconds?: number;
  readonly isCancelled?: () => boolean;
  readonly onArtifact?: (tick: number, artifact: unknown) => void;
}

export class TearHeadlessRunner<TScenario, TObservation, TAction> {
  readonly #environment: TearHeadlessEnvironment<TScenario, TObservation, TAction>;

  constructor(environment: TearHeadlessEnvironment<TScenario, TObservation, TAction>) {
    this.#environment = environment;
  }

  run(
    options: TearHeadlessRunOptions<TScenario>,
    policy: TearHeadlessPolicy<TObservation, TAction>,
    batchSize = 1,
    control: TearHeadlessExecutionControl = {},
  ): TearHeadlessEpisode<TScenario, TObservation> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new RangeError("batchSize must be positive");
    if (control.timeoutMilliseconds !== undefined
      && (!Number.isFinite(control.timeoutMilliseconds) || control.timeoutMilliseconds < 0)) {
      throw new RangeError("headless timeout must be a non-negative finite number");
    }
    const now = control.now ?? (() => performance.now());
    const startedAt = now();
    const observations: TObservation[] = [this.#environment.reset(options.scenario)];
    let outcome: TearHeadlessEpisode<TScenario, TObservation>["outcome"] = "truncated";
    let metrics: Readonly<Record<string, number>> = {};
    const stopOutcome = (): "cancelled" | "timed-out" | undefined => {
      if (control.isCancelled?.() === true) return "cancelled";
      if (control.timeoutMilliseconds !== undefined && now() - startedAt >= control.timeoutMilliseconds) return "timed-out";
      return undefined;
    };
    let steps = 0;
    while (steps < options.maxTicks) {
      const stopped = stopOutcome();
      if (stopped !== undefined) { outcome = stopped; break; }
      const input = observations.slice(-batchSize);
      const actionBatches = policy.decide(input);
      const permitted = actionBatches.slice(0, Math.min(batchSize, options.maxTicks - steps));
      if (permitted.length === 0) throw new RangeError("headless policy must provide at least one action batch");
      for (const actions of permitted) {
        const transition = this.#environment.step(actions);
        steps += 1;
        observations.push(transition.observation);
        metrics = transition.metrics ?? metrics;
        if (transition.artifact !== undefined) control.onArtifact?.(steps, transition.artifact);
        if (transition.terminated) { outcome = "terminated"; break; }
        if (transition.truncated) { outcome = "truncated"; break; }
        const stoppedAfterStep = stopOutcome();
        if (stoppedAfterStep !== undefined) { outcome = stoppedAfterStep; break; }
      }
      if (outcome !== "truncated" || steps >= options.maxTicks) break;
    }
    const ticks = observations.length - 1;
    return Object.freeze({
      id: options.id,
      scenario: options.scenario,
      observations: Object.freeze(observations),
      outcome,
      ticks,
      semanticHash: stableVerificationHash(observations.at(-1)),
      metrics: Object.freeze({ ...metrics }),
    });
  }

  dispose(): void { this.#environment.dispose(); }
}

export type TearHeadlessJob<TScenario> = TearHeadlessRunOptions<TScenario>;

export interface TearArtifactSample {
  readonly episodeId: string;
  readonly tick?: number;
  readonly artifact: unknown;
}

export class BoundedArtifactSampler {
  readonly #limit: number;
  readonly #samples: TearArtifactSample[] = [];

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("artifact sample limit must be non-negative");
    this.#limit = limit;
  }

  consider(sample: TearArtifactSample): void {
    if (this.#samples.length < this.#limit) this.#samples.push(Object.freeze(structuredClone(sample)));
  }

  samples(): readonly TearArtifactSample[] { return Object.freeze([...this.#samples]); }
}

export interface TearHeadlessPoolRunOptions<TScenario, TObservation> {
  readonly batchSize?: number;
  readonly controlForJob?: (job: TearHeadlessJob<TScenario>) => TearHeadlessExecutionControl | undefined;
  readonly artifactSampler?: BoundedArtifactSampler;
  /** Synchronous bounded consumer; it must report/drop pressure without retaining an unbounded queue. */
  readonly artifactConsumer?: (sample: TearArtifactSample) => void;
  readonly now?: () => number;
  readonly onCompleted?: (
    job: TearHeadlessJob<TScenario>,
    episode: TearHeadlessEpisode<TScenario, TObservation>,
    elapsedMilliseconds: number,
  ) => void;
}

export class TearHeadlessEnvironmentPool<TScenario, TObservation, TAction> {
  readonly #size: number;
  readonly #createEnvironment: () => TearHeadlessEnvironment<TScenario, TObservation, TAction>;

  constructor(size: number, createEnvironment: () => TearHeadlessEnvironment<TScenario, TObservation, TAction>) {
    if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("pool size must be positive");
    this.#size = size;
    this.#createEnvironment = createEnvironment;
  }

  async run(
    jobs: readonly TearHeadlessJob<TScenario>[],
    createPolicy: (job: TearHeadlessJob<TScenario>) => TearHeadlessPolicy<TObservation, TAction>,
    options: TearHeadlessPoolRunOptions<TScenario, TObservation> = {},
  ): Promise<readonly TearHeadlessEpisode<TScenario, TObservation>[]> {
    const results = new Map<number, TearHeadlessEpisode<TScenario, TObservation>>();
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const index = cursor;
        cursor += 1;
        const job = jobs[index];
        if (job === undefined) continue;
        const environment = this.#createEnvironment();
        const runner = new TearHeadlessRunner(environment);
        try {
          const control = options.controlForJob?.(job);
          const startedAt = (options.now ?? (() => performance.now()))();
          const episode = runner.run(job, createPolicy(job), options.batchSize ?? 8, {
            ...control,
            onArtifact: (tick, artifact) => {
              control?.onArtifact?.(tick, artifact);
              const sample = Object.freeze({ episodeId: job.id, tick, artifact });
              options.artifactSampler?.consider(sample);
              options.artifactConsumer?.(sample);
            },
          });
          results.set(index, episode);
          options.onCompleted?.(job, episode, Math.max(0, (options.now ?? (() => performance.now()))() - startedAt));
        } finally {
          runner.dispose();
        }
        await Promise.resolve();
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.#size, jobs.length) }, worker));
    return Object.freeze([...results.entries()].sort(([left], [right]) => left - right).map(([, result]) => result));
  }
}

export interface TearParityCase<TScenario> {
  readonly id: string;
  readonly scenario: TScenario;
  readonly maxTicks: number;
}

export interface TearParityResult {
  readonly id: string;
  readonly headlessHash: string;
  readonly browserFastHash: string;
  readonly equal: boolean;
}

export function compareHeadlessBrowserParity<TScenario, TObservation, TAction>(
  cases: readonly TearParityCase<TScenario>[],
  createHeadless: () => TearHeadlessEnvironment<TScenario, TObservation, TAction>,
  createBrowserFast: () => TearHeadlessEnvironment<TScenario, TObservation, TAction>,
  createPolicy: () => TearHeadlessPolicy<TObservation, TAction>,
): readonly TearParityResult[] {
  return Object.freeze(cases.map((entry) => {
    const headless = new TearHeadlessRunner(createHeadless());
    const browser = new TearHeadlessRunner(createBrowserFast());
    try {
      const options = { id: entry.id, scenario: entry.scenario, maxTicks: entry.maxTicks };
      const headlessResult = headless.run(options, createPolicy(), 8);
      const browserResult = browser.run(options, createPolicy(), 8);
      return Object.freeze({
        id: entry.id,
        headlessHash: headlessResult.semanticHash,
        browserFastHash: browserResult.semanticHash,
        equal: headlessResult.semanticHash === browserResult.semanticHash,
      });
    } finally {
      headless.dispose();
      browser.dispose();
    }
  }));
}

export interface TearHeadlessBenchmark {
  readonly episodes: number;
  readonly elapsedMilliseconds: number;
  readonly episodesPerSecond: number;
  readonly deterministic: boolean;
}

export async function benchmarkHeadlessPool<TScenario, TObservation, TAction>(
  pool: TearHeadlessEnvironmentPool<TScenario, TObservation, TAction>,
  jobs: readonly TearHeadlessJob<TScenario>[],
  createPolicy: (job: TearHeadlessJob<TScenario>) => TearHeadlessPolicy<TObservation, TAction>,
  now: () => number = () => performance.now(),
): Promise<TearHeadlessBenchmark> {
  const start = now();
  const first = await pool.run(jobs, createPolicy);
  const end = now();
  const elapsedMilliseconds = Math.max(0.001, end - start);
  const hashes = first.map((episode) => episode.semanticHash);
  const repeated = await pool.run(jobs, createPolicy);
  return Object.freeze({
    episodes: jobs.length,
    elapsedMilliseconds,
    episodesPerSecond: jobs.length / elapsedMilliseconds * 1_000,
    deterministic: hashes.every((hash, index) => hash === repeated[index]?.semanticHash),
  });
}
