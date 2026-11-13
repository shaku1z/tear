import { describe, expect, it } from "vitest";
import { tutorialInputPrompt } from "../../src/presentation/world/tutorial-input-prompts";

const pad = {
  bindingLabel(action: "jump" | "dash" | "throw" | "tether"): string {
    return { jump: "Cross", dash: "R2", throw: "R1", tether: "L1" }[action];
  },
};

describe("tutorial input prompts", () => {
  it("projects real opponent controls onto the active device", () => {
    expect(
      tutorialInputPrompt("MENDER ENCOUNTER", "Defeat it", ["MOUSE", "SHIFT", "RMB"], "gamepad", pad).keys,
    ).toEqual(["RS — SWING", "R2", "R1"]);
    expect(tutorialInputPrompt("MENDER ENCOUNTER", "Defeat it", ["MOUSE", "SHIFT", "RMB"], "touch", pad).keys).toEqual([
      "DRAG — SWING",
      "DASH",
      "THROW",
    ]);
  });
  it("preserves semantic keyboard and mouse prompts", () => {
    expect(tutorialInputPrompt("CUT", "Current curriculum", ["MOUSE"], "mouse", pad)).toEqual({
      description: "Current curriculum",
      keys: ["MOUSE"],
    });
  });

  it("uses configured gamepad bindings without hard-coding a console layout", () => {
    expect(tutorialInputPrompt("POWER SLAM", "Current curriculum", ["S + SHIFT"], "gamepad", pad)).toEqual({
      description: "Current curriculum",
      keys: ["LS ↓ + R2", "RS ↓"],
    });
    expect(tutorialInputPrompt("THROW", "Current curriculum", ["RMB"], "gamepad", pad).keys).toEqual(["R1"]);
  });

  it("teaches current touch gestures and the evade-then-punish field test", () => {
    expect(tutorialInputPrompt("LAUNCH", "Current curriculum", ["MOUSE ↑"], "touch", pad)).toEqual({
      description: "Current curriculum",
      keys: ["DRAG ↑"],
    });
    expect(tutorialInputPrompt("FIELD TEST", "Carry the route", ["SHIFT", "MOUSE"], "touch", pad).keys).toEqual([
      "DASH",
      "DRAG SWING",
    ]);
    expect(tutorialInputPrompt("READ THE CHARGE", "Wait for recovery", [], "gamepad", pad).keys).toEqual(["R2"]);
    expect(tutorialInputPrompt("READ THE CHARGE", "Evade the charge", [], "touch", pad).keys).toEqual(["DASH"]);
    expect(tutorialInputPrompt("FIELD TEST", "Evade, then punish", ["SHIFT", "MOUSE"], "gamepad", pad).keys).toEqual([
      "R2",
      "RS SWING",
    ]);
    expect(tutorialInputPrompt("FIELD TEST", "Evade, then punish", ["SHIFT", "MOUSE"], "keyboard", pad).keys).toEqual([
      "SHIFT",
      "MOUSE",
    ]);
    expect(tutorialInputPrompt("FIELD TEST", "INTER-WAVE", [], "gamepad", pad).keys).toEqual([]);
    expect(
      tutorialInputPrompt("FIELD TEST", "Launch, follow and return", ["MOUSE UP", "MOUSE"], "gamepad", pad).keys,
    ).toEqual(["RS ↑", "RS — SWING"]);
    expect(
      tutorialInputPrompt("FIELD TEST", "Launch, follow and return", ["MOUSE UP", "MOUSE"], "touch", pad).keys,
    ).toEqual(["DRAG ↑", "DRAG — SWING"]);
  });
});
