// Action IDs for buttons on the engineering-only screens. They live here rather than in
// src/agents so that the screens drawing those buttons do not pull agent modules into
// release bundles. src/agents re-exports them under the same names.

/** Training Archive (the Academy screen); legacy Academy IDs stay in src/agents/training-archive. */
export const TRAINING_ARCHIVE_ACTIONS = Object.freeze({
  open: "training-archive.open",
  retry: "training-archive.retry",
  daggerAdvance: "training-archive.dagger.advance",
  daggerReview: "training-archive.dagger.review",
  withdrawModelTraining: "training-archive.record.withdrawModelTraining",
  humanCalibrationOptIn: "training-archive.humanCalibration.optIn",
  humanCalibrationRevoke: "training-archive.humanCalibration.revoke",
} as const);

/** Training Operations (the Foundry screen); legacy Foundry IDs stay in src/agents/training-operations. */
export const TRAINING_OPERATIONS_ACTIONS = Object.freeze({
  open: "training-operations.open",
  refresh: "training-operations.refresh",
  bootstrap: "training-operations.bootstrap",
  scheduleEnable: "training-operations.schedule.enable",
  scheduleDisable: "training-operations.schedule.disable",
  promote: "training-operations.promote",
  restoreBaseline: "training-operations.restoreBaseline",
} as const);

/** Run Monitor (the Ghost Lab screen); legacy IDs stay in src/agents/surface-route. */
export const RUN_MONITOR_ACTIONS = Object.freeze({
  open: "run-monitor.open",
  control: "run-monitor.control",
} as const);
