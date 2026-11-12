import { describe, expect, it, vi } from "vitest";
import { createLiveReplayScreenAdapter, type ReplayScreenServices } from "../../src/app/replay/replay-screen-adapter";

const ports = vi.hoisted(() => ({ read: vi.fn(), reopen: vi.fn(), confirm: vi.fn(), open: vi.fn(), exit: vi.fn() }));
vi.mock("../../src/ghost/browser-capsule-vault", () => ({ readBrowserGhostCapsule: ports.read, listBrowserGhostCapsuleManifests: vi.fn().mockResolvedValue([]) }));
vi.mock("../../src/ghost/finale-companion", () => ({ readGhostFinaleCompanion: () => ({ origin: { tick: 120 } }) }));
vi.mock("../../src/ghost/browser-finale-companion", () => ({ reopenGhostFinaleCompanion: ports.reopen }));
vi.mock("../../src/app/replay/ghost-finale-screen-adapter", () => ({ createGhostFinaleScreenAdapter: () => ({ open: ports.open, exit: ports.exit }) }));
vi.mock("../../src/app/library/ghost-theater-screen-adapter", () => ({ createGhostTheaterScreenAdapter: () => ({ exit: vi.fn() }) }));
vi.mock("../../src/app/replay/ghost-comparison-screen-adapter", () => ({ createGhostComparisonScreenAdapter: () => ({ exit: vi.fn() }) }));
vi.mock("../../src/app/replay/browser-ghost-studio-media", () => ({ createBrowserGhostStudioMedia: vi.fn(), createBrowserGhostReplayPresentation: vi.fn() }));
vi.mock("../../src/app/replay/browser-ghost-coach-history", () => ({ createBrowserGhostCoachHistoryPort: vi.fn() }));

describe("pending finale Theater admission lifetime", () => {
  it.each(["read", "confirm"])("cannot replace a newer screen after a delayed %s", async (boundary) => {
    vi.clearAllMocks();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const capsule = { manifest: { rootIntegrity: "source-root" } };
    ports.read.mockImplementation(async () => { if (boundary === "read") await held; return capsule; });
    ports.confirm.mockImplementation(async () => { if (boundary === "confirm") await held; });
    ports.reopen.mockResolvedValue({ parent: { manifest: { id: "parent" } }, permit: {}, confirm: ports.confirm });
    const setScreen = vi.fn();
    const adapter = createLiveReplayScreenAdapter({ dependencies: { UI: {} }, renderers: { replay: vi.fn() }, setScreen } as unknown as ReplayScreenServices);
    const opening = adapter.enterGhostCapsule("finale", "profile");
    if (boundary === "confirm") await vi.waitFor(() => { expect(ports.confirm).toHaveBeenCalledOnce(); });
    // The normal screen owner calls this when navigation or a new run replaces it.
    adapter.cancelPendingOpen(); release?.();
    expect(await opening).toMatchObject({ kind: "refused", category: "source-invalid" });
    expect(setScreen).not.toHaveBeenCalled();
  });
});
