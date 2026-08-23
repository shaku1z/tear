/** Canonical application facade for the normal-build Training Archive. */
export { createLiveAcademyScreen as createLiveTrainingArchiveScreen } from "./live-academy-screen";
export type { AcademyScreenView as TrainingArchiveScreenView } from "../presentation/screens/contracts";
export {
  TRAINING_ARCHIVE_ACTIONS,
  LEGACY_TRAINING_ARCHIVE_ACTIONS,
  TRAINING_ARCHIVE_QUERY,
  TRAINING_ARCHIVE_ROUTE,
  TRAINING_ARCHIVE_SCREEN,
  LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES,
  LEGACY_TRAINING_ARCHIVE_ROUTES,
  isTrainingArchiveRequested,
  normalizeTrainingArchiveSearch,
  requestedTrainingArchive,
  resolveTrainingArchiveRoute,
  writeTrainingArchiveSearch,
} from "../agents/training-archive";
