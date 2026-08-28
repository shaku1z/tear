import { describe, expect, it } from "vitest";
import { PRESETS } from "../../src/gameplay/affixes";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom, type RandomSource } from "../../src/domain/random";
import { STAGES } from "../../src/gameplay/stages";
import {
  BOSS_ROSTER,
  type EnemyKind,
} from "../../src/gameplay/run/content-director";
import {
  activatePreparedWave,
  planNextWave,
  type PlanNextWaveOptions,
  type WavePlanningState,
  type WaveStage,
} from "../../src/gameplay/run/wave-planner";

class ConstantRandom implements RandomSource {
  constructor(private readonly value: number) {}
  next(): number { return this.value; }
}

const STAGE_INPUT: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map((entry) => {
    const [kind, weight, unlockWave] = entry;
    if (typeof weight !== "number" || typeof unlockWave !== "number") throw new TypeError("invalid campaign pool tuple");
    return { kind, weight, unlockWave };
  }),
}));

function state(overrides: Partial<WavePlanningState> = {}): WavePlanningState {
  return {
    mode: "endless",
    wave: 0,
    diffHp: 1,
    diffCount: 1,
    bossOrder: BOSS_ROSTER.map((boss) => boss.id),
    bossIdx: 0,
    bossesBeaten: 0,
    curBoss: null,
    currentStageIndex: 0,
    biomeIdx: null,
    pendingBossOutro: null,
    ...overrides,
  };
}

function options(overrides: Partial<PlanNextWaveOptions> = {}): PlanNextWaveOptions {
  return {
    state: state(),
    tuning: CONFIG.run,
    stages: STAGE_INPUT,
    presets: PRESETS,
    random: new SeededRandom("wave-plan"),
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 3,
    ...overrides,
  };
}

