import { describe, expect, it } from "vitest";

import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { migrateProfileEnvelope, PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import { activeLoadout, normalizeCosmeticState } from "../../src/domain/cosmetics";
import { createProfileStore, type ProfileStore } from "../../src/persistence/profile-store";

/** In-memory storage with the acknowledged channel the live platform provides. */
function memory(initial: Record<string, string> = {}, acknowledged = true) {
  const values = new Map(Object.entries(initial));
  const store = {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => void values.set(key, value),
    ...(acknowledged
      ? {
          acknowledged: {
            read: (key: string) => Promise.resolve({ status: "committed" as const, value: values.get(key) ?? null }),
            update: (key: string, change: (current: string | null) => string) => {
              const next = change(values.get(key) ?? null);
              values.set(key, next);
              return Promise.resolve({ status: "committed" as const, value: next });
            },
          },
        }
      : {}),
  };
  return { values, store };
}
function open(
  storage = memory(),
  clock = { now: 1_000 },
): { profile: ProfileStore; storage: ReturnType<typeof memory> } {
  const profile = createProfileStore({
    store: storage.store,
    now: () => clock.now,
    writerId: () => "unit",
    getAchievements: () => undefined,
    getMeta: () => undefined,
    getCosmeticCatalog: () => COSMETIC_CATALOG,
  });
  profile.load();
  return { profile, storage };
}
const saved = (storage: ReturnType<typeof memory>): { profile: Record<string, unknown>; schemaVersion: number } =>
  JSON.parse(storage.values.get("tear_profile_v2") ?? "{}") as {
    profile: Record<string, unknown>;
    schemaVersion: number;
  };

describe("profile envelope: the version 4 cosmetics ledger", () => {
  it("adds an empty cosmetics ledger to an old version 3 save and keeps everything else", () => {
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: 3,
      revision: 7,
      profile: { shards: 40, ach: { a: 1 }, unknownFuture: "kept" },
      extensions: { keep: true },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: 3,
      value: {
        schemaVersion: PROFILE_ENVELOPE_VERSION,
        profile: {
          shards: 40,
          ach: { a: 1 },
          unknownFuture: "kept",
          cosmetics: { v: 1, owned: {}, seen: {}, counters: {}, loadouts: {}, active: { id: "main", at: 0 } },
        },
        extensions: { keep: true },
      },
    });
    expect(PROFILE_ENVELOPE_VERSION).toBe(4);
  });

  it("gives a legacy save an empty ledger and drops malformed cosmetics from a current one", () => {
    expect(migrateProfileEnvelope({ shards: 5 })).toMatchObject({
      ok: true,
      value: { profile: { cosmetics: { owned: {} } } },
    });
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      profile: { cosmetics: { v: 1, owned: { ok_item: 10, bad: -1, "Bad Id": 3 }, loadouts: { main: "junk" } } },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: null,
      value: { profile: { cosmetics: { v: 1, owned: { ok_item: 10 }, loadouts: {} } } },
    });
    expect(
      migrateProfileEnvelope({
        schema: "tear.profile",
        schemaVersion: PROFILE_ENVELOPE_VERSION,
        profile: { cosmetics: 12 },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        profile: {
          cosmetics: { v: 1, owned: {}, seen: {}, counters: {}, loadouts: {}, active: { id: "main", at: 0 } },
        },
      },
    });
  });

  it("starts a new profile with the same fields a migrated one has, cosmetics included", () => {
    // Both save slots unreadable: the store starts from a fresh profile.
    const { profile } = open(memory({ tear_profile_v2: "{broken", tear_profile: "{broken" }));
    const fresh = { ...profile.data };
    expect(fresh.cosmetics).toEqual(normalizeCosmeticState(undefined));
    // The same profile saved by a client from before version 4 (no ledger) migrates to the same keys and ledger.
    const older: Record<string, unknown> = { ...fresh };
    delete older.cosmetics;
    const migrated = migrateProfileEnvelope({ schema: "tear.profile", schemaVersion: 3, profile: older });
    if (!migrated.ok) throw new Error(migrated.error);
    expect(Object.keys(migrated.value.profile).sort()).toEqual(Object.keys(fresh).sort());
    expect(migrated.value.profile.cosmetics).toEqual(fresh.cosmetics);
  });

  it("rejects a future version safely", () => {
    expect(
      migrateProfileEnvelope({ schema: "tear.profile", schemaVersion: PROFILE_ENVELOPE_VERSION + 1, profile: {} }).ok,
    ).toBe(false);
  });
});

