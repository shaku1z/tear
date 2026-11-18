import { describe, expect, it } from "vitest";
import { PRESETS } from "../../src/gameplay/affixes";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom } from "../../src/domain/random";
import { STAGES, bossIdsAvailableOn } from "../../src/gameplay/stages";
import type { BossId } from "../../src/gameplay/run/content-director";
import {
  GAUNTLET_RULES,
  GAUNTLET_WAVES_PER_TRIAL,
  gauntletBossHeal,
  gauntletLabel,
  gauntletTrialOrder,
  gauntletWave,
} from "../../src/gameplay/run/gauntlet-trials";
import { planNextWave, type WavePlanningState, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { planWaveClear, type WaveClearInput } from "../../src/gameplay/run/wave-clear-planner";
import { bossScaling, describeWave, waveTitle } from "../../src/gameplay/run/wave-rules";
import { stageIdAfterWave } from "../../src/app/run/wave-composition";

const STAGE_INPUT: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight: weight ?? 1, unlockWave: unlockWave ?? 1 })),
}));

const ROSTER = bossIdsAvailableOn("gauntlet");

function trialOrder(seed: string): BossId[] {
  return gauntletTrialOrder(ROSTER, new SeededRandom(seed));
}

/** Plans a whole Gauntlet, wave by wave, the way the live wave controller carries state between waves. */
function planGauntlet(seed: string, order = trialOrder(seed)) {
  const random = new SeededRandom(`${seed}:waves`);
  let state: WavePlanningState = {
    mode: "gauntlet",
    wave: 0,
    diffHp: 1,
    diffCount: 1,
    bossOrder: order,
    bossIdx: 0,
    bossesBeaten: 0,
    curBoss: null,
    currentStageIndex: 0,
    biomeIdx: null,
    pendingBossOutro: null,
  };
  const waves = [];
  for (let index = 0; index < order.length * GAUNTLET_WAVES_PER_TRIAL; index += 1) {
    const planned = planNextWave({
      state,
      tuning: CONFIG.run,
      stages: STAGE_INPUT,
      presets: PRESETS,
      random,
      startDelay: CONFIG.run.startDelay,
      currentMultiplier: 1,
    });
    waves.push(planned);
    state = { ...planned.state, currentStageIndex: planned.state.stage ?? state.currentStageIndex };
  }
  return waves;
}

