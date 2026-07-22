import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createDailyChallenges } from "../../src/gameplay/progression/challenges";
import { createMetaProgression, type ProgressionApplyContext } from "../../src/gameplay/progression/meta";
import { createLegacyProfile } from "../../src/persistence/legacy-profile";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    get(key: string) { return values.get(key) ?? null; },
    set(key: string, value: string) { values.set(key, value); },
  };
}

function metaFor(store: ReturnType<typeof memoryStore>) {
  return createMetaProgression<never, ProgressionApplyContext>({
    store,
    config: CONFIG,
    cloud: { loggedIn: () => false, push: () => Promise.resolve() },
    random: { next: () => 0.5 },
    upgrades: [],
    applyUpgrade: () => undefined,
  });
}

describe("progression persistence contract", () => {
  it("round-trips currency, shop levels, profile achievements/stats and daily progress together", () => {
    const store = memoryStore();
    const firstMeta = metaFor(store);
    firstMeta.META.load();
    firstMeta.META.addCoins(2_000);
    const toughness = firstMeta.SHOP.find((item) => item.id === "tough");
    expect(toughness).toBeDefined();
    if (toughness === undefined) throw new Error("toughness fixture missing");
    expect(firstMeta.META.buy(toughness)).toBe(true);

    const achievement = { id: "round_trip", shards: 7, coins: 125 };
    const firstProfile = createLegacyProfile({
      store,
      now: () => 1_725_000_000_000,
      getAchievements: () => undefined,
      getMeta: () => firstMeta.META,
      writerId: () => "first-session",
    });
    firstProfile.load();
    firstProfile.setUsername("Persistence Pilot");
    firstProfile.addStat("runs", 4);
    firstProfile.maxStat("bestCombo", 37);
    firstProfile.markMode("campaign");
    expect(firstProfile.unlock(achievement)).toBe(true);
    firstProfile.save();

    const fixedDate = new Date(2026, 6, 19, 12, 0, 0);
    const firstDaily = createDailyChallenges({
      achievements: { pending: [] },
      profile: firstProfile,
      clock: { now: () => fixedDate, nextLocalMidnight: () => new Date(2026, 6, 20) },
    });
    const selected = firstDaily.today()[0];
    expect(selected).toBeDefined();
    if (selected === undefined) throw new Error("daily fixture missing");
    firstDaily.bump(selected.key, selected.goal, "max");
    expect(firstDaily.isDone(selected)).toBe(true);

    const secondMeta = metaFor(store);
    secondMeta.META.load();
    const secondProfile = createLegacyProfile({
      store,
      now: () => 1_725_000_100_000,
      getAchievements: () => undefined,
      getMeta: () => secondMeta.META,
      writerId: () => "second-session",
    });
    secondProfile.load();
    const secondDaily = createDailyChallenges({
      achievements: { pending: [] },
      profile: secondProfile,
      clock: { now: () => fixedDate, nextLocalMidnight: () => new Date(2026, 6, 20) },
    });

    expect(secondMeta.META.level("tough")).toBe(1);
    expect(secondMeta.META.coins()).toBe(firstMeta.META.coins());
    expect(secondProfile.username()).toBe("Persistence Pilot");
    expect(secondProfile.unlocked("round_trip")).toBe(true);
    expect(secondProfile.shards()).toBe(achievement.shards + selected.shards);
    expect(secondProfile.stat("runs")).toBe(4);
    expect(secondProfile.stat("bestCombo")).toBe(37);
    expect(secondProfile.data.modes.campaign).toBe(true);
    expect(secondDaily.todayKey()).toBe(firstDaily.todayKey());
    expect(secondDaily.progress(selected)).toBe(selected.goal);
    expect(secondDaily.isDone(selected)).toBe(true);
  });
});
