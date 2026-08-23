/**
 * Canonical Game Agent API facade over the preserved TearBot/evaluation
 * implementation.  Durable format IDs, persistence keys, and report hashes
 * intentionally remain owned by their historical modules.
 */
export {
  GAME_AGENT_ACTIONS,
  LEGACY_GAME_AGENT_ACTIONS,
  LEGACY_GAME_AGENT_ACTION_ALIASES,
  GAME_AGENT_QUERY,
  GAME_AGENT_ROUTE,
  LEGACY_GAME_AGENT_QUERY_ALIASES,
  LEGACY_GAME_AGENT_ROUTES,
  normalizeAgentSurfaceSearch,
  resolveAgentSurfaceRoute,
  requestedAgentSurface,
  isAgentSurfaceRequested,
  isCanonicalAgentSurfaceRequested,
} from "./surface-route";

export type {
  TearAgentProfileId as GameAgentProfileId,
  TearAgentObjective as GameAgentObjective,
  TearBladeManeuver as GameAgentBladeManeuver,
  TearAgentUiObservation as GameAgentUiObservation,
  TearAgentObservation as GameAgentObservation,
  TearAgentIntentTrace as GameAgentIntentTrace,
  TearAgentDecision as GameAgentDecision,
  TearAgentModule as GameAgentModule,
  TearAgentActionPort as GameAgentActionPort,
} from "./contracts";
export {
  TearAgentOrchestrator as GameAgentOrchestrator,
  TearScriptedPolicy as GameAgentScriptedPolicy,
  SCRIPTED_POLICY_PROFILES as GAME_AGENT_PROFILES,
} from "./scripted-policy";
export { TearLiveHierarchicalPolicy as GameAgentHierarchicalPolicy } from "./hierarchical-policy-adapter";

export type {
  TearBotLevel as GameAgentLevel,
  TearBotOrthogonalConfiguration as GameAgentOrthogonalConfiguration,
  TearAstutenessVector as GameAgentAstutenessVector,
  TearBoundedRationality as GameAgentBoundedRationality,
  TearScenarioItem as GameAgentScenarioItem,
  TearLadderEvaluation as GameAgentLadderEvaluation,
  TearLadderReport as GameAgentLadderReport,
  TearHumanAnchor as GameAgentHumanAnchor,
} from "./ladder-foundry";
export {
  compileTearBotLevel as compileGameAgentLevel,
  validateHumanInformationFirewall as validateGameAgentInformationFirewall,
  itemResponseProbability as gameAgentItemResponseProbability,
  evaluateTearBotLadder as evaluateGameAgentLadder,
  applyHumanAnchors as applyGameAgentHumanAnchors,
} from "./ladder-foundry";

export type {
  TearBotLadderBoundedRationalityProfileV1 as GameAgentLadderBoundedRationalityProfileV1,
  TearBotLadderPolicyReferenceV1 as GameAgentLadderPolicyReferenceV1,
  TearBotLadderBenchmarkCaseV1 as GameAgentLadderBenchmarkCaseV1,
  TearBotLadderEvaluationPlanV1 as GameAgentLadderEvaluationPlanV1,
  TearBotLadderEpisodeV1 as GameAgentLadderEpisodeV1,
  TearBotLadderExecutedReportV1 as GameAgentLadderExecutedReportV1,
} from "./tearbot-ladder-evaluation";
export {
  createTearBotLadderEvaluationPlan as createGameAgentLadderEvaluationPlan,
  parseTearBotLadderEvaluationPlan as parseGameAgentLadderEvaluationPlan,
  executeTearBotLadderEvaluation as executeGameAgentLadderEvaluation,
} from "./tearbot-ladder-evaluation";

