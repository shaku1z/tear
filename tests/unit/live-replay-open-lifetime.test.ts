import { describe, expect, it, vi } from "vitest";
import { createLiveReplayScreenAdapter, type ReplayScreenServices } from "../../src/app/replay/replay-screen";

const ports = vi.hoisted(() => ({ read: vi.fn(), openRecord: vi.fn() }));
vi.mock("../../src/app/replay/kept-record-lookup", () => ({
  findKeptRecord: vi.fn(),
  keptRecordSeed: vi.fn(),
  readKeptRecord: ports.read,
}));
vi.mock("../../src/app/replay/live-replay-recorder-slot", () => ({
  liveReplayRecorder: { ensure: () => Promise.resolve({ openReplayRecordStore: vi.fn() }) },
}));
vi.mock("../../src/ghost/replay-engine", () => ({ replayEngine: { ensure: () => Promise.resolve({}) } }));
vi.mock("../../src/app/replay/record-world", () => ({ watchRecord: ports.openRecord }));
vi.mock("../../src/app/replay/browser-replay-clip-export", () => ({ createBrowserReplayClipExport: vi.fn() }));
vi.mock("../../src/app/replay/browser-ghost-replay-presentation", () => ({
  createBrowserGhostReplayPresentation: vi.fn(),
}));

describe("a pending replay open", () => {
  it("cannot replace a newer screen after a delayed read of a kept record", async () => {
    vi.clearAllMocks();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    ports.read.mockImplementation(async () => {
      await held;
      return { key: "kept", record: {} };
    });
    ports.openRecord.mockReturnValue({ play: vi.fn(), dispose: vi.fn() });
    const setScreen = vi.fn();
    const adapter = createLiveReplayScreenAdapter({
      dependencies: { UI: {} },
      renderers: { replay: vi.fn() },
      setScreen,
    } as unknown as ReplayScreenServices);
    const opening = adapter.watchRecord("kept", "profile");
    // The normal screen owner calls this when navigation or a new run replaces it.
    adapter.cancelPendingOpen();
    release?.();
    expect(await opening).toBe(false);
    expect(ports.openRecord).not.toHaveBeenCalled();
    expect(setScreen).not.toHaveBeenCalled();
  });
});
