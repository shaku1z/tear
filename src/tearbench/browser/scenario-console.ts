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
  isScenarioConsoleRequested,
  normalizeScenarioConsoleSearch,
} from "./scenario-console-route";

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
