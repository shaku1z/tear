/**
 * Source-owned timing vocabulary for TearBench. Gameplay advances at a fixed
 * 120 Hz; presentation cadence is an independent concern and must not be
 * mistaken for the simulation authority.
 */
export const TEAR_SIMULATION_TICKS_PER_SECOND = 120 as const;
export const TEAR_RENDER_RATES_HZ = Object.freeze([30, 60, 144] as const);
export const TEAR_CHECKPOINT_CADENCE_TICKS = TEAR_SIMULATION_TICKS_PER_SECOND;

export function assertTearSimulationStepSeconds(stepSeconds: number): void {
  if (!Number.isFinite(stepSeconds)
    || Math.abs(stepSeconds - 1 / TEAR_SIMULATION_TICKS_PER_SECOND) > Number.EPSILON) {
    throw new Error("Tear gameplay simulation authority must remain 120 Hz");
  }
}

export const TEAR_SIMULATION_PROFILE = Object.freeze({
  simulation: Object.freeze({ ticksPerSecond: TEAR_SIMULATION_TICKS_PER_SECOND }),
  render: Object.freeze({ ratesHz: TEAR_RENDER_RATES_HZ, cadence: "presentation-frame" as const }),
  checkpoint: Object.freeze({ cadenceTicks: TEAR_CHECKPOINT_CADENCE_TICKS }),
});
