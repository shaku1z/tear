import { describe, expect, it } from "vitest";
import { tutorialInputPrompt } from "../../src/presentation/world/tutorial-input-prompts";

const pad = {
  bindingLabel(action: "jump" | "dash" | "throw" | "tether"): string {
    return { jump: "Cross", dash: "R2", throw: "R1", tether: "L1" }[action];
  },
};

describe("tutorial input prompts", () => {
  it("preserves semantic keyboard and mouse prompts", () => {
    expect(tutorialInputPrompt("CUT", "Current curriculum", ["MOUSE"], "mouse", pad)).toEqual({
      description: "Current curriculum", keys: ["MOUSE"],
    });
  });

  it("uses configured gamepad bindings without hard-coding a console layout", () => {
    expect(tutorialInputPrompt("POWER SLAM", "Current curriculum", ["S + SHIFT"], "gamepad", pad)).toEqual({
      description: "Current curriculum", keys: ["LS ↓ + R2", "RS ↓"],
    });
    expect(tutorialInputPrompt("THROW", "Current curriculum", ["RMB"], "gamepad", pad).keys).toEqual(["R1"]);
  });

  it("teaches current touch gestures and the mixed-verbs field test", () => {
    expect(tutorialInputPrompt("LAUNCH", "Current curriculum", ["MOUSE ↑"], "touch", pad)).toEqual({
      description: "Current curriculum", keys: ["DRAG ↑"],
    });
    expect(tutorialInputPrompt("FIELD TEST", "Carry the route", [], "touch", pad).keys)
      .toEqual(["DASH", "DRAG — SWING", "DRAG ↑"]);
  });
});
