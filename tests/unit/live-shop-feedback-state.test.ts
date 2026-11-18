import { describe, expect, it } from "vitest";

import { createLiveShopFeedbackState } from "../../src/app/run/shop-feedback-state";

describe("live shop feedback state", () => {
  it("owns the shop tab, display and flash feedback independently", () => {
    const state = createLiveShopFeedbackState();
    expect(state.snapshot().tab).toBe("upgrades");

    state.set({ tab: "shards", displayedCoins: 240, flash: { id: "dash", time: 0.5 } });

    expect(state.snapshot()).toEqual({ tab: "shards", displayedCoins: 240, flash: { id: "dash", time: 0.5 } });
    expect(Object.isFrozen(state)).toBe(true);
  });
});
