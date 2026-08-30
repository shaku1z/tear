import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { addKillScore } from "../../src/gameplay/combat/weapon-runtime-coordinator";
import { planWaveClear, type WaveClearInput, type WaveClearState } from "../../src/gameplay/run/wave-clear-planner";
import { calculateCoinAward } from "../../src/gameplay/scoring/coin-awards";
import { synthesizeProgression } from "../../src/tearbench/progression-ledger";

function clearState(overrides: Partial<WaveClearState>): WaveClearState {
  return {
    mode: "campaign", diff: "normal", wave: 39, isBossWave: false, horde: false,
    waveTime: 10, waveKills: 19, wavePeak: 2, runTime: 400, bossesBeaten: 0,
    damagedThisWave: false, damagedThisStage: false, clearTimer: -1, pendingReward: null,
    waveLog: [], ...overrides,
  };
}

function clearInput(state: WaveClearState, overrides: Partial<WaveClearInput> = {}): WaveClearInput {
  return {
    state, dt: 0.1, waveLifecycleActive: true, spawnQueueLength: 0, enemyCount: 0,
    achievementTracking: true, playerOneHit: false, ownedAbilityCount: 12,
    stageIndex: 3, stageCount: 6, currentStageAccent: "#e4c95a",
    healEachWave: CONFIG.run.healEachWave, waveHealBonus: 0,
    waveClearPause: CONFIG.run.waveClearPause, availableTierUpCount: 4,
    ...overrides,
  };
}

describe("Verdant wave-40 economy and progression", () => {
  it("uses production progression and coin owners for all forty campaign rewards", () => {
    const economy = { score: 1_000, remoteMultiplier: 1, coinMagnetLevel: 2, fortuneLevel: 3 } as const;
    const result = synthesizeProgression({
      mode: "campaign", difficulty: "normal", weapon: "sword", targetWave: 40,
      economy, selections: [], policy: "coverage-seeking",
    });
    expect(result.reachable).toBe(true);
    expect(result.ledger.events.filter((event) => event.type === "stage.entered").map((event) => event.wave))
      .toEqual([1, 11, 21, 31]);
    expect(result.ledger.events.filter((event) => event.type === "boss.defeated").map((event) => event.wave))
      .toEqual([10, 20, 30, 40]);
    expect(result.ledger.draftOpportunities + result.ledger.tierOpportunities).toBe(40);
    expect(result.ledger.events.filter((event) => event.type === "configuration.mutated")).toHaveLength(40);
    const reward = result.ledger.events.find((event) => event.type === "reward.granted" && event.wave === 40);
    const expected = calculateCoinAward({
      score: economy.score, wave: 40, difficultyId: "normal", baseDifficultyMultiplier: 1,
      remoteMultiplier: economy.remoteMultiplier, coinMagnetLevel: economy.coinMagnetLevel,
      fortuneLevel: economy.fortuneLevel,
    });
    expect(reward?.type === "reward.granted" ? reward.currency : null).toBe(expected.earned);
  });

  it("keeps kill score difficulty scaling in the production coordinator", () => {
    const run = { score: 0, wave: 40, mult: 2, scoreMod: 1.4, waveKills: 0 };
    addKillScore(run, CONFIG.run.scorePerKill, CONFIG.run.scoreMult);
    expect(run).toEqual({ score: 672, wave: 40, mult: 2, scoreMod: 1.4, waveKills: 1 });
  });

  it("preserves regular draft healing and non-final Rootbound boss reward healing", () => {
    const regular = planWaveClear(clearInput(clearState({})));
    expect(regular.intents).toContainEqual({ type: "heal-player", amount: 12 });
    expect(regular.intents).toContainEqual({ type: "prepare-reward", reward: "draft" });

    const rootbound = planWaveClear(clearInput(clearState({ wave: 40, isBossWave: true })));
    expect(rootbound.terminal).toBe(false);
    expect(rootbound.intents).toContainEqual({ type: "heal-player", amount: 24 });
    expect(rootbound.intents).toContainEqual({ type: "prepare-reward", reward: "boss" });

    const oneHit = planWaveClear(clearInput(clearState({ diff: "onehit" }), { playerOneHit: true }));
    expect(oneHit.intents.some((intent) => intent.type === "heal-player")).toBe(false);
  });
});
