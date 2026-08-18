import { describe, expect, it, vi } from "vitest";
import { finalizeCombatTick, resolvePlayerDeath, runTrainingTick, type CombatCleanupHooks, type TailPlayer, type TailRun } from "../../src/gameplay/combat/combat-tail-runtime";

const player = (): TailPlayer => ({ x: 0, y: 0, vy: -200, hp: 10, maxHp: 100, iframe: 0, onGround: false,
  tookHit: true, shopRevives: 0, abilityRevives: 0, oneHit: false });
const run = (): TailRun => ({ mode: "campaign", runTime: 0, waveTime: 0, _prevGround: true });
function cleanupHooks(): CombatCleanupHooks {
  return { enemyDefeated: vi.fn(), ghostRecording: () => false, ghostSample: vi.fn(), updateTrick: vi.fn(),
    breakStreak: vi.fn(), jumped: vi.fn(), achievementTick: vi.fn(), maxStat: vi.fn(), checkAchievements: vi.fn(),
    achievementsEnabled: () => true };
}
describe("combat tick tail", () => {
  it("publishes a native defeat once without Ghost 2 recording or a legacy visual id", () => {
    const dead = { dead: true, y: 0, bleedStacks: 0, burnT: 0 };
    const hooks = cleanupHooks();
    const enemyDefeated = vi.fn(); const ghostSample = vi.fn();
    hooks.enemyDefeated = enemyDefeated; hooks.ghostSample = ghostSample;
    const input = { dt: 0.25, enemies: [dead], projectiles: [], floaters: [], shake: 0,
      shakeDecay: 4, player: player(), run: run(), hooks };

    finalizeCombatTick(input);
    finalizeCombatTick(input);

    expect(enemyDefeated).toHaveBeenCalledTimes(1);
    expect(enemyDefeated).toHaveBeenCalledWith(dead);
    expect(ghostSample).not.toHaveBeenCalled();
  });
  it("samples living enemies only while Ghost 2 recording is active", () => {
    const alive = { dead: false, y: 0, bleedStacks: 0, burnT: 0 };
    const hooks = cleanupHooks();
    const enemyDefeated = vi.fn(); const ghostSample = vi.fn();
    hooks.enemyDefeated = enemyDefeated; hooks.ghostSample = ghostSample;
    hooks.ghostRecording = () => true;

    finalizeCombatTick({ dt: 0.25, enemies: [alive], projectiles: [], floaters: [], shake: 0,
      shakeDecay: 4, player: player(), run: run(), hooks });

    expect(ghostSample).toHaveBeenCalledWith(0.25, [alive]);
    expect(enemyDefeated).not.toHaveBeenCalled();
  });
  it("filters before updating survivors and records hit/air achievement state", () => {
    const alive = { dead: false, y: 0, bleedStacks: 3, burnT: 1 }; const dead = { dead: true, y: 0, bleedStacks: 9, burnT: 1 };
    const update = vi.fn(); const p = player(); const r = run(); const hooks = cleanupHooks();
    const result = finalizeCombatTick({ dt: 0.25, enemies: [alive, dead], projectiles: [{ dead: false, update }],
      floaters: [{ y: 10, life: 1 }], shake: 5, shakeDecay: 4, player: p, run: r, hooks });
    expect(result.enemies).toEqual([alive]); expect(update).toHaveBeenCalledWith(0.25); expect(result.shake).toBe(4);
    expect(r).toMatchObject({ runTime: 0.25, waveTime: 0.25, _dmgThisWave: true, _airT: 0.25 });
  });
  it("keeps the training tick out of the tail so late spawns survive", () => {
    // The tail must not run training itself: its filtered lists are installed by the
    // caller afterwards, so a playground spawn issued here would be discarded.
    const hooks = cleanupHooks() as CombatCleanupHooks & Record<string, unknown>;
    expect(hooks.updatePlayground).toBeUndefined();

    // A playground spawn pushed onto the installed list must be preserved.
    const live: { dead: boolean; y: number; bleedStacks: number; burnT: number }[] = [{ dead: true, y: 0, bleedStacks: 0, burnT: 0 }];
    const r = run(); r.mode = "playground";
    const result = finalizeCombatTick({ dt: 0.25, enemies: live, projectiles: [], floaters: [], shake: 0,
      shakeDecay: 4, player: player(), run: r, hooks: cleanupHooks() });
    const installed = result.enemies;   // what the caller installs as the live list
    runTrainingTick(r.mode, 0.25, {
      updateTutorial: vi.fn(),
      updatePlayground: () => { installed.push({ dead: false, y: 0, bleedStacks: 0, burnT: 0 }); },
    });
    expect(installed).toHaveLength(1);
  });
  it("honors revive priority before the ad and terminal paths", () => {
    const p = player(); p.hp = 0; p.shopRevives = 1; p.abilityRevives = 1; const r = run();
    const hooks = { trainingReset: vi.fn(), shopRevive: vi.fn(), abilityRevive: vi.fn(), adAvailable: () => true,
      requestAdContinue: vi.fn(), endRun: vi.fn() };
    expect(resolvePlayerDeath(p, r, hooks)).toBe("shop-revive"); expect(p.shopRevives).toBe(0); expect(p.abilityRevives).toBe(1);
  });
});
