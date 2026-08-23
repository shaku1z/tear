/** Canonical application facade for the normal-build Run Monitor controller. */
export {
  LivePlayerWatchController as RunMonitorController,
  type PlayerWatchPort as RunMonitorPort,
  type PlayerWatchRuntimeLoader as RunMonitorRuntimeLoader,
  type PlayerWatchStatus as RunMonitorStatus,
  type PlayerWatchView as RunMonitorView,
} from "./live-player-watch-controller";
export {
  RUN_MONITOR_ACTIONS,
  LEGACY_RUN_MONITOR_ACTIONS,
  RUN_MONITOR_QUERY,
  RUN_MONITOR_ROUTE,
  LEGACY_RUN_MONITOR_QUERY_ALIASES,
  LEGACY_RUN_MONITOR_ROUTES,
  normalizeAgentSurfaceSearch,
  resolveAgentSurfaceRoute,
  requestedAgentSurface,
  isAgentSurfaceRequested,
  isCanonicalAgentSurfaceRequested,
} from "../agents/surface-route";
