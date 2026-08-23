/** Canonical application facade for Game Agent evidence/read-only surfaces. */
export { LiveBotEvidenceController as GameAgentEvidenceController } from "./live-bot-evidence-controller";
export type { BotEvidenceLoader as GameAgentEvidenceLoader } from "./live-bot-evidence-controller";
export {
  GAME_AGENT_ACTIONS,
  LEGACY_GAME_AGENT_ACTIONS,
  GAME_AGENT_QUERY,
  GAME_AGENT_ROUTE,
  LEGACY_GAME_AGENT_QUERY_ALIASES,
  LEGACY_GAME_AGENT_ROUTES,
  normalizeAgentSurfaceSearch,
  resolveAgentSurfaceRoute,
  requestedAgentSurface,
  isAgentSurfaceRequested,
  isCanonicalAgentSurfaceRequested,
} from "../agents/surface-route";
