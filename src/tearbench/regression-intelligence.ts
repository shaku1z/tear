import { stableVerificationHash } from "../replay/hash";
import type { TearBenchRunArtifactV1 } from "./artifact";
import type { TearBuildIdentityV1, TearFailureArtifactV1, TearObservationClass } from "./contracts";

export interface TearRegressionFrame {
  readonly tick: number;
  readonly semanticHash: string;
  readonly exactHash?: string;
  readonly actionHash?: string;
  readonly state?: Readonly<Record<string, unknown>>;
  readonly entityHashes?: Readonly<Record<string, string>>;
  readonly rng?: Readonly<Record<string, string>>;
  readonly buildHash?: string;
}

export interface TearRegressionComparison {
  readonly equivalent: boolean;
  readonly firstMaterialDivergence?: Readonly<{
    tick: number;
    base: TearRegressionFrame;
    candidate: TearRegressionFrame;
  }>;
  readonly downstreamDivergenceTicks: readonly number[];
}

/**
 * Durable C26 comparison evidence. This intentionally stores the complete
 * run-artifact identities alongside the first material divergence, rather
 * than reducing a base/candidate comparison to a boolean test result.
 */
export interface TearRegressionInvestigation {
  readonly format: "tearbench-regression-investigation";
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly observationClass: TearObservationClass;
  readonly coordinates: Readonly<{
    readonly scenarioId: string;
    readonly scenarioVersion: number;
    readonly seed: string;
    readonly actionsHash: string;
    readonly target: string;
    readonly rulesetVersion: string;
    readonly configHash: string;
  }>;
  readonly base: Readonly<{ id: string; build: TearBuildIdentityV1; artifactHash: string }>;
  readonly candidate: Readonly<{ id: string; build: TearBuildIdentityV1; artifactHash: string }>;
  readonly comparison: TearRegressionComparison;
  readonly status: "equivalent" | "diverged";
  readonly evidenceHash: string;
}

function artifactIdentity(artifact: TearBenchRunArtifactV1): string {
  return stableVerificationHash({
    id: artifact.id, build: artifact.build, scenario: artifact.resolvedScenario,
    seed: artifact.seed, actionsHash: stableVerificationHash(artifact.actions),
    semanticHash: artifact.hashes.semantic, ticks: artifact.ticks,
    eventIds: artifact.events.map((event) => event.id),
    failureIds: artifact.failures.map((failure) => failure.id), metrics: artifact.metrics,
  });
}

function semanticFrames(artifact: TearBenchRunArtifactV1): readonly TearRegressionFrame[] {
  const actionHash = stableVerificationHash(artifact.actions);
  return Object.freeze(artifact.observations.map((observation) => {
    const state = Object.freeze({ player: observation.player, blade: observation.blade, entities: observation.entities, run: observation.run });
    return Object.freeze({
      tick: observation.tick,
      semanticHash: stableVerificationHash(state),
      actionHash,
      state,
      entityHashes: Object.freeze(Object.fromEntries(observation.entities.map((entity) => [entity.id, stableVerificationHash(entity)]))),
      buildHash: artifactIdentity(artifact),
    });
  }));
}

function same(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new TypeError(`regression investigation requires identical ${label}`);
}

/**
 * Compares two fully materialized TearBench runs. Candidate code may differ,
 * but scenario, seed, semantic action trace, observation authority, target,
 * ruleset and configuration are required to match before any divergence is
 * attributed to the candidate.
 */
export function investigateRegressionRuns(input: Readonly<{
  base: TearBenchRunArtifactV1;
  candidate: TearBenchRunArtifactV1;
  createdAt: string;
}>): TearRegressionInvestigation {
  const { base, candidate } = input;
  same(candidate.resolvedScenario.id, base.resolvedScenario.id, "scenario id");
  same(candidate.resolvedScenario.version, base.resolvedScenario.version, "scenario version");
  same(candidate.seed, base.seed, "seed");
  same(stableVerificationHash(candidate.actions), stableVerificationHash(base.actions), "semantic action trace");
  const baseClass = base.observations[0]?.observationClass;
  const candidateClass = candidate.observations[0]?.observationClass;
  if (baseClass === undefined || candidateClass === undefined) throw new TypeError("regression investigation requires non-empty observations");
  same(candidateClass, baseClass, "observation class");
  same(candidate.build.target, base.build.target, "build target");
  same(candidate.build.rulesetVersion, base.build.rulesetVersion, "ruleset version");
  same(candidate.build.configHash, base.build.configHash, "configuration hash");
  const actionsHash = stableVerificationHash(base.actions);
  const coordinates = Object.freeze({
    scenarioId: base.resolvedScenario.id, scenarioVersion: base.resolvedScenario.version,
    seed: base.seed, actionsHash, target: base.build.target,
    rulesetVersion: base.build.rulesetVersion, configHash: base.build.configHash,
  });
  const comparison = compareRegressionTraces(semanticFrames(base), semanticFrames(candidate));
  const data = {
    format: "tearbench-regression-investigation" as const, schemaVersion: 1 as const,
    createdAt: input.createdAt, observationClass: baseClass, coordinates,
    base: Object.freeze({ id: base.id, build: base.build, artifactHash: artifactIdentity(base) }),
    candidate: Object.freeze({ id: candidate.id, build: candidate.build, artifactHash: artifactIdentity(candidate) }),
    comparison, status: comparison.equivalent ? "equivalent" as const : "diverged" as const,
  };
  return Object.freeze({ ...data, evidenceHash: stableVerificationHash(data) });
}

