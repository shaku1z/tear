import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import type { RandomSource } from "../../src/domain/random";
import {
  concurrentEnemyCap,
  planGroundSpawn,
  planSideSpawn,
  scheduleWaveSpawn,
  type SpawnScheduleState,
} from "../../src/gameplay/run/spawn-scheduler";

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  next(): number { return this.values[this.index++] ?? 0; }
}

function state(overrides: Partial<SpawnScheduleState> = {}): SpawnScheduleState {
  return {
    mode: "endless",
    wave: 1,
    horde: false,
    spawnQueue: [{ type: "charger" }, { type: "ranged" }],
    spawnTimer: 0.8,
    ...overrides,
  };
}

describe("spawn scheduling conformance", () => {
  it("preserves concurrency caps for campaign depth, endless depth, and hordes", () => {
    expect(concurrentEnemyCap(state({ mode: "campaign", wave: 1 }), CONFIG.run)).toBe(6);
    expect(concurrentEnemyCap(state({ mode: "campaign", wave: 41 }), CONFIG.run)).toBe(10);
    expect(concurrentEnemyCap(state({ mode: "endless", wave: 21 }), CONFIG.run)).toBe(9);
    expect(concurrentEnemyCap(state({ mode: "endless", wave: 21, horde: true }), CONFIG.run)).toBe(12);
    expect(concurrentEnemyCap(state({ mode: "endless", wave: 200, horde: true }), CONFIG.run)).toBe(13);
    expect(concurrentEnemyCap(state({ mode: "sandbox", wave: 99 }), CONFIG.run)).toBe(6);
  });

  it("holds queued spawns during lore and at the live-enemy cap", () => {
    const lore = scheduleWaveSpawn({ state: state(), tuning: CONFIG.run, enemyCount: 0, loreBusy: true, dt: 1 });
    expect(lore).toMatchObject({ spawned: null, eligible: false });
    expect(lore.state.spawnTimer).toBe(0.8);
    const capped = scheduleWaveSpawn({ state: state(), tuning: CONFIG.run, enemyCount: 6, loreBusy: false, dt: 1 });
    expect(capped).toMatchObject({ spawned: null, eligible: false });
    expect(capped.state.spawnTimer).toBe(0.8);
  });

  it("shortens an empty screen to a 0.3 second beat and spawns at most one per tick", () => {
    const waiting = scheduleWaveSpawn({ state: state(), tuning: CONFIG.run, enemyCount: 0, loreBusy: false, dt: 0.1 });
    expect(waiting).toMatchObject({ eligible: true, spawned: null });
    expect(waiting.state.spawnTimer).toBeCloseTo(0.2);
    const spawned = scheduleWaveSpawn({ state: waiting.state, tuning: CONFIG.run, enemyCount: 0, loreBusy: false, dt: 10 });
    expect(spawned.spawned).toEqual({ type: "charger" });
    expect(spawned.state.spawnQueue).toEqual([{ type: "ranged" }]);
    expect(spawned.state.spawnTimer).toBe(CONFIG.run.spawnInterval);
  });

  it("preserves platform and side ground-spawn coordinates and random draw order", () => {
    const platform = planGroundSpawn(
      20,
      [{ x: 100, y: 300, w: 200, oneway: true }, { x: 500, y: 600, w: 100 }],
      820,
      1600,
      new SequenceRandom([0.2, 0, 0.5]),
    );
    expect(platform).toEqual({ x: 200, y: 280 });
    const side = planGroundSpawn(
      20,
      [{ x: 100, y: 300, w: 200, oneway: true }],
      820,
      1600,
      new SequenceRandom([0.4, 0.4, 0.5]),
    );
    expect(side).toEqual({ x: 300, y: 740 });
    expect(planSideSpawn(1600, new SequenceRandom([0.5, 0.25]))).toBe(1360);
  });
});
