import { stableVerificationHash } from "../replay/hash";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type { TearBuildIdentityV1, TearSnapshotV1 } from "./contracts";
import type { TearBenchPresentationInputV1, TearBenchRunArtifactV1 } from "./artifact";
import { investigateRegressionRuns, type TearRegressionInvestigation } from "./regression-intelligence";

/**
 * The complete coordinate supplied to one side of a replay. Build identity is
 * deliberately immutable: removing it would turn a base/candidate comparison
 * into an untraceable run. State Forge snapshots and browser presentation are
 * instead candidates for replay-validated reduction.
 */
export interface TearRegressionReplayContext {
  readonly expectedBuild: TearBuildIdentityV1;
  readonly initialSnapshot?: TearSnapshotV1;
  readonly presentation?: TearBenchPresentationInputV1;
}

export interface TearRegressionReplayRequest {
  readonly side: "base" | "candidate";
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly maxTicks: number;
  readonly attempt: number;
  readonly context: TearRegressionReplayContext;
}

/**
 * The caller owns process/build isolation. A minimizer never simulates a
 * candidate from cached observations: every accepted reduction is replayed
 * through the supplied base and candidate materializers.
 */
export interface TearRegressionReplayExecutor {
  materialize(request: TearRegressionReplayRequest): Promise<TearBenchRunArtifactV1>;
}

export interface TearRegressionMinimizationRun {
  readonly id: string;
  readonly artifactHash: string;
  readonly actionsHash: string;
  readonly ticks: number;
  readonly status: TearBenchRunArtifactV1["status"];
}

export interface TearRegressionReplayContextEvidence {
  readonly expectedBuild: TearBuildIdentityV1;
  readonly initialSnapshot?: TearSnapshotV1;
  readonly presentation?: TearBenchPresentationInputV1;
  readonly contextHash: string;
}

type ReplayContextPair = Readonly<{
  base: TearRegressionReplayContext;
  candidate: TearRegressionReplayContext;
}>;

export interface TearRegressionMinimization {
  readonly format: "tearbench-regression-minimization";
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly status: "minimized";
  readonly coordinates: Readonly<{
    scenarioId: string;
    scenarioVersion: number;
    seed: string;
    observationClass: string;
  }>;
  readonly signature: Readonly<{
    firstDivergenceTick: number;
    baseSemanticHash: string;
    candidateSemanticHash: string;
  }>;
  readonly original: Readonly<{
    base: TearRegressionMinimizationRun;
    candidate: TearRegressionMinimizationRun;
    actionCount: number;
    maxTicks: number;
    replayContext: Readonly<{ base: TearRegressionReplayContextEvidence; candidate: TearRegressionReplayContextEvidence }>;
  }>;
  /** A separately materialized replay pair, suitable for a Graveyard child. */
  readonly minimalChild: Readonly<{
    base: TearRegressionMinimizationRun;
    candidate: TearRegressionMinimizationRun;
    actions: readonly CommandEnvelope<GameAction>[];
    maxTicks: number;
    acceptedReproductions: number;
    /** Explicitly preserves the original/minimal state and environment lineage. */
    lineage: Readonly<{ relation: "minimized-from"; parentEvidenceHash: string }>;
    replayContext: Readonly<{ base: TearRegressionReplayContextEvidence; candidate: TearRegressionReplayContextEvidence }>;
    reducedDimensions: readonly ("actions" | "timeline" | "state" | "entities" | "rng" | "presentation" | "build")[];
  }>;
  readonly evidenceHash: string;
}

function artifactHash(artifact: TearBenchRunArtifactV1): string {
  return stableVerificationHash({
    id: artifact.id, build: artifact.build, scenario: artifact.resolvedScenario,
    seed: artifact.seed, actions: artifact.actions, ticks: artifact.ticks,
    status: artifact.status, semantic: artifact.hashes.semantic,
    ...(artifact.replayContext === undefined ? {} : { replayContext: artifact.replayContext }),
    observations: artifact.observations.map((entry) => ({ tick: entry.tick, player: entry.player, blade: entry.blade, entities: entry.entities, run: entry.run })),
  });
}