describe("buying and equipping through the profile store", () => {
  it("loads an old save unchanged: balance equals earned shards, nothing owned", () => {
    const { profile } = open(
      memory({
        tear_profile_v2: JSON.stringify({ schema: "tear.profile", schemaVersion: 3, profile: { shards: 120 } }),
      }),
    );
    expect(profile.shards()).toBe(120);
    expect(profile.shardBalance()).toBe(120);
    expect(profile.cosmetics().owned).toEqual({});
  });

  it("buys, lowers the balance, equips, and survives a reload", async () => {
    const storage = memory({
      tear_profile_v2: JSON.stringify({ schema: "tear.profile", schemaVersion: 3, profile: { shards: 200 } }),
    });
    const { profile } = open(storage);
    expect(await profile.buyCosmetic("trail_dusk")).toBe("committed");
    expect(profile.shards()).toBe(200);
    expect(profile.shardBalance()).toBe(175);
    expect(await profile.buyCosmetic("trail_dusk")).toBe("owned");
    expect(await profile.equipCosmetic("trail", "trail_dusk")).toBe("committed");
    expect(await profile.equipCosmetic("trail", "trail_tidewater")).toBe("unknown");
    // The balance is derived: the stored shard number is untouched, only ownership is recorded.
    expect(saved(storage).profile.shards).toBe(200);
    const reloaded = open(storage).profile;
    expect(reloaded.shardBalance()).toBe(175);
    expect(activeLoadout(reloaded.cosmetics())?.slots.trail?.id).toBe("trail_dusk");
  });

  it("refuses what cannot be afforded, is locked, or is unknown, and writes nothing", async () => {
    const storage = memory({
      tear_profile_v2: JSON.stringify({ schema: "tear.profile", schemaVersion: 3, profile: { shards: 50 } }),
    });
    const { profile } = open(storage);
    expect(await profile.buyCosmetic("trail_tidewater")).toBe("insufficient");
    expect(await profile.buyCosmetic("trail_heartwood")).toBe("locked");
    expect(await profile.buyCosmetic("not_an_item")).toBe("unknown");
    expect(profile.cosmetics().owned).toEqual({});
  });

  it("unlocks a boss collection from the boss kill stat", async () => {
    const { profile } = open(
      memory({
        tear_profile_v2: JSON.stringify({
          schema: "tear.profile",
          schemaVersion: 3,
          profile: { shards: 600, stats: { killRootbound: 1 } },
        }),
      }),
    );
    expect(await profile.buyCosmetic("trail_heartwood")).toBe("committed");
    expect(profile.shardBalance()).toBe(200);
  });

  it("works without the acknowledged channel (plain local storage)", () => {
    const storage = memory({}, false);
    const { profile } = open(storage);
    profile.addShards(100);
    return profile.buyCosmetic("trail_dusk").then(async (status) => {
      expect(status).toBe("committed");
      expect(await profile.equipCosmetic("trail", "trail_dusk")).toBe("committed");
      expect(open(storage).profile.cosmetics().owned).toEqual({ trail_dusk: 25 });
    });
  });

  it("keeps an unknown item id a newer client bought, counts its price, and shows the default look", () => {
    const { profile } = open(
      memory({
        tear_profile_v2: JSON.stringify({
          schema: "tear.profile",
          schemaVersion: 4,
          profile: {
            shards: 300,
            cosmetics: {
              v: 1,
              owned: { future_trail: 100 },
              loadouts: { main: { name: "MAIN", nameAt: 1, slots: { trail: { id: "future_trail", at: 9 } } } },
            },
          },
        }),
      }),
    );
    expect(profile.cosmetics().owned).toEqual({ future_trail: 100 });
    expect(profile.shardBalance()).toBe(200);
  });

  it("merges two devices' purchases without losing either and converges", () => {
    const left = open().profile,
      right = open().profile;
    left.addShards(300);
    right.addShards(300);
    left.data.cosmetics = {
      v: 1,
      owned: { trail_dusk: 25 },
      loadouts: { main: { name: "MAIN", nameAt: 1, slots: { trail: { id: "trail_dusk", at: 5 } } } },
    };
    right.data.cosmetics = {
      v: 1,
      owned: { spark_orchid: 25 },
      loadouts: { main: { name: "MAIN", nameAt: 1, slots: { trail: { id: null, at: 9 } } } },
    };
    const remoteOfRight = structuredClone(right.data);
    const remoteOfLeft = structuredClone(left.data);
    left.merge(remoteOfRight);
    right.merge(remoteOfLeft);
    expect(left.cosmetics()).toEqual(right.cosmetics());
    expect(left.cosmetics().owned).toEqual({ trail_dusk: 25, spark_orchid: 25 });
    expect(left.cosmetics().loadouts.main?.slots.trail).toEqual({ id: null, at: 9 });
    left.merge(remoteOfRight);
    expect(left.cosmetics()).toEqual(right.cosmetics());
  });

  it("claims items earned by an achievement or a boss without spending shards", async () => {
    const { profile } = open(
      memory({
        tear_profile_v2: JSON.stringify({
          schema: "tear.profile",
          schemaVersion: 4,
          profile: { shards: 10, ach: { first_boss: 1 } },
        }),
      }),
    );
    expect(await profile.claimCosmeticGrants()).toBe("committed");
    expect(profile.cosmetics().owned).toEqual({ title_giant_slayer: 0 });
    expect(profile.shardBalance()).toBe(10);
    expect(await profile.claimCosmeticGrants()).toBe("already");
  });

  it("records that an item was seen once", async () => {
    const { profile } = open();
    expect(await profile.markCosmeticsSeen(["trail_dusk"])).toBe("committed");
    expect(await profile.markCosmeticsSeen(["trail_dusk"])).toBe("already");
  });

  it("shows zero, and blocks buying, when merged purchases overspend", async () => {
    const { profile } = open();
    profile.addShards(100);
    profile.merge({ cosmetics: { v: 1, owned: { a: 80, b: 80 }, loadouts: {} } });
    expect(profile.shardBalance()).toBe(0);
    expect(await profile.buyCosmetic("title_wanderer")).toBe("insufficient");
  });
});
