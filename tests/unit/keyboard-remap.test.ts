import { afterEach, describe, expect, it } from "vitest";

import {
  KEYBOARD_DEFAULTS,
  keyboardBindings,
  keyboardCollisions,
  keyboardLabel,
} from "../../src/domain/keyboard-bindings";
import {
  REBINDABLE_ACTIONS,
  applyKeyboardRemap,
  rebindKey,
  remappedBindings,
  sanitizeKeyboardRemap,
} from "../../src/domain/keyboard-remap";
import { promptLabel } from "../../src/domain/prompt-vocabulary";
import { KEYBOARD_SETTINGS_VERSION, readKeyboardSettings } from "../../src/persistence/keyboard-settings";
import { SettingsController } from "../../src/app/screens/settings-controller";
import { captureRebindKey } from "../../src/app/screens/settings-rename-adapters-runtime";
import { buildSettingsSections, rebindNote } from "../../src/presentation/settings-snapshots";

afterEach(() => {
  applyKeyboardRemap({});
});

describe("keyboard remap", () => {
  it("moves the primary key and keeps the action's other default keys", () => {
    const table = remappedBindings({ jump: "KeyL", "move-left": "KeyJ" });
    expect(table.jump).toEqual({
      codes: ["KeyL", "Space", "ArrowUp"],
      context: "play",
      named: ["KeyL", "Space", "ArrowUp"],
    });
    expect(table["move-left"].codes).toEqual(["KeyJ", "ArrowLeft"]);
    expect(table.dash).toBe(KEYBOARD_DEFAULTS.dash);
    expect(keyboardCollisions(table)).toEqual([]);
  });

  it("assigns a free key, swaps with another action's key, and refuses a key in use", () => {
    expect(rebindKey({}, "throw", "KeyR")).toEqual({ kind: "assigned", remap: { throw: "KeyR" } });
    expect(rebindKey({}, "throw", "KeyE")).toEqual({ kind: "unchanged", remap: {} });
    expect(rebindKey({}, "dash", "KeyE")).toEqual({
      kind: "swapped",
      remap: { dash: "KeyE", throw: "ShiftLeft" },
      with: "throw",
    });
    // Swapping back to the defaults saves nothing.
    expect(rebindKey({ dash: "KeyE", throw: "ShiftLeft" }, "dash", "ShiftLeft").remap).toEqual({});
    expect(rebindKey({}, "throw", "KeyF")).toMatchObject({ kind: "refused", remap: {}, by: "fullscreen" });
    expect(rebindKey({}, "throw", "Escape")).toMatchObject({ kind: "refused", by: "pause" });
    expect(rebindKey({}, "throw", "Tab")).toMatchObject({ kind: "refused", by: "playground-menu" });
    expect(rebindKey({}, "jump", "KeyK")).toMatchObject({ kind: "refused", by: "clear-enemies" });
    expect(rebindKey({}, "jump", "ArrowLeft")).toMatchObject({ kind: "refused", by: "move-left" });
    expect(rebindKey({}, "jump", "not a key")).toMatchObject({ kind: "refused", by: "jump" });
  });

  it("never lets a rebind give one key two meanings on a screen", () => {
    const codes = ["KeyE", "KeyQ", "KeyW", "KeyA", "Space", "ShiftLeft", "KeyF", "Tab", "KeyR", "Digit1", "ArrowUp"];
    for (const action of REBINDABLE_ACTIONS)
      for (const code of codes) {
        const outcome = rebindKey({}, action, code);
        expect(keyboardCollisions(remappedBindings(outcome.remap)), `${action} ← ${code}`).toEqual([]);
      }
  });

  it("makes the remap live for input and every prompt, and a reset restores the defaults", () => {
    applyKeyboardRemap({ throw: "KeyR", jump: "KeyL" });
    expect(keyboardBindings().throw.codes).toEqual(["KeyR"]);
    expect(promptLabel("throw", "keyboard")).toBe("R / RIGHT CLICK");
    expect(keyboardLabel("jump")).toBe("L / SPACE / ↑");
    applyKeyboardRemap({});
    expect(keyboardBindings()).toBe(KEYBOARD_DEFAULTS);
    expect(promptLabel("throw", "keyboard")).toBe("E / RIGHT CLICK");
  });

  it("reads a stored remap as untrusted", () => {
    expect(sanitizeKeyboardRemap({ jump: "KeyL", nope: "KeyL", dash: 5, throw: "x y", tether: "KeyQ" })).toEqual({
      jump: "KeyL",
    });
    expect(sanitizeKeyboardRemap({ throw: "KeyF" })).toEqual({});
    expect(sanitizeKeyboardRemap(["KeyL"])).toEqual({});
    expect(sanitizeKeyboardRemap(null)).toEqual({});
  });
});

