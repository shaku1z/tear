/**
 * Canonical Training Operations facade over the existing local Foundry
 * orchestration boundary.
 *
 * These aliases intentionally stop at the safe job/schedule/recovery/launch
 * surface.  The v1-v4 receipt, execution-binding, promotion, monitoring,
 * rollback, and authority modules keep their historical names and wire
 * formats until a later migration can prove the same persisted identity.
 */
export type {
  TearFoundryJobPhase as TrainingOperationsJobPhase,
  TearFoundryFrozenInputsV1 as TrainingOperationsFrozenInputsV1,
  TearFoundryEvaluationProtocolV1 as TrainingOperationsEvaluationProtocolV1,
  TearFoundryEvaluationProtocolInputV1 as TrainingOperationsEvaluationProtocolInputV1,
  TearFoundryJobEventV1 as TrainingOperationsJobEventV1,
  TearFoundryJobV1 as TrainingOperationsJobV1,
  TearFoundryJobReportV1 as TrainingOperationsJobReportV1,
} from "./foundry-job-state";
export {
  createTearFoundryJob as createTrainingOperationsJob,
  createTearFoundryJobV2 as createTrainingOperationsJobV2,
  parseTearFoundryJob as parseTrainingOperationsJob,
  requireTearFoundryEvaluationProtocol as requireTrainingOperationsEvaluationProtocol,
  transitionTearFoundryJob as transitionTrainingOperationsJob,
  reportTearFoundryJob as reportTrainingOperationsJob,
} from "./foundry-job-state";
export { TearFoundryJobVault as TrainingOperationsJobVault } from "./foundry-job-vault";

export type {
  TearFoundryScheduleDisposition as TrainingOperationsScheduleDisposition,
  TearFoundryJobScheduleV1 as TrainingOperationsJobScheduleV1,
  TearFoundryScheduleProjectionV1 as TrainingOperationsScheduleProjectionV1,
  TearFoundryScheduleAuthority as TrainingOperationsScheduleAuthority,
  TearFoundryScheduleContinuationReceiptV1 as TrainingOperationsScheduleContinuationReceiptV1,
} from "./foundry-job-schedule";
export {
  createTearFoundryJobSchedule as createTrainingOperationsSchedule,
  parseTearFoundryJobSchedule as parseTrainingOperationsSchedule,
  setTearFoundryJobScheduleEnabled as setTrainingOperationsScheduleEnabled,
  rebindTearFoundryJobSchedule as rebindTrainingOperationsSchedule,
  concludeTearFoundryJobSchedule as concludeTrainingOperationsSchedule,
  dueAtFoundryJobSchedule as dueAtTrainingOperationsSchedule,
  TearFoundryJobScheduleVault as TrainingOperationsScheduleVault,
  TearFoundryScheduleController as TrainingOperationsScheduleController,
} from "./foundry-job-schedule";

export type { TearFoundryRecoveryProjectionV1 as TrainingOperationsRecoveryProjectionV1 } from "./foundry-job-recovery";
export { TearFoundryRecoveryController as TrainingOperationsRecoveryController } from "./foundry-job-recovery";

export type {
  TearFoundryLaunchProfileV1 as TrainingOperationsLaunchProfileV1,
  TearFoundryLaunchProfileProjectionV1 as TrainingOperationsLaunchProfileProjectionV1,
} from "./foundry-launch-profile";
export {
  createTearFoundryLaunchProfile as createTrainingOperationsLaunchProfile,
  parseTearFoundryLaunchProfile as parseTrainingOperationsLaunchProfile,
  TearFoundryLaunchProfileAuthority as TrainingOperationsLaunchProfileAuthority,
} from "./foundry-launch-profile";

export type {
  TearFoundryBootstrapRequestV1 as TrainingOperationsBootstrapRequestV1,
  TearFoundryBootstrapReceiptV1 as TrainingOperationsBootstrapReceiptV1,
} from "./foundry-job-bootstrap";
export {
  parseTearFoundryBootstrapReceipt as parseTrainingOperationsBootstrapReceipt,
  TearFoundryBootstrapExecutor as TrainingOperationsBootstrapExecutor,
} from "./foundry-job-bootstrap";

/** Canonical normal-build route/query vocabulary for Training Operations. */
export type TrainingOperationsSurface = "training-operations";
export const TRAINING_OPERATIONS_ROUTE = "training-operations" as const;
/** The canvas state graph remains on the historical screen ID. */
export const TRAINING_OPERATIONS_SCREEN = "foundry" as const;
export const LEGACY_TRAINING_OPERATIONS_ROUTES = Object.freeze(["foundry"] as const);
export const TRAINING_OPERATIONS_QUERY = TRAINING_OPERATIONS_ROUTE;
export const LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES = Object.freeze(["foundry"] as const);
export const TRAINING_OPERATIONS_QUERY_VALUE = "1" as const;

/** Canonical semantic actions; old Foundry action IDs remain readable. */
export const TRAINING_OPERATIONS_ACTIONS = Object.freeze({
  open: "training-operations.open",
  refresh: "training-operations.refresh",
  bootstrap: "training-operations.bootstrap",
  scheduleEnable: "training-operations.schedule.enable",
  scheduleDisable: "training-operations.schedule.disable",
} as const);
export const LEGACY_TRAINING_OPERATIONS_ACTIONS = Object.freeze({
  refresh: "foundry.refresh",
  bootstrap: "foundry.bootstrap",
  scheduleEnable: "foundry.schedule.enable",
  scheduleDisable: "foundry.schedule.disable",
} as const);

/** Resolves canonical and preserved Foundry route tokens. */
export function resolveTrainingOperationsRoute(route: string): TrainingOperationsSurface | undefined {
  if (route === TRAINING_OPERATIONS_ROUTE || route === TRAINING_OPERATIONS_SCREEN
    || LEGACY_TRAINING_OPERATIONS_ROUTES.includes(route as never)) return TRAINING_OPERATIONS_ROUTE;
  return undefined;
}

function enabledFlag(parameters: URLSearchParams, key: string): boolean {
  if (!parameters.has(key)) return false;
  const value = parameters.get(key);
  return value === "" || value === TRAINING_OPERATIONS_QUERY_VALUE;
}

/** Returns true for a canonical or enabled legacy Training Operations link. */
export function isTrainingOperationsRequested(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return [TRAINING_OPERATIONS_QUERY, ...LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES]
    .some((key) => enabledFlag(parameters, key));
}

/** Returns the canonical surface when a link requests Training Operations. */
export function requestedTrainingOperations(search: string): TrainingOperationsSurface | undefined {
  return isTrainingOperationsRequested(search) ? TRAINING_OPERATIONS_ROUTE : undefined;
}

/** Writes the canonical query key while preserving unrelated parameters. */
export function writeTrainingOperationsSearch(search: string): string {
  const parameters = new URLSearchParams(search);
  if (!isTrainingOperationsRequested(search)) return search;
  for (const alias of LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES) parameters.delete(alias);
  parameters.set(TRAINING_OPERATIONS_QUERY, TRAINING_OPERATIONS_QUERY_VALUE);
  const normalized = parameters.toString();
  return search.startsWith("?") ? `?${normalized}` : normalized;
}

/** Reads old Foundry links and returns one canonical spelling. */
export function normalizeTrainingOperationsSearch(search: string): string {
  return writeTrainingOperationsSearch(search);
}
