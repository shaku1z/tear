/** Browser deep-link facade for the canonical Replay Hub surface. */
import { isReplaySurfaceRequested } from "../../replay/surface-route";

export {
  REPLAY_HUB_QUERY,
  LEGACY_REPLAY_HUB_QUERY,
  REPLAY_QUERY_VALUE,
  isReplaySurfaceRequested,
  normalizeReplaySurfaceSearch,
  requestedReplaySurface,
  writeReplaySurfaceSearch,
} from "../../replay/surface-route";

export function isReplayHubRequested(search: string): boolean {
  return isReplaySurfaceRequested(search, "replay-hub");
}