function runEvidence(artifact: TearBenchRunArtifactV1): TearRegressionMinimizationRun {
  return Object.freeze({
    id: artifact.id, artifactHash: artifactHash(artifact), actionsHash: stableVerificationHash(artifact.actions),
    ticks: artifact.ticks, status: artifact.status,
  });
}

function signature(investigation: TearRegressionInvestigation): TearRegressionMinimization["signature"] {
  const divergence = investigation.comparison.firstMaterialDivergence;
  if (investigation.status !== "diverged" || divergence === undefined) {
    throw new TypeError("replay minimization requires a material regression with a paired first divergence");
  }
  return Object.freeze({
    firstDivergenceTick: divergence.tick,
    baseSemanticHash: divergence.base.semanticHash,
    candidateSemanticHash: divergence.candidate.semanticHash,
  });
}

function sameSignature(left: TearRegressionMinimization["signature"], right: TearRegressionMinimization["signature"]): boolean {
  return left.firstDivergenceTick === right.firstDivergenceTick
    && left.baseSemanticHash === right.baseSemanticHash
    && left.candidateSemanticHash === right.candidateSemanticHash;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableVerificationHash(left) === stableVerificationHash(right);
}

function withoutKey(record: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)));
}

function contextFromArtifact(artifact: TearBenchRunArtifactV1): TearRegressionReplayContext {
  return Object.freeze({
    expectedBuild: structuredClone(artifact.build),
    ...(artifact.replayContext?.initialSnapshot === undefined
      ? {} : { initialSnapshot: structuredClone(artifact.replayContext.initialSnapshot) }),
    ...(artifact.replayContext?.presentation === undefined
      ? {} : { presentation: structuredClone(artifact.replayContext.presentation) }),
  });
}

function contextEvidence(context: TearRegressionReplayContext): TearRegressionReplayContextEvidence {
  const data = {
    expectedBuild: structuredClone(context.expectedBuild),
    ...(context.initialSnapshot === undefined ? {} : { initialSnapshot: structuredClone(context.initialSnapshot) }),
    ...(context.presentation === undefined ? {} : { presentation: structuredClone(context.presentation) }),
  };
  return Object.freeze({ ...data, contextHash: stableVerificationHash(data) });
}

function assertComparableContexts(contexts: ReplayContextPair): void {
  const baseSnapshot = contexts.base.initialSnapshot;
  const candidateSnapshot = contexts.candidate.initialSnapshot;
  if ((baseSnapshot === undefined) !== (candidateSnapshot === undefined)
    || (baseSnapshot !== undefined && candidateSnapshot !== undefined && !sameValue(baseSnapshot, candidateSnapshot))) {
    throw new TypeError("base and candidate must retain an identical persisted State Forge starting snapshot");
  }
  const basePresentation = contexts.base.presentation;
  const candidatePresentation = contexts.candidate.presentation;
  if ((basePresentation === undefined) !== (candidatePresentation === undefined)
    || (basePresentation !== undefined && candidatePresentation !== undefined && !sameValue(basePresentation, candidatePresentation))) {
    throw new TypeError("base and candidate must retain identical replay presentation inputs");
  }
}

