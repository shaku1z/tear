import { describe, expect, it } from "vitest";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/replay/hash";

describe("canonical gameplay state", () => {
  it("quantizes floats and sorts enemies by deterministic identity", () => {
    const input = { tick: 8, moveX: 1, moveY: 0, aimTurn: 50, primaryHeld: false } as const;
    const run = { mode: "endless", wave: 3, score: 20, runTime: 1.23456, runSeed: 77 };
    const player = { x: 1.23456, y: 2, vx: 3, vy: 4, hp: 99.9999 };
    const blade = { state: "held", x: 4, y: 5, vx: 0, vy: 0 };
    const first = projectCanonicalGameplayState(8, input, run, player, blade, [
      { _gid: 2, kind: "flyer", x: 2, y: 0, vx: 0, vy: 0, hp: 5, dead: false },
      { _gid: 1, kind: "charger", x: 1, y: 0, vx: 0, vy: 0, hp: 5, dead: false },
    ]);
    const second = projectCanonicalGameplayState(8, input, run, player, blade, [
      { _gid: 1, kind: "charger", x: 1, y: 0, vx: 0, vy: 0, hp: 5, dead: false },
      { _gid: 2, kind: "flyer", x: 2, y: 0, vx: 0, vy: 0, hp: 5, dead: false },
    ]);
    expect(first.run?.time).toBe(1235);
    expect(first.player?.x).toBe(1235);
    expect(first.enemies.map((enemy) => enemy.id)).toEqual([1, 2]);
    expect(stableVerificationHash(first)).toBe(stableVerificationHash(second));
  });
});
