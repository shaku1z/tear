import { describe, expect, it } from "vitest";

import { createLiveInterfaceFrameState } from "../../src/app/live-interface-frame-state";

describe("live interface frame state", () => {
  it("owns screen navigation, timing, entrance state, and UI zoom", () => {
    const state = createLiveInterfaceFrameState("menu");

    state.advance(0.25);
    state.setPreviousScreen("playing");
    state.setEnterAmount(0.6);
    state.setUiZoom(1.4);

    expect(state.seconds()).toBe(0.25);
    expect(state.enterSeconds()).toBe(0.25);
    expect(state.deltaSeconds()).toBe(0.25);
    expect(state.previousScreen()).toBe("playing");
    expect(state.enterAmount()).toBe(0.6);
    expect(state.uiZoom()).toBe(1.4);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
