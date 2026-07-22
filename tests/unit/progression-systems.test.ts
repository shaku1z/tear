import { describe, expect, it, vi } from "vitest";
import { createAchievements, type Achievement, type AchievementProfilePort } from "../../src/gameplay/progression/achievements";
import { createDailyChallenges, selectDailyChallenges, type DailyProfilePort } from "../../src/gameplay/progression/challenges";
import { createMetaProgression, migrateMetaData, type ProgressionApplyContext } from "../../src/gameplay/progression/meta";

function metaSystem(initial: unknown = {}) {
  const values = new Map([["tear_meta", JSON.stringify(initial)]]);
  const cloud = { loggedIn: () => true, push: vi.fn(() => Promise.resolve()) };
  const config = {
    blade: { damageScale: 1, maxDamage: 100, aimRadius: 1, length: 1, maxReach: 1, throw: { damage: 1, damageFromSpeed: 1 } },
    player: { moveSpeed: 1, dmgTakenMult: 1 }, dash: { cooldown: 1 },
  };
  return {
    ...createMetaProgression({
      store: { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); } },
      config, cloud, random: { next: () => 0 }, upgrades: [{ id: "starter", unique: false }],
      applyUpgrade: () => { return; },
    }),
    values, cloud, config,
  };
}

describe("meta progression", () => {
  it("migrates the legacy coin balance into a monotonic ledger", () => {
    expect(migrateMetaData({ coins: 725, buy: { tough: 2 } })).toEqual({
      lifetimeEarned: 725, lifetimeSpent: 0, buy: { tough: 2 },
    });
    expect(migrateMetaData({ coins: "corrupt", buy: null })).toEqual({ lifetimeEarned: 0, lifetimeSpent: 0, buy: {} });
  });

  it("preserves all shop content and cannot purchase past an item's cap", () => {
    const system = metaSystem({ lifetimeEarned: 20_000, lifetimeSpent: 0, buy: {} });
    system.META.load();
    expect(system.SHOP).toHaveLength(22);
    const expanded = system.SHOP.find((item) => item.id === "expanded");
    if (!expanded) throw new Error("expanded draft missing");
    expect(system.META.buy(expanded)).toBe(true);
    expect(system.META.buy(expanded)).toBe(false);
    expect(system.META.level("expanded")).toBe(1);
    expect(system.cloud.push).toHaveBeenCalledOnce();
  });

  it("applies purchased passives without dropping hazard resistance", () => {
    const system = metaSystem({ lifetimeEarned: 10_000, lifetimeSpent: 0, buy: { hazardboots: 2 } });
    system.META.load();
    const context: ProgressionApplyContext = {
      player: {
        maxHp: 100, hp: 100, maxShield: 0, shield: 0, maxDashCharges: 1, dashCharges: 1,
        shopRevives: 0, dashMomentumMult: 1, airborneDmgMult: 1, hazardDmgMult: 1, secondBreathDuration: 0,
      },
      blade: { throwCooldownMult: 1, recallWindow: 0 },
      mods: { waveHeal: 0, reservePick: false, draftRerolls: 0, expandedDraft: false },
    };
    system.META.apply(context);
    expect(context.player.hazardDmgMult).toBeCloseTo(0.94 ** 2);
  });
});

describe("achievements", () => {
  it("keeps the complete unique catalogue and configured economy pool", () => {
    const unlocked = new Set<string>();
    const profile: AchievementProfilePort = {
      unlocked: (id) => unlocked.has(id), stat: () => 0,
      unlock: (achievement) => { if (unlocked.has(achievement.id)) return false; unlocked.add(achievement.id); return true; },
    };
    const achievements = createAchievements({
      meta: { level: () => 0 }, profile, audio: { rankup() { return; } }, shop: [],
      clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
    });
    expect(achievements._all).toHaveLength(98);
    expect(new Set(achievements._all.map((achievement) => achievement.id)).size).toBe(98);
    expect(achievements._all.reduce((total, achievement) => total + achievements.coinsFor(achievement), 0)).toBe(70_100);
  });

  it("makes scripted rewards and audio idempotent", () => {
    const unlocked = new Set<string>();
    const granted: Achievement[] = [];
    const audio = vi.fn();
    const profile: AchievementProfilePort = {
      unlocked: (id) => unlocked.has(id), stat: () => 0,
      unlock: (achievement) => { if (unlocked.has(achievement.id)) return false; unlocked.add(achievement.id); granted.push(achievement); return true; },
    };
    const achievements = createAchievements({
      meta: { level: () => 0 }, profile, audio: { rankup: audio }, shop: [],
      clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
    });
    expect(achievements.unlock("witness")).toBe(true);
    expect(achievements.unlock("witness")).toBe(false);
    expect(granted).toHaveLength(1);
    expect(audio).toHaveBeenCalledOnce();
  });
});

describe("daily challenges", () => {
  it("selects deterministically and awards each completion once", () => {
    let shards = 0;
    let saves = 0;
    const profile: DailyProfilePort = {
      data: {}, addShards: (amount) => { shards += amount; }, save: () => { saves += 1; },
    };
    const achievements = { pending: [] };
    const current = new Date(2026, 6, 19, 12, 0, 0);
    const daily = createDailyChallenges({
      achievements, profile,
      clock: { now: () => new Date(current), nextLocalMidnight: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) },
    });
    expect(daily.today().map((challenge) => challenge.id)).toEqual(selectDailyChallenges("2026-7-19", daily.POOL).map((challenge) => challenge.id));
    const challenge = daily.today()[0];
    if (!challenge) throw new Error("daily selection empty");
    daily.bump(challenge.key, challenge.goal, challenge.mode);
    daily.bump(challenge.key, challenge.goal, challenge.mode);
    expect(shards).toBe(challenge.shards);
    expect(achievements.pending).toHaveLength(1);
    expect(saves).toBeGreaterThan(0);
  });
});
