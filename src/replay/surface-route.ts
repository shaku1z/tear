/**
 * Route and action names for the replay editor. The `replay.studio.*` actions
 * are the older spellings of the same two actions and stay readable.
 */
export const REPLAY_EDITOR_ROUTE = "replay-editor" as const;
export const LEGACY_REPLAY_EDITOR_ROUTE = "replay.studio" as const;

export { LEGACY_REPLAY_EDITOR_ACTIONS, REPLAY_EDITOR_ACTIONS } from "../domain/replay-editor-actions";
