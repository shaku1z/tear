import { describe, expect, it } from "vitest";
import { normalizeGameAction } from "../../src/input/game-action";

describe("normalizeGameAction", () => {
  it("produces the same semantic action without retaining device metadata", () => {
    const keyboard = normalizeGameAction({ type: "move", x: 1_000, y: 0, key: "KeyD", device: "keyboard" });
    const gamepad = normalizeGameAction({ type: "move", x: 1_000, y: 0, axis: 0, device: "gamepad" });
    expect(keyboard).toEqual(gamepad);
    expect(keyboard).toEqual({ ok: true, action: { type: "move", x: 1_000, y: 0 } });
  });

  it("rejects non-canonical analog values before they reach deterministic code", () => {
    expect(normalizeGameAction({ type: "move", x: 0.5, y: 0 })).toMatchObject({ ok: false });
    expect(normalizeGameAction({ type: "aim", turn: 1_000_000 })).toMatchObject({ ok: false });
    expect(normalizeGameAction({ type: "aim", turn: 0, magnitude: 1_001 })).toMatchObject({ ok: false });
  });

  it("preserves reticle distance while defaulting legacy angle-only aim to full reach", () => {
    expect(normalizeGameAction({ type: "aim", turn: 250_000, magnitude: 500 }))
      .toEqual({ ok: true, action: { type: "aim", turn: 250_000, magnitude: 500 } });
    expect(normalizeGameAction({ type: "aim", turn: 250_000 }))
      .toEqual({ ok: true, action: { type: "aim", turn: 250_000, magnitude: 1_000 } });
  });

  it("normalizes identifiers and weapon phases", () => {
    expect(normalizeGameAction({ type: "ability", abilityId: "  blink  ", phase: "pressed" }))
      .toEqual({ ok: true, action: { type: "ability", abilityId: "blink", phase: "pressed" } });
    expect(normalizeGameAction({ type: "weapon", intent: "throw", phase: "released" }))
      .toEqual({ ok: true, action: { type: "weapon", intent: "throw", phase: "released" } });
    expect(normalizeGameAction({ type: "jump", phase: "pressed" }))
      .toEqual({ ok: true, action: { type: "jump", phase: "pressed" } });
  });
});
