import { describe, expect, it, vi } from "vitest";
import { StageRuntimeState } from "../../src/app/stage-runtime-state";

describe("stage runtime state", () => {
  it("owns synchronized stage, platform and banner state", () => {
    const state = new StageRuntimeState(vi.fn((index: number) => ({ index })), vi.fn((index: number) => [`platform-${String(index)}`]));
    state.load(3); state.setBanner("Source", 2.5);
    expect(state).toMatchObject({ index: 3, current: { index: 3 }, platforms: ["platform-3"], name: "Source", bannerSeconds: 2.5 });
    state.resetBanner();
    expect(state.bannerSeconds).toBe(0);
  });

  it("restores stage identity and banner without replacing captured platforms", () => {
    const state = new StageRuntimeState((index: number) => ({ index }), (index: number) => [`platform-${String(index)}`]);
    state.platforms = ["captured-platform"];
    state.restoreIndex(2);
    state.restoreBanner("The Verge", 1.25);

    expect(state).toMatchObject({ index: 2, current: { index: 2 }, platforms: ["captured-platform"],
      name: "The Verge", bannerSeconds: 1.25 });
    expect(() => { state.restoreBanner("bad", -1); }).toThrow(/seconds are invalid/);
  });
});
