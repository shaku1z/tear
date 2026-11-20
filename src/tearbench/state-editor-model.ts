import { isRecord } from "../domain/records";
import type { TearSdlDocumentV1, TearSdlIssue, TearSdlResolved } from "./tearsdl";
import { parseTearSdl, resolveTearSdl } from "./tearsdl";

export type StateSetupReportStatus =
  "valid" | "invalid" | "reachable" | "unreachable" | "plausible" | "provisional" | "implausible" | "not-evaluated";

export interface StateSetupReport {
  readonly status: StateSetupReportStatus;
  readonly messages: readonly string[];
}

export interface StateSetupValidationReports {
  readonly structural: StateSetupReport;
  readonly reachability: StateSetupReport;
  readonly populationPlausibility: StateSetupReport;
}

export interface StateSetupEvaluation {
  readonly source: string;
  readonly document?: TearSdlDocumentV1;
  readonly resolved?: TearSdlResolved;
  readonly reports: StateSetupValidationReports;
}

export interface StateSetupValueDiff {
  readonly path: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

const notEvaluated = (reason: string): StateSetupReport =>
  Object.freeze({ status: "not-evaluated", messages: Object.freeze([reason]) });

function issueMessage(issue: TearSdlIssue): string {
  return `${issue.path}: ${issue.message}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown validation failure";
}

export function evaluateStateSetupSource(
  source: string,
  library: ReadonlyMap<string, TearSdlDocumentV1> = new Map(),
): StateSetupEvaluation {
  try {
    const document = parseTearSdl(source);
    const resolved = resolveTearSdl(document, library);
    const structuralMessages = resolved.structural.issues.map(issueMessage);
    const structural = Object.freeze({
      status: "valid" as const,
      messages: Object.freeze(structuralMessages.length === 0 ? ["TearSDL structure is valid."] : structuralMessages),
    });
    const reachability = Object.freeze({
      status: resolved.reachability.reachable ? ("reachable" as const) : ("unreachable" as const),
      messages: Object.freeze(
        resolved.reachability.reasons.length === 0
          ? ["No reachability contradiction was found."]
          : [...resolved.reachability.reasons],
      ),
    });
    const plausibilityStatus = resolved.plausibility.provisional
      ? ("provisional" as const)
      : resolved.plausibility.plausible
        ? ("plausible" as const)
        : ("implausible" as const);
    const populationPlausibility = Object.freeze({
      status: plausibilityStatus,
      messages: Object.freeze(
        resolved.plausibility.reasons.length === 0
          ? ["Population plausibility constraints are satisfied."]
          : [...resolved.plausibility.reasons],
      ),
    });
    return Object.freeze({
      source,
      document,
      resolved,
      reports: Object.freeze({ structural, reachability, populationPlausibility }),
    });
  } catch (error) {
    const reason = errorMessage(error);
    return Object.freeze({
      source,
      reports: Object.freeze({
        structural: Object.freeze({ status: "invalid", messages: Object.freeze([reason]) }),
        reachability: notEvaluated("Reachability requires structurally valid TearSDL."),
        populationPlausibility: notEvaluated("Population plausibility requires structurally valid TearSDL."),
      }),
    });
  }
}

function collectDiff(before: unknown, after: unknown, path: string, differences: StateSetupValueDiff[]): void {
  if (Object.is(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) collectDiff(before[key], after[key], `${path}.${key}`, differences);
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  differences.push(
    Object.freeze({
      path,
      ...(before === undefined ? {} : { before: structuredClone(before) }),
      ...(after === undefined ? {} : { after: structuredClone(after) }),
    }),
  );
}

export function diffStateSetupValues(before: unknown, after: unknown): readonly StateSetupValueDiff[] {
  const differences: StateSetupValueDiff[] = [];
  collectDiff(before, after, "$", differences);
  return Object.freeze(differences);
}

export function createStateSetupForkSource(
  source: string,
  id: string,
  patch: Readonly<Record<string, unknown>>,
): string {
  const document = parseTearSdl(source);
  const fork = Object.freeze({
    ...document,
    id,
    extends: document.id,
    state: Object.freeze({ ...document.state, ...structuredClone(patch) }),
  });
  return `${JSON.stringify(fork, null, 2)}\n`;
}
