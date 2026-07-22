import { describe, expect, it, vi } from "vitest";
import { finalizeCombatTick, resolvePlayerDeath, type CombatCleanupHooks, type TailPlayer, type TailRun } from "../../src/gameplay/combat/combat-tail-runtime";

const player = (): TailPlayer => ({ x: 0, y: 0, vy: -200, hp: 10, maxHp: 100, iframe: 0, onGround: false,
  tookHit: true, shopRevives: 0, abilityRevives: 0, oneHit: false });
const run = (): TailRun => ({ mode: "campaign", runTime: 0, waveTime: 0, _prevGround: true });
function cleanupHooks(): CombatCleanupHooks {
  return { ghostRecording: () => false, ghostDeath: vi.fn(), ghostSample: vi.fn(), updateTrick: vi.fn(),
    breakStreak: vi.fn(), jumped: vi.fn(), achievementTick: vi.fn(), maxStat: vi.fn(), checkAchievements: vi.fn(),
    achievementsEnabled: () => true, updateTutorial: vi.fn(), updatePlayground: vi.fn() };
}
describe("combat tick tail", () => {
  it("filters before updating survivors and records hit/air achievement state", () => {
    const alive = { dead: false, y: 0, bleedStacks: 3, burnT: 1 }; const dead = { dead: true, y: 0, bleedStacks: 9, burnT: 1 };
    const update = vi.fn(); const p = player(); const r = run(); const hooks = cleanupHooks();
    const result = finalizeCombatTick({ dt: 0.25, enemies: [alive, dead], projectiles: [{ dead: false, update }],
      floaters: [{ y: 10, life: 1 }], shake: 5, shakeDecay: 4, player: p, run: r, hooks });
    expect(result.enemies).toEqual([alive]); expect(update).toHaveBeenCalledWith(0.25); expect(result.shake).toBe(4);
    expect(r).toMatchObject({ runTime: 0.25, waveTime: 0.25, _dmgThisWave: true, _airT: 0.25 });
  });
  it("honors revive priority before the ad and terminal paths", () => {
    const p = player(); p.hp = 0; p.shopRevives = 1; p.abilityRevives = 1; const r = run();
    const hooks = { trainingReset: vi.fn(), shopRevive: vi.fn(), abilityRevive: vi.fn(), adAvailable: () => true,
      requestAdContinue: vi.fn(), endRun: vi.fn() };
    expect(resolvePlayerDeath(p, r, hooks)).toBe("shop-revive"); expect(p.shopRevives).toBe(0); expect(p.abilityRevives).toBe(1);
  });
});