describe("wave planning conformance", () => {
  it("maps every campaign stage to its canonical boss and complete local pool", () => {
    expect(STAGE_INPUT.map((stage) => stage.boss)).toEqual([
      "warden", "colossus", "aldric", "rootbound", "echo", "source",
    ]);
    expect(STAGE_INPUT.map((stage) => stage.pool.map((entry) => entry.kind))).toEqual([
      ["charger", "ranged", "bomber", "armored"],
      ["armored", "bomber", "charger", "ranged", "anchor"],
      ["charger", "flyer", "bomber", "herald", "chimera"],
      ["flyer", "ranged", "charger", "rootbinder", "mender", "anchor", "armored", "chimera"],
      ["wraith", "flyer", "ranged", "priest", "chimera", "mender"],
      ["charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera", "herald", "anchor", "priest", "mender"],
    ]);
    expect(PRESETS.map((preset) => [preset.type, ...preset.affixes])).toEqual([
      ["ranged", "rapid", "volley"],
      ["charger", "tank", "armed"],
      ["armored", "warded", "tank"],
    ]);
  });

  it("preserves campaign stage cadence, transition intents, counts, and scaling", () => {
    const first = planNextWave(options({ state: state({ mode: "campaign" }) }));
    expect(first.state).toMatchObject({ wave: 1, stage: 0, currentStageIndex: 0, isBossWave: false });
    expect(first.state.spawnQueue).toHaveLength(3);
    expect(first.state.spawnQueue.every((spawn) => spawn.hpScale === 1 && spawn.dmgScale === 1)).toBe(true);
    expect(first.activationDeferred).toBe(false);
    expect(first.intents.map((intent) => intent.type)).toEqual([
      "load-stage", "set-stage-banner", "begin-campaign-chapter", "ghost-wave", "prepare-wave",
      "activate-wave", "show-wave-banner", "play-wave-sfx",
    ]);

    const stageTwo = planNextWave(options({
      state: state({ mode: "campaign", wave: 10, currentStageIndex: 0 }),
      random: new ConstantRandom(0.99),
    }));
    expect(stageTwo.state).toMatchObject({ wave: 11, stage: 1, currentStageIndex: 1 });
    expect(stageTwo.state.spawnQueue).toHaveLength(5);
    expect(stageTwo.state.spawnQueue[0]?.hpScale).toBeCloseTo(1.28);
    expect(stageTwo.state.spawnQueue[0]?.dmgScale).toBeCloseTo(1.12);
    expect(stageTwo.intents.map((intent) => intent.type).slice(0, 4)).toEqual([
      "begin-wipe", "load-stage", "set-stage-banner", "begin-campaign-chapter",
    ]);
  });

  it("uses Verdant local wave rather than global wave for pool unlocks", () => {
    const firstVerdant = planNextWave(options({
      state: state({ mode: "campaign", wave: 30, currentStageIndex: 2 }),
      random: new ConstantRandom(0.999),
    }));
    expect(firstVerdant.state).toMatchObject({ wave: 31, stage: 3 });
    expect(new Set(firstVerdant.state.spawnQueue.map((spawn) => spawn.type)))
      .toEqual(new Set(["charger"]));

    const matureVerdant = planNextWave(options({
      state: state({ mode: "campaign", wave: 35, currentStageIndex: 3 }),
      random: new ConstantRandom(0.999),
    }));
    expect(matureVerdant.state).toMatchObject({ wave: 36, stage: 3 });
    expect(matureVerdant.state.spawnQueue.some((spawn) => spawn.type === "chimera")).toBe(true);
  });

  it("preserves the existing local-wave ramp on the StageId-owned Verdant base", () => {
    expect(CONFIG.run).toMatchObject({ countPerWave: 1.4, inStageHp: 0.06, inStageDmg: 0.02 });
    const opening = planNextWave(options({
      state: state({ mode: "campaign", wave: 30, currentStageIndex: 2 }),
      random: new ConstantRandom(0.999),
    }));
    const mastery = planNextWave(options({
      state: state({ mode: "campaign", wave: 38, currentStageIndex: 3 }),
      random: new ConstantRandom(0.999),
    }));

    expect(opening.state.spawnQueue).toHaveLength(8);
    expect(opening.state.spawnQueue[0]).toMatchObject({ hpScale: 1.82, dmgScale: 1.34 });
    expect(mastery.state.spawnQueue).toHaveLength(19);
    expect(mastery.state.spawnQueue[0]?.hpScale).toBeCloseTo(1.82 * (1 + 8 * 0.06));
    expect(mastery.state.spawnQueue[0]?.dmgScale).toBeCloseTo(1.34 * (1 + 8 * 0.02));
  });

  it("defers campaign activation without overwriting live timers", () => {
    const planned = planNextWave(options({
      state: state({ mode: "campaign", pendingBossOutro: { page: 2 } }),
      chapterFlowActive: true,
    }));
    expect(planned).toMatchObject({
      activationDeferred: true,
      spawnTimer: null,
      waveTime: null,
      waveKills: null,
      wavePeak: null,
    });
    expect(planned.state.pendingBossOutro).toBeNull();
    expect(planned.intents.at(-1)).toEqual({ type: "prepare-wave", wave: 1, boss: false, deferred: true });
    expect(activatePreparedWave(0.8, 4)).toMatchObject({ spawnTimer: 0.8, waveTime: 0, waveKills: 0, wavePeak: 4 });
  });

  it("preserves endless horde, mini-boss, biome, and density rules", () => {
    const horde = planNextWave(options({ state: state({ wave: 4, biomeIdx: 0 }), random: new ConstantRandom(0.99) }));
    expect(horde.state).toMatchObject({ wave: 5, horde: true, miniBoss: null, waveTag: "⚠  HORDE" });
    expect(horde.state.spawnQueue).toHaveLength(14);
    expect(horde.state.spawnQueue[0]).toMatchObject({ hpScale: (1 + 4 * 0.12) * 0.6, dmgScale: 0.9 });

    const miniBoss = planNextWave(options({ state: state({ wave: 9, biomeIdx: 1 }), random: new ConstantRandom(0) }));
    expect(miniBoss.state).toMatchObject({ wave: 10, miniBoss: "warden", horde: false, waveTag: "MINI-BOSS  ·  The Warden" });
    expect(miniBoss.state.spawnQueue[0]).toEqual({ type: "miniboss", bossId: "warden" });
    expect(miniBoss.state.spawnQueue).toHaveLength(8);

    const biome = planNextWave(options({ state: state({ wave: 5, biomeIdx: 0 }) }));
    expect(biome.state).toMatchObject({ wave: 6, stage: 1, biomeIdx: 1 });
    expect(biome.intents.map((intent) => intent.type).slice(0, 3)).toEqual(["begin-wipe", "load-stage", "set-stage-banner"]);
  });

  it("preserves gauntlet boss cadence and boss roster wrapping", () => {
    const boss = planNextWave(options({
      state: state({ mode: "gauntlet", wave: 7, biomeIdx: 1, bossIdx: 5 }),
    }));
    expect(boss.state).toMatchObject({ wave: 8, isBossWave: true, curBoss: "source", bossIdx: 6, waveTag: "The Source" });
    expect(boss.state.spawnQueue).toEqual([{ type: "boss" }]);

    const wrappedA = planNextWave(options({
      state: state({ mode: "gauntlet", wave: 15, biomeIdx: 3, bossIdx: 6 }),
      random: new SeededRandom("wrap"),
    }));
    const wrappedB = planNextWave(options({
      state: state({ mode: "gauntlet", wave: 15, biomeIdx: 3, bossIdx: 6 }),
      random: new SeededRandom("wrap"),
    }));
    expect(wrappedA.state.bossOrder).toEqual(wrappedB.state.bossOrder);
    expect([...wrappedA.state.bossOrder].sort()).toEqual(BOSS_ROSTER.map((entry) => entry.id).sort());
    expect(wrappedA.state.bossIdx).toBe(1);

    const betweenBosses = planNextWave(options({ state: state({ mode: "gauntlet", wave: 8, biomeIdx: 1, curBoss: "source" }) }));
    expect(betweenBosses.state.curBoss).toBe("source");
  });

  it("puts every boss-test fight in its home biome and wipes after the opener", () => {
    for (const [index, boss] of BOSS_ROSTER.entries()) {
      const planned = planNextWave(options({
        state: state({ mode: "bossonly", wave: index, bossOrder: BOSS_ROSTER.map((entry) => entry.id), bossIdx: index }),
        bossOnly: true,
      }));
      const homeIndex = STAGE_INPUT.findIndex((stage) => stage.boss === boss.id);
      expect(planned.state).toMatchObject({ curBoss: boss.id, stage: homeIndex, currentStageIndex: homeIndex, isBossWave: true });
      expect(planned.intents).toContainEqual({ type: "load-stage", stageIndex: homeIndex });
      expect(planned.intents.some((intent) => intent.type === "begin-wipe")).toBe(index > 0);
    }
  });

  it("keeps authored presets inside campaign biome families", () => {
    for (let stageIndex = 0; stageIndex < STAGE_INPUT.length; stageIndex += 1) {
      const wave = stageIndex * 10 + 4;
      const planned = planNextWave(options({
        state: state({ mode: "campaign", wave: wave - 1, currentStageIndex: stageIndex }),
        random: new ConstantRandom(0),
      }));
      const legal = new Set(STAGE_INPUT[stageIndex]?.pool.map((entry) => entry.kind));
      expect(planned.state.spawnQueue.every((spawn) => legal.has(spawn.type as EnemyKind))).toBe(true);
      expect(planned.state.spawnQueue.filter((spawn) => spawn.preset !== undefined).every(
        (spawn) => legal.has(spawn.preset?.type as EnemyKind),
      )).toBe(true);
    }
  });

  it("is deterministic for all playable wave modes and difficulty scaling inputs", () => {
    const cases = ["campaign", "endless", "gauntlet", "bossonly", "sandbox"] as const;
    for (const mode of cases) {
      const prior = state({ mode, wave: mode === "bossonly" ? 2 : 3, diffHp: 1.7, diffCount: 1.4 });
      const make = () => planNextWave(options({
        state: prior,
        random: new SeededRandom(`determinism-${mode}`),
        bossOnly: mode === "bossonly",
      }));
      expect(make()).toEqual(make());
    }
  });

  it("preserves configured fixed-wave boss eligibility", () => {
    const planned = planNextWave(options({
      state: state({ mode: "sandbox", wave: 5 }),
      configuredWaves: 5,
    }));
    expect(planned.state).toMatchObject({ wave: 6, isBossWave: true });
    expect(planned.state.spawnQueue).toEqual([{ type: "boss" }]);
  });

  it("unlocks the full enemy identity roster on sandbox wave one without prematurely authoring presets", () => {
    const kinds = new Set<EnemyKind>();
    for (let seed = 0; seed < 400; seed += 1) {
      const planned = planNextWave(options({
        state: state({ mode: "sandbox" }),
        random: new SeededRandom(`sandbox-${String(seed)}`),
      }));
      for (const spawn of planned.state.spawnQueue) {
        if (spawn.type !== "boss" && spawn.type !== "miniboss") kinds.add(spawn.type);
        expect(spawn.preset).toBeUndefined();
      }
    }
    expect(kinds).toEqual(new Set([
      "charger", "ranged", "flyer", "bomber", "armored", "priest", "mender", "herald", "anchor", "wraith", "chimera", "rootbinder",
    ]));
  });
});
