import { describe, expect, it } from "vitest";
import { createLegacyGamepad } from "../../src/input/legacy-gamepad";
import { createLegacyInput } from "../../src/input/legacy-input";
import type { LegacyInputConfig } from "../../src/input/legacy-input-contracts";
import { SemanticInputBuffer } from "../../src/input/semantic-buffer";

const CONFIG: LegacyInputConfig = { view: { w: 1_600, h: 900 }, touch: {} };

function createInput(semantic = new SemanticInputBuffer()) {
  return createLegacyInput({
    config: CONFIG,
    safeArea: { l: 0, r: 0, t: 0, b: 0 },
    overscan: { x: 0, y: 0 },
    window: new EventTarget() as Window,
    document: new EventTarget() as Document,
    navigator: { vibrate: () => true },
    performance,
    semantic,
  });
}

function button(pressed = false, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function gamepad(buttons: readonly GamepadButton[], axes: readonly number[] = [0, 0, 0, 0]): Gamepad {
  return {
    axes,
    buttons,
    connected: true,
    id: "Xbox Test Controller",
    index: 0,
    mapping: "standard",
    timestamp: 1,
    vibrationActuator: {
      playEffect: () => Promise.resolve("complete"),
      reset: () => Promise.resolve("complete"),
    },
  };
}

function controllerEvent(type: string, activeGamepad: Gamepad): Event {
  const event = new Event(type);
  Object.defineProperty(event, "gamepad", { value: activeGamepad });
  return event;
}

describe("legacy input adapter", () => {
  it("records tether edges once and exposes additive mouse/controller hold state", () => {
    const semantic = new SemanticInputBuffer();
    const input = createInput(semantic);
    semantic.startRecording();

    input.lmb = true;
    input.setPadTether(true);
    input.setPadTether(true);
    expect(input.tetherHeld).toBe(true);
    input.setPadTether(false);
    expect(input.tetherHeld).toBe(true);

    expect(semantic.drain(4).map((entry) => entry.command)).toEqual([
      { type: "weapon", intent: "primary", phase: "pressed" },
      { type: "weapon", intent: "primary", phase: "released" },
    ]);
  });

  it("consolidates UI edges and consumes wheel input without losing gamepad scroll", () => {
    const input = createInput();
    input.pressed.add("KeyQ");
    input._uiTabNext = true;
    input.padScrollX = 3;
    input.padScrollY = 8;
    input.wheel = 5;

    input.updateUI();
    expect(input.ui).toMatchObject({ tabPrev: true, tabNext: true, scrollX: 3, scrollY: 8 });
    expect(input.takeUIScroll()).toEqual({ x: 3, y: 13, source: "mouse" });
    expect(input.takeUIScroll()).toEqual({ x: 3, y: 8, source: "gamepad" });
    expect(input._uiTabNext).toBe(false);
  });
});

describe("legacy gamepad adapter", () => {
  it("keeps the five shipped presets and safely falls back to default", () => {
    const input = createInput();
    const windowTarget = new EventTarget();
    const { PAD, PAD_PRESETS } = createLegacyGamepad({
      config: CONFIG,
      input,
      window: windowTarget as Window,
      navigator: { getGamepads: () => [] },
      semantic: input.semantic,
    });

    expect(Object.keys(PAD_PRESETS)).toEqual(["default", "standard", "tear", "classic", "split"]);
    expect(PAD.setPreset("tear")).toBe("tear");
    expect(PAD.bindingLabel("jump")).toBe("LB");
    expect(PAD.setPreset("not-a-preset")).toBe("default");
  });

  it("honors an explicit non-default glyph family independently of detected hardware", () => {
    const input = createInput();
    const activeGamepad = gamepad(Array.from({ length: 16 }, () => button()));
    const { PAD } = createLegacyGamepad({
      config: CONFIG,
      input,
      window: new EventTarget() as Window,
      navigator: { getGamepads: () => [activeGamepad] },
      semantic: input.semantic,
    });
    PAD.index = 0;

    const padConfig = CONFIG.pad;
    if (padConfig === undefined) throw new Error("gamepad config fixture missing");
    padConfig.glyphStyle = "playstation";
    expect(PAD.glyph(0)).toBe("✕");
    expect(PAD.bindingLabel("tether")).toBe("L1");

    padConfig.glyphStyle = "generic";
    expect(PAD.glyph(0)).toBe("South");
    expect(PAD.glyph(9)).toBe("Start");
  });

  it("maps movement, action and aim channels, then releases them on disconnect", () => {
    const semantic = new SemanticInputBuffer();
    semantic.startRecording();
    const input = createInput(semantic);
    const listeners = new Map<string, EventListener>();
    const windowPort = {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === "function") listeners.set(type, listener);
      },
    } as Window;
    const buttons = Array.from({ length: 16 }, () => button());
    buttons[0] = button(true);
    const activeGamepad = gamepad(buttons, [0.8, 0, 0.7, 0]);
    const navigatorPort = { getGamepads: () => [activeGamepad] };
    const { PAD } = createLegacyGamepad({ config: CONFIG, input, window: windowPort, navigator: navigatorPort, semantic });

    listeners.get("gamepadconnected")?.(controllerEvent("gamepadconnected", activeGamepad));
    PAD.poll(1 / 60, false);
    expect(input.right()).toBe(true);
    expect(input.tJump).toBe(true);
    expect(input.stickAim?.x).toBeGreaterThan(0);
    expect(semantic.drain(10).map((entry) => entry.command)).toEqual(expect.arrayContaining([
      { type: "move", x: 1_000, y: 0 },
      { type: "jump", phase: "pressed" },
    ]));

    input.setPadTether(true);
    listeners.get("gamepaddisconnected")?.(controllerEvent("gamepaddisconnected", activeGamepad));
    expect(input.right()).toBe(false);
    expect(input.padTether).toBe(false);
    expect(input.stickAim).toBeNull();
  });
});
