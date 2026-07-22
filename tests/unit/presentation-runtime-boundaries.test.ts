import { describe, expect, it, vi } from "vitest";
import { createScreenActionRouter, type ScreenActionHandlers } from "../../src/app/screen-action-router";
import { firstEnabledUiButton, handleUiRuntimeFrame } from "../../src/app/ui-runtime-controller";
import { renderPresentationFrame, type RenderPipelinePorts } from "../../src/presentation/render-pipeline";

describe("presentation runtime boundaries", () => {
  it("routes semantic actions through the exhaustive application boundary", () => {
    const calls: string[] = [];
    const fallback = (action: { readonly type: string }): void => { calls.push(action.type); };
    const handlers = new Proxy({}, { get: () => fallback }) as ScreenActionHandlers;
    const route = createScreenActionRouter(handlers);
    route({ type: "setup.selectWeapon", id: "katana" });
    route({ type: "replay.seekTo", fraction: 0.5 });
    expect(calls).toEqual(["setup.selectWeapon", "replay.seekTo"]);
  });

  it("owns focus, confirmation and interface feedback for one UI frame", () => {
    const action = vi.fn();
    const sound = vi.fn();
    let focus = -1;
    let scroll = 0;
    handleUiRuntimeFrame({
      screen: () => "menu",
      buttons: () => [{ x: 0, y: 0, w: 100, h: 40, label: "PLAY", action }],
      focus: () => focus,
      setFocus: (value) => { focus = value; },
      scroll: () => scroll,
      setScroll: (value) => { scroll = value; },
      input: {
        mouseX: 500, mouseY: 500,
        ui: { pageUp: false, pageDown: false, tabPrev: false, tabNext: false },
        pressed: new Set(), padBack: false,
        touchActive: () => false, takeUIScroll: () => ({ x: 0, y: 0 }),
        menuLeft: () => false, menuRight: () => false, menuUp: () => false, menuDown: () => false,
        menuPrev: () => false, menuNext: () => false, confirmPressed: () => true, takeClick: () => null,
      },
      playInterfaceSound: sound,
      chooseUpgrade: vi.fn(), chooseReserve: vi.fn(), rerollDraft: vi.fn(),
    });
    expect(firstEnabledUiButton([{ x: 0, y: 0, w: 1, h: 1, enabled: false }, { x: 0, y: 0, w: 1, h: 1 }])).toBe(1);
    expect(focus).toBe(0);
    expect(action).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledOnce();
  });

  it("keeps frame composition ordering stable and resets changed-screen navigation", () => {
    type Screen = "menu" | "playing";
    const events: string[] = [];
    let previous: Screen = "playing";
    let zoom = 1;
    let focus = 9;
    const context = {
      setTransform: () => { events.push("transform"); }, translate: () => { events.push("translate"); }, scale: () => { events.push("scale"); },
      clearRect: () => { events.push("clear"); }, fillRect: () => { events.push("background"); },
      save: () => { events.push("save"); }, restore: () => { events.push("restore"); }, fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const ports: RenderPipelinePorts<Screen> = {
      canvas: { width: 1600, clientWidth: 1600, clientHeight: 900 } as HTMLCanvasElement,
      context, logicalWidth: 1600, logicalHeight: 900, overscan: () => ({ x: 0, y: 0 }),
      screen: () => "menu", previousScreen: () => previous, setPreviousScreen: (value) => { previous = value; },
      resize: () => events.push("resize"), screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
      touchActive: () => false, cssPerLogicalPixel: () => 1, uiZoom: () => zoom, setUiZoom: (value) => { zoom = value; },
      deltaSeconds: () => 1 / 60, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      resetControls: () => events.push("controls"), background: () => "#fff", setTheme: () => events.push("theme"),
      renderWorldLayers: () => events.push("world"), renderReticle: () => events.push("reticle"), isMenuScreen: () => true,
      enterSeconds: () => 1, setEnterSeconds: () => events.push("enter-reset"), enterAmount: () => 1, setEnterAmount: () => { events.push("enter-amount"); },
      ease: (value) => value, resetScroll: () => events.push("scroll-reset"), renderMenuBackdrop: () => events.push("attract"),
      renderScreen: () => events.push("screen"), drawButtons: () => events.push("buttons"), drawPostLayers: () => events.push("post"),
      drawCursor: () => events.push("cursor"), drawControllerToast: () => events.push("pad"), drawRotationGate: () => events.push("rotate"),
      firstEnabledButton: () => 2, setFocus: (value) => { focus = value; }, updateDomHints: () => events.push("hints"),
    };
    renderPresentationFrame(ports);
    expect(events.indexOf("background")).toBeLessThan(events.indexOf("screen"));
    expect(events.indexOf("screen")).toBeLessThan(events.indexOf("post"));
    expect(previous).toBe("menu");
    expect(focus).toBe(2);
  });
});