describe("saved keyboard settings", () => {
  it("reads a save from before rebinding as the defaults", () => {
    expect(readKeyboardSettings(undefined)).toEqual({
      stored: { version: KEYBOARD_SETTINGS_VERSION, primary: {} },
      remap: {},
      future: false,
    });
    expect(readKeyboardSettings("KeyL").remap).toEqual({});
  });

  it("cleans version 1 and keeps a newer version untouched", () => {
    const read = readKeyboardSettings({ version: 1, primary: { jump: "KeyL", nope: "KeyL" }, extra: true });
    expect(read).toEqual({ stored: { version: 1, primary: { jump: "KeyL" } }, remap: { jump: "KeyL" }, future: false });
    expect(readKeyboardSettings(JSON.parse(JSON.stringify(read.stored)))).toEqual(read);
    const newer = { version: 2, slots: { jump: ["KeyL", "KeyL"] } };
    expect(readKeyboardSettings(newer)).toEqual({ stored: newer, remap: {}, future: true });
  });

  it("saves a rebind, loads it back live, and resets the keys alone", () => {
    const slot = new Map<string, string>();
    const open = () =>
      new SettingsController({
        config: {
          blade: { aimSensitivity: 1 },
          pad: {
            deadL: 0.22,
            deadR: 0.22,
            aimSens: 1,
            tetherMode: "hold",
            doubleTapDash: false,
            vibration: "medium",
            glyphStyle: "auto",
          },
        },
        accessibility: { flashScale: 1, motionScale: 1, reducedMotion: false, highContrast: false },
        graphics: { low: false },
        input: { forceMode: "auto", touchAimMode: "stick" },
        gamepad: { setPreset: (value: string) => value },
        audio: { migrateSettings: (value: Record<string, unknown>) => value, applySettings: () => undefined },
        store: { get: (key) => slot.get(key) ?? null, set: (key, value) => slot.set(key, value) },
        navigator: { hardwareConcurrency: 8 },
        matchMedia: () => ({ matches: false }),
      });
    const first = open();
    expect(first.rebindKey("throw", "KeyF").kind).toBe("refused");
    expect(slot.size).toBe(0);
    expect(first.rebindKey("throw", "KeyR").kind).toBe("assigned");
    first.step("masterVolume", -1);
    applyKeyboardRemap({});
    const second = open();
    expect(second.settings.keyboard).toEqual({ version: 1, primary: { throw: "KeyR" } });
    expect(keyboardBindings().throw.codes).toEqual(["KeyR"]);
    second.resetKeys();
    expect(keyboardBindings()).toBe(KEYBOARD_DEFAULTS);
    expect(second.settings.masterVolume).toBe(0.5);
    const saved: unknown = JSON.parse(slot.get("tear_settings") ?? "{}");
    expect((saved as { keyboard?: unknown }).keyboard).toEqual({ version: 1, primary: {} });
  });
});

describe("Controls tab keyboard rows", () => {
  const settings = {
    masterVolume: 1,
    musicVolume: 1,
    sfxVolume: 1,
    interfaceVolume: 1,
    masterMuted: false,
    musicMuted: false,
    sfxMuted: false,
    interfaceMuted: false,
    gfx: "auto",
    padPreset: "default",
    tetherMode: "hold",
    sens: 1,
    controls: "auto",
    shake: 1,
  };
  const environment = (touch: boolean, listening: "jump" | null = null) => ({
    lowGraphics: false,
    touch,
    installAvailable: false,
    update: { ready: false, applying: false },
    buildLabel: "test",
    presets: { default: { name: "DEFAULT", tag: "", line: "", map: "" } },
    keyboard: { listening, note: { row: "rebind:dash", text: "Swapped: Throw / recall now uses the old key." } },
  });

  it("lists every rebindable action with its live key, desktop only", () => {
    applyKeyboardRemap({ jump: "KeyL" });
    const keyboard = buildSettingsSections("controls", settings, environment(false))[1];
    expect(keyboard?.label).toBe("KEYBOARD");
    expect(keyboard?.rows.map((row) => row.key)).toEqual([
      ...REBINDABLE_ACTIONS.map((action) => `rebind:${action}`),
      "resetKeys",
    ]);
    expect(keyboard?.rows.find((row) => row.key === "rebind:jump")?.value).toBe("L / SPACE / ↑");
    expect(keyboard?.rows.find((row) => row.key === "rebind:dash")?.note).toMatch(/Swapped/u);
    expect(buildSettingsSections("controls", settings, environment(true))).toHaveLength(1);
    const listening = buildSettingsSections("controls", settings, environment(false, "jump"))[1];
    expect(listening?.rows.find((row) => row.key === "rebind:jump")?.value).toMatch(/PRESS A KEY/u);
  });

  it("words a refusal and a swap", () => {
    expect(rebindNote("throw", rebindKey({}, "throw", "KeyF"), "KeyF")).toBe(
      "F already means fullscreen. Pick another key.",
    );
    expect(rebindNote("dash", rebindKey({}, "dash", "KeyE"), "KeyE")).toBe(
      "Swapped: Throw / recall now uses the old key.",
    );
    expect(rebindNote("throw", rebindKey({}, "throw", "KeyR"), "KeyR")).toBeNull();
  });
});

describe("listening for a key", () => {
  const input = (mode: "keyboard" | "gamepad" | "mouse", codes: readonly string[], padBack = false) => ({
    mode,
    pressed: new Set(codes),
    padBack,
    ui: {
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: true,
      back: false,
      tabPrev: true,
      tabNext: false,
      pageUp: false,
      pageDown: false,
      scrollX: 0,
      scrollY: 0,
      context1: false,
      context2: false,
    },
  });

  it("takes the key and consumes the frame, so the menu does not act on it", () => {
    const frame = input("keyboard", ["KeyQ"]);
    expect(captureRebindKey(frame)).toEqual({ kind: "key", code: "KeyQ" });
    expect(frame.pressed.size).toBe(0);
    expect(frame.ui.tabPrev).toBe(false);
    expect(frame.ui.confirm).toBe(false);
  });

  it("waits with no input, and cancels on Escape or controller input", () => {
    expect(captureRebindKey(input("keyboard", []))).toEqual({ kind: "none" });
    expect(captureRebindKey(input("keyboard", ["Escape"]))).toEqual({ kind: "cancel" });
    expect(captureRebindKey(input("gamepad", ["ArrowDown"]))).toEqual({ kind: "cancel" });
    expect(captureRebindKey(input("gamepad", [], true))).toEqual({ kind: "cancel" });
  });
});
