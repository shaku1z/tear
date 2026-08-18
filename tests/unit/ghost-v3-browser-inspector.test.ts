import { describe, expect, it } from "vitest";
import { installGhostV3BrowserInspector } from "../../src/tearbench/browser/live-runtime-bridge";

describe("Ghost V3 browser inspector", () => {
  it("installs the stable test-build inspection surface from supplied callbacks", async () => {
    const target = {} as Window & { __TEAR_GHOST_V3__?: Record<string, unknown> };
    installGhostV3BrowserInspector(target, {
      manifest: () => null,
      manifests: () => Promise.resolve([]),
      read: () => Promise.resolve(undefined),
      replay: () => Promise.resolve(undefined),
      admission: () => Promise.resolve(undefined),
      verify: () => Promise.resolve(undefined),
      seek: () => Promise.resolve(undefined),
      practice: () => Promise.resolve(undefined),
      active: () => false,
      activePractice: () => null,
      failure: () => null,
    });
    const inspector = target.__TEAR_GHOST_V3__;
    expect(inspector).toBeDefined();
    expect((inspector?.manifest as () => unknown)()).toBeNull();
    await expect((inspector?.manifests as () => Promise<unknown>)()).resolves.toEqual([]);
    await expect((inspector?.seek as () => Promise<unknown>)()).resolves.toBeUndefined();
    expect((inspector?.active as () => unknown)()).toBe(false);
    expect((inspector?.activePractice as () => unknown)()).toBeNull();
    expect((inspector?.failure as () => unknown)()).toBeNull();
  });
});