describe("Gauntlet trial order", () => {
  it("has one trial per boss the Gauntlet fields, opened by the Warden and closed by the Source", () => {
    expect(ROSTER.length).toBeGreaterThan(2);
    for (const seed of ["a", "b", "c", "d"]) {
      const order = trialOrder(seed);
      expect([...order].sort()).toEqual([...ROSTER].sort());
      expect(order[0]).toBe("warden");
      expect(order.at(-1)).toBe("source");
    }
  });

  it("shuffles the middle from the seed: the same seed gives the same order", () => {
    expect(trialOrder("seed-1")).toEqual(trialOrder("seed-1"));
    const orders = new Set(Array.from({ length: 24 }, (_, index) => trialOrder(`seed-${String(index)}`).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("refuses an empty or repeating roster", () => {
    expect(() => gauntletTrialOrder([], new SeededRandom("x"))).toThrow(RangeError);
    expect(() => gauntletTrialOrder(["warden", "warden"], new SeededRandom("x"))).toThrow(RangeError);
  });
});

describe("Gauntlet waves", () => {
  it("numbers each trial as two rounds and a boss", () => {
    expect(gauntletWave(1)).toEqual({ trial: 0, round: 1, boss: false, opensTrial: true });
    expect(gauntletWave(2)).toEqual({ trial: 0, round: 2, boss: false, opensTrial: false });
    expect(gauntletWave(3)).toEqual({ trial: 0, round: null, boss: true, opensTrial: false });
    expect(gauntletWave(4)).toEqual({ trial: 1, round: 1, boss: false, opensTrial: true });
    expect(describeWave({ mode: "gauntlet", wave: 3 })).toMatchObject({
      bossWave: true,
      hordeWave: false,
      miniBossWave: false,
      endlessBiome: null,
      gauntletTrial: 0,
    });
  });

  it("labels the HUD and banner by trial and round", () => {
    expect(gauntletLabel(4, 6)).toBe("TRIAL 2/6 · ROUND 1/2");
    expect(gauntletLabel(6, 6)).toBe("TRIAL 2/6 · BOSS");
    expect(waveTitle("gauntlet", 6, true, 6)).toBe("TRIAL 2/6 · BOSS");
    expect(waveTitle("endless", 6, false)).toBe("WAVE 6");
  });

  it("plays every trial in its boss's home stage, loading it once with a trial card", () => {
    const order = trialOrder("homes");
    const waves = planGauntlet("homes", order);
    waves.forEach((planned, index) => {
      const position = gauntletWave(index + 1);
      const boss = order[position.trial];
      expect(planned.state.curBoss).toBe(boss);
      expect(STAGE_INPUT[planned.state.stage ?? -1]?.boss).toBe(boss);
      const loads = planned.intents.filter((intent) => intent.type === "load-stage");
      expect(loads).toHaveLength(position.opensTrial ? 1 : 0);
      if (position.opensTrial) {
        expect(planned.intents).toContainEqual(
          expect.objectContaining({ type: "set-stage-banner", duration: GAUNTLET_RULES.trialCardSeconds }),
        );
        expect(planned.intents.some((intent) => intent.type === "begin-wipe")).toBe(index > 0);
      }
      expect(planned.state.isBossWave).toBe(position.boss);
      if (position.boss) expect(planned.state.spawnQueue).toEqual([{ type: "boss" }]);
    });
  });

  it("builds rounds from the table: R1 plain, R2 bigger with one one-affix gatekeeper, no random elites", () => {
    const waves = planGauntlet("rounds");
    const count = (localWave: number) =>
      CONFIG.run.firstWaveCount + Math.floor((localWave - 1) * CONFIG.run.countPerWave);
    for (const [index, planned] of waves.entries()) {
      const position = gauntletWave(index + 1);
      if (position.round === null) continue;
      const round = GAUNTLET_RULES.rounds[position.round - 1];
      if (round === undefined) throw new Error("round missing");
      const queue = planned.state.spawnQueue;
      expect(queue).toHaveLength(count(round.localWave) + round.extraEnemies + round.gatekeepers);
      const elites = queue.filter((spec) => spec.preset !== undefined);
      expect(elites).toHaveLength(round.gatekeepers);
      for (const elite of elites) expect(elite.preset?.affixes).toEqual([GAUNTLET_RULES.gatekeeperAffix]);
      const pool = new Set(STAGE_INPUT[planned.state.stage ?? -1]?.pool.map((entry) => entry.kind));
      for (const spec of queue) expect(pool.has(spec.type as never), spec.type).toBe(true);
    }
  });

  it("scales enemies and bosses by the trial index only", () => {
    const waves = planGauntlet("scale");
    const firstRound = waves[0]?.state.spawnQueue[0];
    const laterRound = waves[3 * GAUNTLET_WAVES_PER_TRIAL]?.state.spawnQueue[0];
    expect(firstRound?.hpScale).toBeCloseTo(1 + (2 - 1) * CONFIG.run.hpScalePerWave);
    expect(laterRound?.hpScale).toBeCloseTo((1 + CONFIG.run.hpScalePerWave) * (1 + 3 * 0.15));
    expect(laterRound?.dmgScale).toBeCloseTo(1 + 3 * 0.07);
    const boss = (wave: number) =>
      bossScaling({
        mode: "gauntlet",
        wave,
        bossesBeaten: 9,
        campaignStage: 0,
        placeholderBoss: false,
        difficultyHp: 1,
      });
    expect(boss(3)).toEqual({ health: 1, contactDamage: 1 });
    expect(boss(9).health).toBeCloseTo(1.24);
    expect(boss(9).contactDamage).toBeCloseTo(1.1);
    // Boss Test keeps its own formula.
    expect(
      bossScaling({
        mode: "bossonly",
        wave: 2,
        bossesBeaten: 1,
        campaignStage: 0,
        placeholderBoss: false,
        difficultyHp: 1,
      }).health,
    ).toBeCloseTo(1 + 2 * 0.12 + 0.06);
  });

  it("prefetches the next trial's stage from the trial order", () => {
    const order = trialOrder("prefetch");
    const next = STAGES.find((stage) => stage.boss === order[1])?.id;
    expect(stageIdAfterWave("gauntlet", 3, STAGES, order)).toBe(next);
    expect(stageIdAfterWave("gauntlet", 1, STAGES, order)).toBe(STAGES.find((stage) => stage.boss === "warden")?.id);
  });
});

function clearInput(overrides: Partial<WaveClearInput> & { boss?: boolean; beaten?: number }): WaveClearInput {
  const { boss = false, beaten = 0, ...rest } = overrides;
  return {
    state: {
      mode: "gauntlet",
      diff: "hard",
      wave: boss ? 3 : 1,
      isBossWave: boss,
      horde: false,
      waveTime: 40,
      waveKills: 5,
      wavePeak: 2,
      runTime: 100,
      bossesBeaten: beaten,
      damagedThisWave: false,
      damagedThisStage: false,
      clearTimer: -1,
      pendingReward: null,
      waveLog: [],
    },
    dt: 0.1,
    waveLifecycleActive: true,
    spawnQueueLength: 0,
    enemyCount: 0,
    achievementTracking: true,
    playerOneHit: false,
    ownedAbilityCount: 0,
    stageIndex: 0,
    stageCount: 6,
    currentStageAccent: "#fff",
    healEachWave: 12,
    waveHealBonus: 3,
    waveClearPause: 0.8,
    availableTierUpCount: 2,
    playerHealth: { hp: 40, maxHp: 100 },
    trialCount: 6,
    ...rest,
  };
}

describe("Gauntlet clears", () => {
  it("restores nothing after a round and opens the draft", () => {
    const result = planWaveClear(clearInput({}));
    expect(result.intents.some((intent) => intent.type === "heal-player")).toBe(false);
    expect(result.intents).toContainEqual({ type: "prepare-reward", reward: "draft" });
  });

  it("restores half the missing health when a boss falls, then a tier-up", () => {
    const result = planWaveClear(clearInput({ boss: true }));
    expect(result.intents).toContainEqual({ type: "heal-player", amount: 30 });
    expect(result.intents).toContainEqual({ type: "prepare-reward", reward: "boss" });
    expect(result.state.bossesBeaten).toBe(1);
    expect(result.terminal).toBe(false);
    expect(gauntletBossHeal(40, 100, true)).toBe(0);
    const oneHit = planWaveClear(clearInput({ boss: true, playerOneHit: true }));
    expect(oneHit.intents.some((intent) => intent.type === "heal-player")).toBe(false);
  });

  it("wins the run on the last trial's boss and records the clear stats", () => {
    const result = planWaveClear(clearInput({ boss: true, beaten: 5 }));
    expect(result.terminal).toBe(true);
    expect(result.intents.at(-1)).toEqual({ type: "win-run" });
    expect(result.intents).toContainEqual({ type: "profile-max", stat: "gauntletFull", value: 1 });
    expect(result.intents).toContainEqual({ type: "profile-max", stat: "gauntletClearHard", value: 1 });
    expect(result.intents).toContainEqual({ type: "profile-add", stat: "gauntletFlawlessTrials", value: 1 });
    expect(result.intents).toContainEqual({ type: "profile-max", stat: "gauntletBestTrial", value: 6 });
  });

  it("counts a flawless trial only without a hit in the trial", () => {
    const hit = clearInput({ boss: true });
    const result = planWaveClear({ ...hit, state: { ...hit.state, damagedThisStage: true } });
    expect(
      result.intents.some((intent) => intent.type === "profile-add" && intent.stat === "gauntletFlawlessTrials"),
    ).toBe(false);
    expect(result.state.damagedThisStage).toBe(false);
  });
});
