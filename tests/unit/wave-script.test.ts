import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom } from "../../src/domain/random";
import { PRESETS } from "../../src/gameplay/affixes";
import { CAMPAIGN_STAGE_CURVES, type CampaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";
import { compositionCost } from "../../src/gameplay/run/composition-budget";
import { BOSS_ROSTER, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type WaveSpawnSpec, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { describeWave } from "../../src/gameplay/run/wave-rules";
import { scriptedWave, type WaveScriptRow } from "../../src/gameplay/run/wave-script";
import type { RunMode } from "../../src/gameplay/run/session";
import { STAGES } from "../../src/gameplay/stages";

const SEEDS = 300;
const WAVES_PER_STAGE = 10;

const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight, unlockWave: unlockWave ?? 1 })),
}));
const curves: Readonly<Partial<Record<string, CampaignStageCurve>>> = CAMPAIGN_STAGE_CURVES;

interface ScriptedCase {
  readonly stageIndex: number;
  readonly stage: WaveStage;
  readonly curve: CampaignStageCurve;
  readonly localWave: number;
  readonly row: WaveScriptRow;
}

/** Every scripted wave of every campaign stage: the test covers a new stage's table the day it is added. */
const scriptedCases: readonly ScriptedCase[] = stages.flatMap((stage, stageIndex) => {
  const curve = curves[stage.id];
  return (curve?.waves?.localWaves ?? []).map((row, index) => {
    if (curve === undefined) throw new Error("a scripted stage has a curve");
    return { stageIndex, stage, curve, localWave: index + 1, row };
  });
});

function queueOf(mode: RunMode, wave: number, stageIndex: number, seed: string): readonly WaveSpawnSpec[] {
  return planNextWave({
    state: {
      mode,
      wave: wave - 1,
      diffHp: 1,
      diffCount: 1,
      bossOrder: BOSS_ROSTER.map((boss) => boss.id),
      bossIdx: 0,
      bossesBeaten: 0,
      curBoss: null,
      currentStageIndex: stageIndex,
      biomeIdx: stageIndex,
      pendingBossOutro: null,
    },
    tuning: CONFIG.run,
    stages,
    presets: PRESETS,
    random: new SeededRandom(seed),
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 1,
  }).state.spawnQueue;
}

const kindsOf = (queue: readonly WaveSpawnSpec[]): readonly string[] => queue.map((spawn) => spawn.type);

describe("stage wave scripts", () => {
  it("Verdant has a row for each of its nine waves before the boss", () => {
    const verdant = scriptedCases.filter((entry) => entry.stage.id === "verdant-sanctum");
    expect(verdant.map((entry) => entry.localWave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(verdant.every((entry) => entry.row.purpose.length > 0)).toBe(true);
  });

  it("every scripted campaign wave starts and ends with its listed enemies, in order, on every seed", () => {
    expect(scriptedCases.length).toBeGreaterThan(0);
    for (const { stageIndex, stage, curve, localWave, row } of scriptedCases) {
      const first = [...row.first];
      const last = [...(row.last ?? [])];
      const count = CONFIG.run.firstWaveCount + Math.floor((localWave - 1) * CONFIG.run.countPerWave) + curve.countAdd;
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const queue = queueOf(
          "campaign",
          stageIndex * WAVES_PER_STAGE + localWave,
          stageIndex,
          `${stage.id}-${String(localWave)}-${String(seed)}`,
        );
        const label = `${stage.id} wave ${String(localWave)} seed ${String(seed)}`;
        expect(kindsOf(queue.slice(0, first.length)), label).toEqual(first);
        expect(kindsOf(queue.slice(queue.length - last.length)), label).toEqual(last);
        // The script does not add enemies: the wave is as large as it was.
        expect(queue.length, label).toBe(count);
        // Scripted enemies are marked plain, which the spawn step reads; an elite can only come from the fill.
        const scriptedSpawns = [...queue.slice(0, first.length), ...queue.slice(queue.length - last.length)];
        expect(
          scriptedSpawns.every((spawn) => spawn.preset === undefined && spawn.plain === true),
          label,
        ).toBe(true);
        const filled = queue.slice(first.length, queue.length - last.length);
        expect(
          filled.every((spawn) => spawn.plain === undefined),
          label,
        ).toBe(true);
      }
    }
  });

  it("the whole wave, script and fill together, stays inside the stage's budget and caps", () => {
    for (const { stageIndex, stage, curve, localWave } of scriptedCases) {
      const composition = curve.composition;
      if (composition === undefined) continue;
      const budget = composition.localWaveBudgets[localWave - 1] ?? -1;
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const queue = queueOf("campaign", stageIndex * WAVES_PER_STAGE + localWave, stageIndex, `b-${String(seed)}`);
        const kinds = kindsOf(queue) as readonly EnemyKind[];
        const spent = kinds.reduce((total, kind) => total + compositionCost(composition, kind), 0);
        expect(spent, `${stage.id} wave ${String(localWave)}`).toBeLessThanOrEqual(budget);
        for (const [kind, caps] of Object.entries(composition.maximumPerWave)) {
          const cap = caps[localWave - 1] ?? -1;
          expect(kinds.filter((entry) => entry === kind).length, `${stage.id} ${kind}`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });

  it("a row lists only enemies the stage pool has unlocked by that wave, and fits in the wave", () => {
    for (const { stage, curve, localWave, row } of scriptedCases) {
      const unlocked = new Set(stage.pool.filter((entry) => localWave >= entry.unlockWave).map((entry) => entry.kind));
      const listed = [...row.first, ...(row.last ?? [])];
      expect(
        listed.filter((kind) => !unlocked.has(kind)),
        `${stage.id} wave ${String(localWave)}`,
      ).toEqual([]);
      const smallest = CONFIG.run.firstWaveCount + Math.floor((localWave - 1) * CONFIG.run.countPerWave);
      expect(listed.length, `${stage.id} wave ${String(localWave)}`).toBeLessThanOrEqual(smallest + curve.countAdd);
    }
  });

  it("a scripted stage's waves in Endless start with the same listed enemies", () => {
    for (const { stageIndex, stage, localWave, row } of scriptedCases) {
      let wave = 0;
      for (let candidate = 1; candidate <= 200 && wave === 0; candidate += 1) {
        const description = describeWave({ mode: "endless", wave: candidate });
        const ordinary = !description.bossWave && !description.miniBossWave && !description.hordeWave;
        if (description.endlessBiome === stageIndex && ordinary && ((candidate - 1) % 5) + 1 === localWave)
          wave = candidate;
      }
      if (wave === 0) continue;
      const queue = queueOf("endless", wave, stageIndex, `endless-${stage.id}-${String(localWave)}`);
      expect(kindsOf(queue.slice(0, row.first.length)), `${stage.id} endless wave ${String(wave)}`).toEqual([
        ...row.first,
      ]);
    }
  });

  it("a stage without a script, or a wave without a row, is not scripted", () => {
    expect(scriptedWave(undefined, 1)).toEqual({ first: [], last: [] });
    expect(scriptedWave({ localWaves: [{ purpose: "one", first: ["charger"] }] }, 2)).toEqual({
      first: [],
      last: [],
    });
    expect(scriptedWave({ localWaves: [{ purpose: "one", first: ["charger"] }] }, 1)).toEqual({
      first: ["charger"],
      last: [],
    });
    expect(curves.grounds?.waves).toBeUndefined();
  });
});
