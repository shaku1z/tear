import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createLivePresentationHost } from "../../src/app/interface/presentation-host";
import { createUiConfirmArming } from "../../src/app/interface/ui-runtime-controller";
import * as hostModule from "../../src/app/interface/presentation-host";
import * as compositionModule from "../../src/app/interface/presentation-composition";
import * as screenModule from "../../src/app/interface/screen-presentation-composition";
import * as worldModule from "../../src/app/world/world-presentation-adapters";
import {
  createLiveInterfaceComposition,
  type LiveInterfaceCompositionOptions,
} from "../../src/app/interface/interface-composition";
import * as pipelineModule from "../../src/presentation/render-pipeline";
import * as buttonLayerModule from "../../src/presentation/screens/button-layer";
import * as uiRuntimeModule from "../../src/app/interface/ui-runtime-controller";

// Execute the actual coordinator callback without booting unrelated browser/storage owners.
function coordinatorRender(composition: ReturnType<typeof createLiveInterfaceComposition>): () => void {
  const source = ts.createSourceFile(
    "game-runtime.ts",
    readFileSync("src/app/shell/game-runtime.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let callback: ts.ArrowFunction | undefined;
  let callbackCount = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "coordinatorContext" && node.initializer) {
      const initializer = ts.isSatisfiesExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (!ts.isObjectLiteralExpression(initializer)) throw new Error("coordinator must retain a concrete render port");
      const render = initializer.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText(source) === "render",
      );
      if (render && ts.isPropertyAssignment(render) && ts.isArrowFunction(render.initializer)) {
        callback = render.initializer;
        callbackCount += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!callback || callbackCount !== 1) throw new Error("expected exactly one production coordinator render callback");
  return runInNewContext(`(${callback.getText(source)})`, {
    interfaceComposition: composition,
    interfaceFrame: { deltaSeconds: () => 1 / 60 },
  }) as () => void;
}

describe("live presentation host", () => {
  it("advances HUD only at explicit world-frame boundaries and respects hidden cinematic HUD", () => {
    const order: string[] = [];
    const advanceHudFrame = vi.fn(() => order.push("advance")),
      render = vi.fn(() => order.push("draw"));
    const completeHudFrame = vi.fn(() => order.push("complete"));
    let screen = "playing",
      hideHud = false,
      playerPresent = true;
    const frame = { render, screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }), stepTab: vi.fn() };
    vi.spyOn(compositionModule, "createLivePresentationSurface").mockReturnValue({
      wipe: { begin: vi.fn() },
      world: {},
    } as never);
    vi.spyOn(compositionModule, "createLivePresentationFrameHost").mockReturnValue(frame as never);
    vi.spyOn(screenModule, "createLiveScreenPresentationComposition").mockReturnValue({} as never);
    vi.spyOn(worldModule, "createLiveWorldPresentationAdapters").mockReturnValue({
      advanceHudFrame,
      completeHudFrame,
    } as never);
    try {
      const composition = createLiveInterfaceComposition({
        wipe: {},
        worldSurface: {},
        screens: { library: {}, settings: {} },
        frameState: { screen: () => screen },
        frameServices: {
          cinema: {
            get hideHud() {
              return hideHud;
            },
          },
        },
        worldState: { player: () => (playerPresent ? {} : null) },
        worldServices: { ease: (value: number) => value },
        onBiomeTransition: vi.fn(),
      } as unknown as LiveInterfaceCompositionOptions);
      const normalFrame = coordinatorRender(composition);
      normalFrame();
      expect(order).toEqual(["advance", "draw", "complete"]);
      expect(advanceHudFrame).toHaveBeenCalledExactlyOnceWith(1 / 60);
      composition.frame.render();
      composition.capture.ports(render, () => "image").captureScreenshot();
      composition.capture.ports(render, () => "image").screenshot();
      expect(advanceHudFrame).toHaveBeenCalledTimes(1);
      expect(completeHudFrame).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(3);
      hideHud = true;
      normalFrame();
      screen = "mainmenu";
      hideHud = false;
      normalFrame();
      screen = "playing";
      playerPresent = false;
      normalFrame();
      expect(advanceHudFrame).toHaveBeenCalledTimes(1);
      expect(completeHudFrame).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(6);
      screen = "paused";
      playerPresent = true;
      normalFrame();
      expect(advanceHudFrame).toHaveBeenLastCalledWith(1 / 60);
      expect(advanceHudFrame).toHaveBeenCalledTimes(2);
      expect(completeHudFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("excludes controller toast, rotation, screen and buttons under UI capture exclusion", () => {
    let ui: "include" | "exclude" = "exclude";
    let ports: ReturnType<Parameters<typeof createLivePresentationHost>[0]["framePorts"]> | undefined;
    const screen = vi.fn(),
      buttons = vi.fn(),
      badge = vi.fn(),
      rotation = vi.fn();
    vi.spyOn(hostModule, "createLivePresentationHost").mockImplementation((options) => {
      const host = { screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }), drawButtons: buttons };
      ports = options.framePorts(host as never);
      return host as never;
    });
    try {
      compositionModule.createLivePresentationFrameHost(
        { timeSeconds: () => 1, screen: () => "mainmenu", controls: () => [] } as never,
        {
          context: { save: vi.fn(), restore: vi.fn() },
          ui: { badge, rotateGate: rotation, t: { color: { accent: "#abc" } } },
          capturePolicy: () => ({ ui }),
          controller: () => ({ active: true, toastSeconds: 1, toastText: "Connected" }),
          width: 1600,
          safeTop: () => 0,
          clamp: (value: number) => value,
          renderScreen: screen,
        } as never,
      );
      if (!ports) throw new Error("real frame composition did not produce ports");
      ports.drawControllerToast();
      ports.drawRotationGate();
      ports.renderScreen("mainmenu");
      ports.drawButtons();
      for (const callback of [badge, rotation, screen, buttons]) expect(callback).not.toHaveBeenCalled();
      ui = "include";
      ports.drawControllerToast();
      ports.drawRotationGate();
      ports.renderScreen("mainmenu");
      ports.drawButtons();
      for (const callback of [badge, rotation, screen, buttons]) expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("owns the overscan rectangle and delegates the frame and UI runtimes", () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 100, clientWidth: 100, clientHeight: 100 } as HTMLCanvasElement;
    const screenDraw = vi.fn();
    const buttons = [{ x: 0, y: 0, w: 10, h: 10, label: "go", enabled: true, action: vi.fn() }];
    const input = {
      mode: "mouse" as const,
      pointer: () => ({ x: 0, y: 0 }),
      ui: { pageUp: false, pageDown: false, tabPrev: false, tabNext: false },
      pressed: new Set<string>(),
      padBack: false,
      touchActive: () => false,
      takeUIScroll: () => ({ x: 0, y: 0 }),
      menuLeft: () => false,
      menuRight: () => false,
      menuUp: () => false,
      menuDown: () => false,
      menuPrev: () => false,
      menuNext: () => false,
      confirmPressed: () => false,
      confirmHeld: () => false,
      menuInputHeld: () => false,
      backPressed: () => false,
      takeClick: () => null,
    };
    const host = createLivePresentationHost({
      dimensions: { width: 80, height: 60, overscan: () => ({ x: 10, y: 20 }) },
      framePorts: (runtime) => ({
        canvas,
        context,
        logicalWidth: 80,
        logicalHeight: 60,
        overscan: () => ({ x: 10, y: 20 }),
        screen: () => "playing",
        previousScreen: () => "playing",
        setPreviousScreen: vi.fn(),
        resizeIfNeeded: vi.fn(),
        screenRectangle: runtime.screenRectangle,
        touchActive: () => false,
        applyScreenDensity: vi.fn(),
        resetControls: vi.fn(),
        background: () => "#000",
        setTheme: vi.fn(),
        renderWorldLayers: screenDraw,
        renderReticle: vi.fn(),
        renderOverlayBackdrop: vi.fn(),
        isMenuScreen: () => false,
        enterSeconds: () => 1,
        setEnterSeconds: vi.fn(),
        enterAmount: () => 1,
        setEnterAmount: vi.fn(),
        ease: (value) => value,
        resetScroll: vi.fn(),
        setScroll: vi.fn(),
        arrival: () => undefined,
        renderMenuBackdrop: vi.fn(),
        renderScreen: vi.fn(),
        drawButtons: vi.fn(),
        drawPostLayers: vi.fn(),
        drawCursor: vi.fn(),
        showCanvasCursor: () => false,
        drawControllerToast: vi.fn(),
        drawRotationGate: vi.fn(),
        entryFocus: () => 0,
        setFocus: vi.fn(),
        updateDomHints: vi.fn(),
      }),
      uiPorts: () => ({
        screen: () => "playing",
        buttons: () => buttons,
        focus: () => 0,
        setFocus: vi.fn(),
        scroll: () => 0,
        setScroll: vi.fn(),
        input,
        now: () => 0,
        arming: createUiConfirmArming(),
        playInterfaceSound: vi.fn(),
        chooseUpgrade: vi.fn(),
        chooseReserve: vi.fn(),
        chooseTier: vi.fn(),
        rerollDraft: vi.fn(),
      }),
      buttonLayer: () => ({
        context,
        buttons,
        focus: 0,
        pointerX: 0,
        pointerY: 0,
        deltaSeconds: 1 / 60,
        enterSeconds: 1,
        hoverAnimation: {},
        ui: { pointIn: () => false, chip: vi.fn(), button: vi.fn() },
        entranceEase: (value) => value,
      }),
    });

    expect(host.screenRectangle()).toEqual({ x: -10, y: -20, w: 100, h: 100 });
    expect(host.entryFocus(undefined)).toBe(0);
    host.render();
    host.handleUi();
    host.drawButtons();
    expect(screenDraw).toHaveBeenCalledOnce();
  });
  it("builds frame and UI ports once and the per-frame button layer every frame", () => {
    const pipeline = vi.spyOn(pipelineModule, "renderPresentationFrame").mockImplementation(() => undefined);
    vi.spyOn(buttonLayerModule, "renderButtonLayer").mockImplementation(() => undefined);
    vi.spyOn(uiRuntimeModule, "handleUiRuntimeFrame").mockImplementation(() => undefined);
    const framePorts = vi.fn(() => ({}) as never);
    const uiPorts = vi.fn(() => ({ buttons: () => [] }) as never);
    const buttonLayer = vi.fn(() => ({}) as never);
    try {
      const host = createLivePresentationHost({
        dimensions: { width: 80, height: 60, overscan: () => ({ x: 0, y: 0 }) },
        framePorts,
        uiPorts,
        buttonLayer,
      });
      for (let frame = 0; frame < 3; frame += 1) {
        host.render();
        host.handleUi();
        host.drawButtons();
        host.entryFocus(undefined);
      }
      expect(framePorts).toHaveBeenCalledOnce();
      expect(uiPorts).toHaveBeenCalledOnce();
      expect(buttonLayer).toHaveBeenCalledTimes(3);
      expect(new Set(pipeline.mock.calls.map(([ports]) => ports)).size).toBe(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("writes DOM hint display only when it changes", () => {
    let ports: ReturnType<Parameters<typeof createLivePresentationHost>[0]["framePorts"]> | undefined;
    vi.spyOn(hostModule, "createLivePresentationHost").mockImplementation((options) => {
      ports = options.framePorts({ screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }) } as never);
      return {} as never;
    });
    const writes: string[] = [];
    const element = (name: string) => {
      let display = "";
      return {
        style: {
          get display() {
            return display;
          },
          set display(value: string) {
            writes.push(`${name}=${value}`);
            display = value;
          },
        },
      };
    };
    try {
      compositionModule.createLivePresentationFrameHost(
        { bossIntroActive: () => false } as never,
        {
          capturePolicy: () => ({ ui: "include", pointerLock: "include" }),
          controlHintContext: () => ({ runSeconds: 0, completedRuns: 0 }),
          touchActive: () => false,
          input: { mode: "mouse" },
          pointerLocked: () => false,
          cinema: { active: false },
          lockHint: element("lock"),
          inputHint: element("input"),
          fullscreenButton: element("fullscreen"),
          fullscreenAvailable: () => true,
        } as never,
      );
      if (!ports) throw new Error("real frame composition did not produce ports");
      ports.updateDomHints("playing");
      ports.updateDomHints("playing");
      ports.updateDomHints("menu");
      ports.updateDomHints("menu");
      expect(writes).toEqual([
        "lock=block",
        "input=block",
        "fullscreen=none",
        "lock=none",
        "input=none",
        "fullscreen=",
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
