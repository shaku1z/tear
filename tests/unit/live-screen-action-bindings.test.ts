import { describe, expect, it, vi } from "vitest";

import {
  createLiveScreenActionBindings,
  type ScreenActionBindingPorts,
} from "../../src/app/interface/screen-action-bindings";

describe("live screen action bindings", () => {
  it("starts a declared Race only through its explicit setup action", () => {
    const startSelectedRun = vi.fn(),
      startSelectedRace = vi.fn();
    const dispatch = createLiveScreenActionBindings({
      startSelectedRun,
      startSelectedRace,
    } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "setup.start" });
    expect(startSelectedRun).toHaveBeenCalledExactlyOnceWith();
    expect(startSelectedRace).not.toHaveBeenCalled();
    dispatch({ type: "setup.start", race: true });
    expect(startSelectedRace).toHaveBeenCalledExactlyOnceWith();
    expect(startSelectedRun).toHaveBeenCalledOnce();
  });
  it("sends every REPLAYS list action to the one list, the import in the same click", () => {
    const replays = {
      filter: vi.fn(),
      watch: vi.fn(),
      share: vi.fn(),
      download: vi.fn(),
      pin: vi.fn(),
      remove: vi.fn(),
      importFile: vi.fn(),
    };
    const dispatch = createLiveScreenActionBindings({ library: { replays } } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "profile.filterReplays", id: "bests" });
    dispatch({ type: "profile.watchReplay", id: "a" });
    dispatch({ type: "profile.publishReplay", id: "b" });
    dispatch({ type: "profile.downloadReplay", id: "c" });
    dispatch({ type: "profile.pinReplay", id: "d", pinned: true });
    dispatch({ type: "profile.deleteReplay", id: "e" });
    dispatch({ type: "profile.importReplay" });
    expect(replays.filter).toHaveBeenCalledExactlyOnceWith("bests");
    expect(replays.watch).toHaveBeenCalledExactlyOnceWith("a");
    expect(replays.share).toHaveBeenCalledExactlyOnceWith("b");
    expect(replays.download).toHaveBeenCalledExactlyOnceWith("c");
    expect(replays.pin).toHaveBeenCalledExactlyOnceWith("d", true);
    expect(replays.remove).toHaveBeenCalledExactlyOnceWith("e");
    expect(replays.importFile).toHaveBeenCalledExactlyOnceWith();
  });

  it("maps the replay editor actions to the replay adapter", () => {
    const toggleReplayEditor = vi.fn(),
      appendClip = vi.fn();
    const dispatch = createLiveScreenActionBindings({
      replay: { toggleReplayEditor, appendClip },
    } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "replay.editor.toggle" });
    dispatch({ type: "replay.editor.appendClip" });
    expect(toggleReplayEditor).toHaveBeenCalledTimes(1);
    expect(appendClip).toHaveBeenCalledTimes(1);
  });
});