function assertRequestedReplay(
  artifact: TearBenchRunArtifactV1,
  actions: readonly CommandEnvelope<GameAction>[],
  maxTicks: number,
  context: TearRegressionReplayContext,
  side: "base" | "candidate",
): void {
  if (stableVerificationHash(artifact.actions) !== stableVerificationHash(actions)) {
    throw new TypeError(`${side} materializer did not execute the requested semantic action trace`);
  }
  if (artifact.resolvedScenario.maxTicks !== maxTicks) {
    throw new TypeError(`${side} materializer did not execute the requested timeline bound`);
  }
  if (!sameValue(artifact.build, context.expectedBuild)) {
    throw new TypeError(`${side} materializer did not execute the expected immutable build identity`);
  }
  if (context.initialSnapshot !== undefined
    && (artifact.replayContext?.initialSnapshot === undefined || !sameValue(artifact.replayContext.initialSnapshot, context.initialSnapshot))) {
    throw new TypeError(`${side} materializer did not execute the requested persisted State Forge snapshot`);
  }
  if (context.presentation !== undefined
    && (artifact.replayContext?.presentation === undefined || !sameValue(artifact.replayContext.presentation, context.presentation))) {
    throw new TypeError(`${side} materializer did not execute the requested presentation inputs`);
  }
}

interface Reproduction {
  readonly base: TearBenchRunArtifactV1;
  readonly candidate: TearBenchRunArtifactV1;
  readonly investigation: TearRegressionInvestigation;
}

async function reproduce(
  executor: TearRegressionReplayExecutor,
  actions: readonly CommandEnvelope<GameAction>[],
  maxTicks: number,
  contexts: ReplayContextPair,
  attempt: number,
): Promise<Reproduction> {
  const [base, candidate] = await Promise.all([
    executor.materialize({ side: "base", actions, maxTicks, context: contexts.base, attempt }),
    executor.materialize({ side: "candidate", actions, maxTicks, context: contexts.candidate, attempt }),
  ]);
  assertRequestedReplay(base, actions, maxTicks, contexts.base, "base");
  assertRequestedReplay(candidate, actions, maxTicks, contexts.candidate, "candidate");
  return Object.freeze({
    base, candidate,
    investigation: investigateRegressionRuns({ base, candidate, createdAt: new Date().toISOString() }),
  });
}

function snapshotWith(
  source: TearSnapshotV1,
  state: Readonly<Record<string, unknown>>,
  rng: TearSnapshotV1["rng"],
): TearSnapshotV1 {
  const hashes = Object.freeze({
    ...source.hashes,
    exact: stableVerificationHash(state),
    semantic: stableVerificationHash(state),
    progression: stableVerificationHash(state["tear.run.v1"] ?? null),
    environment: stableVerificationHash(state["tear.world.v1"] ?? null),
  });
  return Object.freeze({ ...structuredClone(source), hashes, state: Object.freeze(structuredClone(state)), rng: Object.freeze(structuredClone(rng)) });
}

function mapContexts(
  contexts: ReplayContextPair,
  transform: (snapshot: TearSnapshotV1) => TearSnapshotV1 | undefined,
  presentationTransform?: (presentation: TearBenchPresentationInputV1) => TearBenchPresentationInputV1 | undefined,
): ReplayContextPair | undefined {
  const baseSnapshot = contexts.base.initialSnapshot;
  const candidateSnapshot = contexts.candidate.initialSnapshot;
  const basePresentation = contexts.base.presentation;
  const candidatePresentation = contexts.candidate.presentation;
  const nextBaseSnapshot = baseSnapshot === undefined ? undefined : transform(baseSnapshot);
  const nextCandidateSnapshot = candidateSnapshot === undefined ? undefined : transform(candidateSnapshot);
  const nextBasePresentation = presentationTransform === undefined || basePresentation === undefined ? basePresentation : presentationTransform(basePresentation);
  const nextCandidatePresentation = presentationTransform === undefined || candidatePresentation === undefined ? candidatePresentation : presentationTransform(candidatePresentation);
  if (baseSnapshot !== undefined && nextBaseSnapshot === undefined) return undefined;
  if (candidateSnapshot !== undefined && nextCandidateSnapshot === undefined) return undefined;
  const next = Object.freeze({
    base: Object.freeze({ ...contexts.base, ...(nextBaseSnapshot === undefined ? {} : { initialSnapshot: nextBaseSnapshot }), ...(nextBasePresentation === undefined ? {} : { presentation: nextBasePresentation }) }),
    candidate: Object.freeze({ ...contexts.candidate, ...(nextCandidateSnapshot === undefined ? {} : { initialSnapshot: nextCandidateSnapshot }), ...(nextCandidatePresentation === undefined ? {} : { presentation: nextCandidatePresentation }) }),
  });
  assertComparableContexts(next);
  return next;
}

