import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type {
  TearBuildIdentityV1,
  TearCausalEventV1,
  TearFailureArtifactV1,
  TearHashSetV1,
  TearObservationV1,
  TearScenarioV1,
} from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import type { TearInvariantFailure } from "./invariants";
import { runInvariantChecks } from "./invariants";

export interface TearActionBatchEntry {
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly frames: number;
}

export interface TearScenarioTransition {
  readonly observation: TearObservationV1;
  readonly events: readonly TearCausalEventV1[];
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly terminated: boolean;
  readonly truncated: boolean;
  readonly info: Readonly<Record<string, unknown>>;
}

export interface TearScenarioRuntime {
  reset(scenario: TearScenarioV1): TearObservationV1;
  step(actions: readonly CommandEnvelope<GameAction>[]): TearScenarioTransition;
  metrics(): Readonly<Record<string, number>>;
}

export interface TearBenchRunResult {
  readonly scenario: TearScenarioV1;
  readonly status: "passed" | "failed" | "truncated";
  readonly ticks: number;
  readonly observations: readonly TearObservationV1[];
  readonly events: readonly TearCausalEventV1[];
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly failures: readonly TearInvariantFailure[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly semanticHash: string;
}

export type TearBenchSessionStatus = "ready" | "running" | "paused" | "passed" | "failed" | "truncated" | "terminated";

export interface TearBenchSessionSnapshot {
  readonly status: TearBenchSessionStatus;
  readonly observation: TearObservationV1;
  readonly ticks: number;
}

/**
 * Incremental deterministic execution primitive used by the CLI, visual harness,
 * and future agents. Control state is deliberately outside the game runtime so
 * pausing a bench session cannot advance authoritative simulation time.
 */
export class TearBenchSession {
  readonly #runtime: TearScenarioRuntime;
  readonly #scenario: TearScenarioV1;
  readonly #observations: TearObservationV1[];
  readonly #events: TearCausalEventV1[] = [];
  readonly #actions: CommandEnvelope<GameAction>[] = [];
  readonly #failures: TearInvariantFailure[];
  #status: TearBenchSessionStatus;

  constructor(runtime: TearScenarioRuntime, scenario: TearScenarioV1) {
    this.#runtime = runtime;
    this.#scenario = scenario;
    const initial = runtime.reset(scenario);
    this.#observations = [initial];
    this.#failures = [...runInvariantChecks(initial, scenario.assertions)];
    this.#status = this.#failures.length > 0 ? "failed" : "ready";
  }

  observe(): TearObservationV1 {
    const observation = this.#observations.at(-1);
    if (observation === undefined) throw new Error("TearBench session has no observation");
    return observation;
  }

  snapshot(): TearBenchSessionSnapshot {
    const observation = this.observe();
    return Object.freeze({ status: this.#status, observation, ticks: observation.tick });
  }

  pause(): void {
    if (this.#status === "ready" || this.#status === "running") this.#status = "paused";
  }

  resume(): void {
    if (this.#status === "paused") this.#status = "running";
  }

  terminate(): void {
    if (!this.done()) this.#status = "terminated";
  }

  done(): boolean {
    return ["passed", "failed", "truncated", "terminated"].includes(this.#status);
  }

  step(actions: readonly CommandEnvelope<GameAction>[] = []): TearBenchSessionSnapshot {
    if (this.#status === "paused") return this.snapshot();
    if (this.done()) throw new Error(`cannot step a ${this.#status} TearBench session`);
    this.#status = "running";
    const transition = this.#runtime.step(actions);
    this.#actions.push(...transition.actions);
    this.#observations.push(transition.observation);
    this.#events.push(...transition.events);
    const previous = this.#observations[this.#observations.length - 2];
    this.#failures.push(...runInvariantChecks(transition.observation, this.#scenario.assertions, undefined, previous));
    if (this.#failures.length > 0) this.#status = "failed";
    else if (transition.terminated) this.#status = "passed";
    else if (transition.truncated || transition.observation.tick >= this.#scenario.maxTicks) this.#status = "truncated";
    return this.snapshot();
  }

  result(): TearBenchRunResult {
    const last = this.observe();
    const finalStatus: TearBenchRunResult["status"] =
      this.#status === "passed" ? "passed" : this.#status === "failed" ? "failed" : "truncated";
    let semanticHash: string;
    try {
      semanticHash = stableVerificationHash({
        scenario: `${this.#scenario.id}@${String(this.#scenario.version)}`,
        observation: last,
        events: this.#events,
        failures: this.#failures,
      });
    } catch {
      semanticHash = stableVerificationHash({
        scenario: `${this.#scenario.id}@${String(this.#scenario.version)}`,
        lastTick: last.tick,
        failureIds: this.#failures.map((entry) => entry.id),
        failureMessages: this.#failures.map((entry) => entry.message),
      });
    }
    return Object.freeze({
      scenario: this.#scenario,
      status: finalStatus,
      ticks: last.tick,
      observations: Object.freeze([...this.#observations]),
      events: Object.freeze([...this.#events]),
      actions: Object.freeze([...this.#actions]),
      failures: Object.freeze([...this.#failures]),
      metrics: Object.freeze(this.#runtime.metrics()),
      semanticHash,
    });
  }
}

export class TearBenchRunner {
  readonly #runtime: TearScenarioRuntime;

  constructor(runtime: TearScenarioRuntime) {
    this.#runtime = runtime;
  }

  createSession(scenario: TearScenarioV1): TearBenchSession {
    return new TearBenchSession(this.#runtime, scenario);
  }

  run(scenario: TearScenarioV1, batches: readonly TearActionBatchEntry[] = []): TearBenchRunResult {
    const session = this.createSession(scenario);
    let batchIndex = 0;
    let batchRemaining = batches[0]?.frames ?? 0;

    while (!session.done()) {
      const batch = batches[batchIndex];
      session.step(batch?.actions ?? []);
      if (batch !== undefined) {
        batchRemaining -= 1;
        if (batchRemaining <= 0) {
          batchIndex += 1;
          batchRemaining = batches[batchIndex]?.frames ?? 0;
        }
      }
    }
    return session.result();
  }
}

export interface TearFailureArtifactOptions {
  readonly id: string;
  readonly build: TearBuildIdentityV1;
  readonly hashes: TearHashSetV1;
  readonly policyId?: string;
  readonly startingSnapshotId?: string;
  readonly attachments?: Readonly<Record<string, string>>;
}

export function createFailureArtifact(
  result: TearBenchRunResult,
  options: TearFailureArtifactOptions,
): TearFailureArtifactV1 {
  const first = result.failures[0];
  if (result.status !== "failed" || first === undefined) throw new TypeError("a failure artifact requires a failed TearBench result");
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "failure",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: options.id,
    scenarioId: result.scenario.id,
    scenarioVersion: result.scenario.version,
    seed: result.scenario.seed,
    build: options.build,
    ...(options.policyId === undefined ? {} : { policyId: options.policyId }),
    firstFailureTick: first.tick,
    invariantId: first.id,
    severity: first.severity,
    message: first.message,
    ...(options.startingSnapshotId === undefined ? {} : { startingSnapshotId: options.startingSnapshotId }),
    actions: result.actions,
    eventIds: Object.freeze(result.events.map((event) => event.id)),
    hashes: options.hashes,
    attachments: options.attachments ?? {},
  });
}
