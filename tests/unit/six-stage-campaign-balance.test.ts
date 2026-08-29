import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { bossScaling } from "../../src/gameplay/run/wave-rules";
import { planWaveClear, type WaveClearInput, type WaveClearState } from "../../src/gameplay/run/wave-clear-planner";
import { concurrentEnemyCap } from "../../src/gameplay/run/spawn-scheduler";
import { CAMPAIGN_STAGE_IDS, STAGES } from "../../src/gameplay/stages";
import { synthesizeProgression } from "../../src/tearbench/progression-ledger";

function clearState(wave: number): WaveClearState {
  return { mode: "campaign", diff: "normal", wave, isBossWave: wave % 10 === 0, horde: false,
    waveTime: 30, waveKills: 12, wavePeak: 6, runTime: wave * 30, bossesBeaten: Math.floor((wave - 1) / 10),
    damagedThisWave: false, damagedThisStage: false, clearTimer: -1, pendingReward: null, waveLog: [] };
}

function clearInput(wave: number): WaveClearInput {
  return { state: clearState(wave), dt: 0.1, waveLifecycleActive: true, spawnQueueLength: 0, enemyCount: 0,
    achievementTracking: true, playerOneHit: false, ownedAbilityCount: 12,
    stageIndex: Math.floor((wave - 1) / 10), stageCount: CAMPAIGN_STAGE_IDS.length,
    currentStageAccent: "#fff", healEachWave: CONFIG.run.healEachWave, waveHealBonus: 0,
    waveClearPause: CONFIG.run.waveClearPause, availableTierUpCount: 4 };
}

describe("six-stage Adventure balance boundary", () => {
  it("places the exact published bosses at waves 10 through 60", () => {
    expect(STAGES.map((stage, index) => ({ stage: stage.id, boss: stage.boss, wave: (index + 1) * 10 }))).toEqual([
      { stage: "grounds", boss: "warden", wave: 10 },
      { stage: "undercroft", boss: "colossus", wave: 20 },
      { stage: "crimson-fields", boss: "aldric", wave: 30 },
      { stage: "verdant-sanctum", boss: "rootbound", wave: 40 },
      { stage: "voidspire", boss: "echo", wave: 50 },
      { stage: "tear", boss: "source", wave: 60 },
    ]);
  });

  it("keeps health, damage, population and concurrency pressure monotonic within hard caps", () => {
    const curves = CAMPAIGN_STAGE_IDS.map(campaignStageCurve);
    for (let index = 1; index < curves.length; index += 1) {
      expect(curves[index]?.health).toBeGreaterThanOrEqual(curves[index - 1]?.health ?? 0);
      expect(curves[index]?.damage).toBeGreaterThanOrEqual(curves[index - 1]?.damage ?? 0);
      expect(curves[index]?.countAdd).toBeGreaterThanOrEqual(curves[index - 1]?.countAdd ?? 0);
    }
    const caps = CAMPAIGN_STAGE_IDS.map((stageId, index) => concurrentEnemyCap({
      mode: "campaign", wave: index * 10 + 1, stageId, horde: false,
    }, CONFIG.run));
    expect(caps).toEqual([6, 7, 8, 8, 10, 10]);
    expect(caps.every((cap) => cap <= CONFIG.run.maxConcurrentCap)).toBe(true);
  });

  it("synthesizes sixty legal rewards, six bosses, bounded build power, economy and duration", () => {
    const result = synthesizeProgression({ mode: "campaign", difficulty: "normal", weapon: "sword",
      targetWave: 60, configuredCampaignWaves: 60, policy: "coverage-seeking",
      economy: { score: 25_000, remoteMultiplier: 1, coinMagnetLevel: 2, fortuneLevel: 2 } });
    expect(result.reachable).toBe(true);
    expect(result.ledger.events.filter((event) => event.type === "stage.entered").map((event) => event.wave))
      .toEqual([1, 11, 21, 31, 41, 51]);
    expect(result.ledger.events.filter((event) => event.type === "boss.defeated").map((event) => event.wave))
      .toEqual([10, 20, 30, 40, 50, 60]);
    expect(result.ledger.draftOpportunities + result.ledger.tierOpportunities).toBe(60);
    // One source-owned reward remains available after every wave. The 60-wave
    // extension reaches more legal families without changing any ability.
    expect(Object.keys(result.build)).toHaveLength(48);
    expect(Object.values(result.build).every((tierOrCount) => Number.isSafeInteger(tierOrCount) && tierOrCount >= 1)).toBe(true);
    expect(result.statistics.currency).toBeGreaterThan(0);
    expect(result.statistics.elapsedTicks / 120).toBeGreaterThanOrEqual(25 * 60);
    expect(result.statistics.elapsedTicks / 120).toBeLessThanOrEqual(40 * 60);
  });

  it("keeps Echo and Source on their authored Wave 50/60 health across every difficulty", () => {
    for (const difficulty of DIFFICULTY_CATALOG) {
      for (const [wave, campaignStage, authoredHealth] of [
        [50, 4, CONFIG.echo.hp],
        [60, 5, CONFIG.source.hp],
      ] as const) {
        const scaling = bossScaling({
          mode: "campaign",
          wave,
          bossesBeaten: campaignStage,
          campaignStage,
          placeholderBoss: false,
          difficultyHp: difficulty.modifiers.enemyHealth,
        });
        expect(scaling.health).toBe(difficulty.modifiers.enemyHealth);
        expect(scaling.contactDamage).toBe(1);
        expect(authoredHealth * scaling.health).toBe(authoredHealth * difficulty.modifiers.enemyHealth);
      }

      const result = synthesizeProgression({
        mode: "campaign",
        difficulty: difficulty.id,
        weapon: "sword",
        targetWave: 60,
        configuredCampaignWaves: 60,
        policy: "coverage-seeking",
        economy: { score: 25_000, remoteMultiplier: 1, coinMagnetLevel: 2, fortuneLevel: 2 },
      });
      expect(result.reachable, `${difficulty.id} Adventure must remain reachable through Wave 60`).toBe(true);
      expect(result.ledger.events.filter((event) => event.type === "boss.defeated").map((event) => event.wave))
        .toEqual([10, 20, 30, 40, 50, 60]);
    }
  });

  it("heals and rewards after Echo but starts the finale directly after Source", () => {
    const echo = planWaveClear(clearInput(50));
    expect(echo.terminal).toBe(false);
    expect(echo.intents).toContainEqual({ type: "heal-player", amount: CONFIG.run.healEachWave * 2 });
    expect(echo.intents).toContainEqual({ type: "prepare-reward", reward: "boss" });

    const source = planWaveClear(clearInput(60));
    expect(source.terminal).toBe(true);
    expect(source.intents.at(-1)).toEqual({ type: "start-adventure-finale" });
    expect(source.intents.some((intent) => intent.type === "heal-player" || intent.type === "prepare-reward")).toBe(false);
  });
});
