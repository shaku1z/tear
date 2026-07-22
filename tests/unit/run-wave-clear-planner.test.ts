import { describe, expect, it } from "vitest";
import {
  planWaveClear,
  type WaveClearInput,
  type WaveClearState,
} from "../../src/gameplay/run/wave-clear-planner";

function state(overrides: Partial<WaveClearState> = {}): WaveClearState {
  return {
    mode: "endless",
    diff: "normal",
    wave: 5,
    isBossWave: false,
    horde: true,
    waveTime: 12.5,
    waveKills: 14,
    wavePeak: 4,
    runTime: 80.9,
    bossesBeaten: 0,
    damagedThisWave: false,
    damagedThisStage: false,
    clearTimer: -1,
    pendingReward: null,
    waveLog: [],
    ...overrides,
  };
}

function input(overrides: Partial<WaveClearInput> = {}): WaveClearInput {
  return {
    state: state(),
    dt: 0.1,
    waveLifecycleActive: true,
    spawnQueueLength: 0,
    enemyCount: 0,
    achievementTracking: true,
    playerOneHit: false,
    ownedAbilityCount: 7,
    stageIndex: 0,
    stageCount: 5,
    currentStageAccent: "#e23b3b",
    healEachWave: 12,
    waveHealBonus: 3,
    waveClearPause: 0.8,
    availableTierUpCount: 0,
    ...overrides,
  };
}

describe("wave-clear and reward conformance", () => {
  it("logs and rewards a normal wave after both queue and live enemies empty", () => {
    const result = planWaveClear(input());
    expect(result.state.waveLog).toEqual([{ wave: 5, time: 12.5, kills: 14, peak: 4 }]);
    expect(result.state).toMatchObject({ damagedThisWave: false, pendingReward: "draft" });
    expect(result.state.clearTimer).toBeCloseTo(0.7);
    expect(result.intents).toContainEqual({ type: "heal-player", amount: 15 });
    expect(result.intents).toContainEqual({ type: "horde-cleared", waveTime: 12.5 });
    expect(result.intents).toContainEqual({ type: "prepare-reward", reward: "draft" });
    expect(result.intents.filter((intent) => intent.type === "achievement-check")).toHaveLength(1);
  });

  it("does not clear while queued or live enemies remain", () => {
    expect(planWaveClear(input({ spawnQueueLength: 1 })).intents).toEqual([]);
    expect(planWaveClear(input({ enemyCount: 1 })).intents).toEqual([]);
    expect(planWaveClear(input({ waveLifecycleActive: false })).intents).toEqual([]);
  });

  it("opens the draft after the exact clear pause and exits pointer lock", () => {
    const result = planWaveClear(input({ dt: 0.8 }));
    expect(result.state.clearTimer).toBe(-1);
    expect(result.intents.slice(-2)).toEqual([{ type: "exit-pointer-lock" }, { type: "open-draft" }]);
  });

  it("routes non-final campaign bosses to tier-up rewards and stage achievements", () => {
    const result = planWaveClear(input({
      state: state({ mode: "campaign", wave: 20, isBossWave: true }),
      stageIndex: 1,
      availableTierUpCount: 4,
      dt: 2,
    }));
    expect(result.terminal).toBe(false);
    expect(result.state).toMatchObject({ pendingReward: "boss", clearTimer: -1, damagedThisStage: false });
    expect(result.intents).toContainEqual({ type: "heal-player", amount: 27 });
    expect(result.intents).toContainEqual({ type: "profile-add", stat: "stageClears", value: 1 });
    expect(result.intents).toContainEqual({ type: "profile-add", stat: "noHitStages", value: 1 });
    expect(result.intents).toContainEqual({ type: "stage-done" });
    expect(result.intents.slice(-2)).toEqual([{ type: "exit-pointer-lock" }, { type: "open-tier-up" }]);
  });

  it("starts the finale directly after the final campaign boss", () => {
    const result = planWaveClear(input({
      state: state({ mode: "campaign", wave: 50, isBossWave: true }),
      stageIndex: 4,
    }));
    expect(result.terminal).toBe(true);
    expect(result.intents.at(-1)).toEqual({ type: "start-adventure-finale" });
    expect(result.intents.some((intent) => intent.type === "prepare-reward" || intent.type === "heal-player")).toBe(false);
  });

  it("wins fixed-wave modes at their boss and keeps gauntlet cycling", () => {
    const fixed = planWaveClear(input({ state: state({ mode: "sandbox", isBossWave: true }) }));
    expect(fixed.terminal).toBe(true);
    expect(fixed.intents.at(-1)).toEqual({ type: "win-run" });

    const gauntlet = planWaveClear(input({ state: state({ mode: "gauntlet", wave: 8, isBossWave: true, bossesBeaten: 2 }) }));
    expect(gauntlet.terminal).toBe(false);
    expect(gauntlet.state).toMatchObject({ bossesBeaten: 3, pendingReward: "boss" });
  });

  it("preserves one-hit healing suppression and endless difficulty milestones", () => {
    const result = planWaveClear(input({
      state: state({ diff: "extreme", wave: 100, horde: false }),
      playerOneHit: true,
    }));
    expect(result.intents.some((intent) => intent.type === "heal-player")).toBe(false);
    expect(result.intents).toContainEqual({ type: "profile-max", stat: "oneHitWave", value: 100 });
    expect(result.intents).toContainEqual({ type: "profile-max", stat: "wave100Extreme", value: 1 });
  });

  it("preserves damage gates and skips profile work when achievements are disabled", () => {
    const damaged = planWaveClear(input({ state: state({ damagedThisWave: true, damagedThisStage: true }) }));
    expect(damaged.intents.some((intent) => intent.type === "profile-add" && intent.stat === "noHitWaves")).toBe(false);
    const disabled = planWaveClear(input({ achievementTracking: false }));
    expect(disabled.intents.some((intent) => intent.type.startsWith("profile-") || intent.type === "daily-bump")).toBe(false);
  });

  it("continues an already prepared reward timer without clearing twice", () => {
    const result = planWaveClear(input({
      state: state({ clearTimer: 0.2, pendingReward: "boss" }),
      waveLifecycleActive: false,
      availableTierUpCount: 1,
      dt: 0.2,
    }));
    expect(result.state.clearTimer).toBe(-1);
    expect(result.intents).toEqual([{ type: "exit-pointer-lock" }, { type: "open-tier-up" }]);
  });
});
