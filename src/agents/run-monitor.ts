/** Canonical Run Monitor facade over the historical Watch Agent host. */
import type { LiveTearRuntimeEnvironmentContext } from "../tearbench/live-runtime-contracts";
import type { TearActivePolicyRuntime } from "./policy-runtime";
import type { TearPolicyDecisionJournal } from "./policy-decision-journal";
import type { TearC32CanonicalActivePolicyRuntime } from "./c32-canonical-active-policy-runtime";
import type { TearFoundryV3PostPromotionMonitor } from "./foundry-job-v3-post-promotion-monitor";
import {
  createLiveWatchAgentHost,
  installLiveWatchAgentHost,
  type TearWatchAgentApi,
} from "./live-watch-agent-host";
import { RUN_MONITOR_PANEL } from "./panel-surface";

export {
  RUN_MONITOR_ACTIONS,
  LEGACY_RUN_MONITOR_ACTIONS,
  LEGACY_RUN_MONITOR_ACTION_ALIASES,
  RUN_MONITOR_POLICY_JOURNAL_PREFIX,
  RUN_MONITOR_QUERY,
  RUN_MONITOR_ROUTE,
  LEGACY_RUN_MONITOR_QUERY_ALIASES,
  LEGACY_RUN_MONITOR_ROUTES,
  normalizeAgentSurfaceSearch,
  resolveAgentSurfaceRoute,
  requestedAgentSurface,
  isAgentSurfaceRequested,
  isCanonicalAgentSurfaceRequested,
} from "./surface-route";
export { RUN_MONITOR_PANEL } from "./panel-surface";

export type {
  TearWatchAgentApi as RunMonitorApi,
  TearWatchAgentOptions as RunMonitorOptions,
  TearWatchAgentSelection as RunMonitorSelection,
  TearWatchAgentSnapshot as RunMonitorSnapshot,
  TearWatchAgentStatus as RunMonitorStatus,
  TearWatchdogSnapshot as RunMonitorWatchdogSnapshot,
} from "./live-watch-agent-host";

/** Exact implementation identity is retained; only the public module name changes. */
export const createRunMonitor = createLiveWatchAgentHost;

export function installRunMonitor(
  context: LiveTearRuntimeEnvironmentContext,
  target: Window & { __TEAR_RUN_MONITOR__?: TearWatchAgentApi; __TEAR_WATCH_AGENT__?: TearWatchAgentApi },
  artifactRuntime?: TearActivePolicyRuntime,
  decisionJournal?: TearPolicyDecisionJournal,
  canonicalRuntime?: TearC32CanonicalActivePolicyRuntime,
  postPromotionMonitor?: TearFoundryV3PostPromotionMonitor,
): void {
  installLiveWatchAgentHost(context, target, artifactRuntime, decisionJournal, canonicalRuntime, postPromotionMonitor, RUN_MONITOR_PANEL);
}
