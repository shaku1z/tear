import { describe, expect, it, vi } from "vitest";
import { createLiveReplayScreenAdapter, type ReplayScreenServices } from "../../src/app/replay/replay-screen-adapter";

const ports = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn() }));
vi.mock("../../src/ghost/browser-capsule-vault", () => ({ readBrowserGhostCapsule: ports.read }));
vi.mock("../../src/app/library/ghost-theater-screen-adapter", () => ({
  createGhostTheaterScreenAdapter: () => ({ open: ports.open, exit: vi.fn() }),
}));
vi.mock("../../src/app/replay/browser-replay-clip-export", () => ({ createBrowserReplayClipExport: vi.fn() }));
vi.mock("../../src/app/replay/browser-ghost-replay-presentation", () => ({
  createBrowserGhostReplayPresentation: vi.fn(),
}));

describe("pending Theater open lifetime", () => {
  it("cannot replace a newer screen after a delayed read", async () => {
    vi.clearAllMocks();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    ports.read.mockImplementation(async () => {
      await held;
      return { manifest: { rootIntegrity: "source-root" } };
    });
    const setScreen = vi.fn();
    const adapter = createLiveReplayScreenAdapter({
      dependencies: { UI: {} },
      renderers: { replay: vi.fn() },
      setScreen,
    } as unknown as ReplayScreenServices);
    const opening = adapter.enterGhostCapsule("source", "profile");
    // The normal screen owner calls this when navigation or a new run replaces it.
    adapter.cancelPendingOpen();
    release?.();
    expect(await opening).toMatchObject({ kind: "refused", category: "source-invalid" });
    expect(ports.open).not.toHaveBeenCalled();
    expect(setScreen).not.toHaveBeenCalled();
  });
});