export type {
  TearBotV3CanonicalEvaluationCaseV1 as GameAgentV3CanonicalEvaluationCaseV1,
  TearBotV3CanonicalEvaluationPlanV1 as GameAgentV3CanonicalEvaluationPlanV1,
  TearBotV3CanonicalEvaluationEpisodeV1 as GameAgentV3CanonicalEvaluationEpisodeV1,
  TearBotV3CanonicalEvaluationReportV1 as GameAgentV3CanonicalEvaluationReportV1,
} from "./tearbot-v3-canonical-evaluation";
export {
  createTearBotV3CanonicalEvaluationPlan as createGameAgentV3CanonicalEvaluationPlan,
  parseTearBotV3CanonicalEvaluationPlan as parseGameAgentV3CanonicalEvaluationPlan,
  parseTearBotV3CanonicalEvaluationReport as parseGameAgentV3CanonicalEvaluationReport,
  TearBotV3CanonicalEvidenceVault as GameAgentV3CanonicalEvidenceVault,
  TearBotV3CanonicalEvaluationExecutor as GameAgentV3CanonicalEvaluationExecutor,
} from "./tearbot-v3-canonical-evaluation";

export type {
  TearBotHumanLikenessThresholdsV1 as GameAgentHumanLikenessThresholdsV1,
  TearBotHumanLikenessComparisonReportV1 as GameAgentHumanLikenessComparisonReportV1,
  TearHumanLikenessMetricsV1 as GameAgentHumanLikenessMetricsV1,
} from "./tearbot-human-likeness-comparison";
export {
  createTearBotHumanLikenessThresholds as createGameAgentHumanLikenessThresholds,
  parseTearBotHumanLikenessThresholds as parseGameAgentHumanLikenessThresholds,
  compareTearBotHumanLikeness as compareGameAgentHumanLikeness,
} from "./tearbot-human-likeness-comparison";

export type {
  TearHumanCalibrationConsentAttestationV1 as GameAgentHumanCalibrationConsentAttestationV1,
  TearHumanCalibrationSourceReceiptV1 as GameAgentHumanCalibrationSourceReceiptV1,
  TearHumanCalibrationConsentLedger as GameAgentHumanCalibrationConsentLedger,
} from "./tearbot-human-calibration-source";
export {
  createTearHumanCalibrationConsentAttestation as createGameAgentHumanCalibrationConsentAttestation,
  parseTearHumanCalibrationConsentAttestation as parseGameAgentHumanCalibrationConsentAttestation,
  TearHumanCalibrationSourceStore as GameAgentHumanCalibrationSourceStore,
} from "./tearbot-human-calibration-source";
export type {
  TearHumanCalibrationConsent as GameAgentHumanCalibrationConsent,
  TearHumanCalibrationConsentRecord as GameAgentHumanCalibrationConsentRecord,
} from "./tearbot-human-calibration-consent-ledger";
export { TearHumanCalibrationLocalConsentLedger as GameAgentHumanCalibrationLocalConsentLedger } from "./tearbot-human-calibration-consent-ledger";
export type {
  TearHumanCalibrationPendingAttestationSink as GameAgentHumanCalibrationPendingAttestationSink,
  TearHumanCalibrationPendingAttestationStore as GameAgentHumanCalibrationPendingAttestationStore,
  TearHumanCalibrationCaptureCoordinator as GameAgentHumanCalibrationCaptureCoordinator,
  TearHumanCalibrationCaptureOptions as GameAgentHumanCalibrationCaptureOptions,
} from "./tearbot-human-calibration-capture";
export {
  TearHumanCalibrationLocalPendingAttestationStore as GameAgentHumanCalibrationLocalPendingAttestationStore,
  createTearHumanCalibrationCaptureCoordinator as createGameAgentHumanCalibrationCaptureCoordinator,
} from "./tearbot-human-calibration-capture";
export { TearHumanCalibrationPendingAdmissionController as GameAgentHumanCalibrationPendingAdmissionController } from "./tearbot-human-calibration-admission";
export type { TearHumanCalibrationDistributionV1 as GameAgentHumanCalibrationDistributionV1 } from "./tearbot-human-calibration-distribution";
export { createTearHumanCalibrationDistribution as createGameAgentHumanCalibrationDistribution } from "./tearbot-human-calibration-distribution";
