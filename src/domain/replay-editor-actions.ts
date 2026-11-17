/**
 * Action names of the replay editor. The `replay.studio.*` actions are the older spellings of
 * the same two actions and stay readable.
 */
export const REPLAY_EDITOR_ACTIONS = Object.freeze({
  toggle: "replay.editor.toggle",
  createCutList: "replay.editor.createCutList",
} as const);
export const LEGACY_REPLAY_EDITOR_ACTIONS = Object.freeze({
  toggle: "replay.studio.toggle",
  createCutList: "replay.studio.createCutList",
} as const);
