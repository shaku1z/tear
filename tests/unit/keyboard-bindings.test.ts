import { describe, expect, it } from "vitest";
import {
  KEYBOARD_ACTIONS,
  KEYBOARD_BINDINGS,
  KEYBOARD_SCREENS,
  anyKeyIn,
  keyCodeLabel,
  keyCodes,
  keyboardCollisions,
  keyboardLabel,
  rangeKeyIn,
} from "../../src/domain/keyboard-bindings";
import { PROMPT_ACTIONS, promptLabel } from "../../src/domain/prompt-vocabulary";

describe("keyboard binding table", () => {
  it("never gives one key two meanings on one screen, except the declared up-is-jump overlap", () => {
    expect(keyboardCollisions()).toEqual([]);
  });

  it("refuses the Playground menu on E, where E throws, and accepts it on Tab", () => {
    const onE = { ...KEYBOARD_BINDINGS, "playground-menu": { codes: ["KeyE"], context: "playground" as const } };
    expect(keyboardCollisions(onE)).toContainEqual({
      screen: "playground",
      code: "KeyE",
      actions: ["throw", "playground-menu"],
    });
    expect(KEYBOARD_BINDINGS["playground-menu"]).toEqual({ codes: ["Tab"], context: "playground" });
  });

  it("binds every action to at least one key, each listed once, live on at least one screen", () => {
    const liveContexts = new Set(Object.values(KEYBOARD_SCREENS).flat());
    for (const action of KEYBOARD_ACTIONS) {
      const { codes, context } = KEYBOARD_BINDINGS[action];
      expect(codes.length, action).toBeGreaterThan(0);
      expect(new Set(codes).size, action).toBe(codes.length);
      expect(liveContexts.has(context), action).toBe(true);
    }
  });

  it("puts throw on E, tether on Q and fullscreen on F, and keeps the Playground menu off E", () => {
    expect(KEYBOARD_BINDINGS.throw.codes).toEqual(["KeyE"]);
    expect(KEYBOARD_BINDINGS.tether.codes).toEqual(["KeyQ"]);
    expect(KEYBOARD_BINDINGS.fullscreen.codes).toEqual(["KeyF"]);
    expect(KEYBOARD_BINDINGS["playground-menu"].codes).toEqual(["Tab"]);
    expect(KEYBOARD_BINDINGS.fullscreen.context).toBe("everywhere");
  });

  it("names keys by their QWERTY legend", () => {
    expect(keyCodeLabel("KeyE")).toBe("E");
    expect(keyCodeLabel("Digit7")).toBe("7");
    expect(keyCodeLabel("ShiftRight")).toBe("SHIFT");
    expect(keyCodeLabel("Escape")).toBe("ESC");
    expect(keyboardLabel("jump")).toBe("W / SPACE");
    expect(keyboardLabel("pause")).toBe("ESC / P");
    expect(keyboardLabel("quick-spawn")).toBe("1–8");
    expect(keyboardLabel("confirm")).toBe("SPACE");
  });

  it("names only bound keys, and keeps Enter first for the pad's confirm", () => {
    for (const action of KEYBOARD_ACTIONS)
      for (const code of KEYBOARD_BINDINGS[action].named ?? []) expect(keyCodes(action), action).toContain(code);
    expect(keyCodes("confirm")[0]).toBe("Enter");
  });

  it("reads held and pressed sets through the table, ranges in order", () => {
    expect(anyKeyIn(new Set(["ShiftRight"]), "dash")).toBe(true);
    expect(anyKeyIn(new Set(["KeyQ"]), "throw")).toBe(false);
    expect(rangeKeyIn(new Set(["Digit3"]), "choose")).toBe(2);
    expect(rangeKeyIn(new Set(["Digit4"]), "choose", 3)).toBeNull();
  });
});

describe("prompt vocabulary keyboard column", () => {
  it("gives every prompt action a keyboard label", () => {
    for (const action of PROMPT_ACTIONS) expect(promptLabel(action, "keyboard"), action).toMatch(/\S/u);
  });

  it("words the keyboard and mouse twins together", () => {
    expect(promptLabel("throw", "keyboard")).toBe("E / RIGHT CLICK");
    expect(promptLabel("recall", "keyboard")).toBe("E / RIGHT CLICK");
    expect(promptLabel("tether", "keyboard")).toBe("Q / LEFT CLICK");
    expect(promptLabel("fullscreen", "keyboard")).toBe("F");
    expect(promptLabel("playground-menu", "keyboard")).toBe("TAB");
    expect(promptLabel("dash-down", "keyboard")).toBe("S + SHIFT");
    expect(promptLabel("drop", "keyboard")).toBe("HOLD S");
  });

  it("has no fullscreen prompt on touch or controller", () => {
    expect(promptLabel("fullscreen", "touch")).toBeNull();
    expect(promptLabel("fullscreen", "gamepad")).toBeNull();
  });
});
