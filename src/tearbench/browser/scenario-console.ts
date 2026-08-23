/**
 * Canonical Scenario Console facade.
 *
 * State Forge remains the implementation and serialized compatibility layer.
 * This module gives new callers explicit terminology without moving or
 * rewriting TearBench codecs, scenario IDs, checkpoint archives, or evidence.
 */
export {
  SCENARIO_CONSOLE_QUERY,
  LEGACY_SCENARIO_CONSOLE_QUERY,
  SCENARIO_CONSOLE_QUERY_VALUE,
  SCENARIO_CONSOLE_QUERY_ALIASES,
  isScenarioConsoleRequested,
  normalizeScenarioConsoleSearch,
} from "./scenario-console-route";

export {
  SCENARIO_CONSOLE_DOM_SELECTORS,
  LEGACY_STATE_FORGE_DOM_SELECTORS,
  SCENARIO_CONSOLE_DOM_SELECTOR_ALIASES,
} from "./scenario-console-selectors";

export {
  installStateForgeStudio as installScenarioConsole,
  type StateForgeCheckpointItem as ScenarioConsoleCheckpointItem,
  type StateForgeForkRequest as ScenarioConsoleForkRequest,
  type StateForgeStudioHost as ScenarioConsoleHost,
} from "./state-forge-studio";

export {
  createLiveStateForgeStudioHost as createLiveScenarioConsoleHost,
  installLiveStateForgeStudio as installLiveScenarioConsole,
} from "./live-state-forge-studio-host";

export {
  createStateForgeForkSource as createScenarioConsoleForkSource,
  diffStateForgeValues as diffScenarioConsoleValues,
  evaluateStateForgeSource as evaluateScenarioConsoleSource,
  type StateForgeEvaluation as ScenarioConsoleEvaluation,
  type StateForgeReport as ScenarioConsoleReport,
  type StateForgeValidationReports as ScenarioConsoleValidationReports,
  type StateForgeValueDiff as ScenarioConsoleValueDiff,
} from "../state-forge-studio-model";

export {
  parseTearSdl as parseScenarioConsoleSource,
  flattenTearSdl as flattenScenarioConsoleSource,
  resolveTearSdl as resolveScenarioConsoleSource,
  TearCheckpointBank as ScenarioConsoleCheckpointBank,
  type TearCheckpointArchiveV1 as ScenarioConsoleCheckpointArchive,
  type TearCheckpointEntry as ScenarioConsoleCheckpointEntry,
  type TearSdlDocumentV1 as ScenarioConsoleSourceDocument,
  type TearSdlResolved as ScenarioConsoleResolvedSource,
} from "../tearsdl";

export type { TearSnapshotV1 as ScenarioConsoleSnapshot } from "../contracts";

export {
  TearStateTimeline as ScenarioConsoleStateTimeline,
  migrateTimelineArchive as migrateScenarioConsoleTimeline,
  type TearTimelineArchiveV2 as ScenarioConsoleTimelineArchive,
} from "../state-forge-timeline";

export {
  selectDiffAwareEvidence as selectScenarioConsoleEvidence,
  type EvidenceRoute as ScenarioConsoleEvidenceRoute,
  type EvidenceSelection as ScenarioConsoleEvidenceSelection,
} from "../release-certification";

export {
  GhostCapsuleReader as ScenarioConsoleCapsuleReader,
  type GhostReadCapsule as ScenarioConsoleReadCapsule,
} from "../../ghost/capsule-reader";

export {
  mapGhostCapsuleToReplayEnvelope as mapScenarioConsoleCapsuleToReplayEnvelope,
  type GhostCapsuleReplayMapping as ScenarioConsoleReplayMapping,
} from "../../ghost/capsule-replay-envelope";
