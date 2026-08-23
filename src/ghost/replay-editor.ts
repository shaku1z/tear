/**
 * Canonical Replay Editor API over the preserved replay/EDL implementation.
 *
 * `ghost-studio-edl` v1 remains the wire format.  These exports only provide
 * permanent names for new callers; source IDs, root hashes, clip hashes, and
 * local export behavior are deliberately unchanged.
 */
export {
  createStudioEdl as createReplayEditorEdl,
  renderStudioMediaLocally as renderReplayEditorMediaLocally,
} from "./player-experiences";
export type {
  GhostStudioAspectRatio as ReplayEditorAspectRatio,
  GhostStudioCamera as ReplayEditorCamera,
  GhostStudioClip as ReplayEditorClip,
  GhostStudioEditDecisionList as ReplayEditorEditDecisionList,
  GhostStudioMediaExport as ReplayEditorMediaExport,
  GhostStudioRenderer as ReplayEditorRenderer,
} from "./player-experiences";

export {
  createGhostStudioCutListFromTheater as createReplayEditorCutListFromTheater,
} from "./studio-cut-list-theater";
export type {
  GhostStudioCutListTheaterProjection as ReplayEditorCutListTheaterProjection,
} from "./studio-cut-list-theater";

export const REPLAY_EDITOR_EDL_FORMAT = "ghost-studio-edl" as const;
export const REPLAY_EDITOR_EDL_SCHEMA_VERSION = 1 as const;
