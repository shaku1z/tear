import { describe, expect, it, vi } from "vitest";
import { createScreenActionRouter, type ScreenActionHandlers } from "../../src/app/interface/screen-action-router";
import { createUiConfirmArming, firstEnabledUiButton, handleUiRuntimeFrame } from "../../src/app/interface/ui-runtime-controller";
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
        mode: "mouse", mouseX: 500, mouseY: 500,
        ui: { pageUp: false, pageDown: false, tabPrev: false, tabNext: false },
        pressed: new Set(), padBack: false,
        touchActive: () => false, takeUIScroll: () => ({ x: 0, y: 0 }),
        menuLeft: () => false, menuRight: () => false, menuUp: () => false, menuDown: () => false,
        menuPrev: () => false, menuNext: () => false, confirmPressed: () => true,
        confirmHeld: () => true, backPressed: () => false, takeClick: () => null,
      },
      now: () => 0, arming: createUiConfirmArming(),
      playInterfaceSound: sound,
      chooseUpgrade: vi.fn(), chooseReserve: vi.fn(), chooseTier: vi.fn(), rerollDraft: vi.fn(),
    });
    expect(firstEnabledUiButton([{ x: 0, y: 0, w: 1, h: 1, enabled: false }, { x: 0, y: 0, w: 1, h: 1 }])).toBe(1);
    expect(focus).toBe(0);
    expect(action).toHaveBeenCalledOnce();
    expect(sound).toHaveBeenCalledOnce();
  });

  it("arms a just-opened draft only after confirm is released and the settle time passes", () => {
    let screen = "playing", now = 0, held = true, confirm = false, digit = false, click: { x: number; y: number } | null = null;
    const card = vi.fn();
    const chooseTier = vi.fn();
    const arming = createUiConfirmArming();
    const frame = (): void => {
      handleUiRuntimeFrame({
        screen: () => screen, buttons: () => [{ x: 0, y: 0, w: 100, h: 200, label: "", confirm: true, action: card }],
        focus: () => 0, setFocus: vi.fn(), scroll: () => 0, setScroll: vi.fn(),
        input: {
          mode: "keyboard", mouseX: 50, mouseY: 50, ui: { pageUp: false, pageDown: false, tabPrev: false, tabNext: false },
          pressed: new Set(digit ? ["Digit2"] : []), padBack: false,
          touchActive: () => false, takeUIScroll: () => ({ x: 0, y: 0 }),
          menuLeft: () => false, menuRight: () => false, menuUp: () => false, menuDown: () => false,
          menuPrev: () => false, menuNext: () => false, confirmPressed: () => confirm,
          confirmHeld: () => held, backPressed: () => false,
          takeClick: () => { const value = click; click = null; return value; },
        },
        now: () => now, arming, playInterfaceSound: vi.fn(),
        chooseUpgrade: vi.fn(), chooseReserve: vi.fn(), chooseTier, rerollDraft: vi.fn(),
      });
    };
    frame();                                   // jumping with Space held as the wave clears
    screen = "draft"; confirm = true; frame(); // the draft opens on the same press
    now = 0.5; confirm = false; frame();       // still held: no release yet
    expect(card).not.toHaveBeenCalled();
    held = false; now = 0.6; frame();          // released
    held = true; confirm = true; now = 0.7; frame();
    expect(card).toHaveBeenCalledOnce();

    screen = "gameover"; now = 1; held = false; confirm = false; frame();
    click = { x: 50, y: 50 }; now = 1.1; frame(); // a click aimed at the arena
    expect(card).toHaveBeenCalledOnce();
    click = { x: 50, y: 50 }; now = 1.5; frame();
    expect(card).toHaveBeenCalledTimes(2);

    screen = "tierup"; now = 2; digit = true; frame();
    expect(chooseTier).not.toHaveBeenCalled();
    now = 2.4; frame();
    expect(chooseTier).toHaveBeenCalledWith(1);
  });

  it("keeps frame composition ordering stable and resets changed-screen navigation", () => {
    type Screen = "menu" | "playing";
    const events: string[] = [];
    let previous: Screen = "playing";
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
      resizeIfNeeded: () => { events.push("resize-check"); },
      screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
      touchActive: () => false, applyScreenDensity: () => events.push("density"),
      resetControls: () => events.push("controls"), background: () => "#fff", setTheme: () => events.push("theme"),
      renderWorldLayers: () => events.push("world"), renderReticle: () => events.push("reticle"), isMenuScreen: () => true,
      enterSeconds: () => 1, setEnterSeconds: () => events.push("enter-reset"), enterAmount: () => 1, setEnterAmount: () => { events.push("enter-amount"); },
      ease: (value) => value, resetScroll: () => events.push("scroll-reset"), renderMenuBackdrop: () => events.push("attract"),
      renderScreen: () => events.push("screen"), drawButtons: () => events.push("buttons"), drawPostLayers: () => events.push("post"),
      drawCursor: () => events.push("cursor"), showCanvasCursor: () => true,
      drawControllerToast: () => events.push("pad"), drawRotationGate: () => events.push("rotate"),
      firstEnabledButton: () => 2, setFocus: (value) => { focus = value; }, updateDomHints: () => events.push("hints"),
    };
    renderPresentationFrame(ports);
    expect(events).not.toContain("clear");
    expect(events.indexOf("background")).toBeLessThan(events.indexOf("screen"));
    expect(events.indexOf("screen")).toBeLessThan(events.indexOf("post"));
    expect(previous).toBe("menu");
    expect(focus).toBe(2);
  });
});
