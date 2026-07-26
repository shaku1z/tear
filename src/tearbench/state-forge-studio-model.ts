import type { TearSdlDocumentV1, TearSdlIssue, TearSdlResolved } from "./tearsdl";
import { parseTearSdl, resolveTearSdl } from "./tearsdl";

export type StateForgeReportStatus =
  | "valid"
  | "invalid"
  | "reachable"
  | "unreachable"
  | "plausible"
  | "provisional"
  | "implausible"
  | "not-evaluated";

export interface StateForgeReport {
  readonly status: StateForgeReportStatus;
  readonly messages: readonly string[];
}

export interface StateForgeValidationReports {
  readonly structural: StateForgeReport;
  readonly reachability: StateForgeReport;
  readonly populationPlausibility: StateForgeReport;
}

export interface StateForgeEvaluation {
  readonly source: string;
  readonly document?: TearSdlDocumentV1;
  readonly resolved?: TearSdlResolved;
  readonly reports: StateForgeValidationReports;
}

export interface StateForgeValueDiff {
  readonly path: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

const notEvaluated = (reason: string): StateForgeReport =>
  Object.freeze({ status: "not-evaluated", messages: Object.freeze([reason]) });

function issueMessage(issue: TearSdlIssue): string {
  return `${issue.path}: ${issue.message}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown validation failure";
}

export function evaluateStateForgeSource(
  source: string,
  library: ReadonlyMap<string, TearSdlDocumentV1> = new Map(),
): StateForgeEvaluation {
  try {
    const document = parseTearSdl(source);
    const resolved = resolveTearSdl(document, library);
    const structuralMessages = resolved.structural.issues.map(issueMessage);
    const structural = Object.freeze({
      status: "valid" as const,
      messages: Object.freeze(structuralMessages.length === 0 ? ["TearSDL structure is valid."] : structuralMessages),
    });
    const reachability = Object.freeze({
      status: resolved.reachability.reachable ? "reachable" as const : "unreachable" as const,
      messages: Object.freeze(
        resolved.reachability.reasons.length === 0
          ? ["No reachability contradiction was found."]
          : [...resolved.reachability.reasons],
      ),
    });
    const plausibilityStatus = resolved.plausibility.provisional
      ? "provisional" as const
      : resolved.plausibility.plausible ? "plausible" as const : "implausible" as const;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectDiff(
  before: unknown,
  after: unknown,
  path: string,
  differences: StateForgeValueDiff[],
): void {
  if (Object.is(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) collectDiff(before[key], after[key], `${path}.${key}`, differences);
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  differences.push(Object.freeze({
    path,
    ...(before === undefined ? {} : { before: structuredClone(before) }),
    ...(after === undefined ? {} : { after: structuredClone(after) }),
  }));
}

export function diffStateForgeValues(before: unknown, after: unknown): readonly StateForgeValueDiff[] {
  const differences: StateForgeValueDiff[] = [];
  collectDiff(before, after, "$", differences);
  return Object.freeze(differences);
}

export function createStateForgeForkSource(
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
