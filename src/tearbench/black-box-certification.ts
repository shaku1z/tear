import { stableVerificationHash } from "../replay/hash";
import type { TearExecutionClass, TearObservationClass } from "./contracts";

/**
 * C25's statistical contract deliberately lives outside the browser harness.
 * A harness may produce attempts, but this module is the single place that
 * decides whether those attempts can be described as Class C certification.
 */
export const BLACK_BOX_CERTIFICATION_CONFIDENCE = 0.95;
const ONE_SIDED_95_WILSON_Z = 1.6448536269514722;

export type PhysicalPlayerInputKind = "keyboard-mouse" | "controller" | "touch";
export type BlackBoxAttemptOutcome = "success" | "failure" | "incomplete";
export type BlackBoxAttemptRole = "primary" | "diagnostic-retry";
export type BlackBoxCertificationDisposition = "pass" | "fail" | "incomplete";

const PHYSICAL_PLAYER_INPUT_KINDS = new Set<PhysicalPlayerInputKind>(["keyboard-mouse", "controller", "touch"]);
const BLACK_BOX_ATTEMPT_OUTCOMES = new Set<BlackBoxAttemptOutcome>(["success", "failure", "incomplete"]);

export interface BlackBoxEvidenceArtifacts {
  readonly inputTrace: string;
  readonly observationTrace: string;
  readonly finalScreenshot: string;
}

export interface BlackBoxCertificationAttemptInput {
  readonly id: string;
  readonly recordedAt: string;
  readonly buildId: string;
  readonly policyId: string;
  /** These are runtime-checked as well as literal in the output contract. */
  readonly executionClass: TearExecutionClass;
  readonly observationClass: TearObservationClass;
  readonly physicalInput: PhysicalPlayerInputKind;
  readonly outcome: BlackBoxAttemptOutcome;
  readonly artifacts: BlackBoxEvidenceArtifacts;
  readonly role?: BlackBoxAttemptRole;
  /** A retry is diagnostic evidence only and can never replace this attempt. */
  readonly diagnosticRetryOf?: string;
}

export interface BlackBoxCertificationAttempt {
  readonly format: "tearbench-black-box-attempt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly recordedAt: string;
  readonly buildId: string;
  readonly policyId: string;
  readonly executionClass: "black-box";
  readonly observationClass: "pixel-only";
  readonly physicalInput: PhysicalPlayerInputKind;
  readonly outcome: BlackBoxAttemptOutcome;
  readonly artifacts: Readonly<BlackBoxEvidenceArtifacts>;
  readonly role: BlackBoxAttemptRole;
  readonly diagnosticRetryOf?: string;
  readonly evidenceHash: string;
}

export interface BlackBoxCertificationTarget {
  readonly id: string;
  readonly label: string;
  readonly requiredAttempts: number;
  readonly requiredWilsonLowerBound: number;
  readonly confidence: number;
}

/**
 * The initial declared Normal Adventure target.  A one-sided 95% Wilson
 * bound of 90% intentionally makes 49/50 a pass and 48/50 a failure.
 */
export const NORMAL_ADVENTURE_BLACK_BOX_TARGET: Readonly<BlackBoxCertificationTarget> = Object.freeze({
  id: "normal-adventure-class-c-v1",
  label: "Normal Adventure",
  requiredAttempts: 50,
  requiredWilsonLowerBound: 0.9,
  confidence: BLACK_BOX_CERTIFICATION_CONFIDENCE,
});

