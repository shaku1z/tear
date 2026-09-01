import { describe, expect, it } from "vitest";
import {
  TEAR_CHECKPOINT_CADENCE_TICKS,
  TEAR_RENDER_RATES_HZ,
  TEAR_SIMULATION_PROFILE,
  TEAR_SIMULATION_TICKS_PER_SECOND,
  assertTearSimulationStepSeconds,
} from "../../src/tearbench/simulation-profile";

describe("TearBench simulation profile", () => {
  it("keeps fixed-step gameplay authority separate from presentation cadence", () => {
    expect(TEAR_SIMULATION_TICKS_PER_SECOND).toBe(120);
    expect(TEAR_SIMULATION_PROFILE.simulation.ticksPerSecond).toBe(120);
    expect(TEAR_RENDER_RATES_HZ).toEqual([30, 60, 144]);
    expect(TEAR_SIMULATION_PROFILE.render.ratesHz).toBe(TEAR_RENDER_RATES_HZ);
    expect(TEAR_SIMULATION_PROFILE.render.cadence).toBe("presentation-frame");
    expect(TEAR_CHECKPOINT_CADENCE_TICKS).toBe(120);
    expect(TEAR_SIMULATION_PROFILE.checkpoint.cadenceTicks).toBe(TEAR_CHECKPOINT_CADENCE_TICKS);
    expect(() => { assertTearSimulationStepSeconds(1 / 120); }).not.toThrow();
    expect(() => { assertTearSimulationStepSeconds(1 / 60); }).toThrow(/120 Hz/u);
  });
});
