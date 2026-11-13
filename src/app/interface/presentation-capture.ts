import type { GraphicsPreference } from "../screens/settings-controller";
import type { TearCaptureLayerPolicyV1, TearLivePresentationStateV1 } from "../../tearbench/live-runtime-contracts";
import type { LiveCaptureLayerPolicy } from "./presentation-composition";

export const DEFAULT_LIVE_CAPTURE_POLICY: LiveCaptureLayerPolicy = Object.freeze({
  ui: "include", debug: "include", pointerLock: "include", actors: "include",
});

export function normalizeLiveCapturePolicy(policy?: TearCaptureLayerPolicyV1): LiveCaptureLayerPolicy {
  return Object.freeze({
    ui: policy?.ui ?? "include", debug: policy?.debug ?? "include",
    pointerLock: policy?.pointerLock ?? "include", actors: policy?.actors ?? "include",
  });
}

export function projectLivePresentationState(input: Readonly<{
  simulationTick: number;
  simulationSeconds: number;
  logicalWidth: number;
  logicalHeight: number;
  canvas: HTMLCanvasElement;
  browserWindow: Window;
  gfx: GraphicsPreference;
  lowGraphics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  flashScale: number;
  debugAvailable: boolean;
  pointerLocked: boolean;
  pointerLockHint: HTMLElement | null;
}>): TearLivePresentationStateV1 {
  const rect = input.canvas.getBoundingClientRect();
  return Object.freeze({
    simulationTick: input.simulationTick, presentationClockSeconds: input.simulationSeconds,
    viewport: Object.freeze({ logicalWidth: input.logicalWidth, logicalHeight: input.logicalHeight,
      cssWidth: rect.width, cssHeight: rect.height, backingWidth: input.canvas.width,
      backingHeight: input.canvas.height, deviceScaleFactor: input.browserWindow.devicePixelRatio }),
    settings: Object.freeze({ gfx: input.gfx, lowGraphics: input.lowGraphics,
      reducedMotion: input.reducedMotion, highContrast: input.highContrast, flashScale: input.flashScale }),
    overlays: Object.freeze({ debugAvailable: input.debugAvailable, pointerLocked: input.pointerLocked,
      pointerLockHintVisible: input.pointerLockHint !== null && input.pointerLockHint.style.display !== "none" }),
  });
}

export function createLivePresentationCaptureController(state: () => TearLivePresentationStateV1) {
  let policy = DEFAULT_LIVE_CAPTURE_POLICY;
  return Object.freeze({
    policy: () => policy,
    ports: (render: () => void, screenshot: () => string) => Object.freeze({
      render,
      presentation: state,
      // Snapshot visual hashes observe the existing surface without advancing a frame.
      screenshot,
      captureScreenshot: (next?: TearCaptureLayerPolicyV1) => {
        const previous = policy; policy = normalizeLiveCapturePolicy(next);
        try { render(); return screenshot(); } finally { policy = previous; }
      },
    }),
  });
}

export interface LivePresentationCaptureSource {
  readonly simulationTick: () => number;
  readonly browserWindow: Window;
  readonly gfx: () => GraphicsPreference;
  readonly debugAvailable: boolean;
}

/** Assemble capture metadata beside its controller, outside the game runtime. */
export function createLiveInterfacePresentationCapture(
  source: LivePresentationCaptureSource | undefined,
  world: Readonly<{ width: number; height: number; timeSeconds: number;
    lowGraphics: boolean; reducedMotion: boolean; highContrast: boolean }>,
  frame: Readonly<{ canvas: HTMLCanvasElement; flashScale: () => number;
    pointerLocked: () => boolean; lockHint: HTMLElement | null }>,
) {
  return createLivePresentationCaptureController(() => {
    if (source === undefined) throw new Error("Presentation capture source is unavailable");
    return projectLivePresentationState({
      simulationTick: source.simulationTick(), simulationSeconds: world.timeSeconds,
      logicalWidth: world.width, logicalHeight: world.height, canvas: frame.canvas,
      browserWindow: source.browserWindow, gfx: source.gfx(), lowGraphics: world.lowGraphics,
      reducedMotion: world.reducedMotion, highContrast: world.highContrast, flashScale: frame.flashScale(),
      debugAvailable: source.debugAvailable, pointerLocked: frame.pointerLocked(), pointerLockHint: frame.lockHint,
    });
  });
}
