import { describe, expect, it } from "vitest";

import { createLiveInterfaceInteractionState, type LiveInterfaceButton } from "../../src/app/live-interface-interaction-state";

describe("live interface interaction state", () => {
  it("owns controls, focus, scroll, and hover feedback for one UI frame", () => {
    const state = createLiveInterfaceInteractionState();
    const control = { label: "PLAY" } as LiveInterfaceButton;

    state.enqueue(control);
    state.setFocus(0);
    state.setScroll(120);
    state.hoverAnimations().PLAY = 0.4;

    expect(state.buttons()).toEqual([control]);
    expect(state.focus()).toBe(0);
    expect(state.scroll()).toBe(120);
    expect(state.hoverAnimations()).toEqual({ PLAY: 0.4 });
    state.resetButtons();
    expect(state.buttons()).toEqual([]);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
