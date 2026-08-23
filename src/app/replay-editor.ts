/** Canonical application facade for the replay editing surface. */
export {
  createLiveReplayScreenAdapter as createLiveReplayEditor,
  type ReplayScreenAdapter as ReplayEditorAdapter,
  type ReplayScreenServices as ReplayEditorServices,
  type ReplayStatus as ReplayEditorStatus,
} from "./live-replay-screen-adapter";
export {
  REPLAY_EDITOR_ACTIONS,
  LEGACY_REPLAY_EDITOR_ACTIONS,
  REPLAY_EDITOR_ROUTE,
  LEGACY_REPLAY_EDITOR_ROUTE,
} from "../replay/surface-route";
