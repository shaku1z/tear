import type { ProfileScreenView, ReplayView, ScreenAction } from "./contracts";

/**
 * The REPLAYS list as both profile layouts draw it (desktop rows in profile-achievements.ts, phone rows in
 * compact-profile.ts): its empty states, its import button and each row's actions. One description, so
 * the two layouts can never offer different actions.
 */

/** The desktop REPLAYS toolbar (filters and import) height; the snapshot's scroll bounds use the same value. */
export const REPLAY_TOOLBAR_HEIGHT = 52;

/** What the list says while the replays on this device are still being read. */
export const REPLAY_LIST_OPENING = "Opening your replays…";

/**
 * The list's state as the profile screen needs it. Until the replays have been read the list is not known
 * to be empty, so "opening" and "failed" must not be drawn as "none yet".
 */
export function replayListState(
  status: "idle" | "loading" | "ready" | "unavailable",
): NonNullable<ProfileScreenView["replayList"]> | undefined {
  if (status === "idle" || status === "loading") return "opening";
  return status === "ready" ? undefined : "failed";
}

export interface ProfileListEmptyState {
  readonly glyph: string;
  readonly line: string;
  readonly detail: string;
  /** Offer PLAY A RUN: only when the player simply has no runs yet. */
  readonly play: boolean;
}

/** The one description of an empty REPLAYS list. */
export function profileListEmptyState(
  view: Pick<ProfileScreenView, "message" | "emptyMessage" | "replayList" | "replayFilters">,
): ProfileListEmptyState {
  if (view.replayList === "opening") return { glyph: "▶", line: REPLAY_LIST_OPENING, detail: "", play: false };
  if (view.replayList === "failed")
    return { glyph: "▶", line: "Replays could not be opened", detail: view.message ?? "", play: false };
  const filter = view.replayFilters?.find((choice) => choice.selected === true);
  if (filter !== undefined && filter.id !== "all")
    return {
      glyph: "▶",
      line: filter.id === "pinned" ? "No pinned replays" : "No bests yet",
      detail: filter.id === "pinned" ? "PIN a replay to keep it here." : "Your best run of each mode lands here.",
      play: false,
    };
  return {
    glyph: "▶",
    line: "No runs recorded yet",
    detail: view.emptyMessage ?? "Every real run lands here automatically.",
    play: true,
  };
}

export type ReplayRowActionId = "watch" | "pin" | "share" | "download" | "delete";

export interface ReplayRowAction {
  readonly id: ReplayRowActionId;
  readonly label: string;
  readonly action: ScreenAction;
  readonly enabled?: boolean;
  readonly selected?: boolean;
}

/** A REPLAYS row's actions, in order: WATCH, PIN, SHARE, DOWNLOAD (when the run has a file), DELETE. */
export function replayRowActions(replay: ReplayView): readonly ReplayRowAction[] {
  const actions: ReplayRowAction[] = [
    {
      id: "watch",
      label: replay.available === false ? "CAN'T PLAY" : "▶  WATCH",
      enabled: replay.available !== false,
      action: { type: "profile.watchReplay", id: replay.id },
    },
    {
      id: "pin",
      label: replay.pinned === true ? "★ PINNED" : "PIN",
      selected: replay.pinned === true,
      action: { type: "profile.pinReplay", id: replay.id, pinned: replay.pinned !== true },
    },
    {
      id: "share",
      label: replay.shared === true ? "SHARED" : "SHARE",
      selected: replay.shared === true,
      enabled: replay.shared !== true && replay.canShare === true,
      action: { type: "profile.publishReplay", id: replay.id },
    },
  ];
  if (replay.canDownload === true)
    actions.push({ id: "download", label: "DOWNLOAD", action: { type: "profile.downloadReplay", id: replay.id } });
  actions.push({ id: "delete", label: "✕ DELETE", action: { type: "profile.deleteReplay", id: replay.id } });
  return actions;
}

/** The import button's label; the list offers it only when this browser can read a file (`canImport`). */
export const REPLAY_IMPORT_LABEL = "IMPORT A REPLAY FILE";
