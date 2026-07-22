import { describe, expect, it } from "vitest";
import { advanceStormEchoes, dischargeStormbank } from "../../src/gameplay/combat/stormbank";

const config = {
  maxPrimary: [0.3, 0.4, 0.5], primaryPerCharge: [0.05, 0.06, 0.07], maxTargets: [2, 3, 4],
  radius: 100, chainDamage: 20, stun: 0.6, echoDuration: 2, echoInterval: 0.5,
} as const;

const target = (x: number, isBoss = false) => ({ x, y: 0, dead: false, isBoss });

describe("Stormbank ability runtime", () => {
  it("drains charges, caps the primary bonus, and selects nearest secondary targets", () => {
    const primary = target(5), near = target(10), far = target(90), outside = target(110);
    const state = { stormbank: 2, stormCharges: 8, stormEchoes: [] };
    const result = dischargeStormbank(state, config, { x: 0, y: 0 }, primary, 100, [outside, far, near, primary]);
    expect(result?.primaryBonus).toBe(40);
    expect(result?.arcs.map((arc) => arc.target)).toEqual([near, far]);
    expect(result?.arcs.every((arc) => arc.stun === 0.6)).toBe(true);
    expect(state.stormCharges).toBe(0);
  });

  it("creates tier-three echoes and emits a nearest-target arc on cadence", () => {
    const primary = target(5), near = target(12), state = { stormbank: 3, stormCharges: 2, stormEchoes: [] };
    expect(dischargeStormbank(state, config, { x: 0, y: 0 }, primary, 40, [primary])?.label).toBe("STORMBANK ×2");
    expect(state.stormEchoes).toHaveLength(1);
    expect(advanceStormEchoes(state, config, 0.5, [near])).toMatchObject([{ arc: { target: near, damage: 9 } }]);
  });

  it("does nothing without an active tier or charges", () => {
    const primary = target(0);
    expect(dischargeStormbank({ stormbank: 0, stormCharges: 3, stormEchoes: [] }, config, primary, primary, 10, [])).toBeNull();
    expect(dischargeStormbank({ stormbank: 1, stormCharges: 0, stormEchoes: [] }, config, primary, primary, 10, [])).toBeNull();
  });
});
