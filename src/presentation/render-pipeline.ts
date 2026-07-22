export interface ScreenRectangle { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface RenderPipelinePorts<Screen extends string> {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly screen: () => Screen;
  readonly previousScreen: () => Screen;
  readonly setPreviousScreen: (screen: Screen) => void;
  readonly resize: () => void;
  readonly screenRectangle: () => ScreenRectangle;
  readonly touchActive: () => boolean;
  readonly cssPerLogicalPixel: () => number;
  readonly uiZoom: () => number;
  readonly setUiZoom: (zoom: number) => void;
  readonly deltaSeconds: () => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
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
  readonly drawControllerToast: () => void;
  readonly drawRotationGate: () => void;
  readonly firstEnabledButton: () => number;
  readonly setFocus: (index: number) => void;
  readonly updateDomHints: (screen: Screen) => void;
}

const zoomScreens = new Set(["draft", "tierup", "paused", "confirmquit", "gameover", "win", "continue"]);
const worldScreens = new Set(["playing", "draft", "tierup", "paused", "gameover", "win", "confirmquit", "continue", "pgmenu", "pglab"]);

/** Stable, testable ordering for the canvas presentation frame. */
export function renderPresentationFrame<Screen extends string>(ports: RenderPipelinePorts<Screen>): void {
  ports.resize();
  const overscan = ports.overscan();
  const scale = ports.canvas.width / (ports.logicalWidth + overscan.x * 2);
  ports.context.setTransform(scale, 0, 0, scale, overscan.x * scale, overscan.y * scale);
  const screen = ports.screen();
  const target = zoomScreens.has(screen) && ports.touchActive() && ports.cssPerLogicalPixel() < 0.55
    ? ports.clamp(0.55 / ports.cssPerLogicalPixel(), 1, 1.45) : 1;
  let zoom = ports.uiZoom() + (target - ports.uiZoom()) * ports.clamp(10 * ports.deltaSeconds(), 0, 1);
  if (Math.abs(zoom - target) < 0.004) zoom = target;
  ports.setUiZoom(zoom);
  if (zoom > 1.001) {
    ports.context.translate(ports.logicalWidth / 2, ports.logicalHeight / 2);
    ports.context.scale(zoom, zoom);
    ports.context.translate(-ports.logicalWidth / 2, -ports.logicalHeight / 2);
  }
  const rectangle = ports.screenRectangle();
  ports.context.clearRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
  const playLike = worldScreens.has(screen);
  const background = ports.background(playLike);
  ports.context.fillStyle = background;
  ports.context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
  ports.resetControls();
  ports.setTheme(background, playLike);
  if (playLike) ports.renderWorldLayers(rectangle, playLike);
  if (screen === "playing") ports.renderReticle();

  if (screen !== ports.previousScreen()) {
    ports.setEnterSeconds(0);
    if (screen === "shop" || screen === "draft" || screen === "reserve" || screen === "tierup") ports.resetScroll();
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
  if (screen !== "playing") ports.drawCursor();
  ports.drawControllerToast();
  if (ports.touchActive() && ports.canvas.clientHeight > ports.canvas.clientWidth) ports.drawRotationGate();
  if (screen !== ports.previousScreen()) {
    ports.setPreviousScreen(screen);
    ports.setFocus(ports.firstEnabledButton());
    ports.resetScroll();
  }
  ports.updateDomHints(screen);
}