/**
 * Turns a material base/candidate divergence into a portable invariant
 * failure. This is the durable failure input for a Graveyard entry: it is not
 * a generic test assertion and it retains both runnable runs plus the first
 * material tick that made the candidate incompatible with its declared base.
 */
export function createBranchDivergenceFailure(input: Readonly<{
  investigation: TearRegressionInvestigation;
  candidate: TearBenchRunArtifactV1;
  baseRunPath: string;
  candidateRunPath: string;
  investigationPath: string;
}>): TearFailureArtifactV1 {
  const first = input.investigation.comparison.firstMaterialDivergence;
  if (input.investigation.status !== "diverged" || first === undefined) {
    throw new TypeError("a branch-divergence failure requires a material investigation divergence");
  }
  if (input.candidate.id !== input.investigation.candidate.id) {
    throw new TypeError("branch-divergence failure candidate does not match the investigation artifact");
  }
  const exact = stableVerificationHash({ base: input.investigation.base.artifactHash, candidate: input.investigation.candidate.artifactHash });
  const visual = stableVerificationHash(input.candidate.attachments.screenshot ?? "no-screenshot");
  const progression = stableVerificationHash(input.candidate.observations.at(-1)?.run ?? {});
  const environment = stableVerificationHash(input.candidate.build);
  return Object.freeze({
    format: "tear-contract",
    kind: "failure",
    schemaVersion: 1,
    id: `branch-divergence-${input.candidate.id}`,
    scenarioId: input.candidate.resolvedScenario.id,
    scenarioVersion: input.candidate.resolvedScenario.version,
    seed: input.candidate.seed,
    build: input.candidate.build,
    firstFailureTick: first.tick,
    invariantId: "replay.branch-equivalence",
    severity: "error",
    message: `candidate diverged from declared base at fixed tick ${String(first.tick)}`,
    actions: input.candidate.actions,
    eventIds: input.candidate.events.map((event) => event.id),
    hashes: Object.freeze({ exact, semantic: input.candidate.hashes.semantic, visual, progression, environment }),
    attachments: Object.freeze({
      baseRun: input.baseRunPath,
      candidateRun: input.candidateRunPath,
      investigation: input.investigationPath,
    }),
  });
}

export function compareRegressionTraces(
  base: readonly TearRegressionFrame[],
  candidate: readonly TearRegressionFrame[],
): TearRegressionComparison {
  const count = Math.max(base.length, candidate.length);
  let first: TearRegressionComparison["firstMaterialDivergence"];
  const downstream: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = base[index];
    const right = candidate[index];
    const divergent = left?.semanticHash !== right?.semanticHash;
    if (!divergent) continue;
    const tick = left?.tick ?? right?.tick ?? index;
    if (first === undefined && left !== undefined && right !== undefined) {
      first = Object.freeze({ tick, base: left, candidate: right });
    } else {
      downstream.push(tick);
    }
  }
  return Object.freeze({
    equivalent: first === undefined && downstream.length === 0,
    ...(first === undefined ? {} : { firstMaterialDivergence: first }),
    downstreamDivergenceTicks: Object.freeze(downstream),
  });
}

export type TearStableFailurePredicate<T> = (candidate: readonly T[]) => boolean;

function reproduces<T>(candidate: readonly T[], predicate: TearStableFailurePredicate<T>, repetitions: number): boolean {
  for (let attempt = 0; attempt < repetitions; attempt += 1) if (!predicate(candidate)) return false;
  return true;
}

/** Delta-debug an ordered timeline while re-verifying every accepted reduction. */
export function minimizeTimeline<T>(
  original: readonly T[],
  predicate: TearStableFailurePredicate<T>,
  repetitions = 3,
): readonly T[] {
  if (!reproduces(original, predicate, repetitions)) throw new TypeError("original trace does not reproduce stably");
  let current = [...original];
  let partitions = 2;
  while (current.length >= 2) {
    const chunkSize = Math.ceil(current.length / partitions);
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkSize) {
      const candidate = [...current.slice(0, start), ...current.slice(start + chunkSize)];
      if (candidate.length > 0 && reproduces(candidate, predicate, repetitions)) {
        current = candidate;
        partitions = Math.max(2, partitions - 1);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (partitions >= current.length) break;
      partitions = Math.min(current.length, partitions * 2);
    }
  }
  return Object.freeze(current);
}

