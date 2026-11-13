import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1 } from "./contracts";

export interface TearHeadlessTransition<TObservation> {
  readonly observation: TObservation;
  readonly terminated: boolean;
  readonly truncated: boolean;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly events?: readonly TearCausalEventV1[];
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
  /** Native causal facts actually delivered by the environment, in source order. */
  readonly events?: readonly TearCausalEventV1[];
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
  /** Observes a completed source tick; it cannot alter simulation control flow. */
  readonly onStep?: (tick: number) => void;
  readonly onArtifact?: (tick: number, artifact: unknown) => void;
}

export interface TearHeadlessProgress<TObservation> {
  readonly startTick: number;
  readonly endTick: number;
  readonly executedTicks: number;
  readonly transition: TearHeadlessTransition<TObservation>;
}

export interface TearHeadlessCooperativeControl<TObservation> extends TearHeadlessExecutionControl {
  /** Production callers supply only an observation returned by validated restoreCheckpoint. */
  readonly initialize?: () => Readonly<{ tick: number; observation: TObservation }>;
  readonly afterStep?: (progress: TearHeadlessProgress<TObservation>) => Promise<void>;
  readonly yieldToHost: () => Promise<void>;
  readonly quantumTicks?: number;
}

export interface TearHeadlessExecutionResult<TScenario, TObservation> {
  /** Observations/events and episode.ticks describe actual work in this process only. */
  readonly episode: TearHeadlessEpisode<TScenario, TObservation>;
  readonly startTick: number;
  readonly endTick: number;
  readonly executedTicks: number;
}

export class TearHeadlessRunner<TScenario, TObservation, TAction> {
  readonly #environment: TearHeadlessEnvironment<TScenario, TObservation, TAction>;
  #executionActive = false;

  constructor(environment: TearHeadlessEnvironment<TScenario, TObservation, TAction>) {
    this.#environment = environment;
  }

  run(
    options: TearHeadlessRunOptions<TScenario>,
    policy: TearHeadlessPolicy<TObservation, TAction>,
    batchSize = 1,
    control: TearHeadlessExecutionControl = {},
  ): TearHeadlessEpisode<TScenario, TObservation> {
    const execution = this.#execute(options, policy, batchSize, control);
    let result = execution.next();
    while (!result.done) result = execution.next();
    return result.value.episode;
  }

  async runCooperatively(
    options: TearHeadlessRunOptions<TScenario>,
    policy: TearHeadlessPolicy<TObservation, TAction>,
    control: TearHeadlessCooperativeControl<TObservation>,
  ): Promise<TearHeadlessExecutionResult<TScenario, TObservation>> {
    const quantum = control.quantumTicks ?? 32;
    if (!Number.isSafeInteger(quantum) || quantum < 1) throw new RangeError("invalid cooperative quantum");
    const execution = this.#execute(options, policy, 1, control, control.initialize);
    try {
      let result = execution.next();
      while (!result.done) {
        await control.afterStep?.(result.value);
        if (result.value.executedTicks % quantum === 0) await control.yieldToHost();
        result = execution.next();
      }
      return result.value;
    } finally { execution.return(undefined as never); }
  }

  *#execute(
    options: TearHeadlessRunOptions<TScenario>, policy: TearHeadlessPolicy<TObservation, TAction>,
    batchSize: number, control: TearHeadlessExecutionControl,
    initialize?: () => Readonly<{ tick: number; observation: TObservation }>,
  ): Generator<TearHeadlessProgress<TObservation>, TearHeadlessExecutionResult<TScenario, TObservation>> {
    if (this.#executionActive) throw new Error("headless runner already owns an active execution");
    this.#executionActive = true;
    try {
      if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new RangeError("batchSize must be positive");
      if (control.timeoutMilliseconds !== undefined
        && (!Number.isFinite(control.timeoutMilliseconds) || control.timeoutMilliseconds < 0)) {
        throw new RangeError("headless timeout must be a non-negative finite number");
      }
      const now = control.now ?? (() => performance.now());
      const startedAt = now();
      const initial = initialize?.() ?? { tick: 0, observation: this.#environment.reset(options.scenario) };
      if (!Number.isSafeInteger(initial.tick) || initial.tick < 0 || initialize !== undefined && initial.tick >= options.maxTicks) {
        throw new RangeError("headless start must precede the absolute horizon");
      }
      const observations: TObservation[] = [initial.observation];
      const events: TearCausalEventV1[] = [];
      let outcome: TearHeadlessEpisode<TScenario, TObservation>["outcome"] = "truncated";
      let metrics: Readonly<Record<string, number>> = {};
      const stopOutcome = (): "cancelled" | "timed-out" | undefined => {
        if (control.isCancelled?.() === true) return "cancelled";
        if (control.timeoutMilliseconds !== undefined && now() - startedAt >= control.timeoutMilliseconds) return "timed-out";
        return undefined;
      };
      let steps = 0;
      const remainingTicks = options.maxTicks - initial.tick;
      while (steps < remainingTicks) {
        const stopped = stopOutcome();
        if (stopped !== undefined) { outcome = stopped; break; }
        const input = observations.slice(-batchSize);
        const actionBatches = policy.decide(input);
        const permitted = actionBatches.slice(0, Math.min(batchSize, remainingTicks - steps));
        if (permitted.length === 0) throw new RangeError("headless policy must provide at least one action batch");
        for (const actions of permitted) {
          const transition = this.#environment.step(actions);
          steps += 1;
          observations.push(transition.observation);
          events.push(...(transition.events ?? []));
          metrics = transition.metrics ?? metrics;
          control.onStep?.(steps);
          if (transition.artifact !== undefined) control.onArtifact?.(steps, transition.artifact);
          yield Object.freeze({ startTick: initial.tick, endTick: initial.tick + steps, executedTicks: steps, transition });
          if (transition.terminated) { outcome = "terminated"; break; }
          if (transition.truncated) { outcome = "truncated"; break; }
          const stoppedAfterStep = stopOutcome();
          if (stoppedAfterStep !== undefined) { outcome = stoppedAfterStep; break; }
        }
        if (outcome !== "truncated" || steps >= remainingTicks) break;
      }
      const ticks = observations.length - 1;
      const episode = Object.freeze({
        id: options.id,
        scenario: options.scenario,
        observations: Object.freeze(observations),
        events: Object.freeze(events),
        outcome,
        ticks,
        semanticHash: stableVerificationHash(observations.at(-1)),
        metrics: Object.freeze({ ...metrics }),
      });
      return Object.freeze({ episode, startTick: initial.tick, endTick: initial.tick + ticks, executedTicks: ticks });
    } finally { this.#executionActive = false; }
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
