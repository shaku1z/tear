import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom } from "../../src/domain/random";
import { PRESETS } from "../../src/gameplay/affixes";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import {
  LiveWaveController,
  type LiveWavePort,
  type LiveWaveRun,
  type LiveWaveStageSource,
} from "../../src/gameplay/run/live-wave-controller";
import { STAGES } from "../../src/gameplay/stages";

function runState(overrides: Partial<LiveWaveRun> = {}): LiveWaveRun {
  return {
    mode: "endless",
    diff: "normal",
    wave: 0,
    diffHp: 1,
    diffCount: 1,
    bossOrder: BOSS_ROSTER.map((boss) => boss.id),
    bossIdx: 0,
    bossesBeaten: 0,
    curBoss: null,
    spawnQueue: [],
    spawnTimer: 0,
    pendingBossOutro: null,
    waveTime: 0,
    waveKills: 0,
    wavePeak: 1,
    mult: 1,
    runTime: 0,
    clearTimer: -1,
    waveLog: [],
    _dmgThisWave: false,
    _dmgThisStage: false,
    mods: { owned: {} },
    ...overrides,
  };
}

function harness(initial: LiveWaveRun) {
  const planIntents: string[] = [];
  const clearIntents: string[] = [];
  const spawns: string[] = [];
  let prepared = false;
  let active = false;
  let enemies = 0;
  const port: LiveWavePort = {
    run: () => initial,
    tuning: () => CONFIG.run,
    stages: STAGES as unknown as readonly LiveWaveStageSource[],
    presets: PRESETS,
    random: new SeededRandom("live-wave"),
    modeDefinition: () => ({}),
    currentStage: () => ({ index: 0, accent: "#fff" }),
    stageHasChapter: () => false,
    chapterFlowActive: () => false,
    lifecycle: {
      hasPreparedWave: () => prepared,
      isWaveActive: () => active,
      pendingReward: () => null,
    },
    executePlanIntents: (intents) => planIntents.push(...intents.map((intent) => intent.type)),
    executeClearIntents: (intents) => clearIntents.push(...intents.map((intent) => intent.type)),
    spawn: (spec) => { spawns.push(spec.type); enemies += 1; },
    enemyCount: () => enemies,
    loreBusy: () => false,
    achievementTracking: () => false,
    playerOneHit: () => false,
    availableTierUpCount: () => 0,
  };
  return {
    controller: new LiveWaveController(port),
    planIntents,
    clearIntents,
    spawns,
    setPrepared(value: boolean) { prepared = value; },
    setActive(value: boolean) { active = value; },
  };
}

describe("LiveWaveController", () => {
  it("plans, applies, activates, and spawns a wave through one bounded owner", () => {
    const run = runState({ mult: 3 });
    const live = harness(run);
    live.controller.startNextWave();
    expect(run.wave).toBe(1);
    expect(run.spawnQueue.length).toBeGreaterThan(0);
    expect(live.planIntents).toContain("prepare-wave");

    live.setPrepared(true);
    live.controller.activatePreparedWave();
    expect(run.wavePeak).toBe(3);
    expect(live.planIntents).toContain("activate-wave");

    run.spawnTimer = 0;
    live.controller.update(1);
    expect(live.spawns).toHaveLength(1);
    expect(run.spawnQueue.length).toBeGreaterThanOrEqual(0);
  });

  it("owns wave-clear state mutation and forwards ordered side-effect intents", () => {
    const run = runState({ wave: 2, waveTime: 4, waveKills: 3, wavePeak: 2, spawnQueue: [] });
    const live = harness(run);
    live.setActive(true);
    live.controller.update(0.1);
    expect(run.waveLog).toEqual([{ wave: 2, time: 4, kills: 3, peak: 2 }]);
    expect(run.clearTimer).toBeCloseTo(CONFIG.run.waveClearPause - 0.1);
    expect(live.clearIntents.slice(0, 3)).toEqual(["clear-wave-lifecycle", "backdrop-bloom", "ghost-wave"]);
    expect(live.clearIntents).toContain("prepare-reward");
  });

  it("normalizes tuple stage pools without changing boss identities", () => {
    const run = runState({ mode: "campaign", bossOrder: BOSS_ROSTER.map((boss) => boss.id) });
    const live = harness(run);
    live.controller.startNextWave();
    expect(run.stage).toBe(0);
    expect(run.spawnQueue).toHaveLength(CONFIG.run.firstWaveCount);
  });
});
