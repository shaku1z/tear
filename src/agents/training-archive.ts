/**
 * Canonical Training Archive facade over the existing Academy custody and
 * consent implementation.
 *
 * These are identity aliases, not a serialization migration.  The Academy
 * module names, durable keys, record discriminators, intake format, and hash
 * inputs remain the compatibility boundary until the registry expiry gate is
 * explicitly signed.
 */
export {
  CANONICAL_ACADEMY_LESSONS as CANONICAL_TRAINING_ARCHIVE_LESSONS,
  TearDemonstrationCorpus as TrainingArchiveDemonstrationCorpus,
  reviewDemonstration as reviewTrainingArchiveDemonstration,
  encodeBehaviorCloningManifest as encodeTrainingArchiveManifest,
  decodeBehaviorCloningManifest as decodeTrainingArchiveManifest,
  trainBehaviorClonedPolicy as trainTrainingArchivePolicy,
} from "./academy";
export type {
  TearLessonDomain as TrainingArchiveLessonDomain,
  TearAcademyLesson as TrainingArchiveLesson,
  TearAcademyConsent as TrainingArchiveConsent,
  TearDemonstrationSegmentKind as TrainingArchiveSegmentKind,
  TearAcademySample as TrainingArchiveSample,
  TearDemonstrationReview as TrainingArchiveReview,
  TearDatasetSplit as TrainingArchiveDatasetSplit,
  TearDatasetEntry as TrainingArchiveDatasetEntry,
  TearBehaviorCloningManifest as TrainingArchiveBehaviorCloningManifest,
  TearObservationFeature as TrainingArchiveObservationFeature,
  TearBehaviorClonedPolicy as TrainingArchivePolicy,
} from "./academy";

