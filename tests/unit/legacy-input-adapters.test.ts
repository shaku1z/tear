import { describe, expect, it } from "vitest";
import { createBrowserGamepad } from "../../src/input/browser-gamepad";
import { createBrowserInput } from "../../src/input/browser-input";
import type { BrowserInputConfig } from "../../src/input/browser-input-contracts";
import { SemanticInputBuffer } from "../../src/input/semantic-buffer";

const CONFIG: BrowserInputConfig = { view: { w: 1_600, h: 900 }, touch: {} };

function createInput(semantic = new SemanticInputBuffer(), windowTarget = new EventTarget(), config = CONFIG) {
  return createBrowserInput({
    config,
    safeArea: { l: 0, r: 0, t: 0, b: 0 },
    overscan: { x: 0, y: 0 },
    window: windowTarget as Window,
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

function controllerFixture() {
  const config: BrowserInputConfig = { view: { w: 1_600, h: 900 }, touch: {} };
  const windowTarget = new EventTarget();
  const input = createInput(new SemanticInputBuffer(), windowTarget, config);
  input.init(new EventTarget() as HTMLCanvasElement, () => undefined);
  const buttons = Array.from({ length: 16 }, () => button());
  const axes = [0, 0, 0, 0];
  const activeGamepad = gamepad(buttons, axes);
  const { PAD } = createBrowserGamepad({
    config,
    input,
    window: windowTarget as Window,
    navigator: { getGamepads: () => [activeGamepad] },
    semantic: input.semantic,
  });
  windowTarget.dispatchEvent(controllerEvent("gamepadconnected", activeGamepad));
  const settings = config.pad;
  if (settings === undefined) throw new Error("controller settings missing");
  return { input, PAD, buttons, axes, windowTarget, settings };
}

describe("legacy input adapter", () => {
  it("requests capture only during play and consumes raw movement while pointer lock owns the canvas", () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget() as Document;
    const semantic = new SemanticInputBuffer();
    const input = createBrowserInput({
      config: CONFIG,
      safeArea: { l: 0, r: 0, t: 0, b: 0 },
      overscan: { x: 0, y: 0 },
      window: windowTarget as Window,
      document: documentTarget,
      navigator: { vibrate: () => true },
      performance,
      semantic,
    });
    let lockRequests = 0;
    const canvas = new EventTarget() as HTMLCanvasElement;
    Object.defineProperties(canvas, {
      getBoundingClientRect: { value: () => ({ left: 0, top: 0, width: 1_600, height: 900 }) },
    });
    let pointerLockElement: Element | null = null;
    Object.defineProperty(documentTarget, "pointerLockElement", { get: () => pointerLockElement });
    input.init(canvas, () => {
      lockRequests += 1;
    });
    const pointerEvent = (type: string, values: Readonly<Record<string, number>>): Event => {
      const event = new Event(type);
      for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
      return event;
    };

    canvas.dispatchEvent(pointerEvent("click", { clientX: 800, clientY: 450 }));
    expect(lockRequests).toBe(0);
    input.allowLock = true;
    canvas.dispatchEvent(pointerEvent("click", { clientX: 800, clientY: 450 }));
    expect(lockRequests).toBe(1);

    pointerLockElement = canvas;
    documentTarget.dispatchEvent(new Event("pointerlockchange"));
    canvas.dispatchEvent(pointerEvent("mousemove", { clientX: 800, clientY: 450, movementX: 12, movementY: -4 }));
    expect(input.consumeDelta()).toEqual({ x: 12, y: -4 });
    expect(input.consumeDelta()).toEqual({ x: 0, y: 0 });

    pointerLockElement = null;
    documentTarget.dispatchEvent(new Event("pointerlockchange"));
    expect(input.locked).toBe(false);
  });

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
    input.uiMode = true;
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

/** A keyboard event in the node test environment, which has Event but no KeyboardEvent. */
function keyEvent(type: "keydown" | "keyup", code: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event;
}

describe("keyboard throw and tether keys", () => {
  function keyboardFixture() {
    const semantic = new SemanticInputBuffer();
    const windowTarget = new EventTarget();
    const canvas = new EventTarget() as HTMLCanvasElement;
    const input = createInput(semantic, windowTarget);
    input.init(canvas, () => undefined);
    semantic.startRecording();
    const mouse = (type: string, button: number) => {
      const event = new Event(type);
      Object.defineProperty(event, "button", { value: button });
      (type === "mouseup" ? windowTarget : canvas).dispatchEvent(event);
    };
    const commands = () => semantic.drain(1).map((entry) => entry.command);
    return { input, windowTarget, mouse, commands };
  }

  it("E throws exactly like the right mouse button, once per press despite key repeat", () => {
    const keys = keyboardFixture();
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyE"));
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyE")); // auto-repeat
    expect(keys.input.consumeThrow()).toBe(true);
    expect(keys.input.consumeThrow()).toBe(false);
    const fromKey = keys.commands();
    keys.windowTarget.dispatchEvent(keyEvent("keyup", "KeyE"));
    keys.mouse("mousedown", 2);
    expect(keys.input.consumeThrow()).toBe(true);
    expect(fromKey).toEqual(keys.commands());
    expect(fromKey).toEqual([{ type: "weapon", intent: "throw", phase: "pressed" }]);
  });

  it("Q holds the tether exactly like the left mouse button, and blur lets it go", () => {
    const keys = keyboardFixture();
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ"));
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ")); // auto-repeat
    expect(keys.input.tetherHeld).toBe(true);
    keys.windowTarget.dispatchEvent(keyEvent("keyup", "KeyQ"));
    expect(keys.input.tetherHeld).toBe(false);
    const fromKey = keys.commands();
    keys.mouse("mousedown", 0);
    keys.mouse("mouseup", 0);
    expect(fromKey).toEqual(keys.commands());
    expect(fromKey).toEqual([
      { type: "weapon", intent: "primary", phase: "pressed" },
      { type: "weapon", intent: "primary", phase: "released" },
    ]);

    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ"));
    keys.windowTarget.dispatchEvent(new Event("blur"));
    expect(keys.input.tetherHeld).toBe(false);
    expect(keys.input.held.size).toBe(0);
  });

  it("keeps the mouse tether held when the tether key is let go", () => {
    const keys = keyboardFixture();
    keys.mouse("mousedown", 0);
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ"));
    keys.windowTarget.dispatchEvent(keyEvent("keyup", "KeyQ"));
    expect(keys.input.tetherHeld).toBe(true);
  });

  it("never turns Q or E into a menu tab step during play", () => {
    const keys = keyboardFixture();
    keys.input.uiMode = false;
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ"));
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyE"));
    keys.input.updateUI();
    expect(keys.input.ui.tabPrev).toBe(false);
    expect(keys.input.ui.tabNext).toBe(false);
    keys.input.endFrame();
    keys.input.held.clear();
    keys.input.uiMode = true;
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyE"));
    keys.input.updateUI();
    expect(keys.input.ui.tabNext).toBe(true);
  });

  it("lets no throw or tether from pause-menu tab steps reach the run, even with Q held across resume", () => {
    const keys = keyboardFixture();
    keys.input.uiMode = true; // the pause menu owns input
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyE"));
    keys.windowTarget.dispatchEvent(keyEvent("keyup", "KeyE"));
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ")); // held through the resume
    keys.input.updateUI();
    expect(keys.input.ui).toMatchObject({ tabPrev: true, tabNext: true });
    keys.input.endFrame(true); // a frame that keeps simulation edges for the next tick

    keys.input.uiMode = false; // resumed
    expect(keys.input.consumeThrow()).toBe(false);
    expect(keys.input.tetherHeld).toBe(false);
    expect(keys.commands().filter((command) => command.type === "weapon")).toEqual([]);

    // Letting Q go and pressing it again in play tethers as usual.
    keys.windowTarget.dispatchEvent(keyEvent("keyup", "KeyQ"));
    keys.windowTarget.dispatchEvent(keyEvent("keydown", "KeyQ"));
    expect(keys.input.tetherHeld).toBe(true);
  });
});

describe("legacy gamepad adapter", () => {
  it.each(["hold", "toggle"] as const)(
    "requires a new tether press after switching presets through a menu in %s mode",
    (mode) => {
      const { input, PAD, buttons, settings } = controllerFixture();
      settings.tetherMode = mode;
      buttons[7] = button(true);
      PAD.poll(1 / 120, true);
      input.endFrame();
      PAD.setPreset("standard");
      PAD.poll(1 / 120, true);
      PAD.poll(1 / 120, true);
      PAD.poll(1 / 120, false);
      expect(input.padTether).toBe(false);
      expect(input.tDash).toBe(false);
      expect(input.rmb).toBe(false);
      buttons[7] = button();
      PAD.poll(1 / 120, false);
      buttons[7] = button(true);
      PAD.poll(1 / 120, false);
      expect(input.padTether).toBe(true);
    },
  );

  it.each([false, true])("clears a toggled tether across blur with its button still held = %s", (stillHeld) => {
    const { input, PAD, buttons, windowTarget, settings } = controllerFixture();
    settings.tetherMode = "toggle";
    buttons[4] = button(true);
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(true);
    if (!stillHeld) {
      buttons[4] = button();
      PAD.poll(1 / 120, false);
    }
    input.lmb = true;
    expect(input.locked).toBe(false);
    windowTarget.dispatchEvent(new Event("blur"));
    expect(input.padTether).toBe(false);
    expect(input.tetherHeld).toBe(true);
    PAD.poll(1 / 120, false);
    windowTarget.dispatchEvent(new Event("focus"));
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(false);
    input.lmb = false;
    expect(input.tetherHeld).toBe(false);
    buttons[4] = button();
    PAD.poll(1 / 120, false);
    buttons[4] = button(true);
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(true);
  });

  it("preserves ordinary hold tether behavior after a blur requires release and a new press", () => {
    const { input, PAD, buttons, windowTarget } = controllerFixture();
    buttons[4] = button(true);
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(true);
    windowTarget.dispatchEvent(new Event("blur"));
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(false);
    buttons[4] = button();
    PAD.poll(1 / 120, false);
    buttons[4] = button(true);
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(true);
    buttons[4] = button();
    PAD.poll(1 / 120, false);
    expect(input.padTether).toBe(false);
  });

  it("navigates immediately on a direction change, then repeats normally and resets at neutral", () => {
    const { input, PAD, axes, settings } = controllerFixture();
    axes[0] = 0.9;
    PAD.poll(0.01, true);
    expect([...input.pressed]).toEqual(["ArrowRight"]);
    input.endFrame();
    axes[0] = 0;
    axes[1] = 0.9;
    PAD.poll(0.01, true);
    expect([...input.pressed]).toEqual(["ArrowDown"]);
    input.endFrame();
    PAD.poll(settings.menuRepeat / 2, true);
    expect([...input.pressed]).toEqual([]);
    PAD.poll(settings.menuRepeat / 2 + 0.001, true);
    expect([...input.pressed]).toEqual(["ArrowDown"]);
    input.endFrame();
    axes[1] = 0;
    PAD.poll(0.01, true);
    axes[0] = 0.9;
    axes[1] = -0.7;
    PAD.poll(0.01, true);
    expect([...input.pressed]).toEqual(["ArrowRight"]);
    input.endFrame();
    axes[0] = 0.7;
    axes[1] = -0.9;
    PAD.poll(0.01, true);
    expect([...input.pressed]).toEqual(["ArrowUp"]);
  });

  it.each([6, 7])("claims gamepad ownership for analog trigger %i at the existing action threshold", (trigger) => {
    const { input, PAD, buttons, settings } = controllerFixture();
    buttons[trigger] = button(false, settings.triggerThreshold - 0.001);
    PAD.poll(1 / 120, false);
    expect(input.mode).toBe("mouse");
    expect(input.tDash).toBe(false);
    expect(input.rmb).toBe(false);
    buttons[trigger] = button(false, settings.triggerThreshold);
    PAD.poll(1 / 120, false);
    expect(trigger === 7 ? input.tDash : input.rmb).toBe(true);
    expect(input.mode).toBe("gamepad");
    expect(PAD.active).toBe(true);
  });

  it("keeps the five shipped presets and safely falls back to default", () => {
    const input = createInput();
    const windowTarget = new EventTarget();
    const { PAD, PAD_PRESETS } = createBrowserGamepad({
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
    const { PAD } = createBrowserGamepad({
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
    const { PAD } = createBrowserGamepad({
      config: CONFIG,
      input,
      window: windowPort,
      navigator: navigatorPort,
      semantic,
    });

    listeners.get("gamepadconnected")?.(controllerEvent("gamepadconnected", activeGamepad));
    PAD.poll(1 / 60, false);
    expect(input.right()).toBe(true);
    expect(input.tJump).toBe(true);
    expect(input.stickAim?.x).toBeGreaterThan(0);
    expect(semantic.drain(10).map((entry) => entry.command)).toEqual(
      expect.arrayContaining([
        { type: "move", x: 1_000, y: 0 },
        { type: "jump", phase: "pressed" },
      ]),
    );

    input.setPadTether(true);
    listeners.get("gamepaddisconnected")?.(controllerEvent("gamepaddisconnected", activeGamepad));
    expect(input.right()).toBe(false);
    expect(input.padTether).toBe(false);
    expect(input.stickAim).toBeNull();
  });

  it("keeps the aim with the device that last aimed: a released stick holds it until the mouse moves", () => {
    const { input, PAD, axes, windowTarget } = controllerFixture();
    const mouseTo = (clientX: number, clientY: number) => {
      const event = new Event("mousemove");
      Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } });
      windowTarget.dispatchEvent(event);
    };
    mouseTo(40, 450);
    expect(input.aimDevice).toBe("mouse");
    expect(input.aimIsLive()).toBe(true);

    axes[2] = 0.9;
    PAD.poll(1 / 60, false);
    expect(input.aimDevice).toBe("gamepad");
    expect(input.aimIsLive()).toBe(true);

    axes[2] = 0;
    PAD.poll(1 / 60, false);
    expect(input.aimDevice).toBe("gamepad");
    expect(input.aimIsLive()).toBe(false);

    mouseTo(42, 452);
    expect(input.aimIsLive()).toBe(false);
    mouseTo(120, 452);
    expect(input.aimDevice).toBe("mouse");
    expect(input.aimIsLive()).toBe(true);
  });

  it("maps Square/X to the semantic primary-context edge in menus", () => {
    const input = createInput();
    const listeners = new Map<string, EventListener>();
    const windowPort = {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === "function") listeners.set(type, listener);
      },
    } as Window;
    const buttons = Array.from({ length: 16 }, () => button());
    buttons[2] = button(true);
    const activeGamepad = gamepad(buttons);
    const { PAD } = createBrowserGamepad({
      config: CONFIG,
      input,
      window: windowPort,
      navigator: { getGamepads: () => [activeGamepad] },
      semantic: input.semantic,
    });
    listeners.get("gamepadconnected")?.(controllerEvent("gamepadconnected", activeGamepad));

    PAD.poll(1 / 120, true);
    input.updateUI();

    expect(input.ui.context1).toBe(true);
    expect(input.pressed.has("Context1")).toBe(true);
    expect(input.confirmPressed()).toBe(false);
  });
});
