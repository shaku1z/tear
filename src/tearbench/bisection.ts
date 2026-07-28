import type { TearRegressionInvestigation, TearOwnershipRoute } from "./regression-intelligence";
import { routeRegressionOwnership } from "./regression-intelligence";

export const TEAR_BISECTION_FORMAT = "tearbench-local-bisection" as const;
export const TEAR_BISECTION_SCHEMA_VERSION = 1 as const;

export type TearBisectAttemptOutcome = "reproduces" | "does-not-reproduce" | "execution-error";
export type TearBisectStability = "reproduces" | "does-not-reproduce" | "unstable" | "unavailable";

/** One clean-process observation.  The artifact stays independently rerunnable. */
export interface TearBisectAttemptV1 {
  readonly attempt: number;
  readonly outcome: TearBisectAttemptOutcome;
  readonly artifactPath?: string;
  readonly investigationPath?: string;
  readonly firstMaterialDivergenceTick?: number;
  readonly error?: string;
}

export interface TearBisectRevisionRecordV1 {
  readonly revision: string;
  readonly attempts: readonly TearBisectAttemptV1[];
  readonly stability: TearBisectStability;
}

export interface TearBisectRequestV1 {
  readonly goodRevision: string;
  readonly badRevision: string;
  readonly repetitions: number;
  readonly maxRevisions: number;
}

export interface TearBisectOwnershipHintsV1 {
  readonly route: TearOwnershipRoute;
  readonly hints: readonly string[];
}

export interface TearLocalBisectArtifactV1 {
  readonly format: typeof TEAR_BISECTION_FORMAT;
  readonly schemaVersion: typeof TEAR_BISECTION_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly request: TearBisectRequestV1;
  readonly scenario: Readonly<{ id: string; seed: string; actionTrace?: string }>;
  readonly revisions: readonly TearBisectRevisionRecordV1[];
  readonly result: Readonly<{
    readonly status: "first-bad-found" | "inconclusive" | "refused";
    readonly firstBadRevision?: string;
    readonly reason?: string;
  }>;
  readonly ownership?: TearBisectOwnershipHintsV1;
}

function nonBlank(value: string, label: string): string {
  if (value.trim() === "") throw new TypeError(`${label} must be non-empty`);
  return value;
}

/**
 * Prevent an accidental expensive or statistically meaningless bisect before
 * the CLI is allowed to create any Git worktree.
 */
export function validateBisectRequest(request: TearBisectRequestV1): TearBisectRequestV1 {
  nonBlank(request.goodRevision, "good revision");
  nonBlank(request.badRevision, "bad revision");
  if (!Number.isSafeInteger(request.repetitions) || request.repetitions < 2 || request.repetitions > 10) {
    throw new RangeError("bisection repetitions must be an integer from 2 through 10");
  }
  if (!Number.isSafeInteger(request.maxRevisions) || request.maxRevisions < 2 || request.maxRevisions > 64) {
    throw new RangeError("bisection max revisions must be an integer from 2 through 64");
  }
  return Object.freeze({ ...request });
}

/** Classify repeated clean-process runs without hiding flaky or failed setup. */
export function classifyBisectAttempts(attempts: readonly TearBisectAttemptV1[]): TearBisectStability {
  if (attempts.length < 2) throw new RangeError("bisection requires at least two reproduction attempts");
  if (attempts.some((attempt) => attempt.outcome === "execution-error")) return "unavailable";
  const reproduced = attempts.filter((attempt) => attempt.outcome === "reproduces").length;
  return reproduced === attempts.length ? "reproduces"
    : reproduced === 0 ? "does-not-reproduce"
      : "unstable";
}

export function createBisectRevisionRecord(
  revision: string,
  attempts: readonly TearBisectAttemptV1[],
): TearBisectRevisionRecordV1 {
  nonBlank(revision, "revision");
  const expected = attempts.map((attempt, index) => {
    if (attempt.attempt !== index + 1) throw new RangeError("bisection attempts must be consecutive and one-based");
    if (attempt.outcome === "execution-error" && (attempt.error?.trim() ?? "") === "") {
      throw new TypeError("an execution-error attempt requires its error evidence");
    }
    if (attempt.outcome !== "execution-error" && (attempt.artifactPath?.trim() ?? "") === "") {
      throw new TypeError("a completed bisection attempt requires an artifact path");
    }
    return Object.freeze({ ...attempt });
  });
  return Object.freeze({ revision, attempts: Object.freeze(expected), stability: classifyBisectAttempts(expected) });
}

/**
 * Finds a monotonic transition only when both endpoints and every sampled
 * revision are stable.  A flaky run is evidence of uncertainty, never a bad
 * commit.
 */
export function selectFirstStableBadRevision(records: readonly TearBisectRevisionRecordV1[]): Readonly<{
  firstBadRevision?: string;
  reason?: string;
}> {
  if (records.length < 2) return Object.freeze({ reason: "at least good and bad revision records are required" });
  if (records.some((record) => record.stability === "unstable" || record.stability === "unavailable")) {
    return Object.freeze({ reason: "a sampled revision was unstable or unavailable" });
  }
  if (records[0]?.stability !== "does-not-reproduce") return Object.freeze({ reason: "the declared good revision reproduces" });
  if (records.at(-1)?.stability !== "reproduces") return Object.freeze({ reason: "the declared bad revision does not reproduce" });
  const firstBad = records.findIndex((record) => record.stability === "reproduces");
  if (firstBad < 1) return Object.freeze({ reason: "no candidate first-bad revision was observed" });
  if (records.slice(firstBad).some((record) => record.stability !== "reproduces")) {
    return Object.freeze({ reason: "reproduction was non-monotonic across sampled revisions" });
  }
  const revision = records[firstBad]?.revision;
  return revision === undefined
    ? Object.freeze({ reason: "no candidate first-bad revision was observed" })
    : Object.freeze({ firstBadRevision: revision });
}

/**
 * Emits investigation-grounded ownership suggestions.  They deliberately do
 * not assert causality: the changed paths narrow the review surface while the
 * first divergence identifies the causal observation boundary.
 */
export function deriveBisectOwnershipHints(input: Readonly<{
  changedPaths: readonly string[];
  investigation?: TearRegressionInvestigation;
  firstBadRevision?: string;
}>): TearBisectOwnershipHintsV1 {
  const route = routeRegressionOwnership(input.changedPaths);
  const hints = [
    ...route.hints,
    input.firstBadRevision === undefined
      ? "no stable first-bad revision was established; do not assign causality"
      : `review the diff introduced by ${input.firstBadRevision} before assigning ownership`,
  ];
  const first = input.investigation?.comparison.firstMaterialDivergence;
  if (first !== undefined) {
    hints.push(`first material divergence was observed at fixed tick ${String(first.tick)}`);
    hints.push("start from the divergent semantic state and its responsible subsystem, not downstream effects");
  } else if (input.investigation?.status === "equivalent") {
    hints.push("the compared materialized runs were equivalent; this is not a product regression attribution");
  } else {
    hints.push("no compatible investigation artifact was available for a semantic divergence hint");
  }
  return Object.freeze({ route, hints: Object.freeze([...new Set(hints)]) });
}