function removeStateCodec(snapshot: TearSnapshotV1, codecId: string): TearSnapshotV1 | undefined {
  if (!(codecId in snapshot.state)) return undefined;
  return snapshotWith(snapshot, withoutKey(snapshot.state, codecId), snapshot.rng);
}

function removeEntity(snapshot: TearSnapshotV1, codecId: string, entityIndex: number): TearSnapshotV1 | undefined {
  const entities = snapshot.state[codecId];
  if (!Array.isArray(entities) || entityIndex < 0 || entityIndex >= entities.length) return undefined;
  const state = { ...snapshot.state, [codecId]: Object.freeze(entities.filter((_, index) => index !== entityIndex)) };
  return snapshotWith(snapshot, state, snapshot.rng);
}

function removeRngStream(snapshot: TearSnapshotV1, stream: string): TearSnapshotV1 | undefined {
  if (!(stream in snapshot.rng)) return undefined;
  const rng = withoutKey(snapshot.rng, stream) as TearSnapshotV1["rng"];
  const state = { ...snapshot.state };
  const codec = state["tear.rng.v1"];
  if (typeof codec === "object" && codec !== null && !Array.isArray(codec)) {
    state["tear.rng.v1"] = withoutKey(codec as Readonly<Record<string, unknown>>, stream);
  }
  return snapshotWith(snapshot, state, rng);
}

function removePresentationField(
  presentation: TearBenchPresentationInputV1,
  field: keyof TearBenchPresentationInputV1,
): TearBenchPresentationInputV1 | undefined {
  if (!(field in presentation)) return undefined;
  return Object.freeze({
    ...(field === "viewport" || presentation.viewport === undefined ? {} : { viewport: presentation.viewport }),
    ...(field === "colorScheme" || presentation.colorScheme === undefined ? {} : { colorScheme: presentation.colorScheme }),
    ...(field === "reducedMotion" || presentation.reducedMotion === undefined ? {} : { reducedMotion: presentation.reducedMotion }),
  });
}

function comparableSnapshotKeys(contexts: ReplayContextPair): readonly string[] {
  const base = contexts.base.initialSnapshot;
  const candidate = contexts.candidate.initialSnapshot;
  if (base === undefined || candidate === undefined) return [];
  return Object.keys(base.state).filter((key) => key in candidate.state).sort();
}

function comparableEntityCoordinates(contexts: ReplayContextPair): readonly Readonly<{ codecId: string; index: number }>[] {
  const base = contexts.base.initialSnapshot;
  const candidate = contexts.candidate.initialSnapshot;
  if (base === undefined || candidate === undefined) return [];
  const entityCodecs = ["tear.enemy.v1", "tear.boss.v1", "tear.projectile.v1", "tear.platform.v1", "tear.hazard.v1"];
  return Object.freeze(entityCodecs.flatMap((codecId) => {
    const left = base.state[codecId];
    const right = candidate.state[codecId];
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return [];
    return left.map((_, index) => Object.freeze({ codecId, index }));
  }));
}

function comparableRngStreams(contexts: ReplayContextPair): readonly string[] {
  const base = contexts.base.initialSnapshot;
  const candidate = contexts.candidate.initialSnapshot;
  if (base === undefined || candidate === undefined) return [];
  return Object.keys(base.rng).filter((key) => key in candidate.rng).sort();
}

