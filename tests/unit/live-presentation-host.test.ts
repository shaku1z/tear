import { describe, expect, it, vi } from "vitest";
import { createLivePresentationHost } from "../../src/app/live-presentation-host";

describe("live presentation host", () => {
  it("owns the overscan rectangle and delegates the frame and UI runtimes", () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
      translate: vi.fn(), scale: vi.fn(), fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 100, clientWidth: 100, clientHeight: 100 } as HTMLCanvasElement;
    const screenDraw = vi.fn();
    const buttons = [{ x: 0, y: 0, w: 10, h: 10, label: "go", enabled: true, action: vi.fn() }];
    const input = {
      mode: "mouse" as const, mouseX: 0, mouseY: 0, ui: { pageUp: false, pageDown: false, tabPrev: false, tabNext: false },
      pressed: new Set<string>(), padBack: false, touchActive: () => false,
      takeUIScroll: () => ({ x: 0, y: 0 }), menuLeft: () => false, menuRight: () => false,
      menuUp: () => false, menuDown: () => false, menuPrev: () => false, menuNext: () => false,
      confirmPressed: () => false, takeClick: () => null,
    };
    const host = createLivePresentationHost({
      dimensions: { width: 80, height: 60, overscan: () => ({ x: 10, y: 20 }) },
      framePorts: (runtime) => ({
        canvas, context, logicalWidth: 80, logicalHeight: 60, overscan: () => ({ x: 10, y: 20 }),
        screen: () => "playing", previousScreen: () => "playing", setPreviousScreen: vi.fn(), resize: vi.fn(),
        screenRectangle: runtime.screenRectangle, touchActive: () => false, cssPerLogicalPixel: () => 1,
        uiZoom: () => 1, setUiZoom: vi.fn(), deltaSeconds: () => 1 / 60,
        clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)), resetControls: vi.fn(),
        background: () => "#000", setTheme: vi.fn(), renderWorldLayers: screenDraw, renderReticle: vi.fn(),
        isMenuScreen: () => false, enterSeconds: () => 1, setEnterSeconds: vi.fn(), enterAmount: () => 1,
        setEnterAmount: vi.fn(), ease: (value) => value, resetScroll: vi.fn(), renderMenuBackdrop: vi.fn(),
        renderScreen: vi.fn(), drawButtons: vi.fn(), drawPostLayers: vi.fn(), drawCursor: vi.fn(), showCanvasCursor: () => false,
        drawControllerToast: vi.fn(), drawRotationGate: vi.fn(), firstEnabledButton: () => 0,
        setFocus: vi.fn(), updateDomHints: vi.fn(),
      }),
      uiPorts: () => ({ screen: () => "playing", buttons: () => buttons, focus: () => 0, setFocus: vi.fn(),
        scroll: () => 0, setScroll: vi.fn(), input, playInterfaceSound: vi.fn(), chooseUpgrade: vi.fn(),
        chooseReserve: vi.fn(), rerollDraft: vi.fn() }),
      buttonLayer: () => ({ context, buttons, focus: 0, pointerX: 0, pointerY: 0, deltaSeconds: 1 / 60,
        enterSeconds: 1, hoverAnimation: {}, ui: { pointIn: () => false, chip: vi.fn(), button: vi.fn() },
        entranceEase: (value) => value }),
    });

    expect(host.screenRectangle()).toEqual({ x: -10, y: -20, w: 100, h: 100 });
    expect(host.firstEnabledButton()).toBe(0);
    host.render();
    host.handleUi();
    host.drawButtons();
    expect(screenDraw).toHaveBeenCalledOnce();
  });
});
