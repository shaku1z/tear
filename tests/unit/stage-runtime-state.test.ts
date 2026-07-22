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
});
