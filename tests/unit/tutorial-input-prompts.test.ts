import { describe, expect, it } from "vitest";
import {
  lessonPromptActions,
  padPromptLabel,
  tutorialInputPrompt,
} from "../../src/presentation/world/tutorial-input-prompts";

const pad = {
  bindingLabel(action: "jump" | "dash" | "throw" | "tether"): string {
    return { jump: "Cross", dash: "R2", throw: "R1", tether: "L1" }[action];
  },
  glyph(index: number): string {
    return ({ 0: "✕", 1: "◯", 9: "OPTIONS" } as Record<number, string>)[index] ?? "?";
  },
};

describe("tutorial input prompts", () => {
  it("projects opponent practice controls onto the active device", () => {
    const keys = ["MOUSE", "SHIFT", "RMB"];
    expect(tutorialInputPrompt("Defeat it", keys, "gamepad", pad).keys).toEqual(["RS", "R2", "R1"]);
    expect(tutorialInputPrompt("Defeat it", keys, "touch", pad).keys).toEqual(["DRAG", "DASH", "THROW"]);
    expect(tutorialInputPrompt("Defeat it", keys, "mouse", pad).keys).toEqual(["MOUSE", "SHIFT", "RIGHT CLICK"]);
  });

  it("keeps the lesson goal identical on every device", () => {
    for (const mode of ["mouse", "keyboard", "touch", "gamepad"] as const)
      expect(tutorialInputPrompt("Current curriculum", ["MOUSE"], mode, pad).description).toBe("Current curriculum");
  });

  it("uses the configured gamepad preset rather than a console layout", () => {
    expect(tutorialInputPrompt("", ["S + SHIFT", "MOUSE ↓"], "gamepad", pad).keys).toEqual(["LS ↓ + R2", "RS ↓"]);
    expect(tutorialInputPrompt("", ["RMB"], "gamepad", pad).keys).toEqual(["R1"]);
    expect(tutorialInputPrompt("", ["W", "MOUSE UP"], "gamepad", pad).keys).toEqual(["Cross", "RS ↑"]);
  });

  it("words historical key names the same way (MOUSE UP and MOUSE ↑ are one control)", () => {
    expect(tutorialInputPrompt("", ["MOUSE UP", "MOUSE"], "mouse", pad).keys).toEqual(["MOUSE ↑", "MOUSE"]);
    expect(tutorialInputPrompt("", ["MOUSE ↑", "MOUSE"], "touch", pad).keys).toEqual(["DRAG ↑", "DRAG"]);
    expect(lessonPromptActions(["MOUSE UP"])).toEqual(lessonPromptActions(["MOUSE ↑"]));
  });

  it("merges left and right into one move control", () => {
    expect(tutorialInputPrompt("", ["A", "D"], "keyboard", pad).keys).toEqual(["A / D"]);
    expect(tutorialInputPrompt("", ["A", "D"], "touch", pad).keys).toEqual(["LEFT STICK"]);
    expect(tutorialInputPrompt("", ["A", "D"], "gamepad", pad).keys).toEqual(["LS"]);
  });

  it("drops repeats and unknown words, and shows nothing for a lesson without controls", () => {
    expect(tutorialInputPrompt("", ["W", "SPACE"], "keyboard", pad).keys).toEqual(["W / SPACE"]);
    expect(tutorialInputPrompt("", ["RMB", "MOUSE", "RMB"], "touch", pad).keys).toEqual(["THROW", "DRAG"]);
    expect(tutorialInputPrompt("", [], "gamepad", pad).keys).toEqual([]);
  });

  it("resolves menu buttons through the pad glyph style", () => {
    const label = padPromptLabel(pad);
    expect([label("confirm"), label("back"), label("pause"), label("jump")]).toEqual(["✕", "◯", "OPTIONS", "Cross"]);
  });
});