export {
  assessAcademyCandidateEligibility as assessTrainingArchiveCandidateEligibility,
} from "./academy-candidate-admission";
export type {
  TearConsentDisposition as TrainingArchiveConsentDisposition,
  TearAcademyModelTrainingConsent as TrainingArchiveModelTrainingConsent,
  TearAcademyConsentRecordV1 as TrainingArchiveConsentRecordV1,
  TearAcademyPrivacyRecordV1 as TrainingArchivePrivacyRecordV1,
  TearAcademySynchronizedTrackDeclarationV1 as TrainingArchiveSynchronizedTrackDeclarationV1,
  TearAcademyCandidateDeclarationV1 as TrainingArchiveCandidateDeclarationV1,
  TearAcademyCandidateRejection as TrainingArchiveCandidateRejection,
  TearAcademyCandidateAdmissionReceiptV1 as TrainingArchiveCandidateAdmissionReceiptV1,
} from "./academy-candidate-admission";
export {
  academyCandidateHash as trainingArchiveCandidateHash,
  captureAcademyCandidateTracks as captureTrainingArchiveCandidateTracks,
} from "./academy-candidate-tracks";
export type { TearAcademyCandidateTrackBundleV1 as TrainingArchiveCandidateTrackBundleV1 } from "./academy-candidate-tracks";
export {
  materializeAcademyCandidateCapsule as materializeTrainingArchiveCandidateCapsule,
} from "./academy-candidate-capsule-materializer";
export type {
  TearAcademyCandidateCapsuleMaterializationRequest as TrainingArchiveCandidateCapsuleMaterializationRequest,
  TearAcademyCandidateCapsuleMaterializationReceiptV1 as TrainingArchiveCandidateCapsuleMaterializationReceiptV1,
} from "./academy-candidate-capsule-materializer";
export {
  TearAcademyCandidateCustodyStore as TrainingArchiveCandidateCustodyStore,
} from "./academy-candidate-custody";
export type {
  TearAcademyCandidateCustodyStatus as TrainingArchiveCandidateCustodyStatus,
  TearAcademyCandidateRevocationScope as TrainingArchiveCandidateRevocationScope,
  TearAcademyCandidateRetentionPolicyV1 as TrainingArchiveCandidateRetentionPolicyV1,
  TearAcademyCandidatePrivacyRetentionPolicyV1 as TrainingArchiveCandidatePrivacyRetentionPolicyV1,
  TearAcademyCandidateCustodyEventV1 as TrainingArchiveCandidateCustodyEventV1,
  TearAcademyCandidateCustodyRecordV1 as TrainingArchiveCandidateCustodyRecordV1,
  TearAcademyCandidateCustodyAcceptance as TrainingArchiveCandidateCustodyAcceptance,
  TearAcademyCandidateCustodyRevocation as TrainingArchiveCandidateCustodyRevocation,
  TearAcademyCandidateCustodyDeletion as TrainingArchiveCandidateCustodyDeletion,
  TearAcademyCandidateCustodyInventoryV1 as TrainingArchiveCandidateCustodyInventoryV1,
} from "./academy-candidate-custody";
export {
  TearAcademyCandidateQualityStore as TrainingArchiveCandidateQualityStore,
} from "./academy-candidate-quality";
export type {
  TearAcademyCandidateQualityDisposition as TrainingArchiveCandidateQualityDisposition,
  TearAcademyCandidateOutlierReason as TrainingArchiveCandidateOutlierReason,
  TearAcademyCandidateSourceMetadataV1 as TrainingArchiveCandidateSourceMetadataV1,
  TearAcademyCandidateQualityScoreV1 as TrainingArchiveCandidateQualityScoreV1,
  TearAcademyCandidateQualityAssessmentV1 as TrainingArchiveCandidateQualityAssessmentV1,
  TearAcademyCandidateQualityAssessmentRequest as TrainingArchiveCandidateQualityAssessmentRequest,
  TearAcademyCandidateQualityInventoryV1 as TrainingArchiveCandidateQualityInventoryV1,
} from "./academy-candidate-quality";
export {
  TearAcademyCandidateCurationStore as TrainingArchiveCandidateCurationStore,
} from "./academy-candidate-curation";
export type {
  TearAcademyCandidateCurationDisposition as TrainingArchiveCandidateCurationDisposition,
  TearAcademyCandidateCorrectionKind as TrainingArchiveCandidateCorrectionKind,
  TearAcademyCandidateCurationDecisionV1 as TrainingArchiveCandidateCurationDecisionV1,
  TearAcademyCandidateCurationRequest as TrainingArchiveCandidateCurationRequest,
  TearAcademyCandidateCurationInventoryV1 as TrainingArchiveCandidateCurationInventoryV1,
} from "./academy-candidate-curation";
export {
  TearAcademyCandidateSplitStore as TrainingArchiveCandidateSplitStore,
} from "./academy-candidate-splits";
export type {
  TearAcademyDatasetSplitV1 as TrainingArchiveDatasetSplitV1,
  TearAcademyManifestReader as TrainingArchiveManifestReader,
  TearAcademyCandidateSplitAssignmentV1 as TrainingArchiveCandidateSplitAssignmentV1,
  TearAcademyCandidateSplitRequest as TrainingArchiveCandidateSplitRequest,
  TearAcademyPreCorpusManifestV1 as TrainingArchivePreCorpusManifestV1,
  TearAcademyPreCorpusManifestPublishRequest as TrainingArchivePreCorpusManifestPublishRequest,
} from "./academy-candidate-splits";
export {
  TearAcademyReviewedSampleStore as TrainingArchiveReviewedSampleStore,
} from "./academy-reviewed-sample";
export type { TearAcademyReviewedSampleV1 as TrainingArchiveReviewedSampleV1 } from "./academy-reviewed-sample";
export {
  TearAcademyCorpusStore as TrainingArchiveCorpusStore,
} from "./academy-corpus";
export type {
  TearAcademyCorpusEntryV1 as TrainingArchiveCorpusEntryV1,
  TearAcademyCorpusAdmissionRequest as TrainingArchiveCorpusAdmissionRequest,
  TearAcademyCorpusManifestV1 as TrainingArchiveCorpusManifestV1,
  TearAcademyCorpusManifestPublishRequest as TrainingArchiveCorpusManifestPublishRequest,
} from "./academy-corpus";
export {
  TearAcademyTrainingDatasetLoader as TrainingArchiveTrainingDatasetLoader,
} from "./academy-training-dataset";
export type {
  TearAcademyTrainingDatasetRequestV1 as TrainingArchiveTrainingDatasetRequestV1,
  TearAcademyTrainingSequenceV1 as TrainingArchiveTrainingSequenceV1,
  TearAcademyTrainingDatasetV1 as TrainingArchiveTrainingDatasetV1,
  TearAcademyTrainingDatasetLimits as TrainingArchiveTrainingDatasetLimits,
} from "./academy-training-dataset";
export {
  TearAcademyInspectionController as TrainingArchiveInspectionController,
} from "./academy-inspection-controller";
export type { TearAcademyInspectionState as TrainingArchiveInspectionState } from "./academy-inspection-controller";
export { inspectAcademy as inspectTrainingArchive, inspectAcademy as inspectTrainingArchiveSnapshot } from "./academy-inspector";
export type {
  TearAcademyInspectionSnapshotV1 as TrainingArchiveInspectionSnapshotV1,
  TearAcademyInspectionStores as TrainingArchiveInspectionStores,
} from "./academy-inspector";
export { TearAcademyCustodyActionRuntime as TrainingArchiveCustodyActionRuntime } from "./academy-custody-actions";

