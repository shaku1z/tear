/** Canonical application facade for the normal-build Training Operations surface. */
export { createLiveFoundryScreen as createLiveTrainingOperationsScreen } from "./live-foundry-screen";
export type { FoundryScreenView as TrainingOperationsScreenView } from "../presentation/screens/contracts";
export {
  TRAINING_OPERATIONS_ACTIONS,
  LEGACY_TRAINING_OPERATIONS_ACTIONS,
  TRAINING_OPERATIONS_QUERY,
  TRAINING_OPERATIONS_ROUTE,
  TRAINING_OPERATIONS_SCREEN,
  TRAINING_OPERATIONS_QUERY_VALUE,
  LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES,
  LEGACY_TRAINING_OPERATIONS_ROUTES,
  isTrainingOperationsRequested,
  normalizeTrainingOperationsSearch,
  requestedTrainingOperations,
  resolveTrainingOperationsRoute,
  writeTrainingOperationsSearch,
} from "../agents/training-operations";
