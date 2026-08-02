import { CanvasViewport } from "../presentation/canvas-viewport";
import { BrowserPointerLock } from "../platform/browser-pointer-lock";
import { bindFullscreenButton } from "../platform/browser-fullscreen";
import { InstallPromptController } from "./runtime-initialization";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type BrowserDependencies = Pick<GameRuntimeDependencies,
  "CONFIG" | "Input" | "OVERSCAN" | "SAFE" | "browserDocument" | "browserWindow">;

export interface LiveBrowserRuntime {
  readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D;
  readonly width: number; readonly height: number; readonly viewport: CanvasViewport;
  readonly resizeCanvas: () => void; readonly requestPointerLock: () => void;
  readonly installPrompt: InstallPromptController; readonly lockHint: HTMLElement | null; readonly hint: HTMLElement | null;
  readonly pantheonDebug: boolean; readonly testMode: boolean;
}

export function createLiveBrowserRuntime(d: BrowserDependencies): LiveBrowserRuntime {
  const element = d.browserDocument.getElementById("game");
  if (!(element instanceof HTMLCanvasElement)) throw new Error("Tear requires a #game canvas");
  const context = element.getContext("2d");
  if (context === null) throw new Error("Tear requires a 2D canvas context");
  d.Input.init(element);
  const viewport = new CanvasViewport(element, d.CONFIG.view.w, d.CONFIG.view.h, d.OVERSCAN, d.SAFE, d.browserWindow, d.browserDocument);
  viewport.start();
  const pointer = new BrowserPointerLock(element, d.browserDocument);
  bindFullscreenButton(d.browserDocument);
  const parameters = new URLSearchParams(d.browserWindow.location.search);
  return Object.freeze({ canvas: element, context, width: d.CONFIG.view.w, height: d.CONFIG.view.h, viewport,
    resizeCanvas: () => { viewport.resize(); }, requestPointerLock: pointer.api.request,
    installPrompt: new InstallPromptController(d.browserWindow), lockHint: d.browserDocument.getElementById("lockhint"),
    hint: d.browserDocument.getElementById("hint"), pantheonDebug: __TEAR_TEST_BUILD__ && parameters.get("bossdebug") === "1",
    testMode: parameters.get("test") === "1" });
}