/** Canonical normal-build route/query vocabulary for Training Archive. */
export type TrainingArchiveSurface = "training-archive";
export const TRAINING_ARCHIVE_ROUTE = "training-archive" as const;
export const TRAINING_ARCHIVE_SCREEN = "academy" as const;
export const LEGACY_TRAINING_ARCHIVE_ROUTES = Object.freeze(["academy", "agent-academy"] as const);
export const TRAINING_ARCHIVE_QUERY = TRAINING_ARCHIVE_ROUTE;
export const LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES = Object.freeze(["academy", "agent-academy"] as const);
export const TRAINING_ARCHIVE_QUERY_VALUE = "1" as const;

/** Canonical semantic actions; legacy Academy action IDs remain readable. */
export const TRAINING_ARCHIVE_ACTIONS = Object.freeze({
  open: "training-archive.open",
  retry: "training-archive.retry",
  daggerAdvance: "training-archive.dagger.advance",
  daggerReview: "training-archive.dagger.review",
  withdrawModelTraining: "training-archive.record.withdrawModelTraining",
  humanCalibrationOptIn: "training-archive.humanCalibration.optIn",
  humanCalibrationRevoke: "training-archive.humanCalibration.revoke",
} as const);
export const LEGACY_TRAINING_ARCHIVE_ACTIONS = Object.freeze({
  retry: "academy.retry",
  daggerAdvance: "academy.dagger.advance",
  daggerReview: "academy.dagger.review",
  withdrawModelTraining: "academy.record.withdrawModelTraining",
  humanCalibrationOptIn: "academy.humanCalibration.optIn",
  humanCalibrationRevoke: "academy.humanCalibration.revoke",
} as const);

/** Resolves canonical and preserved Academy route tokens. */
export function resolveTrainingArchiveRoute(route: string): TrainingArchiveSurface | undefined {
  if (route === TRAINING_ARCHIVE_ROUTE || route === TRAINING_ARCHIVE_SCREEN
    || LEGACY_TRAINING_ARCHIVE_ROUTES.includes(route as never)) return TRAINING_ARCHIVE_ROUTE;
  return undefined;
}

function enabledFlag(parameters: URLSearchParams, key: string): boolean {
  if (!parameters.has(key)) return false;
  const value = parameters.get(key);
  return value === "" || value === TRAINING_ARCHIVE_QUERY_VALUE;
}

/** Returns true for a canonical or enabled legacy Training Archive link. */
export function isTrainingArchiveRequested(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return [TRAINING_ARCHIVE_QUERY, ...LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES]
    .some((key) => enabledFlag(parameters, key));
}

/** Returns the canonical surface when a link requests Training Archive. */
export function requestedTrainingArchive(search: string): TrainingArchiveSurface | undefined {
  return isTrainingArchiveRequested(search) ? TRAINING_ARCHIVE_ROUTE : undefined;
}

/** Writes the canonical query key while preserving unrelated parameters. */
export function writeTrainingArchiveSearch(search: string): string {
  const parameters = new URLSearchParams(search);
  if (!isTrainingArchiveRequested(search)) return search;
  for (const alias of LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES) parameters.delete(alias);
  parameters.set(TRAINING_ARCHIVE_QUERY, TRAINING_ARCHIVE_QUERY_VALUE);
  const normalized = parameters.toString();
  return search.startsWith("?") ? `?${normalized}` : normalized;
}

/** Reads old Academy links and returns one canonical spelling. */
export function normalizeTrainingArchiveSearch(search: string): string {
  return writeTrainingArchiveSearch(search);
}
