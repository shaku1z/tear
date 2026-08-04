import { describe, expect, it, vi } from "vitest";

import { createLiveScreenActionBindings, type ScreenActionBindingPorts } from "../../src/app/live-screen-action-bindings";

describe("live screen action bindings", () => {
  it("routes Academy retry to the composed inspection refresh without granting a custody action", () => {
    const refreshAcademy = vi.fn();
    const dispatch = createLiveScreenActionBindings({ refreshAcademy } as unknown as ScreenActionBindingPorts);
    dispatch({ type: "academy.retry" });
    expect(refreshAcademy).toHaveBeenCalledOnce();
  });
});
