import { describe, expect, it } from "vitest";

import { createLiveInputAuthorityState } from "../../src/app/live-input-authority-state";

describe("live input authority state", () => {
  it("keeps automated semantic input from acquiring pointer lock or device aim", () => {
    let requested = 0;
    const state = createLiveInputAuthorityState(() => { requested++; });

    state.requestPointerLock();
    state.setSemanticInputAuthority(true);
    state.requestPointerLock();

    expect(requested).toBe(1);
    expect(state.semanticInputAuthority()).toBe(true);
    expect(state.allowsDeviceAimCapture()).toBe(false);

    state.setSemanticInputAuthority(false);
    state.requestPointerLock();

    expect(requested).toBe(2);
    expect(state.allowsDeviceAimCapture()).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
