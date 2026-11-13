import { describe, expect, it } from "vitest";
import { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import type { GameAction } from "../../src/input/game-action";

function envelope(id: number, tick: number, command: GameAction) {
  return Object.freeze({ kind: "command" as const, id, tick, command });
}

describe("authoritative GameAction boundary", () => {
  it.each([0, 250, 1000])("round-trips held aim magnitude %s while retaining the full-scale legacy shape", (magnitude) => {
    const source = new AuthoritativeInputState();
    source.beginTick(1, [envelope(1, 1, { type: "aim", turn: 125000, magnitude })]);
    const saved = source.snapshot(), restored = new AuthoritativeInputState();
    expect(Object.hasOwn(saved, "aimMagnitude")).toBe(magnitude !== 1000);
    restored.restore(JSON.parse(JSON.stringify(saved)) as typeof saved);
    expect(restored.aimVector()).toEqual(source.aimVector());
    restored.beginTick(2, []); source.beginTick(2, []);
    expect(restored.aimVector()).toEqual(source.aimVector());
    expect(restored.snapshot()).toEqual(source.snapshot());
    const before = restored.snapshot();
    for (const invalid of [-1, 1001, 0.5, Number.NaN, "250", null]) {
      expect(() => { restored.restore({ ...saved, aimMagnitude: invalid } as unknown as typeof saved); }).toThrow(/snapshot/);
      expect(restored.snapshot()).toEqual(before);
    }
  });

  it("explicitly assumes full scale for a legacy snapshot without claiming recovered historical magnitude", () => {
    const input = new AuthoritativeInputState();
    const legacy = { tick: 4, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false };
    input.restore(legacy);
    expect(input.aimVector()).toEqual({ x: 1, y: 0 });
    expect(input.snapshot()).toEqual(legacy);
  });
  it("consumes every simulation intent and phase at its fixed tick", () => {
    const input = new AuthoritativeInputState();
    input.beginTick(1, [
      envelope(1, 1, { type: "move", x: -1_000, y: 1_000 }),
      envelope(2, 1, { type: "aim", turn: 250_000, magnitude: 500 }),
      envelope(3, 1, { type: "jump", phase: "pressed" }),
      envelope(4, 1, { type: "dash", x: 1_000, y: -1_000 }),
      envelope(5, 1, { type: "weapon", intent: "primary", phase: "pressed" }),
    ]);
    expect(input.snapshot()).toEqual({ tick: 1, moveX: -1, moveY: 1, aimTurn: 250_000, aimMagnitude: 500, primaryHeld: true });
    expect(input.aimVector().x).toBeCloseTo(0);
    expect(input.aimVector().y).toBeCloseTo(0.5);
    expect(input.jumpPressed()).toBe(true);
    expect(input.dashPressed()).toBe(true);
    expect(input.right()).toBe(true);
    expect(input.up()).toBe(true);

    input.beginTick(2, [
      envelope(6, 2, { type: "jump", phase: "released" }),
      envelope(7, 2, { type: "weapon", intent: "primary", phase: "released" }),
    ]);
    expect(input.jumpPressed()).toBe(false);
    expect(input.primaryHeld).toBe(false);
  });

  it.each(["secondary", "throw", "recall"] as const)(
    "routes a pressed %s intent through the real transport consumer and clears the edge",
    (intent) => {
      const input = new AuthoritativeInputState();
      input.beginTick(1, [envelope(1, 1, { type: "weapon", intent, phase: "pressed" })]);
      expect(input.consumeThrow()).toBe(true);
      expect(input.consumeThrow()).toBe(false);
      input.beginTick(2, [envelope(2, 2, { type: "weapon", intent, phase: "released" })]);
      expect(input.consumeThrow()).toBe(false);
    },
  );

  it("rejects an envelope authored for a different authoritative tick", () => {
    const input = new AuthoritativeInputState();
    expect(() => {
      input.beginTick(2, [envelope(1, 1, { type: "interact" })]);
    })
      .toThrow("action envelope tick does not match");
  });
});
