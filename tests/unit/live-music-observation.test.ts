import { describe, expect, it } from "vitest";

import { buildLiveMusicObservation } from "../../src/audio/live-music-observation";

describe("live music observation", () => {
  it("projects deterministic combat state without leaking runtime objects", () => {
    const boss = { isBoss: true, bossId: "warden", hp: 40, maxHp: 100, phaseMarks: [0.7, 0.4] };
    const observation = buildLiveMusicObservation({
      appState: "playing",
      run: { runTime: 12.3456, mode: "campaign", diff: "hard", wave: 7, spawnQueue: [{}, {}], horde: true, combo: 30, mult: 3, rank: "BRUTAL" },
      player: { hp: 45, maxHp: 90, vx: 181, vy: 0, onGround: false },
      actors: [boss, { hp: 1, maxHp: 1 }, { hp: 0, maxHp: 1, dead: true }],
      projectiles: [{}, { dead: true }, {}],
      stageName: "Citadel", stageIndex: 2, totalWaves: 10,
      waveActive: true, runPhase: "wave-live", topComboThreshold: 60,
      bossIntroActor: boss,
    });

    expect(observation).toEqual({
      timeMs: 12_346, scene: "boss", modeId: "campaign", difficultyId: "hard",
      biomeId: "Citadel", stageId: "2", wave: 7, totalWaves: 10,
      waveActive: true, runPhase: "wave-live", liveEnemies: 2, queuedEnemies: 2,
      projectileCount: 2, horde: true, miniBoss: false,
      bossActive: true, bossId: "warden", bossPhase: 3, bossHealthRatio: 0.4, bossIntro: true,
      playerHealthRatio: 0.5, comboRankId: "BRUTAL", comboGauge: 0.5,
      comboMultiplier: 3, playerMoving: true, playerAirborne: true,
    });
  });

  it("provides safe menu defaults without an active actor or player", () => {
    const observation = buildLiveMusicObservation({
      appState: "menu",
      run: { runTime: 0, mode: "arcade", diff: "normal", spawnQueue: [], combo: 0 },
      player: null, actors: [], projectiles: [], stageName: null, stageIndex: 0,
      totalWaves: 0, waveActive: false, runPhase: "idle", topComboThreshold: 0,
      bossIntroActor: null,
    });

    expect(observation).toMatchObject({
      scene: "main-menu", bossActive: false, bossId: null, bossPhase: null,
      playerHealthRatio: 1, comboGauge: 0, playerMoving: false, playerAirborne: false,
    });
    expect(observation).not.toHaveProperty("bossHealthRatio");
  });
});
