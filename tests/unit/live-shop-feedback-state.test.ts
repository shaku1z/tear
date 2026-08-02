import { describe, expect, it } from "vitest";

import { createLiveShopFeedbackState } from "../../src/app/live-shop-feedback-state";

describe("live shop feedback state", () => {
  it("owns shop display and flash feedback independently", () => {
    const state = createLiveShopFeedbackState();

    state.set({ displayedCoins: 240, flash: { id: "dash", time: 0.5 } });

    expect(state.snapshot()).toEqual({ displayedCoins: 240, flash: { id: "dash", time: 0.5 } });
    expect(Object.isFrozen(state)).toBe(true);
  });
});
