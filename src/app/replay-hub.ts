/** Canonical application facade for the replay inspection/navigation surface. */
export {
  LiveGhostLabHomeController as ReplayHubController,
  createLiveGhostLabHome as createLiveReplayHub,
  createLiveGhostLabHome,
} from "./live-ghost-lab-home";
export type { GhostLabScreenView as ReplayHubScreenView } from "../presentation/screens/contracts";
export {
  REPLAY_HUB_ACTIONS,
  LEGACY_REPLAY_HUB_ACTIONS,
  REPLAY_HUB_ROUTE,
  LEGACY_REPLAY_HUB_ROUTE,
  REPLAY_HUB_SCREEN,
} from "../replay/surface-route";
