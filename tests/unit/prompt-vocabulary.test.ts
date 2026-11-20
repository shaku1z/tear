import { describe, expect, it } from "vitest";
import {
  PROMPT_ACTIONS,
  promptAvailable,
  promptDevice,
  promptLabel,
  promptLabels,
  type PadBinding,
  type PromptAction,
} from "../../src/domain/prompt-vocabulary";

const padLabel = (binding: PadBinding): string =>
  ({
    jump: "A",
    dash: "RB",
    throw: "RT",
    tether: "LT",
    confirm: "A",
    back: "B",
    pause: "MENU",
    "tab-prev": "LB",
    "tab-next": "RB",
    view: "VIEW",
    north: "Y",
  })[binding];

/** Tabbed-menu controls: a pad has them, a touch player taps the tab strip and RESUME instead. */
const MENU_CONTROLS: readonly PromptAction[] = ["tab-prev", "tab-next", "close-menu"];

/** The Playground's shortcuts: a pad reaches all but no damage through the View layer; touch has none. */
const PLAYGROUND_SHORTCUTS: readonly PromptAction[] = [
  "playground-menu",
  "heal",
  "clear-enemies",
  "spawn-dummy",
  "repeat-spawn",
  "toggle-freeze",
  "toggle-no-damage",
];

/** Keyboard-only actions with no pad or touch wording. */
const KEYBOARD_ONLY: readonly PromptAction[] = ["toggle-no-damage", "fullscreen"];

describe("prompt vocabulary", () => {
  it("maps every input mode onto one of three vocabularies", () => {
    expect(promptDevice("mouse")).toBe("keyboard");
    expect(promptDevice("keyboard")).toBe("keyboard");
    expect(promptDevice("touch")).toBe("touch");
    expect(promptDevice("gamepad")).toBe("gamepad");
  });

  it("words every action on keyboard, and every play action on touch and gamepad", () => {
    for (const action of PROMPT_ACTIONS) {
      expect(promptLabel(action, "keyboard"), action).toMatch(/\S/u);
      for (const device of ["touch", "gamepad"] as const) {
        const label = promptLabel(action, device, padLabel);
        const none =
          KEYBOARD_ONLY.includes(action) ||
          (device === "touch" && (PLAYGROUND_SHORTCUTS.includes(action) || MENU_CONTROLS.includes(action)));
        if (none) {
          expect(label, `${action} on ${device}`).toBeNull();
          expect(promptAvailable(action, device)).toBe(false);
        } else {
          expect(label, `${action} on ${device}`).toMatch(/\S/u);
          expect(promptAvailable(action, device)).toBe(true);
        }
      }
    }
  });

  it("never leaks keyboard or mouse words into touch or gamepad prompts", () => {
    for (const action of PROMPT_ACTIONS)
      for (const device of ["touch", "gamepad"] as const) {
        const label = promptLabel(action, device, padLabel) ?? "";
        expect(label, `${action} on ${device}`).not.toMatch(/MOUSE|CLICK|SHIFT|SPACE|ESC|ENTER|\bW\b/u);
      }
  });

  it("keeps keyboard prompts short and in the arrow form (no MOUSE UP)", () => {
    for (const action of PROMPT_ACTIONS) {
      const label = promptLabel(action, "keyboard") ?? "";
      // "E / RIGHT CLICK" is the longest: a key and its mouse twin.
      expect(label.length, action).toBeLessThanOrEqual(15);
      expect(label).not.toMatch(/MOUSE (UP|DOWN)/u);
    }
  });

  it("resolves gamepad preset bindings at draw time", () => {
    expect(promptLabel("jump", "gamepad", padLabel)).toBe("A");
    expect(promptLabel("dash-down", "gamepad", padLabel)).toBe("LS ↓ + RB");
    expect(promptLabel("pause", "gamepad", padLabel)).toBe("MENU");
    expect(promptLabel("jump", "gamepad")).toBe("JUMP");
  });

  it("names the pad's bumpers and back button for tabbed menus", () => {
    expect(promptLabels(["tab-prev", "tab-next"], "gamepad", padLabel)).toEqual(["LB", "RB"]);
    expect(promptLabel("close-menu", "gamepad", padLabel)).toBe("B");
    expect(promptLabels(["tab-prev", "tab-next", "close-menu"], "keyboard")).toEqual(["Q", "E", "TAB / ESC"]);
  });

  it("drops actions a device cannot trigger and merges duplicates", () => {
    expect(promptLabels(["throw", "recall", "playground-menu"], "touch")).toEqual(["THROW"]);
    expect(promptLabels(["playground-menu", "heal", "repeat-spawn"], "keyboard")).toEqual(["TAB", "1", "4"]);
  });

  it("words the Playground's pad layer as View held with a D-pad direction or Y", () => {
    expect(promptLabel("playground-menu", "gamepad", padLabel)).toBe("VIEW");
    expect(promptLabels(["heal", "clear-enemies", "spawn-dummy", "repeat-spawn"], "gamepad", padLabel)).toEqual([
      "VIEW + ↑",
      "VIEW + ↓",
      "VIEW + ←",
      "VIEW + →",
    ]);
    expect(promptLabel("toggle-freeze", "gamepad", padLabel)).toBe("VIEW + Y");
    expect(promptLabel("toggle-no-damage", "gamepad", padLabel)).toBeNull();
  });
});
