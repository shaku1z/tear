import { describe, expect, it } from "vitest";

import { createLiveHudFeedbackState } from "../../src/app/interface/hud-feedback-state";

describe("live HUD feedback state", () => {
  it("owns HUD smoothing and multiplier feedback independently", () => {
    const state = createLiveHudFeedbackState();

    state.set({ lagHp: 0.75, multiplier: 6, multiplierPop: 0.3 });

    expect(state.snapshot()).toEqual({ lagHp: 0.75, multiplier: 6, multiplierPop: 0.3 });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("advances only explicitly, preserving the normal-frame coefficients and retained pulse clock", () => {
    const state = createLiveHudFeedbackState();
    state.set({ lagHp: 0.9, multiplier: 2, multiplierPop: 0.5 });
    state.advance({ hpFraction: 0.79, multiplier: 2, deltaSeconds: 1 / 60 });
    expect(state.snapshot()).toEqual({ lagHp: 0.8923, multiplier: 2, multiplierPop: 0.44 });
    expect(state.clockSeconds()).toBe(1 / 60);
    const saved = state.capture();
    expect(state.snapshot()).toEqual(state.snapshot());
    expect(state.capture()).toEqual(saved);
    state.advance({ hpFraction: 0.79, multiplier: 3, deltaSeconds: 1 / 30 });
    expect(state.snapshot().multiplierPop).toBe(0.94);
    expect(state.clockSeconds()).toBe(0.05);
    state.restore(JSON.parse(JSON.stringify(saved)));
    expect(state.capture()).toEqual(saved);
    state.restore(undefined);
    expect(state.capture()).toEqual({ version: 1, clockSeconds: 0, lagHp: 1, multiplier: 1, multiplierPop: 0 });
  });

  it.each([null, { version: 2 }, { version: 1, clockSeconds: -1, lagHp: 1, multiplier: 1, multiplierPop: 0 },
    { version: 1, clockSeconds: 1, lagHp: 2, multiplier: 1, multiplierPop: 0 }])("rejects malformed feedback before replacing the owner", (invalid) => {
    const state = createLiveHudFeedbackState();
    state.set({ lagHp: 0.8, multiplier: 3, multiplierPop: 0.4 });
    const before = state.capture();
    expect(() => { state.restore(invalid); }).toThrow();
    expect(state.capture()).toEqual(before);
  });
});
