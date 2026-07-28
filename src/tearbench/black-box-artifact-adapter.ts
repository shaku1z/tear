import { stableVerificationHash } from "../replay/hash";
import {
  createBlackBoxCertificationAttempt,
  createBlackBoxCertificationReport,
  type BlackBoxAttemptOutcome,
  type BlackBoxCertificationAttempt,
  type BlackBoxCertificationReport,
  type BlackBoxCertificationTarget,
  type PhysicalPlayerInputKind,
} from "./black-box-certification";

/**
 * This is the import boundary between a browser-run artifact and the C25
 * statistical contract.  It deliberately accepts a narrow, signed-shaped
 * artifact rather than interpreting the assorted browser-smoke JSON files.
 * A smoke is evidence of a boundary, never evidence of an Adventure win.
 */
export const BLACK_BOX_ATTEMPT_ARTIFACT_FORMAT = "tearbench-class-c-attempt-artifact";
export const BLACK_BOX_ATTEMPT_ARTIFACT_SCHEMA_VERSION = 1;
export const BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM = "tear-stable-verification-hash-v1";

export type BlackBoxArtifactKind = "terminal-trace" | "partial-smoke";
export type BlackBoxTerminalDisposition = "victory" | "failure" | "incomplete";
export type BlackBoxArtifactReportKind = "all-attempts-incomplete" | "terminal-evidence" | "mixed-evidence";

export interface BlackBoxArtifactReference {
  readonly path: string;
  /** sha256 of the referenced artifact bytes, recorded by the producer. */
  readonly sha256: string;
}

export interface BlackBoxAttemptArtifactDraft {
  readonly format: typeof BLACK_BOX_ATTEMPT_ARTIFACT_FORMAT;
  readonly schemaVersion: typeof BLACK_BOX_ATTEMPT_ARTIFACT_SCHEMA_VERSION;
  readonly id: string;
  readonly recordedAt: string;
  readonly buildId: string;
  readonly policyId: string;
  readonly executionClass: "black-box";
  readonly observationClass: "pixel-only";
  readonly physicalInput: PhysicalPlayerInputKind;
  /** A partial smoke stays an explicit incomplete primary denominator entry. */
  readonly kind: BlackBoxArtifactKind;
  readonly terminal: BlackBoxTerminalDisposition;
  readonly journey: Readonly<{
    readonly mode: "adventure";
    readonly difficulty: "normal";
    readonly startedAtMenu: boolean;
    readonly returnedToMenu: boolean;
  }>;
  readonly artifacts: Readonly<{
    readonly inputTrace: BlackBoxArtifactReference;
    readonly observationTrace: BlackBoxArtifactReference;
    readonly finalScreenshot: BlackBoxArtifactReference;
  }>;
}

export interface BlackBoxAttemptArtifact extends BlackBoxAttemptArtifactDraft {
  readonly integrity: Readonly<{
    readonly algorithm: typeof BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM;
    readonly contentHash: string;
  }>;
}

export type BlackBoxArtifactImport =
  | Readonly<{ accepted: true; artifact: BlackBoxAttemptArtifact; attempt: BlackBoxCertificationAttempt }>
  | Readonly<{ accepted: false; reasons: readonly string[] }>;

