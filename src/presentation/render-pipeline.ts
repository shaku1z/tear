import { isWorldScreen, screenResetsScrollOnEnter } from "../domain/screen-catalog";

/** The phone rotate gate shows on a touch device whose canvas is taller than wide. The one source for that rule. */
export function rotateGateShown(touchActive: boolean, clientWidth: number, clientHeight: number): boolean {
  return touchActive && clientHeight > clientWidth;
}

export interface ScreenRectangle {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RenderPipelinePorts<Screen extends string> {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly screen: () => Screen;
  readonly previousScreen: () => Screen;
  readonly setPreviousScreen: (screen: Screen) => void;
  readonly resizeIfNeeded: () => void;
  readonly screenRectangle: () => ScreenRectangle;
  readonly touchActive: () => boolean;
  /** Selects the screen's density: compact compositions get the phone floors. */
  readonly applyScreenDensity: (screen: Screen) => void;
  readonly resetControls: () => void;
  readonly background: (playLike: boolean) => string;
  readonly setTheme: (background: string, playLike: boolean) => void;
  readonly renderWorldLayers: (screenRectangle: ScreenRectangle, playLike: boolean) => void;
  readonly renderReticle: () => void;
  readonly isMenuScreen: (screen: Screen) => boolean;
  readonly enterSeconds: () => number;
  readonly setEnterSeconds: (seconds: number) => void;
  readonly enterAmount: () => number;
  readonly setEnterAmount: (amount: number) => void;
  readonly ease: (amount: number) => number;
  readonly resetScroll: () => void;
  readonly renderMenuBackdrop: (screenRectangle: ScreenRectangle, screen: Screen) => void;
  readonly renderScreen: (screen: Screen) => void;
  readonly drawButtons: () => void;
  readonly drawPostLayers: () => void;
  readonly drawCursor: () => void;
  readonly showCanvasCursor: () => boolean;
  readonly drawControllerToast: () => void;
  readonly drawRotationGate: () => void;
  readonly firstEnabledButton: () => number;
  readonly setFocus: (index: number) => void;
  readonly updateDomHints: (screen: Screen) => void;
}

/** Stable, testable ordering for the canvas presentation frame. */
export function renderPresentationFrame<Screen extends string>(ports: RenderPipelinePorts<Screen>): void {
  ports.resizeIfNeeded();
  const overscan = ports.overscan();
  const scale = ports.canvas.width / (ports.logicalWidth + overscan.x * 2);
  ports.context.setTransform(scale, 0, 0, scale, overscan.x * scale, overscan.y * scale);
  const screen = ports.screen();
  ports.applyScreenDensity(screen);
  const rectangle = ports.screenRectangle();
  const playLike = isWorldScreen(screen);
  const background = ports.background(playLike);
  // This opaque full-surface fill replaces every pixel. A preceding clear
  // doubles the high-DPI raster work and cannot affect the resulting image.
  ports.context.globalAlpha = 1;
  ports.context.globalCompositeOperation = "source-over";
  ports.context.fillStyle = background;
  ports.context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
  ports.resetControls();
  ports.setTheme(background, playLike);
  if (playLike) ports.renderWorldLayers(rectangle, playLike);
  if (screen === "playing") ports.renderReticle();

  if (screen !== ports.previousScreen()) {
    ports.setEnterSeconds(0);
    if (screenResetsScrollOnEnter(screen)) ports.resetScroll();
  }
  if (ports.isMenuScreen(screen)) {
    ports.setEnterAmount(ports.ease(ports.enterSeconds() / 0.24));
    ports.renderMenuBackdrop(rectangle, screen);
    ports.context.save();
    ports.context.translate(0, (1 - ports.enterAmount()) * 22);
    ports.renderScreen(screen);
    ports.drawButtons();
    ports.context.restore();
  } else {
    ports.setEnterAmount(1);
    ports.renderScreen(screen);
    if (screen !== "playing") ports.drawButtons();
  }
  ports.drawPostLayers();
  if (ports.showCanvasCursor()) ports.drawCursor();
  ports.drawControllerToast();
  if (rotateGateShown(ports.touchActive(), ports.canvas.clientWidth, ports.canvas.clientHeight))
    ports.drawRotationGate();
  if (screen !== ports.previousScreen()) {
    ports.setPreviousScreen(screen);
    ports.setFocus(ports.firstEnabledButton());
    ports.resetScroll();
  }
  ports.updateDomHints(screen);
}
