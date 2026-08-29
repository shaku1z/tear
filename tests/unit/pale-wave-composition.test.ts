import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { SeededRandom } from "../../src/domain/random";
import { PRESETS } from "../../src/gameplay/affixes";
import { stageEnvironmentDefinition } from "../../src/gameplay/environment/stage-environment-definitions";
import { campaignStageCurve, sevenStageCurveDelta } from "../../src/gameplay/run/campaign-stage-curve";
import { compositionCost } from "../../src/gameplay/run/composition-budget";
import { BOSS_ROSTER, type EnemyKind } from "../../src/gameplay/run/content-director";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { concurrentEnemyCap } from "../../src/gameplay/run/spawn-scheduler";
import { planWaveClear, type WaveClearInput, type WaveClearState } from "../../src/gameplay/run/wave-clear-planner";
import { planNextWave, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { STAGES } from "../../src/gameplay/stages";
import { PALE_VARIANT_IDS, selectVariant } from "../../src/gameplay/variants";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

const PALE_STAGE_INDEX = 4;
const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight, unlockWave: unlockWave ?? 1 })),
}));

function palePlan(localWave: number, seed: string, scaling = { enemyHealth: 1, enemyCount: 1 }) {
  return planNextWave({
    state: {
      mode: "campaign", wave: 39 + localWave, diffHp: scaling.enemyHealth, diffCount: scaling.enemyCount,
      bossOrder: BOSS_ROSTER.map((boss) => boss.id), bossIdx: 0, bossesBeaten: 0,
      curBoss: null, currentStageIndex: PALE_STAGE_INDEX, biomeIdx: PALE_STAGE_INDEX, pendingBossOutro: null,
    },
    tuning: CONFIG.run,
    stages,
    presets: PRESETS,
    random: new SeededRandom(seed),
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 1,
  });
}

function clearInput(overrides: Partial<WaveClearInput> = {}): WaveClearInput {
  const state: WaveClearState = {
    mode: "campaign", diff: "normal", wave: 49, isBossWave: false, horde: false,
    waveTime: 25, waveKills: 20, wavePeak: 9, runTime: 420, bossesBeaten: 4,
    damagedThisWave: false, damagedThisStage: false, clearTimer: -1, pendingReward: null, waveLog: [],
  };
  return {
    state, dt: 0, waveLifecycleActive: true, spawnQueueLength: 0, enemyCount: 0,
    achievementTracking: true, playerOneHit: false, ownedAbilityCount: 8,
    stageIndex: PALE_STAGE_INDEX, stageCount: STAGES.length,
    currentStageAccent: STAGES[PALE_STAGE_INDEX]?.accent ?? "missing",
    healEachWave: CONFIG.run.healEachWave, waveHealBonus: 3,
    waveClearPause: CONFIG.run.waveClearPause, availableTierUpCount: 1,
    ...overrides,
  };
}

