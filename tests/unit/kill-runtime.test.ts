import { describe, expect, it, vi } from "vitest";
import { resolveEnemyKill, type KillEnemy, type KillRuntimeOptions } from "../../src/gameplay/combat/kill-runtime";
import { planWaveClear } from "../../src/gameplay/run/wave-clear-planner";

function enemy(patch: Partial<KillEnemy> = {}): KillEnemy {
  return { x: 0, y: 0, color: "red", dead: true, zones: [], severT: 0, severTier: 0,
    bleedStacks: 0, burnT: 0, ...patch };
}

function options(target: KillEnemy): KillRuntimeOptions {
  return { enemy: target, enemies: [target], projectiles: [], cause: "skill", now: 4,
    run: { score: 0, wave: 2, mult: 3, waveKills: 1, mode: "campaign", mods: {} },
    player: { hp: 5, maxHp: 100 }, stageIndex: 4, finalStageIndex: 4, stageAccent: "white", hasStageChapter: true,
    bossRosterSize: 5, scoring: { scorePerKill: 100, cleanWindow: 2 }, colors: { charger: "c", slam: "s" },
    deathShards: 12, severPulseRadius: 100, achievementsEnabled: true,
    addKillScore: vi.fn(), addStat: vi.fn(), maxStat: vi.fn(), bumpDaily: vi.fn(), bossKillAchievement: vi.fn(),
    killAchievement: vi.fn(), checkAchievements: vi.fn(), bossGhostMoment: vi.fn(), deathEffect: vi.fn(), deathSound: vi.fn(),
    makeDeathEvent: vi.fn(() => ({})), fire: vi.fn(), applySever: vi.fn(), ring: vi.fn(), restorePlatforms: vi.fn(),
    releaseCamera: vi.fn(), happyTime: vi.fn(), bossPresentation: vi.fn(), releaseStolenBlade: vi.fn() };
}

describe("enemy kill transaction", () => {
  it("handles boss scoring, hazard cleanup, finale state and hooks in one ordered transaction", () => {
    const cleanupEncounter = vi.fn();
    const target = enemy({ isBoss: true, bossId: "source", affixCount: 2, firstPlayerDamageAt: 3, zones: [1], cleanupEncounter });
    const shot = { owner: target, dead: false }; const input = options(target); input.projectiles = [shot];
    const makeDeathEvent = vi.fn(() => ({})); const fire = vi.fn(); const bossPresentation = vi.fn();
    input.makeDeathEvent = makeDeathEvent; input.fire = fire; input.bossPresentation = bossPresentation;
    resolveEnemyKill(input);
    expect(input.run.score).toBe(480); expect(input.run.finalBossDeath).toEqual({ x: 0, y: 0, color: "red" });
    expect(shot.dead).toBe(true); expect(target.zones).toEqual([]);
    expect(makeDeathEvent).toHaveBeenCalledWith(target, "skill", true);
    expect(fire).toHaveBeenCalledTimes(3); expect(bossPresentation).toHaveBeenCalledOnce();
    expect(cleanupEncounter).toHaveBeenCalledOnce(); expect(cleanupEncounter).toHaveBeenCalledWith("death");
  });

  it("keeps no-score deaths cosmetic only", () => {
    const target = enemy({ noScore: true }); const input = options(target);
    const deathEffect = vi.fn(); const addKillScore = vi.fn(); input.deathEffect = deathEffect; input.addKillScore = addKillScore;
    resolveEnemyKill(input);
    expect(deathEffect).toHaveBeenCalledWith(target, 8); expect(addKillScore).not.toHaveBeenCalled();
  });

  it("preserves Rootbound defeat cleanup, terminal presentation, reward, and chapter-outro order", () => {
    const trace: string[] = [];
    const outro = { id: "verdant-rootbound-outro" };
    const target = enemy({ isBoss: true, bossId: "rootbound", cleanupEncounter: () => { trace.push("boss-terminal-cleanup"); } });
    const input = options(target);
    input.stageIndex = 3;
    input.finalStageIndex = 5;
    input.stageChapterBossOutro = outro;
    input.makeDeathEvent = () => { trace.push("boss-defeated"); return {}; };
    input.happyTime = () => { trace.push("terminal-release"); };
    input.bossPresentation = () => { trace.push("terminal-presentation"); };
    resolveEnemyKill(input);
    expect(input.run.pendingBossOutro).toBe(outro);

    const clear = planWaveClear({
      state: { mode: "campaign", diff: "normal", wave: 40, isBossWave: true, horde: false, waveTime: 12,
        waveKills: 1, wavePeak: 1, runTime: 120, bossesBeaten: 0, damagedThisWave: false, damagedThisStage: false,
        clearTimer: 0, pendingReward: null, waveLog: [] },
      dt: 0, waveLifecycleActive: true, spawnQueueLength: 0, enemyCount: 0, achievementTracking: true,
      playerOneHit: false, ownedAbilityCount: 0, stageIndex: 3, stageCount: 6, currentStageAccent: "#89b95d",
      healEachWave: 4, waveHealBonus: 0, waveClearPause: 1, availableTierUpCount: 1,
    });
    if (clear.intents.some((intent) => intent.type === "prepare-reward" && intent.reward === "boss")) trace.push("boss-reward");
    if (input.run.pendingBossOutro === outro) trace.push("chapter-outro-pending");
    expect(trace).toEqual([
      "boss-defeated", "boss-terminal-cleanup", "terminal-release", "terminal-presentation", "boss-reward", "chapter-outro-pending",
    ]);
  });
});
