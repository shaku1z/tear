import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/gameplay/campaign/source-void-runtime", () => ({
  createSourceVoidRuntimeBridge: () => Object.freeze({}),
}));

vi.mock("../../src/gameplay/campaign/live-cinematic-runtime", () => ({
  createLiveCinematicRuntime: (options: { readonly storeSeen: (key: string) => void }) => {
    options.storeSeen("tear.cinematic.test");
    return Object.freeze({});
  },
}));

import { createLiveCinematicHost } from "../../src/app/live-cinematic-host";

describe("live cinematic persistence adapter", () => {
  it.each(["campaign", "tutorial", "playground"])("persists cinematic seen markers only outside practice (%s)", (mode) => {
    const setItem = vi.fn();
    createLiveCinematicHost({
      dependencies: { browserStorage: { setItem } } as never,
      state: { run: () => ({ mode }) } as never, sourceController: {} as never, cinema: {} as never,
      story: {} as never, stage: { platforms: [], current: { accent: "#fff" } }, width: 1,
      policy: () => ({ play: true, brief: true }), clearBossBeat: vi.fn(), setWorldZoom: vi.fn(),
      spawnWisp: vi.fn(), addFlash: vi.fn(), addShake: vi.fn(), loseStyle: vi.fn(), shieldAbsorb: vi.fn(),
      addFloater: vi.fn(), finaleBladeCut: vi.fn(), playSound: vi.fn(),
    });

    if (mode === "campaign") expect(setItem).toHaveBeenCalledWith("tear.cinematic.test", "1");
    else expect(setItem).not.toHaveBeenCalled();
  });
});
