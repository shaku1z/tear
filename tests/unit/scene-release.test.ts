import { describe, expect, it } from "vitest";

import { discardScenePresses, type ScenePressState } from "../../src/input/scene-release";
import { SemanticInputBuffer } from "../../src/input/semantic-buffer";

/** The input a scene leaves behind: the press that ended it, on every device, plus held movement. */
function sceneEnd() {
  const semantic = new SemanticInputBuffer();
  semantic.startRecording();
  semantic.setMovement(1, 0);
  semantic.push({ type: "jump", phase: "pressed" }); // Space, W, a tap on JUMP, the pad's jump button
  semantic.push({ type: "dash", x: 1000, y: 0 }); // Shift, a tap on DASH, the pad's dash button
  semantic.push({ type: "weapon", intent: "throw", phase: "pressed" }); // right mouse, THROW, the pad's throw
  semantic.push({ type: "weapon", intent: "primary", phase: "pressed" }); // left mouse
  semantic.push({ type: "weapon", intent: "primary", phase: "released" });
  const clicks = { clicked: true };
  const input: ScenePressState & { pressed: Set<string>; held: Set<string>; clicked: boolean } = {
    pressed: new Set(["Space", "KeyW", "ArrowUp", "ShiftLeft", "Enter"]),
    held: new Set(["KeyD"]),
    tJump: true,
    tDash: true,
    rmb: true,
    get clicked() {
      return clicks.clicked;
    },
    takeClick() {
      const had = clicks.clicked;
      clicks.clicked = false;
      return had ? { x: 0, y: 0 } : null;
    },
    semantic,
  };
  return { input, semantic };
}

describe("the press that ends a scene belongs to the scene", () => {
  it("drops every press queued for the next simulation tick, on every device", () => {
    const { input, semantic } = sceneEnd();
    discardScenePresses(input);
    const sealed = semantic.drain(1).map((envelope) => envelope.command);
    expect(
      sealed.some((action) => action.type === "jump"),
      "jump",
    ).toBe(false);
    expect(
      sealed.some((action) => action.type === "dash"),
      "dash",
    ).toBe(false);
    expect(
      sealed.some((action) => action.type === "weapon" && action.phase === "pressed"),
      "throw and primary presses",
    ).toBe(false);
  });

  it("keeps releases and held movement, so the player is not left holding a button or stopped", () => {
    const { input, semantic } = sceneEnd();
    discardScenePresses(input);
    expect(semantic.drain(1).map((envelope) => envelope.command)).toEqual([
      { type: "move", x: 1000, y: 0 },
      { type: "weapon", intent: "primary", phase: "released" },
    ]);
    expect([...input.held]).toEqual(["KeyD"]);
  });

  it("drops the live loop's press flags too", () => {
    const { input } = sceneEnd();
    discardScenePresses(input);
    expect([...input.pressed]).toEqual([]);
    expect([input.tJump, input.tDash, input.rmb, input.clicked]).toEqual([false, false, false, false]);
  });
});
