import { describe, expect, it } from "vitest";
import { addOverrunStack, advanceOverrun, overrunDamageMultiplier, overrunMovementMultiplier } from "../../src/gameplay/combat/overrun";
const config = { maxStacks: [3, 5, 7], hold: 2, decayStep: 0.5, redline: 3, damagePerStack: 0.1, movePerStack: 0.04 } as const;
describe("Overrun ability runtime", () => {
  it("caps stacks by tier and enters redline at tier three", () => {
    const state = { overrun: 3, overrunStacks: 6, overrunHoldT: 0, overrunDecayT: 0, redlineT: 0 };
    expect(addOverrunStack(state, config)).toEqual({ stacks: 7, redline: true, label: "REDLINE" });
    expect(addOverrunStack(state, config).stacks).toBe(7);
  });
  it("holds, then decays stacks at the configured cadence", () => {
    const state = { overrun: 2, overrunStacks: 4, overrunHoldT: 0.25, overrunDecayT: 0.5, redlineT: 0 };
    advanceOverrun(state, config, 0.25); expect(state.overrunStacks).toBe(4);
    advanceOverrun(state, config, 1.1); expect(state.overrunStacks).toBe(2);
  });
  it("derives combat multipliers without mutation", () => {
    const state = { overrun: 2, overrunStacks: 3 };
    expect(overrunDamageMultiplier(state, config)).toBeCloseTo(1.3);
    expect(overrunMovementMultiplier(state, config)).toBeCloseTo(1.12);
  });
});
