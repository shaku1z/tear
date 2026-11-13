import { describe, expect, it, vi } from "vitest";
import {
  createLivePresentationCaptureController,
  normalizeLiveCapturePolicy,
  projectLivePresentationState,
} from "../../src/app/interface/presentation-capture";

describe("live presentation capture", () => {
  it("keeps raw snapshot readback free of rendering", () => {
    const render = vi.fn(), readback = vi.fn(() => "raw");
    const controller = createLivePresentationCaptureController(() => ({ simulationTick: 0 } as never));
    const ports = controller.ports(render, readback);
    expect(ports.screenshot()).toBe("raw");
    expect(render).not.toHaveBeenCalled();
    expect(readback).toHaveBeenCalledTimes(1);
  });
  it("normalizes omitted and partial layer policies without mutating the default", () => {
    expect(normalizeLiveCapturePolicy()).toEqual({
      ui: "include", debug: "include", pointerLock: "include", actors: "include",
    });
    expect(normalizeLiveCapturePolicy({
      ui: "exclude", debug: "exclude", pointerLock: "exclude",
    })).toEqual({ ui: "exclude", debug: "exclude", pointerLock: "exclude", actors: "include" });
  });

  it("projects the exact source-owned clock, viewport, settings, and observed overlays", () => {
    const canvas = {
      width: 3200,
      height: 1800,
      getBoundingClientRect: () => ({ width: 1600, height: 900 }),
    } as unknown as HTMLCanvasElement;
    const input = {
      simulationTick: 317,
      simulationSeconds: 1 / 120,
      logicalWidth: 1600,
      logicalHeight: 900,
      canvas,
      browserWindow: { devicePixelRatio: 2 } as Window,
      gfx: "high",
      lowGraphics: false,
      reducedMotion: true,
      highContrast: true,
      flashScale: 0,
      debugAvailable: true,
      pointerLocked: false,
      pointerLockHint: { style: { display: "none" } } as HTMLElement,
    } as const;
    const presentation = projectLivePresentationState(input);

    expect(presentation).toEqual({
      simulationTick: 317,
      presentationClockSeconds: 1 / 120,
      viewport: {
        logicalWidth: 1600, logicalHeight: 900, cssWidth: 1600, cssHeight: 900,
        backingWidth: 3200, backingHeight: 1800, deviceScaleFactor: 2,
      },
      settings: {
        gfx: "high", lowGraphics: false, reducedMotion: true, highContrast: true, flashScale: 0,
      },
      overlays: { debugAvailable: true, pointerLocked: false, pointerLockHintVisible: false },
    });
    expect(projectLivePresentationState({ ...input, pointerLockHint: null }).overlays.pointerLockHintVisible).toBe(false);
    expect(projectLivePresentationState({ ...input, pointerLockHint: { style: { display: "block" } } as HTMLElement })
      .overlays.pointerLockHintVisible).toBe(true);
  });

  it("applies a capture policy for one render and restores it after success or failure", () => {
    const state = vi.fn(() => ({ simulationTick: 0 } as never));
    const controller = createLivePresentationCaptureController(state);
    const observed: unknown[] = [];
    const ports = controller.ports(
      () => { observed.push(controller.policy()); },
      () => "frame",
    );

    expect(ports.captureScreenshot({ ui: "exclude", debug: "exclude", pointerLock: "exclude", actors: "exclude" }))
      .toBe("frame");
    expect(observed).toEqual([{ ui: "exclude", debug: "exclude", pointerLock: "exclude", actors: "exclude" }]);
    expect(controller.policy()).toEqual({ ui: "include", debug: "include", pointerLock: "include", actors: "include" });

    const failing = controller.ports(() => undefined, () => { throw new Error("capture failed"); });
    expect(() => failing.captureScreenshot({ ui: "exclude", debug: "include", pointerLock: "include" }))
      .toThrow("capture failed");
    expect(controller.policy()).toEqual({ ui: "include", debug: "include", pointerLock: "include", actors: "include" });
  });
});
