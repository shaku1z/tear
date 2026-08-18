import { describe, expect, it } from "vitest";

import { createLiveReviveCountdownState } from "../../src/app/live-revive-countdown-state";

describe("live revive countdown state", () => {
  it("owns the remaining rewarded-revive seconds", () => {
    const state = createLiveReviveCountdownState();
    state.setSeconds(8);

    expect(state.elapse(0.25)).toBe(7.75);
    expect(state.seconds()).toBe(7.75);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