describe("Pale campaign composition", () => {
  it("bounds pack, route, shield, and control pressure across seeded waves", () => {
    const composition = campaignStageCurve("pale-traverse").composition;
    if (composition === undefined) throw new Error("Pale composition authority is missing");
    for (let localWave = 1; localWave <= 9; localWave += 1) {
      for (let seed = 0; seed < 100; seed += 1) {
        const queue = palePlan(localWave, `pale-budget-${String(localWave)}-${String(seed)}`).state.spawnQueue;
        const spent = queue.reduce((total, spawn) => total + compositionCost(composition, spawn.type as EnemyKind), 0);
        expect(spent).toBeLessThanOrEqual(composition.localWaveBudgets[localWave - 1] ?? -1);
        for (const kind of ["rimehound", "charger", "wraith", "anchor"] as const) {
          const count = queue.filter((spawn) => spawn.type === kind).length;
          expect(count).toBeLessThanOrEqual(composition.maximumPerWave[kind]?.[localWave - 1] ?? -1);
        }
      }
    }
  });

  it("uses the authored local counts, unlocks, scaling, and Pale family pool for waves 41-49", () => {
    const pale = STAGES[PALE_STAGE_INDEX];
    expect(pale).toMatchObject({ id: "pale-traverse", boss: "white-hart" });
    expect(pale?.pool.map(([kind]) => kind)).toEqual([
      "rimehound", "ranged", "charger", "flyer", "armored", "bomber", "wraith", "anchor", "chimera",
    ]);
    for (let localWave = 1; localWave <= 9; localWave += 1) {
      const planned = palePlan(localWave, `pale-local-${String(localWave)}`);
      const allowed = new Set(pale?.pool.filter((entry) => localWave >= (entry[2] ?? 1)).map((entry) => entry[0]));
      expect(planned.state).toMatchObject({ wave: 40 + localWave, stage: PALE_STAGE_INDEX, isBossWave: false });
      expect(planned.state.spawnQueue).toHaveLength(3 + Math.floor((localWave - 1) * 1.4) + 6);
      expect(planned.state.spawnQueue.every((spawn) => allowed.has(spawn.type as EnemyKind))).toBe(true);
      expect(planned.state.spawnQueue[0]?.hpScale).toBeCloseTo(2.08 * (1 + (localWave - 1) * 0.06));
      expect(planned.state.spawnQueue[0]?.dmgScale).toBeCloseTo(1.44 * (1 + (localWave - 1) * 0.02));
    }
  });

  it("makes every Pale-native variant family naturally reachable at its local-wave gate", () => {
    const variantFamilies = new Map([
      ["rime-runner", "charger"], ["prism-seer", "ranged"], ["snowfall-kite", "flyer"],
      ["hailcaster", "bomber"], ["glacier-guard", "armored"],
    ] as const);
    expect([...variantFamilies.keys()]).toEqual(PALE_VARIANT_IDS);
    for (const [variantId, kind] of variantFamilies) {
      const familyAppears = Array.from({ length: 200 }, (_, seed) => palePlan(9, `pale-family-${kind}-${String(seed)}`))
        .some((plan) => plan.state.spawnQueue.some((spawn) => spawn.type === kind));
      expect(familyAppears, `${kind} must occur in Pale's natural campaign queue`).toBe(true);
      let found = false;
      for (let seed = 0; seed < 500 && !found; seed += 1) {
        found = selectVariant(kind, {
          stageId: "pale-traverse", localWave: 5, globalWave: 45, mode: "campaign",
          random: new SeededRandom(`pale-variant-${variantId}-${String(seed)}`),
        })?.id === variantId;
      }
      expect(found, `${variantId} must be selectable from Pale's ${kind} family`).toBe(true);
    }
  });

  it("resolves wave 50 through the White Hart stage authority", () => {
    const planned = palePlan(10, "white-hart-wave-50");
    expect(planned.state).toMatchObject({
      wave: 50, stage: PALE_STAGE_INDEX, currentStageIndex: PALE_STAGE_INDEX,
      isBossWave: true, curBoss: null,
    });
    expect(STAGES[planned.state.stage ?? -1]?.boss).toBe("white-hart");
    expect(planned.state.spawnQueue).toEqual([{ type: "boss" }]);
    expect(planned.intents).toContainEqual({ type: "ghost-wave", wave: 50, marker: "boss" });
  });

  it("applies every production difficulty exactly once and preserves Pale's bounded concurrency", () => {
    for (const difficulty of DIFFICULTY_CATALOG) {
      const planned = palePlan(1, `pale-difficulty-${difficulty.id}`, difficulty.modifiers);
      expect(planned.state.spawnQueue).toHaveLength(Math.round(9 * difficulty.modifiers.enemyCount));
      expect(planned.state.spawnQueue[0]?.hpScale).toBeCloseTo(2.08 * difficulty.modifiers.enemyHealth);
      expect(planned.state.spawnQueue[0]?.dmgScale).toBeCloseTo(1.44);

      const replay = createProductionReplayWorld({ seed: `pale-${difficulty.id}`, mode: "campaign", difficulty: difficulty.id });
      const player = replay.world.state.player() as never as {
        hp: number; maxHp: number; oneHit: boolean;
        takeDamage(damage: number, sourceX: number): string;
      };
      expect(replay.dependencies.CONFIG.player.dmgTakenMult).toBeCloseTo(difficulty.modifiers.playerDamageTaken);
      expect(player.oneHit).toBe(difficulty.oneHit);
      expect(player.takeDamage(10, 0)).toBe("hit");
      expect(player.hp).toBe(difficulty.oneHit ? 0 : player.maxHp - 10 * difficulty.modifiers.playerDamageTaken);
    }
    expect(concurrentEnemyCap({ mode: "campaign", wave: 41, stageId: "pale-traverse", horde: false }, CONFIG.run)).toBe(9);
    expect(stageEnvironmentDefinition("pale-traverse")).toMatchObject({
      maximumFields: 4, maximumCombatObjects: 8, maximumRoutes: 3,
    });
  });

  it("keeps wave 49 on normal heal/draft and wave 50 on inter-stage heal/boss reward", () => {
    const regular = planWaveClear(clearInput());
    expect(regular.terminal).toBe(false);
    expect(regular.intents).toContainEqual({ type: "heal-player", amount: CONFIG.run.healEachWave + 3 });
    expect(regular.intents).toContainEqual({ type: "prepare-reward", reward: "draft" });
    expect(regular.state).toMatchObject({ pendingReward: "draft", clearTimer: CONFIG.run.waveClearPause });
    const regularDraft = planWaveClear(clearInput({
      state: regular.state, dt: CONFIG.run.waveClearPause + 0.01,
      waveLifecycleActive: false,
    }));
    expect(regularDraft.intents).toContainEqual({ type: "open-draft" });

    const bossState = { ...clearInput().state, wave: 50, isBossWave: true };
    const boss = planWaveClear(clearInput({ state: bossState }));
    expect(boss.terminal).toBe(false);
    expect(boss.intents).toContainEqual({ type: "heal-player", amount: CONFIG.run.healEachWave * 2 + 3 });
    expect(boss.intents).toContainEqual({ type: "prepare-reward", reward: "boss" });
    expect(boss.intents).toContainEqual({ type: "stage-done" });
    expect(boss.intents).not.toContainEqual({ type: "start-adventure-finale" });
    expect(boss.state).toMatchObject({ pendingReward: "boss", clearTimer: CONFIG.run.waveClearPause * 1.6 });
    const bossTier = planWaveClear(clearInput({
      state: boss.state, dt: CONFIG.run.waveClearPause * 1.6 + 0.01,
      waveLifecycleActive: false,
    }));
    expect(bossTier.intents).toContainEqual({ type: "open-tier-up" });

    const oneHit = planWaveClear(clearInput({
      state: { ...clearInput().state, diff: "onehit" }, playerOneHit: true,
    }));
    expect(oneHit.intents.some((intent) => intent.type === "heal-player")).toBe(false);
    expect(oneHit.intents).toContainEqual({ type: "prepare-reward", reward: "draft" });
  });

  it("leaves Echo and Source relocation pressure as read-only C22 comparison data", () => {
    expect(campaignStageCurve("voidspire")).toMatchObject({
      health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4, disposition: "legacy-position-placeholder",
    });
    expect(campaignStageCurve("tear")).toMatchObject({
      health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4, disposition: "legacy-position-placeholder",
    });
    expect(sevenStageCurveDelta("voidspire")).toMatchObject({ countAdd: -1, concurrentAdd: -1 });
    expect(sevenStageCurveDelta("tear")).toMatchObject({ countAdd: -2, concurrentAdd: 0 });
  });
});