export function minimizeRecord(
  original: Readonly<Record<string, unknown>>,
  predicate: (candidate: Readonly<Record<string, unknown>>) => boolean,
  repetitions = 3,
): Readonly<Record<string, unknown>> {
  const keys = minimizeTimeline(Object.keys(original), (candidateKeys) => {
    const candidate = Object.fromEntries(candidateKeys.map((key) => [key, original[key]]));
    return predicate(candidate);
  }, repetitions);
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, original[key]])));
}

export interface TearFailureSignatureInput {
  readonly scenarioId: string;
  readonly invariantId: string;
  readonly firstDivergenceTick: number;
  readonly stateClass: string;
  readonly entityKinds: readonly string[];
  readonly errorCode?: string;
}

export function createFailureSignature(input: TearFailureSignatureInput): string {
  return stableVerificationHash({
    scenarioId: input.scenarioId,
    invariantId: input.invariantId,
    firstDivergenceTick: input.firstDivergenceTick,
    stateClass: input.stateClass,
    entityKinds: [...input.entityKinds].sort(),
    errorCode: input.errorCode ?? "",
  });
}

export function clusterFailureSignatures<T extends Readonly<{ signature: string }>>(
  failures: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const clusters = new Map<string, T[]>();
  for (const failure of failures) {
    const cluster = clusters.get(failure.signature) ?? [];
    cluster.push(failure);
    clusters.set(failure.signature, cluster);
  }
  return new Map([...clusters].map(([signature, entries]) => [signature, Object.freeze(entries)]));
}

export type TearFailureAttribution = "product" | "policy" | "instrumentation" | "infrastructure" | "inconclusive";

export interface TearPolicyAdjudication {
  readonly policyId: string;
  readonly basePassed: boolean;
  readonly candidatePassed: boolean;
  readonly evidenceComplete: boolean;
  readonly infrastructureHealthy: boolean;
}

export function adjudicateFailure(results: readonly TearPolicyAdjudication[]): TearFailureAttribution {
  if (results.some((result) => !result.infrastructureHealthy)) return "infrastructure";
  if (results.some((result) => !result.evidenceComplete)) return "instrumentation";
  const regressions = results.filter((result) => result.basePassed && !result.candidatePassed);
  if (regressions.length === 0) return "inconclusive";
  if (regressions.length === results.length && results.length > 1) return "product";
  return "policy";
}

export interface TearOwnershipRoute {
  readonly owner: string;
  readonly hints: readonly string[];
}

export function routeRegressionOwnership(changedFiles: readonly string[]): TearOwnershipRoute {
  const normalized = changedFiles.map((file) => file.replaceAll("\\", "/"));
  if (normalized.some((file) => file.includes("/input/"))) return { owner: "input", hints: ["semantic action canonicalization", "device adapter parity"] };
  if (normalized.some((file) => file.includes("/presentation/"))) return { owner: "presentation", hints: ["screen state", "focus or layout transition"] };
  if (normalized.some((file) => file.includes("/gameplay/"))) return { owner: "gameplay", hints: ["first divergent gameplay phase", "configuration mutation order"] };
  if (normalized.some((file) => file.includes("/replay/") || file.includes("/tearbench/"))) return { owner: "replay-and-tools", hints: ["codec projection", "instrumentation drift"] };
  return { owner: "cross-cutting", hints: ["inspect first semantic divergence"] };
}

export function bisectStableRegression(
  orderedCommits: readonly string[],
  failsStably: (commit: string) => boolean,
): string | undefined {
  if (orderedCommits.length === 0 || !failsStably(orderedCommits[orderedCommits.length - 1] ?? "")) return undefined;
  let low = 0;
  let high = orderedCommits.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const commit = orderedCommits[middle];
    if (commit === undefined) return undefined;
    if (failsStably(commit)) high = middle;
    else low = middle + 1;
  }
  return orderedCommits[low];
}

export interface TearGraveyardEntry {
  readonly id: string;
  readonly signature: string;
  readonly originalFailureId: string;
  readonly minimalChildId: string;
  readonly fixCommit: string;
  readonly invariantId: string;
  readonly ownership: TearOwnershipRoute;
  readonly reopenHistory: readonly Readonly<{ at: string; reason: string }>[];
}

export class TearGhostGraveyard {
  readonly #entries = new Map<string, TearGraveyardEntry>();

  bury(entry: TearGraveyardEntry): void {
    if (this.#entries.has(entry.id)) throw new TypeError(`graveyard entry already exists: ${entry.id}`);
    this.#entries.set(entry.id, Object.freeze(structuredClone(entry)));
  }

  reopen(id: string, at: string, reason: string): TearGraveyardEntry {
    const current = this.get(id);
    const next = Object.freeze({
      ...current,
      reopenHistory: Object.freeze([...current.reopenHistory, Object.freeze({ at, reason })]),
    });
    this.#entries.set(id, next);
    return next;
  }

  get(id: string): TearGraveyardEntry {
    const entry = this.#entries.get(id);
    if (entry === undefined) throw new RangeError(`graveyard entry does not exist: ${id}`);
    return entry;
  }

  list(): readonly TearGraveyardEntry[] {
    return Object.freeze([...this.#entries.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}