/**
 * Bounded delta debugging over actions, fixed-step horizon, State Forge state,
 * entity populations, RNG streams, and browser presentation inputs. Every
 * accepted coordinate keeps the original exact first-divergence signature.
 * Build identity is included and revalidated on every materialization, but is
 * intentionally pinned rather than dropped: it identifies the two revisions.
 */
export async function minimizeRegressionReplay(input: Readonly<{
  originalBase: TearBenchRunArtifactV1;
  originalCandidate: TearBenchRunArtifactV1;
  executor: TearRegressionReplayExecutor;
  createdAt: string;
  repetitions?: number;
  maxPairExecutions?: number;
}>): Promise<TearRegressionMinimization> {
  const repetitions = input.repetitions ?? 3;
  const maxPairExecutions = input.maxPairExecutions ?? 48;
  if (!Number.isSafeInteger(repetitions) || repetitions < 2 || repetitions > 10) throw new RangeError("repetitions must be an integer from 2 through 10");
  if (!Number.isSafeInteger(maxPairExecutions) || maxPairExecutions < repetitions || maxPairExecutions > 200) throw new RangeError("maxPairExecutions must be an integer from repetitions through 200");
  if (stableVerificationHash(input.originalBase.actions) !== stableVerificationHash(input.originalCandidate.actions)) {
    throw new TypeError("original base and candidate must retain an identical semantic action trace");
  }
  if (input.originalBase.resolvedScenario.maxTicks !== input.originalCandidate.resolvedScenario.maxTicks) {
    throw new TypeError("original base and candidate must retain an identical timeline bound");
  }
  const originalContexts: ReplayContextPair = Object.freeze({
    base: contextFromArtifact(input.originalBase), candidate: contextFromArtifact(input.originalCandidate),
  });
  assertComparableContexts(originalContexts);
  const originalInvestigation = investigateRegressionRuns({
    base: input.originalBase, candidate: input.originalCandidate, createdAt: input.createdAt,
  });
  const expected = signature(originalInvestigation);
  const originalActions = input.originalCandidate.actions;
  const originalMaxTicks = input.originalCandidate.resolvedScenario.maxTicks;
  let executions = 0;
  let lastAccepted: Reproduction | undefined;
  let contexts = originalContexts;
  const reducedDimensions = new Set<TearRegressionMinimization["minimalChild"]["reducedDimensions"][number]>(["build"]);

  const accepts = async (
    candidateActions: readonly CommandEnvelope<GameAction>[],
    candidateMaxTicks: number,
    candidateContexts: ReplayContextPair,
  ): Promise<boolean> => {
    const reproductions: Reproduction[] = [];
    for (let index = 0; index < repetitions; index += 1) {
      if (executions >= maxPairExecutions) return false;
      executions += 1;
      let replay: Reproduction;
      try {
        replay = await reproduce(input.executor, candidateActions, candidateMaxTicks, candidateContexts, executions);
      } catch {
        // A dimensional reduction can make a State Forge snapshot invalid or
        // unreplayable. That is evidence that this coordinate is required, not
        // a reason to abandon the original stable regression investigation.
        return false;
      }
      if (replay.investigation.status !== "diverged" || replay.investigation.comparison.firstMaterialDivergence === undefined) return false;
      if (!sameSignature(signature(replay.investigation), expected)) return false;
      reproductions.push(replay);
    }
    lastAccepted = reproductions.at(-1);
    return true;
  };

  if (!await accepts(originalActions, originalMaxTicks, contexts)) {
    throw new TypeError("original replay does not reproduce the material divergence stably");
  }

  let actions = [...originalActions];
  let partitions = 2;
  while (actions.length > 0 && executions + repetitions <= maxPairExecutions) {
    const chunkSize = Math.ceil(actions.length / partitions);
    let reduced = false;
    for (let start = 0; start < actions.length && executions + repetitions <= maxPairExecutions; start += chunkSize) {
      const proposed = [...actions.slice(0, start), ...actions.slice(start + chunkSize)];
      if (await accepts(proposed, originalMaxTicks, contexts)) {
        actions = proposed;
        reducedDimensions.add("actions");
        partitions = Math.max(2, partitions - 1);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (partitions >= actions.length) break;
      partitions = Math.min(actions.length, partitions * 2);
    }
  }

  const minimalMaxTicks = expected.firstDivergenceTick;
  if (minimalMaxTicks < originalMaxTicks && executions + repetitions <= maxPairExecutions && await accepts(actions, minimalMaxTicks, contexts)) {
    reducedDimensions.add("timeline");
  } else if (lastAccepted === undefined) {
    throw new Error("no stable minimized replay was retained");
  }
  const usedMaxTicks = lastAccepted?.base.resolvedScenario.maxTicks ?? originalMaxTicks;

  const tryContextReduction = async (
    dimension: "state" | "entities" | "rng" | "presentation",
    proposed: ReplayContextPair | undefined,
  ): Promise<boolean> => {
    if (proposed === undefined || executions + repetitions > maxPairExecutions) return false;
    if (!await accepts(actions, usedMaxTicks, proposed)) return false;
    contexts = proposed;
    reducedDimensions.add(dimension);
    return true;
  };

  for (const codecId of comparableSnapshotKeys(contexts)) {
    await tryContextReduction("state", mapContexts(contexts, (snapshot) => removeStateCodec(snapshot, codecId)));
  }
  for (const coordinate of comparableEntityCoordinates(contexts)) {
    await tryContextReduction("entities", mapContexts(contexts, (snapshot) => removeEntity(snapshot, coordinate.codecId, coordinate.index)));
  }
  for (const stream of comparableRngStreams(contexts)) {
    await tryContextReduction("rng", mapContexts(contexts, (snapshot) => removeRngStream(snapshot, stream)));
  }
  for (const field of ["viewport", "colorScheme", "reducedMotion"] as const) {
    await tryContextReduction("presentation", mapContexts(contexts, (snapshot) => snapshot, (presentation) => removePresentationField(presentation, field)));
  }

  const retained = lastAccepted;
  if (retained === undefined) throw new Error("no stable minimized replay was retained");
  const originalContextEvidence = Object.freeze({ base: contextEvidence(originalContexts.base), candidate: contextEvidence(originalContexts.candidate) });
  const minimalContextEvidence = Object.freeze({ base: contextEvidence(contexts.base), candidate: contextEvidence(contexts.candidate) });
  const original = Object.freeze({
    base: runEvidence(input.originalBase), candidate: runEvidence(input.originalCandidate), actionCount: originalActions.length, maxTicks: originalMaxTicks,
    replayContext: originalContextEvidence,
  });
  const data = {
    format: "tearbench-regression-minimization" as const,
    schemaVersion: 1 as const,
    createdAt: input.createdAt,
    status: "minimized" as const,
    coordinates: Object.freeze({
      scenarioId: input.originalBase.resolvedScenario.id,
      scenarioVersion: input.originalBase.resolvedScenario.version,
      seed: input.originalBase.seed,
      observationClass: input.originalBase.observations[0]?.observationClass ?? "unknown",
    }),
    signature: expected,
    original,
    minimalChild: Object.freeze({
      base: runEvidence(retained.base), candidate: runEvidence(retained.candidate),
      actions: Object.freeze([...actions]), maxTicks: retained.base.resolvedScenario.maxTicks, acceptedReproductions: repetitions,
      lineage: Object.freeze({ relation: "minimized-from" as const, parentEvidenceHash: stableVerificationHash(original) }),
      replayContext: minimalContextEvidence,
      reducedDimensions: Object.freeze([...reducedDimensions].sort()),
    }),
  };
  return Object.freeze({ ...data, evidenceHash: stableVerificationHash(data) });
}
