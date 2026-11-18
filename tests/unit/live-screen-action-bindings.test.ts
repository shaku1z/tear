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
  it("dispatches normal archive picking synchronously through eager ports with exact job revision controls", () => {
    const ghostFiles = {
      pickArchive: vi.fn(),
      restoreArchive: vi.fn(),
      cancelArchive: vi.fn(),
      downloadArchive: vi.fn(),
    };
    const dispatch = createLiveScreenActionBindings({ ghostFiles } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "profile.pickGhostArchive" });
    expect(ghostFiles.pickArchive).toHaveBeenCalledExactlyOnceWith();
    dispatch({ type: "profile.reselectGhostArchive", id: "intent" });
    expect(ghostFiles.pickArchive).toHaveBeenLastCalledWith("intent");
    dispatch({ type: "profile.restoreGhostArchive", id: "intent", revision: 3 });
    expect(ghostFiles.restoreArchive).toHaveBeenCalledExactlyOnceWith("intent", 3);
    dispatch({ type: "profile.cancelGhostRestore", id: "intent", revision: 4 });
    expect(ghostFiles.cancelArchive).toHaveBeenCalledExactlyOnceWith("intent", 4);
    dispatch({ type: "profile.cancelGhostArchiveSelection" });
    expect(ghostFiles.cancelArchive).toHaveBeenLastCalledWith();
    dispatch({ type: "profile.downloadGhostArchive", id: "capsule" });
    expect(ghostFiles.downloadArchive).toHaveBeenCalledExactlyOnceWith("capsule");
    dispatch({ type: "profile.downloadGhostArchive", id: "capsule", paired: true });
    expect(ghostFiles.downloadArchive).toHaveBeenLastCalledWith("capsule", true);
  });

  it("maps canonical Replay Editor actions and legacy Studio actions to one adapter", () => {
    const toggleStudio = vi.fn(),
      createStudioCutList = vi.fn();
    const dispatch = createLiveScreenActionBindings({
      replay: { toggleStudio, createStudioCutList },
    } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "replay.editor.toggle" });
    dispatch({ type: "replay.studio.toggle" });
    dispatch({ type: "replay.editor.createCutList" });
    dispatch({ type: "replay.studio.createCutList" });
    expect(toggleStudio).toHaveBeenCalledTimes(2);
    expect(createStudioCutList).toHaveBeenCalledTimes(2);
  });
});
