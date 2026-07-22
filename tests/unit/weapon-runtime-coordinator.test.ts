import { describe, expect, it, vi } from "vitest";

import {
  addKillScore,
  advanceWeaponAbilities,
  appendWeaponEvent,
  collapseTargets,
  invokeWeaponHook,
  nearestLivingTarget,
} from "../../src/gameplay/combat/weapon-runtime-coordinator";

const overrun = { maxStacks: [3, 4, 5], hold: 1, decayStep: 1, redline: 1, damagePerStack: 0.1, movePerStack: 0.1 };
const stormbank = { maxPrimary: [1, 1, 1], primaryPerCharge: [1, 1, 1], maxTargets: [1, 1, 1], radius: 200,
  chainDamage: 20, stun: 1, echoDuration: 2, echoInterval: 0.1 };

function target(x: number, dead = false) {
  return { x, y: 0, dead, isBoss: false, radius: 10, weight: 1, anchored: false, vx: 0, vy: 0,
    hit: vi.fn(function hit(this: { dead: boolean }) { this.dead = true; }) };
}

describe("weapon runtime coordinator", () => {
  it("advances overrun before echo hit, ribbon and kill callbacks", () => {
    const state = { overrun: 1, overrunStacks: 1, overrunHoldT: 0, overrunDecayT: 0.01, redlineT: 0,
      stormbank: 3, stormCharges: 0, stormEchoes: [{ x: 0, y: 0, t: 1, arcT: 0 }] };
    const victim = target(20);
    const order: string[] = [];
    victim.hit.mockImplementation(() => { order.push("hit"); victim.dead = true; });
    advanceWeaponAbilities(state, overrun, stormbank, 0.1, [victim], {
      ribbon: () => order.push("ribbon"), killed: () => order.push("kill"),
    });
    expect(state.overrunStacks).toBe(0);
    expect(order).toEqual(["hit", "ribbon", "kill"]);
  });

  it("owns bounded logging, nearest-target, collapse, hook and kill-score semantics", () => {
    const log: { t: number; type: string; weaponId: string }[] = [];
    appendWeaponEvent(log, 1, "throw", "sword", null, 1);
    appendWeaponEvent(log, 2, "catch", "sword", null, 1);
    expect(log).toEqual([{ t: 2, type: "catch", weaponId: "sword" }]);
    const near = target(10), far = target(50), dead = target(1, true);
    expect(nearestLivingTarget([far, dead, near], 0, 0)).toBe(near);
    collapseTargets([near], 100, 0);
    expect(near.vx).toBeGreaterThan(0);
    expect(invokeWeaponHook({ action: (context: { value?: number }) => context.value }, "action", { value: 7 })).toBe(7);
    const run = { score: 0, wave: 2, mult: 1.5, scoreMod: 2, waveKills: 0 };
    addKillScore(run, 100, 1);
    expect(run).toEqual({ score: 600, wave: 2, mult: 1.5, scoreMod: 2, waveKills: 1 });
  });
});