export interface BlackBoxArtifactCertificationReport {
  readonly format: "tearbench-black-box-artifact-certification-report";
  readonly schemaVersion: 1;
  readonly artifactReportKind: BlackBoxArtifactReportKind;
  readonly acceptedAttempts: readonly BlackBoxCertificationAttempt[];
  readonly rejectedArtifacts: readonly Readonly<{ index: number; reasons: readonly string[] }>[];
  readonly certification: BlackBoxCertificationReport;
  readonly evidenceHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function physicalInput(value: unknown): value is PhysicalPlayerInputKind {
  return value === "keyboard-mouse" || value === "controller" || value === "touch";
}

function terminal(value: unknown): value is BlackBoxTerminalDisposition {
  return value === "victory" || value === "failure" || value === "incomplete";
}

function artifactKind(value: unknown): value is BlackBoxArtifactKind {
  return value === "terminal-trace" || value === "partial-smoke";
}

function readReference(value: unknown, path: string, reasons: string[]): BlackBoxArtifactReference | undefined {
  if (!isRecord(value) || !nonEmpty(value.path) || !sha256(value.sha256)) {
    reasons.push(`${path} must contain a non-empty path and sha256`);
    return undefined;
  }
  return Object.freeze({ path: value.path, sha256: value.sha256.toLowerCase() });
}

function integrityPayload(draft: BlackBoxAttemptArtifactDraft): BlackBoxAttemptArtifactDraft {
  return {
    format: draft.format,
    schemaVersion: draft.schemaVersion,
    id: draft.id,
    recordedAt: draft.recordedAt,
    buildId: draft.buildId,
    policyId: draft.policyId,
    executionClass: draft.executionClass,
    observationClass: draft.observationClass,
    physicalInput: draft.physicalInput,
    kind: draft.kind,
    terminal: draft.terminal,
    journey: Object.freeze({ ...draft.journey }),
    artifacts: Object.freeze({
      inputTrace: Object.freeze({ ...draft.artifacts.inputTrace }),
      observationTrace: Object.freeze({ ...draft.artifacts.observationTrace }),
      finalScreenshot: Object.freeze({ ...draft.artifacts.finalScreenshot }),
    }),
  };
}

/** Creates a content-bound artifact. It does not grant a success outcome. */
export function createBlackBoxAttemptArtifact(draft: BlackBoxAttemptArtifactDraft): BlackBoxAttemptArtifact {
  const imported = importBlackBoxAttemptArtifact({ ...draft, integrity: { algorithm: BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM, contentHash: stableVerificationHash(integrityPayload(draft)) } });
  if (!imported.accepted) throw new TypeError(`invalid Class-C attempt artifact: ${imported.reasons.join("; ")}`);
  return imported.artifact;
}

/**
 * Validates an untrusted artifact and converts it to one immutable primary
 * certification attempt. Invalid evidence is rejected rather than silently
 * omitted or counted as a success.
 */
export function importBlackBoxAttemptArtifact(value: unknown): BlackBoxArtifactImport {
  const reasons: string[] = [];
  if (!isRecord(value)) return Object.freeze({ accepted: false, reasons: Object.freeze(["artifact must be an object"]) });
  if (value.format !== BLACK_BOX_ATTEMPT_ARTIFACT_FORMAT) reasons.push("artifact format is not a Class-C attempt artifact");
  if (value.schemaVersion !== BLACK_BOX_ATTEMPT_ARTIFACT_SCHEMA_VERSION) reasons.push("artifact schemaVersion is not supported");
  for (const key of ["id", "recordedAt", "buildId", "policyId"] as const) if (!nonEmpty(value[key])) reasons.push(`${key} must be non-empty`);
  if (value.executionClass !== "black-box") reasons.push("artifact must declare black-box execution");
  if (value.observationClass !== "pixel-only") reasons.push("artifact must declare pixel-only observation");
  if (!physicalInput(value.physicalInput)) reasons.push("artifact must declare a physical input kind");
  if (!artifactKind(value.kind)) reasons.push("artifact kind is not recognized");
  if (!terminal(value.terminal)) reasons.push("artifact terminal disposition is not recognized");
  const journeyValue = value.journey;
  if (!isRecord(journeyValue)
    || journeyValue.mode !== "adventure" || journeyValue.difficulty !== "normal"
    || typeof journeyValue.startedAtMenu !== "boolean" || typeof journeyValue.returnedToMenu !== "boolean") {
    reasons.push("artifact must declare a Normal Adventure menu-to-menu journey");
  }
  const artifactsValue = value.artifacts;
  let inputTrace: BlackBoxArtifactReference | undefined;
  let observationTrace: BlackBoxArtifactReference | undefined;
  let finalScreenshot: BlackBoxArtifactReference | undefined;
  if (!isRecord(artifactsValue)) reasons.push("artifact references are missing");
  else {
    inputTrace = readReference(artifactsValue.inputTrace, "artifacts.inputTrace", reasons);
    observationTrace = readReference(artifactsValue.observationTrace, "artifacts.observationTrace", reasons);
    finalScreenshot = readReference(artifactsValue.finalScreenshot, "artifacts.finalScreenshot", reasons);
  }
  const integrityValue = isRecord(value.integrity) ? value.integrity : undefined;
  if (integrityValue?.algorithm !== BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM || !nonEmpty(integrityValue.contentHash)) {
    reasons.push("artifact integrity is missing or unsupported");
  }
  if (reasons.length > 0 || inputTrace === undefined || observationTrace === undefined || finalScreenshot === undefined
    || !isRecord(journeyValue) || !artifactKind(value.kind) || !terminal(value.terminal) || !physicalInput(value.physicalInput)) {
    return Object.freeze({ accepted: false, reasons: Object.freeze(reasons) });
  }
  const draft: BlackBoxAttemptArtifactDraft = {
    format: BLACK_BOX_ATTEMPT_ARTIFACT_FORMAT,
    schemaVersion: BLACK_BOX_ATTEMPT_ARTIFACT_SCHEMA_VERSION,
    id: value.id as string, recordedAt: value.recordedAt as string, buildId: value.buildId as string, policyId: value.policyId as string,
    executionClass: "black-box", observationClass: "pixel-only", physicalInput: value.physicalInput,
    kind: value.kind, terminal: value.terminal,
    journey: Object.freeze({ mode: "adventure", difficulty: "normal", startedAtMenu: journeyValue.startedAtMenu as boolean, returnedToMenu: journeyValue.returnedToMenu as boolean }),
    artifacts: Object.freeze({ inputTrace, observationTrace, finalScreenshot }),
  };
  const expectedHash = stableVerificationHash(integrityPayload(draft));
  if (integrityValue?.contentHash !== expectedHash) {
    return Object.freeze({ accepted: false, reasons: Object.freeze(["artifact integrity contentHash does not match its evidence payload"]) });
  }
  const completeTerminal = draft.kind === "terminal-trace"
    && draft.terminal === "victory"
    && draft.journey.startedAtMenu
    && draft.journey.returnedToMenu;
  // A smoke may exercise a failure-looking boundary, but it has not attempted
  // the declared menu-to-menu journey and therefore remains incomplete.
  const outcome: BlackBoxAttemptOutcome = draft.kind === "partial-smoke" ? "incomplete"
    : completeTerminal ? "success" : draft.terminal === "failure" ? "failure" : "incomplete";
  const artifact = Object.freeze({
    ...integrityPayload(draft),
    integrity: Object.freeze({ algorithm: BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM, contentHash: expectedHash }),
  });
  const attempt = createBlackBoxCertificationAttempt({
    id: draft.id, recordedAt: draft.recordedAt, buildId: draft.buildId, policyId: draft.policyId,
    executionClass: "black-box", observationClass: "pixel-only", physicalInput: draft.physicalInput, outcome,
    artifacts: {
      inputTrace: `${draft.artifacts.inputTrace.path}#sha256=${draft.artifacts.inputTrace.sha256}`,
      observationTrace: `${draft.artifacts.observationTrace.path}#sha256=${draft.artifacts.observationTrace.sha256}`,
      finalScreenshot: `${draft.artifacts.finalScreenshot.path}#sha256=${draft.artifacts.finalScreenshot.sha256}`,
    },
  });
  return Object.freeze({ accepted: true, artifact, attempt });
}

/** Collects artifact imports without allowing rejected evidence to alter the denominator. */
export function createBlackBoxArtifactCertificationReport(input: Readonly<{
  artifacts: readonly unknown[];
  target?: BlackBoxCertificationTarget;
}>): BlackBoxArtifactCertificationReport {
  const imports = input.artifacts.map(importBlackBoxAttemptArtifact);
  const acceptedAttempts = imports.filter((entry): entry is Extract<BlackBoxArtifactImport, { accepted: true }> => entry.accepted).map((entry) => entry.attempt);
  const rejectedArtifacts = Object.freeze(imports.flatMap((entry, index) => entry.accepted ? [] : [Object.freeze({ index, reasons: entry.reasons })]));
  const certification = createBlackBoxCertificationReport({ attempts: acceptedAttempts, ...(input.target === undefined ? {} : { target: input.target }) });
  const artifactReportKind: BlackBoxArtifactReportKind = acceptedAttempts.length > 0 && acceptedAttempts.every((attempt) => attempt.outcome === "incomplete")
    ? "all-attempts-incomplete"
    : acceptedAttempts.every((attempt) => attempt.outcome === "success" || attempt.outcome === "failure")
      ? "terminal-evidence" : "mixed-evidence";
  const data = { artifactReportKind, acceptedAttempts: Object.freeze(acceptedAttempts), rejectedArtifacts, certification };
  return Object.freeze({
    format: "tearbench-black-box-artifact-certification-report", schemaVersion: 1,
    ...data, evidenceHash: stableVerificationHash(data),
  });
}