export interface BlackBoxCertificationReport {
  readonly format: "tearbench-black-box-certification-report";
  readonly schemaVersion: 1;
  readonly target: Readonly<BlackBoxCertificationTarget>;
  /** Primary attempts are the immutable statistical denominator. */
  readonly attempts: readonly BlackBoxCertificationAttempt[];
  /** Retried diagnostics remain auditable but cannot affect the denominator. */
  readonly diagnosticRetries: readonly BlackBoxCertificationAttempt[];
  readonly denominator: number;
  readonly successes: number;
  readonly failures: number;
  readonly incompleteAttempts: number;
  readonly completionRate: number;
  readonly wilsonLowerBound: number;
  readonly disposition: BlackBoxCertificationDisposition;
  readonly certified: boolean;
  readonly evidenceHash: string;
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must be non-empty`);
}

function assertTarget(target: BlackBoxCertificationTarget): void {
  assertNonEmptyString(target.id, "target ID");
  assertNonEmptyString(target.label, "target label");
  if (!Number.isSafeInteger(target.requiredAttempts) || target.requiredAttempts < 1) {
    throw new RangeError("target requiredAttempts must be a positive safe integer");
  }
  if (target.confidence !== BLACK_BOX_CERTIFICATION_CONFIDENCE) {
    throw new RangeError("only the declared one-sided 95% confidence interval is supported");
  }
  if (!Number.isFinite(target.requiredWilsonLowerBound)
    || target.requiredWilsonLowerBound <= 0 || target.requiredWilsonLowerBound > 1) {
    throw new RangeError("target requiredWilsonLowerBound must be within (0, 1]");
  }
}

function immutableAttempt(input: BlackBoxCertificationAttemptInput): BlackBoxCertificationAttempt {
  assertNonEmptyString(input.id, "attempt ID");
  assertNonEmptyString(input.recordedAt, "attempt recordedAt");
  assertNonEmptyString(input.buildId, "attempt buildId");
  assertNonEmptyString(input.policyId, "attempt policyId");
  if (input.executionClass !== "black-box") throw new TypeError("Class C attempts must use black-box execution");
  if (input.observationClass !== "pixel-only") throw new TypeError("Class C attempts must use pixel-only observation");
  if (!PHYSICAL_PLAYER_INPUT_KINDS.has(input.physicalInput)) {
    throw new TypeError("Class C attempts must use physical player-valid input");
  }
  if (!BLACK_BOX_ATTEMPT_OUTCOMES.has(input.outcome)) throw new TypeError("attempt outcome is not recognized");
  const role = input.role ?? "primary";
  if (role === "primary" && input.diagnosticRetryOf !== undefined) {
    throw new TypeError("only diagnostic retries may declare diagnosticRetryOf");
  }
  if (role === "diagnostic-retry" && (input.diagnosticRetryOf === undefined || input.diagnosticRetryOf.trim().length === 0)) {
    throw new TypeError("diagnostic retries must identify their original attempt");
  }
  const artifacts = Object.freeze({
    inputTrace: input.artifacts.inputTrace,
    observationTrace: input.artifacts.observationTrace,
    finalScreenshot: input.artifacts.finalScreenshot,
  });
  for (const [label, value] of Object.entries(artifacts)) assertNonEmptyString(value, `attempt artifact ${label}`);
  const data = {
    id: input.id,
    recordedAt: input.recordedAt,
    buildId: input.buildId,
    policyId: input.policyId,
    executionClass: "black-box" as const,
    observationClass: "pixel-only" as const,
    physicalInput: input.physicalInput,
    outcome: input.outcome,
    artifacts,
    role,
    ...(input.diagnosticRetryOf === undefined ? {} : { diagnosticRetryOf: input.diagnosticRetryOf }),
  };
  return Object.freeze({
    format: "tearbench-black-box-attempt",
    schemaVersion: 1,
    ...data,
    evidenceHash: stableVerificationHash(data),
  });
}

/** Creates a copied, frozen evidence object and rejects any Class A/B affordance. */
export function createBlackBoxCertificationAttempt(input: BlackBoxCertificationAttemptInput): BlackBoxCertificationAttempt {
  return immutableAttempt(input);
}

/** One-sided lower Wilson confidence limit with the fixed 95% certification z-score. */
export function oneSidedWilsonLowerBound95(successes: number, attempts: number): number {
  if (!Number.isSafeInteger(successes) || !Number.isSafeInteger(attempts)
    || attempts < 0 || successes < 0 || successes > attempts) {
    throw new RangeError("Wilson successes must be within a non-negative integer denominator");
  }
  if (attempts === 0) return 0;
  const proportion = successes / attempts;
  const zSquared = ONE_SIDED_95_WILSON_Z ** 2;
  const numerator = proportion + zSquared / (2 * attempts)
    - ONE_SIDED_95_WILSON_Z * Math.sqrt(
      proportion * (1 - proportion) / attempts + zSquared / (4 * attempts ** 2),
    );
  return Math.max(0, numerator / (1 + zSquared / attempts));
}

function copyAttempt(attempt: BlackBoxCertificationAttempt): BlackBoxCertificationAttempt {
  return immutableAttempt(attempt);
}

/**
 * Builds a certification report without browser dependencies.  Every primary
 * launch remains in `denominator`, including incomplete launches; a diagnostic
 * retry is retained separately and cannot replace, remove, or improve it.
 */
export function createBlackBoxCertificationReport(input: Readonly<{
  attempts: readonly BlackBoxCertificationAttempt[];
  diagnosticRetries?: readonly BlackBoxCertificationAttempt[];
  target?: BlackBoxCertificationTarget;
}>): BlackBoxCertificationReport {
  const target = input.target ?? NORMAL_ADVENTURE_BLACK_BOX_TARGET;
  assertTarget(target);
  const attempts = input.attempts.map(copyAttempt);
  const diagnosticRetries = (input.diagnosticRetries ?? []).map(copyAttempt);
  const ids = new Set<string>();
  for (const attempt of [...attempts, ...diagnosticRetries]) {
    if (ids.has(attempt.id)) throw new TypeError(`attempt IDs must be unique: ${attempt.id}`);
    ids.add(attempt.id);
  }
  if (attempts.some((attempt) => attempt.role !== "primary")) {
    throw new TypeError("the certification denominator contains only primary attempts");
  }
  const primaryIds = new Set(attempts.map((attempt) => attempt.id));
  for (const retry of diagnosticRetries) {
    if (retry.role !== "diagnostic-retry") throw new TypeError("diagnosticRetries must be diagnostic-retry evidence");
    if (!primaryIds.has(retry.diagnosticRetryOf ?? "")) {
      throw new TypeError(`diagnostic retry lacks an original primary attempt: ${retry.id}`);
    }
  }
  const successes = attempts.filter((attempt) => attempt.outcome === "success").length;
  const failures = attempts.filter((attempt) => attempt.outcome === "failure").length;
  const incompleteAttempts = attempts.length - successes - failures;
  const denominator = attempts.length;
  const completionRate = denominator === 0 ? 0 : successes / denominator;
  const wilsonLowerBound = oneSidedWilsonLowerBound95(successes, denominator);
  const disposition: BlackBoxCertificationDisposition = denominator < target.requiredAttempts
    ? "incomplete"
    : wilsonLowerBound >= target.requiredWilsonLowerBound ? "pass" : "fail";
  const data = {
    target: Object.freeze({ ...target }),
    attempts: Object.freeze(attempts),
    diagnosticRetries: Object.freeze(diagnosticRetries),
    denominator,
    successes,
    failures,
    incompleteAttempts,
    completionRate,
    wilsonLowerBound,
    disposition,
    certified: disposition === "pass",
  };
  return Object.freeze({
    format: "tearbench-black-box-certification-report",
    schemaVersion: 1,
    ...data,
    evidenceHash: stableVerificationHash(data),
  });
}
