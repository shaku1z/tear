/**
 * Canonical navigation vocabulary for the Game Agent and Run Monitor
 * surfaces.
 *
 * The implementation and durable evidence still use their historical
 * TearBot/Watch Agent names.  This boundary is deliberately small: new
 * callers write the explicit names, while old screen IDs, query flags, and
 * action tokens remain readable until their recorded expiry checkpoints.
 */
export type AgentSurface = "game-agent" | "run-monitor";

export const GAME_AGENT_ROUTE = "game-agent" as const;
export const RUN_MONITOR_ROUTE = "run-monitor" as const;
export const LEGACY_GAME_AGENT_ROUTES = Object.freeze(["botevidence", "tearbot"] as const);
export const LEGACY_RUN_MONITOR_ROUTES = Object.freeze(["watch", "watchagent"] as const);

export const GAME_AGENT_QUERY = GAME_AGENT_ROUTE;
export const RUN_MONITOR_QUERY = RUN_MONITOR_ROUTE;
export const LEGACY_GAME_AGENT_QUERY_ALIASES = Object.freeze(["botevidence", "tearbot"] as const);
export const LEGACY_RUN_MONITOR_QUERY_ALIASES = Object.freeze(["watchagent"] as const);
export const AGENT_QUERY_VALUE = "1" as const;

export const GAME_AGENT_ACTIONS = Object.freeze({
  open: "game-agent.open",
} as const);
export const LEGACY_GAME_AGENT_ACTIONS = Object.freeze({
  open: "ghostlab.open",
} as const);
/** Historical action types that can open the Game Agent evidence destination. */
export const LEGACY_GAME_AGENT_ACTION_ALIASES = Object.freeze([
  "replay.hub.open",
  "ghostlab.open",
] as const);
export const RUN_MONITOR_ACTIONS = Object.freeze({
  open: "run-monitor.open",
  control: "run-monitor.control",
} as const);
export const LEGACY_RUN_MONITOR_ACTIONS = Object.freeze({
  open: "ghostlab.open",
  control: "ghostlab.watch",
} as const);
/** Historical action types that open or control the Run Monitor destination. */
export const LEGACY_RUN_MONITOR_ACTION_ALIASES = Object.freeze([
  "replay.hub.open",
  "replay.hub.watch",
  "ghostlab.open",
  "ghostlab.watch",
] as const);

export const RUN_MONITOR_POLICY_JOURNAL_PREFIX = "watch-policy:v1:" as const;

function enabledFlag(parameters: URLSearchParams, key: string): boolean {
  if (!parameters.has(key)) return false;
  const value = parameters.get(key);
  return value === "" || value === AGENT_QUERY_VALUE;
}

function aliases(surface: AgentSurface): readonly string[] {
  return surface === "game-agent"
    ? [GAME_AGENT_QUERY, ...LEGACY_GAME_AGENT_QUERY_ALIASES]
    : [RUN_MONITOR_QUERY, ...LEGACY_RUN_MONITOR_QUERY_ALIASES];
}

/** Resolves canonical routes and preserved screen/query aliases. */
export function resolveAgentSurfaceRoute(route: string): AgentSurface | undefined {
  if (route === GAME_AGENT_ROUTE || LEGACY_GAME_AGENT_ROUTES.includes(route as never)) return "game-agent";
  if (route === RUN_MONITOR_ROUTE || LEGACY_RUN_MONITOR_ROUTES.includes(route as never)) return "run-monitor";
  return undefined;
}

/** Returns true for either the canonical query or an enabled legacy alias. */
export function isAgentSurfaceRequested(search: string, surface: AgentSurface): boolean {
  const parameters = new URLSearchParams(search);
  return aliases(surface).some((key) => enabledFlag(parameters, key));
}

/** Canonical query detection used to choose the canonical browser installer. */
export function isCanonicalAgentSurfaceRequested(search: string, surface: AgentSurface): boolean {
  return enabledFlag(new URLSearchParams(search), surface === "game-agent" ? GAME_AGENT_QUERY : RUN_MONITOR_QUERY);
}

/** Returns the one requested surface, or undefined for no/ambiguous input. */
export function requestedAgentSurface(search: string): AgentSurface | undefined {
  const gameAgent = isAgentSurfaceRequested(search, "game-agent");
  const runMonitor = isAgentSurfaceRequested(search, "run-monitor");
  return gameAgent === runMonitor ? undefined : gameAgent ? "game-agent" : "run-monitor";
}

/** Writes a canonical query while retaining unrelated query parameters. */
export function writeAgentSurfaceSearch(search: string, surface: AgentSurface): string {
  const parameters = new URLSearchParams(search);
  const allAliases = [...LEGACY_GAME_AGENT_QUERY_ALIASES, ...LEGACY_RUN_MONITOR_QUERY_ALIASES];
  for (const alias of allAliases) if (enabledFlag(parameters, alias)) parameters.delete(alias);
  parameters.delete(surface === "game-agent" ? RUN_MONITOR_QUERY : GAME_AGENT_QUERY);
  parameters.set(surface === "game-agent" ? GAME_AGENT_QUERY : RUN_MONITOR_QUERY, AGENT_QUERY_VALUE);
  const normalized = parameters.toString();
  return search.startsWith("?") ? `?${normalized}` : normalized;
}

/** Reads legacy deep links and returns their canonical spelling. */
export function normalizeAgentSurfaceSearch(search: string): string {
  const requested = requestedAgentSurface(search);
  return requested === undefined ? search : writeAgentSurfaceSearch(search, requested);
}
