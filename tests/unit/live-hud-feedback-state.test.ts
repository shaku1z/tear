import { describe, expect, it } from "vitest";

import { createLiveHudFeedbackState } from "../../src/app/live-hud-feedback-state";

describe("live HUD feedback state", () => {
  it("owns HUD smoothing and multiplier feedback independently", () => {
    const state = createLiveHudFeedbackState();

    state.set({ lagHp: 0.75, multiplier: 6, multiplierPop: 0.3 });

    expect(state.snapshot()).toEqual({ lagHp: 0.75, multiplier: 6, multiplierPop: 0.3 });
    expect(Object.isFrozen(state)).toBe(true);
  });
});
