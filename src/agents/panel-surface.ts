/**
 * Browser-only DOM/global configuration for the disposable agent panel.
 *
 * Keep this separate from the canonical route module: normal production
 * callers need route/action vocabulary, but must not pull test-only panel
 * selectors, globals, or legacy Watch Agent copy into their bundles.
 */
export interface AgentPanelSurface {
  readonly query: string;
  readonly rootId: string;
  readonly globalId: "__TEAR_GAME_AGENT__" | "__TEAR_RUN_MONITOR__" | "__TEAR_WATCH_AGENT__";
  readonly displayName: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly selectionLabel: string;
  readonly startLabel: string;
  readonly seedErrorLabel: string;
}

export const LEGACY_WATCH_AGENT_PANEL: AgentPanelSurface = Object.freeze({
  query: "watchagent",
  rootId: "tear-watch-agent",
  globalId: "__TEAR_WATCH_AGENT__",
  displayName: "Watch Agent",
  title: "TEARBOT · WATCH AGENT",
  ariaLabel: "Watch Agent",
  selectionLabel: "Watch Agent selection",
  startLabel: "Start Watch Agent",
  seedErrorLabel: "Watch Agent seed must be positive",
});

export const RUN_MONITOR_PANEL: AgentPanelSurface = Object.freeze({
  query: "run-monitor",
  rootId: "tear-run-monitor",
  globalId: "__TEAR_RUN_MONITOR__",
  displayName: "Run Monitor",
  title: "GAME AGENT · RUN MONITOR",
  ariaLabel: "Run Monitor",
  selectionLabel: "Run Monitor selection",
  startLabel: "Start Run Monitor",
  seedErrorLabel: "Run Monitor seed must be positive",
});
