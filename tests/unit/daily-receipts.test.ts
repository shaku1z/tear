/**
 * Daily challenges pay through receipts in the profile (src/gameplay/progression/challenges.ts and
 * src/persistence/profile-store.ts): moving the clock cannot replay a claim, two devices' claims both count
 * and a shared one counts once, and a version 4 save's paid challenges stay paid.
 */
import { describe, expect, it } from "vitest";

import { createDailyChallenges, type DailyChallenges } from "../../src/gameplay/progression/challenges";
import { migrateProfileEnvelope } from "../../src/persistence/profile-envelope";
import { createProfileStore } from "../../src/persistence/profile-store";

const TODAY = new Date(2026, 6, 19, 12);
const YESTERDAY = new Date(2026, 6, 18, 12);

/** In-memory storage with the acknowledged channel the live platform provides. */
function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => void values.set(key, value),
    acknowledged: {
      read: (key: string) => Promise.resolve({ status: "committed" as const, value: values.get(key) ?? null }),
      update: (key: string, change: (current: string | null) => string) => {
        const next = change(values.get(key) ?? null);
        values.set(key, next);
        return Promise.resolve({ status: "committed" as const, value: next });
      },
    },
  };
}

function device(store = memory()) {
  const profile = createProfileStore({
    store,
    now: () => 1_725_000_000_000,
    getAchievements: () => undefined,
    getMeta: () => undefined,
    writerId: () => "test",
  });
  profile.load();
  let clock = TODAY;
  const daily = createDailyChallenges({
    achievements: { pending: [] },
    profile,
    clock: {
      now: () => clock,
      nextLocalMidnight: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    },
  });
  const setClock = (date: Date) => {
    clock = date;
  };
  return { profile, daily, setClock };
}

const finishAll = (daily: DailyChallenges) => {
  for (const challenge of daily.today()) daily.bump(challenge.key, challenge.goal, challenge.mode);
};
const reward = (daily: DailyChallenges) => daily.today().reduce((sum, challenge) => sum + challenge.shards, 0);

describe("daily challenge receipts", () => {
  it("pays each day's challenges once, whichever way the clock moves", () => {
    const { profile, daily, setClock } = device();
    finishAll(daily);
    const today = reward(daily);
    expect(profile.shards()).toBe(today);

    setClock(YESTERDAY);
    const yesterday = reward(daily);
    finishAll(daily);
    expect(profile.shards()).toBe(today + yesterday);

    for (const date of [TODAY, YESTERDAY, TODAY]) {
      setClock(date);
      expect(daily.today().every((challenge) => daily.isDone(challenge))).toBe(true);
      finishAll(daily);
    }
    expect(profile.shards()).toBe(today + yesterday);
  });

  it("counts both devices' claims, and a claim made on both devices once", () => {
    const left = device(),
      right = device();
    const [first, second] = left.daily.today();
    if (!first || !second) throw new Error("daily selection too small");
    left.daily.bump(first.key, first.goal, first.mode);
    right.daily.bump(first.key, first.goal, first.mode);
    right.daily.bump(second.key, second.goal, second.mode);
    left.profile.merge(structuredClone(right.profile.data));
    expect(left.profile.shards()).toBe(first.shards + second.shards);
    expect(left.daily.isDone(second)).toBe(true);
  });

  it("keeps a version 4 save's paid challenges paid, without paying or taking their shards again", async () => {
    const [paid] = device().daily.today();
    if (!paid) throw new Error("daily selection empty");
    const saved = {
      schema: "tear.profile",
      schemaVersion: 4,
      profile: { shards: 50, daily: { date: "2026-7-19", prog: { [paid.key]: paid.goal }, done: { [paid.id]: 1 } } },
    };
    const { profile, daily } = device(memory({ tear_profile_v2: JSON.stringify(saved) }));
    expect(profile.shards()).toBe(50);
    expect(daily.isDone(paid)).toBe(true);
    expect(profile.data.daily).toEqual({ date: "2026-7-19", prog: { [paid.key]: paid.goal } });
    finishAll(daily);
    expect(profile.shards()).toBe(50 + reward(daily) - paid.shards);
    expect(await profile.flushAcknowledged()).toBe("committed");
  });

  it("migrates a malformed daily record without failing: bad marks are dropped, good ones kept", () => {
    const migrate = (daily: unknown) =>
      migrateProfileEnvelope({ schema: "tear.profile", schemaVersion: 4, profile: { shards: 9, daily } });
    for (const daily of [
      { date: "2026-7-19", done: "junk" },
      { date: 12, done: { d_kills: 1 } },
      { prog: {}, done: null },
    ]) {
      const result = migrate(daily);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.profile).not.toHaveProperty("achievementOutbox");
      expect(result.value.profile.daily).not.toHaveProperty("done");
    }
    const mixed = migrate({ date: "2026-7-19", done: { d_kills: 1, "Bad Id": 1, d_boss: 0 } });
    expect(mixed).toMatchObject({
      ok: true,
      value: {
        profile: {
          achievementOutbox: {
            baselineShards: 9,
            grants: { "daily:2026-7-19:d_kills": { coins: 0, shards: 0, acknowledged: true } },
          },
        },
      },
    });
    expect(JSON.stringify(mixed)).not.toMatch(/Bad Id|d_boss/u);
  });
});
