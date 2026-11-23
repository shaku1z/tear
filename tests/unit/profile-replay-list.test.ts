import { describe, expect, it } from "vitest";
import {
  REPLAY_LIST_OPENING,
  profileListEmptyState,
  replayListState,
  replayRowActions,
} from "../../src/presentation/screens/profile-replay-list";

describe("the profile screen's REPLAYS list", () => {
  it("treats a list that has not been read yet as opening, and one that cannot be read as failed", () => {
    expect(replayListState("idle")).toBe("opening");
    expect(replayListState("loading")).toBe("opening");
    expect(replayListState("ready")).toBeUndefined();
    expect(replayListState("unavailable")).toBe("failed");
  });

  it("names the list's state instead of calling an unread list empty", () => {
    expect(profileListEmptyState({ replayList: "opening" })).toEqual({
      glyph: "▶",
      line: REPLAY_LIST_OPENING,
      detail: "",
      play: false,
    });
    expect(profileListEmptyState({ replayList: "failed", message: "why" })).toMatchObject({
      line: "Replays could not be opened",
      detail: "why",
      play: false,
    });
  });

  it("offers PLAY A RUN only when the player has no runs, and names an empty filter", () => {
    expect(profileListEmptyState({ emptyMessage: "go" })).toEqual({
      glyph: "▶",
      line: "No runs recorded yet",
      detail: "go",
      play: true,
    });
    expect(profileListEmptyState({ replayFilters: [{ id: "pinned", label: "PINNED", selected: true }] })).toMatchObject(
      { line: "No pinned replays", play: false },
    );
    expect(profileListEmptyState({ replayFilters: [{ id: "bests", label: "BESTS", selected: true }] })).toMatchObject({
      line: "No bests yet",
      play: false,
    });
  });

  it("gives every row WATCH, PIN, SHARE and DELETE, and DOWNLOAD only for a run with a file", () => {
    const ids = (canDownload: boolean) =>
      replayRowActions({ id: "r", title: "", detail: "", canDownload }).map((action) => action.id);
    expect(ids(true)).toEqual(["watch", "pin", "share", "download", "delete"]);
    expect(ids(false)).toEqual(["watch", "pin", "share", "delete"]);
    const [watch, , share] = replayRowActions({ id: "r", title: "", detail: "", available: false, shared: true });
    expect(watch).toMatchObject({ label: "CAN'T PLAY", enabled: false });
    expect(share).toMatchObject({ label: "SHARED", enabled: false, selected: true });
  });
});
