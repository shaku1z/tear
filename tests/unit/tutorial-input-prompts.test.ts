import { describe, expect, it } from "vitest";
import { tutorialInputPrompt } from "../../src/presentation/world/tutorial-input-prompts";

const pad = {
  bindingLabel(action: "jump" | "dash" | "throw" | "tether"): string {
    return { jump: "Cross", dash: "R2", throw: "R1", tether: "L1" }[action];
  },
};

describe("tutorial input prompts", () => {
  it("preserves legacy keyboard and mouse prompts", () => {
    expect(tutorialInputPrompt("CUT", "Mouse copy", ["MOUSE"], "mouse", pad)).toEqual({
      description: "Mouse copy",
      keys: ["MOUSE"],
    });
  });

  it("uses configured gamepad bindings without hard-coding a console layout", () => {
    expect(tutorialInputPrompt("POWER SLAM", "Keyboard copy", ["S + SHIFT"], "gamepad", pad)).toEqual({
      description: "Steer DOWN and dash, then slam mid-fall — fast descent hits far harder.",
      keys: ["LS ↓ + R2", "RS ↓"],
    });
    expect(tutorialInputPrompt("THROW", "Keyboard copy", ["RMB"], "gamepad", pad).keys).toEqual(["R1"]);
  });

  it("teaches touch gestures instead of keyboard or mouse controls", () => {
    expect(tutorialInputPrompt("LAUNCH", "Keyboard copy", ["MOUSE ↑"], "touch", pad)).toEqual({
      description: "A fast UPWARD drag pops an enemy into the air.",
      keys: ["DRAG ↑"],
    });
  });
});
