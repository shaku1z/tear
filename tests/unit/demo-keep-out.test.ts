import { describe, expect, it } from "vitest";
import { controlsKeepOut } from "../../src/presentation/demo-keep-out";
import { renderPresentationFrame, type RenderPipelinePorts } from "../../src/presentation/render-pipeline";
import { createUiState } from "../../src/presentation/ui-tokens";
import { APP_SCREENS, isMenuScreen, isWorldScreen } from "../../src/domain/screen-catalog";

/** Pipeline ports that record the drawing calls the backdrop rule cares about; everything else does nothing. */
function recordingPorts(screen: string, calls: string[]): RenderPipelinePorts<string> {
  const context = new Proxy({}, { get: () => () => undefined, set: () => true }) as CanvasRenderingContext2D;
  const named: Partial<RenderPipelinePorts<string>> = {
    canvas: { width: 1600, clientWidth: 1600, clientHeight: 900 } as HTMLCanvasElement,
    context,
    logicalWidth: 1600,
    overscan: () => ({ x: 0, y: 0 }),
    screen: () => screen,
    previousScreen: () => screen,
    screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
    background: () => "#fff",
    isMenuScreen,
    touchActive: () => false,
    showCanvasCursor: () => false,
    ease: (value) => value,
    renderWorldLayers: () => calls.push("world"),
    renderOverlayBackdrop: () => calls.push("scrim"),
    renderMenuBackdrop: () => calls.push("menu backdrop"),
    renderScreen: () => calls.push("screen"),
  };
  return new Proxy(named, {
    get: (target, key) => (target as Record<string | symbol, unknown>)[key] ?? (() => undefined),
  }) as RenderPipelinePorts<string>;
}

describe("the live scene never shows through a screen's content", () => {
  it("keeps the menu demo out of the padded area a screen's controls cover", () => {
    expect(controlsKeepOut([])).toBeUndefined();
    expect(
      controlsKeepOut([
        { x: 100, y: 240, w: 320, h: 58 },
        { x: 100, y: 731, w: 320, h: 46 },
      ]),
    ).toEqual({ x: 84, y: 224, w: 352, h: 569 });
  });

  it("draws every run overlay on one scrim from the frame, over the world and under the screen", () => {
    const overlays = APP_SCREENS.filter((screen) => isWorldScreen(screen) && screen !== "playing");
    expect(overlays).toEqual(expect.arrayContaining(["paused", "gameover", "draft", "confirmquit", "pgmenu"]));
    for (const screen of overlays) {
      const calls: string[] = [];
      renderPresentationFrame(recordingPorts(screen, calls));
      expect(calls, screen).toEqual(["world", "scrim", "screen"]);
    }
    const playing: string[] = [];
    renderPresentationFrame(recordingPorts("playing", playing));
    expect(playing).toEqual(["world", "screen"]);
    const menu: string[] = [];
    renderPresentationFrame(recordingPorts("settings", menu));
    expect(menu).toEqual(["menu backdrop", "screen"]);
  });

  it("makes the sheet and the run-overlay scrim solid", () => {
    const { alpha } = createUiState({ bomber: "#f80", charger: "#e33", perfect: "#1cc" }).t;
    expect(alpha.sheet).toBe(1);
    expect(alpha.overlay).toBe(1);
  });
});
