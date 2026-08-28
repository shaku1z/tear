import { describe, expect, it } from "vitest";
import { PRESETS } from "../../src/gameplay/affixes";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom, type RandomSource } from "../../src/domain/random";
import { BOSS_ROSTER, ENEMY_IDENTITY_IDS, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type PlanNextWaveOptions, type WavePlanningState, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { STAGES } from "../../src/gameplay/stages";
import { PLAYGROUND_ALL_KINDS } from "../../src/gameplay/training/playground-controller";

class ConstantRandom implements RandomSource {
  constructor(private readonly value: number) {}
  next(): number { return this.value; }
}

const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => {
    if (typeof weight !== "number" || typeof unlockWave !== "number") throw new TypeError("invalid stage pool tuple");
    return { kind, weight, unlockWave };
  }),
}));

function state(overrides: Partial<WavePlanningState>): WavePlanningState {
  return {
    mode: "campaign", wave: 0, diffHp: 1, diffCount: 1,
    bossOrder: BOSS_ROSTER.map((boss) => boss.id), bossIdx: 0, bossesBeaten: 0,
    curBoss: null, currentStageIndex: 0, biomeIdx: null, pendingBossOutro: null,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanNextWaveOptions> & { state: WavePlanningState }) {
  return planNextWave({
    tuning: CONFIG.run, stages, presets: PRESETS, random: new ConstantRandom(0.999),
    startDelay: CONFIG.run.startDelay, currentMultiplier: 1, ...overrides,
  });
}

describe("Verdant mode coverage", () => {
  it("projects every canonical enemy identity into Playground and Enemy Test", () => {
    expect(PLAYGROUND_ALL_KINDS).toEqual(ENEMY_IDENTITY_IDS);

    const seen = new Set<EnemyKind>();
    for (let seed = 0; seed < 600; seed += 1) {
      const wave = plan({ state: state({ mode: "sandbox" }), random: new SeededRandom(`verdant-sandbox-${String(seed)}`) });
      for (const spawn of wave.state.spawnQueue) {
        if (spawn.type !== "boss" && spawn.type !== "miniboss") seen.add(spawn.type);
      }
    }
    expect(seen).toEqual(new Set(ENEMY_IDENTITY_IDS));
  });

  it.each(["endless", "gauntlet"] as const)("uses the authored Verdant pool when %s rotates into the biome", (mode) => {
    const wave = plan({ state: state({ mode, wave: 16, currentStageIndex: 3, biomeIdx: 3 }) });
    expect(wave.state).toMatchObject({ wave: 17, stage: 3, currentStageIndex: 3, biomeIdx: 3 });
    expect(wave.state.spawnQueue.some((spawn) => spawn.type === "rootbinder")).toBe(true);
    expect(wave.state.spawnQueue.every((spawn) => stages[3]?.pool.some((entry) => entry.kind === spawn.type))).toBe(true);
  });

  it("keeps Campaign and Boss Test on the same Verdant and Rootbound authorities", () => {
    const campaign = plan({ state: state({ mode: "campaign", wave: 31, currentStageIndex: 3, biomeIdx: 3 }) });
    expect(campaign.state.spawnQueue.some((spawn) => spawn.type === "rootbinder")).toBe(true);

    const rootboundIndex = BOSS_ROSTER.findIndex((boss) => boss.id === "rootbound");
    const bossTest = plan({
      state: state({ mode: "bossonly", wave: rootboundIndex, bossIdx: rootboundIndex }),
      bossOnly: true,
    });
    expect(bossTest.state).toMatchObject({ curBoss: "rootbound", stage: 3, currentStageIndex: 3 });
  });
});
