import { CanvasViewport } from "../presentation/canvas-viewport";
import { BrowserPointerLock } from "../platform/browser-pointer-lock";
import { bindFullscreenButton } from "../platform/browser-fullscreen";
import { InstallPromptController } from "./runtime-initialization";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type BrowserDependencies = Pick<GameRuntimeDependencies, "CONFIG" | "Input" | "OVERSCAN" | "SAFE">;

export interface LiveBrowserRuntime {
  readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D;
  readonly width: number; readonly height: number; readonly viewport: CanvasViewport;
  readonly resizeCanvas: () => void; readonly requestPointerLock: () => void;
  readonly installPrompt: InstallPromptController; readonly lockHint: HTMLElement | null; readonly hint: HTMLElement | null;
  readonly pantheonDebug: boolean; readonly testMode: boolean;
}

export function createLiveBrowserRuntime(d: BrowserDependencies): LiveBrowserRuntime {
  const element = document.getElementById("game");
  if (!(element instanceof HTMLCanvasElement)) throw new Error("Tear requires a #game canvas");
  const context = element.getContext("2d");
  if (context === null) throw new Error("Tear requires a 2D canvas context");
  d.Input.init(element);
  const viewport = new CanvasViewport(element, d.CONFIG.view.w, d.CONFIG.view.h, d.OVERSCAN, d.SAFE, window, document);
  viewport.start();
  const pointer = new BrowserPointerLock(element, document);
  bindFullscreenButton(document);
  const parameters = new URLSearchParams(window.location.search);
  return Object.freeze({ canvas: element, context, width: d.CONFIG.view.w, height: d.CONFIG.view.h, viewport,
    resizeCanvas: () => { viewport.resize(); }, requestPointerLock: pointer.api.request,
    installPrompt: new InstallPromptController(window), lockHint: document.getElementById("lockhint"),
    hint: document.getElementById("hint"), pantheonDebug: __TEAR_TEST_BUILD__ && parameters.get("bossdebug") === "1",
    testMode: parameters.get("test") === "1" });
}
