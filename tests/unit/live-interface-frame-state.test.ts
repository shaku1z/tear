import { describe, expect, it } from "vitest";

import { createLiveInterfaceFrameState } from "../../src/app/interface/interface-frame-state";

describe("live interface frame state", () => {
  it("owns screen navigation, timing, and entrance state", () => {
    const state = createLiveInterfaceFrameState();
    // Nothing drawn yet, so the first screen the frame draws is entered like any other.
    expect(state.previousScreen()).toBeUndefined();

    state.advance(0.25);
    state.setPreviousScreen("playing");
    state.setEnterAmount(0.6);

    expect(state.seconds()).toBe(0.25);
    expect(state.enterSeconds()).toBe(0.25);
    expect(state.deltaSeconds()).toBe(0.25);
    expect(state.previousScreen()).toBe("playing");
    expect(state.enterAmount()).toBe(0.6);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
