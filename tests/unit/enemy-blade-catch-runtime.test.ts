import { describe, expect, it, vi } from "vitest";
import { resolveEnemyBladeCatch } from "../../src/gameplay/combat/enemy-blade-catch-runtime";

describe("enemy blade catch runtime", () => {
  it("routes the live blade and player to the first accepting living enemy", () => {
    const blade = { state: "flying" };
    const player = { x: 42 };
    const deadCatch = vi.fn(() => true);
    const reject = vi.fn(() => false);
    const accept = vi.fn(() => true);
    const after = vi.fn(() => true);
    const enemies = [
      { dead: true, tryCatchBlade: deadCatch },
      { dead: false, tryCatchBlade: reject },
      { dead: false, tryCatchBlade: accept },
      { dead: false, tryCatchBlade: after },
    ];

    expect(resolveEnemyBladeCatch(enemies, blade, player)).toBe(enemies[2]);
    expect(deadCatch).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(blade, player);
    expect(accept).toHaveBeenCalledWith(blade, player);
    expect(after).not.toHaveBeenCalled();
  });
});
