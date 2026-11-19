import { describe, expect, it } from "vitest";
import { padPromptLabel, tutorialGoldGlyphs } from "../../src/presentation/world/tutorial-input-prompts";

const pad = {
  bindingLabel(action: "jump" | "dash" | "throw" | "tether"): string {
    return { jump: "Cross", dash: "R2", throw: "R1", tether: "L1" }[action];
  },
  glyph(index: number): string {
    return ({ 0: "✕", 1: "◯", 9: "OPTIONS" } as Record<number, string>)[index] ?? "?";
  },
};

describe("tutorial input prompts", () => {
  it("resolves menu buttons through the pad glyph style and play actions through the preset", () => {
    const label = padPromptLabel(pad);
    expect([label("confirm"), label("back"), label("pause"), label("jump")]).toEqual(["✕", "◯", "OPTIONS", "Cross"]);
  });

  it("words gold demonstration edges from the shared vocabulary on every device", () => {
    const edges = ["left", "jump", "dash", "swing", "primary"];
    expect(tutorialGoldGlyphs(edges, "mouse", pad)).toEqual(["A", "W / SPACE", "SHIFT", "MOUSE", "Q / LEFT CLICK"]);
    expect(tutorialGoldGlyphs(edges, "touch", pad)).toEqual(["STICK ←", "JUMP", "DASH", "DRAG", "HOLD"]);
    expect(tutorialGoldGlyphs(edges, "gamepad", pad)).toEqual(["LS ←", "Cross", "R2", "RS", "L1"]);
    expect(tutorialGoldGlyphs(["unknown"], "gamepad", pad)).toEqual(["unknown"]);
  });
});
