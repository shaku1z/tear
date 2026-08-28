import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { PRESETS } from "../../src/gameplay/affixes";
import { SeededRandom } from "../../src/domain/random";
import { STAGES } from "../../src/gameplay/stages";
import { campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";
import { compositionCost } from "../../src/gameplay/run/composition-budget";
import { BOSS_ROSTER, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight, unlockWave: unlockWave ?? 1 })),
}));

function verdantPlan(localWave: number, seed: string, scaling = { enemyHealth: 1, enemyCount: 1 }) {
  return planNextWave({
    state: {
      mode: "campaign", wave: 29 + localWave, diffHp: scaling.enemyHealth, diffCount: scaling.enemyCount,
      bossOrder: BOSS_ROSTER.map((boss) => boss.id), bossIdx: 0, bossesBeaten: 0,
      curBoss: null, currentStageIndex: 3, biomeIdx: 3, pendingBossOutro: null,
    },
    tuning: CONFIG.run,
    stages,
    presets: PRESETS,
    random: new SeededRandom(seed),
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 1,
  });
}

function verdantWave(localWave: number, seed: string) {
  return verdantPlan(localWave, seed).state.spawnQueue;
}

describe("Verdant wave composition budget", () => {
  it("bounds support/control cost and simultaneous Rootbinders across seeded queues", () => {
    const composition = campaignStageCurve("verdant-sanctum").composition;
    if (composition === undefined) throw new Error("Verdant composition authority is missing");
    for (const localWave of [2, 3, 6, 7, 8, 9]) {
      for (let seed = 0; seed < 100; seed += 1) {
        const queue = verdantWave(localWave, `budget-${String(localWave)}-${String(seed)}`);
        const spent = queue.reduce((total, spawn) => total + compositionCost(composition, spawn.type as EnemyKind), 0);
        const rootbinders = queue.filter((spawn) => spawn.type === "rootbinder").length;
        expect(spent).toBeLessThanOrEqual(composition.localWaveBudgets[localWave - 1] ?? -1);
        expect(rootbinders).toBeLessThanOrEqual((composition.maximumPerWave.rootbinder?.[localWave - 1]) ?? -1);
      }
    }
  });

  it("keeps the opening wave free of support/control cost", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const queue = verdantWave(1, `opening-${String(seed)}`);
      expect(queue.every((spawn) => ["flyer", "ranged", "charger"].includes(spawn.type))).toBe(true);
    }
  });

  it("keeps local waves 1-9 inside authored counts and unlocks", () => {
    const verdant = STAGES.find((stage) => stage.id === "verdant-sanctum");
    if (verdant === undefined) throw new Error("Verdant stage is missing");
    for (let localWave = 1; localWave <= 9; localWave += 1) {
      const planned = verdantPlan(localWave, `local-${String(localWave)}`);
      const allowed = new Set(verdant.pool.filter((entry) => localWave >= (entry[2] ?? 1)).map((entry) => entry[0]));
      expect(planned.state).toMatchObject({ wave: 30 + localWave, stage: 3, isBossWave: false });
      expect(planned.state.spawnQueue).toHaveLength(3 + Math.floor((localWave - 1) * 1.4) + 5);
      expect(planned.state.spawnQueue.every((spawn) => allowed.has(spawn.type as EnemyKind))).toBe(true);
    }
  });

  it("resolves local wave 10 as the single Rootbound boss queue", () => {
    const planned = verdantPlan(10, "rootbound-wave");
    expect(STAGES[3]).toMatchObject({ id: "verdant-sanctum", boss: "rootbound" });
    expect(planned.state).toMatchObject({ wave: 40, stage: 3, currentStageIndex: 3, isBossWave: true });
    expect(planned.state.spawnQueue).toEqual([{ type: "boss" }]);
    expect(planned.intents).toContainEqual({ type: "ghost-wave", wave: 40, marker: "boss" });
  });

  it("applies each production difficulty exactly once across Verdant planning and player damage", () => {
    for (const difficulty of DIFFICULTY_CATALOG) {
      const planned = verdantPlan(1, `difficulty-${difficulty.id}`, difficulty.modifiers);
      expect(planned.state.spawnQueue).toHaveLength(Math.round(8 * difficulty.modifiers.enemyCount));
      expect(planned.state.spawnQueue[0]?.hpScale).toBeCloseTo(1.82 * difficulty.modifiers.enemyHealth);
      expect(planned.state.spawnQueue[0]?.dmgScale).toBeCloseTo(1.34);

      const replay = createProductionReplayWorld({ seed: `verdant-${difficulty.id}`, mode: "campaign", difficulty: difficulty.id });
      const player = replay.world.state.player() as never as {
        hp: number; maxHp: number; oneHit: boolean;
        takeDamage(damage: number, sourceX: number): string;
      };
      expect(replay.dependencies.CONFIG.player.dmgTakenMult).toBeCloseTo(difficulty.modifiers.playerDamageTaken);
      expect(player.oneHit).toBe(difficulty.oneHit);
      expect(player.takeDamage(10, 0)).toBe("hit");
      expect(player.hp).toBe(difficulty.oneHit ? 0 : player.maxHp - 10 * difficulty.modifiers.playerDamageTaken);
    }
  });
});
