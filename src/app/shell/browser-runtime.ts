import { CanvasViewport } from "../../presentation/canvas-viewport";
import { BrowserPointerLock } from "../../platform/browser-pointer-lock";
import { bindFullscreenControls } from "../../platform/browser-fullscreen";
import { InstallPromptController } from "./runtime-initialization";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type BrowserDependencies = Pick<
  GameRuntimeDependencies,
  "CONFIG" | "Input" | "OVERSCAN" | "SAFE" | "browserDocument" | "browserWindow" | "engineeringQuery" | "fullscreen"
>;

export interface LiveBrowserRuntime {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly viewport: CanvasViewport;
  readonly resizeCanvas: () => void;
  readonly requestPointerLock: () => void;
  readonly installPrompt: InstallPromptController;
  readonly lockHint: HTMLElement | null;
  readonly hint: HTMLElement | null;
  readonly fullscreenButton: HTMLElement | null;
  /** The platform can go fullscreen here (not on CrazyGames, which owns it, or iPhone Safari). */
  readonly fullscreenAvailable: () => boolean;
  /** The boss debug harness (`__PANTHEON_TEST`) is installed. */
  readonly pantheonDebug: boolean;
  /** The boss debug overlay is drawn: platform labels, zone boxes and the painted/visible box. */
  readonly pantheonDebugOverlay: boolean;
  readonly testMode: boolean;
}

/**
 * Test builds only. `?bossdebug=1` installs the boss debug harness and draws its overlay; adding
 * `&overlay=0` keeps the harness and draws no overlay, so a picture for the owner shows the game as
 * players see it. A production build has neither.
 */
export function bossDebugFlags(
  testBuild: boolean,
  parameters: Pick<URLSearchParams, "get">,
): { readonly hooks: boolean; readonly overlay: boolean } {
  const hooks = testBuild && parameters.get("bossdebug") === "1";
  return Object.freeze({ hooks, overlay: hooks && parameters.get("overlay") !== "0" });
}

export function createLiveBrowserRuntime(d: BrowserDependencies): LiveBrowserRuntime {
  const element = d.browserDocument.getElementById("game");
  if (!(element instanceof HTMLCanvasElement)) throw new Error("Tear requires a #game canvas");
  // The frame pipeline paints the complete backing store with an opaque
  // background before world/UI layers. Declaring that contract lets the
  // browser skip alpha-surface composition without changing rendered pixels.
  const context = element.getContext("2d", { alpha: false });
  if (context === null) throw new Error("Tear requires a 2D canvas context");
  const pointer = new BrowserPointerLock(element, d.browserDocument);
  d.Input.init(element, pointer.api.request);
  const viewport = new CanvasViewport(
    element,
    d.CONFIG.view.w,
    d.CONFIG.view.h,
    d.OVERSCAN,
    d.SAFE,
    d.browserWindow,
    d.browserDocument,
  );
  viewport.start();
  bindFullscreenControls({
    document: d.browserDocument,
    window: d.browserWindow,
    fullscreen: d.fullscreen,
    textEntry: () => d.Input.textEntryMode,
  });
  // Only composition-admitted engineering parameters are read; release builds receive none.
  const parameters = d.engineeringQuery;
  const bossDebug = bossDebugFlags(__TEAR_TEST_BUILD__, parameters);
  return Object.freeze({
    canvas: element,
    context,
    width: d.CONFIG.view.w,
    height: d.CONFIG.view.h,
    viewport,
    resizeCanvas: () => {
      viewport.resizeIfNeeded();
    },
    requestPointerLock: pointer.api.request,
    installPrompt: new InstallPromptController(d.browserWindow),
    lockHint: d.browserDocument.getElementById("lockhint"),
    hint: d.browserDocument.getElementById("hint"),
    fullscreenButton: d.browserDocument.getElementById("fs"),
    fullscreenAvailable: () => d.fullscreen().available,
    pantheonDebug: bossDebug.hooks,
    pantheonDebugOverlay: bossDebug.overlay,
    testMode: parameters.get("test") === "1",
  });
}
