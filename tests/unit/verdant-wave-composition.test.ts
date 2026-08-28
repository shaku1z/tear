import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { PRESETS } from "../../src/gameplay/affixes";
import { SeededRandom } from "../../src/domain/random";
import { STAGES } from "../../src/gameplay/stages";
import { campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";
import { compositionCost } from "../../src/gameplay/run/composition-budget";
import { BOSS_ROSTER, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type WaveStage } from "../../src/gameplay/run/wave-planner";

const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight, unlockWave: unlockWave ?? 1 })),
}));

function verdantWave(localWave: number, seed: string) {
  return planNextWave({
    state: {
      mode: "campaign", wave: 29 + localWave, diffHp: 1, diffCount: 1,
      bossOrder: BOSS_ROSTER.map((boss) => boss.id), bossIdx: 0, bossesBeaten: 0,
      curBoss: null, currentStageIndex: 3, biomeIdx: 3, pendingBossOutro: null,
    },
    tuning: CONFIG.run,
    stages,
    presets: PRESETS,
    random: new SeededRandom(seed),
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 1,
  }).state.spawnQueue;
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
});
