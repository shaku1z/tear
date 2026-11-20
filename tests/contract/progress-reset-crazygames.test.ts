import { describe, expect, it } from "vitest";
import { resetProgress } from "../../src/app/progress/progress-reset";
import { CONFIG } from "../../src/config/game-config";
import { createMetaProgression } from "../../src/gameplay/progression/meta";
import { PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import { createProfileStore } from "../../src/persistence/profile-store";
import { createCrazyGamesPlatformServices, type CrazyGamesSdkShape } from "../../src/platform/crazygames";
import { createLegacyPlatformCompatibility } from "../../src/platform/legacy-compat";
import type { SyncStringStorage } from "../../src/platform/storage";

const earnedProfile = JSON.stringify({
  schema: "tear.profile",
  schemaVersion: PROFILE_ENVELOPE_VERSION,
  revision: 41,
  updatedAtMs: 1,
  writerId: "crazygames",
  profile: { shards: 30, username: "Someone", modes: { endless: true }, stats: { kills: 900 }, ach: {}, seen: {} },
  extensions: {},
});
const earnedMeta = JSON.stringify({ lifetimeEarned: 500, lifetimeSpent: 200, buy: { tough: 3 } });

/**
 * On CrazyGames the game keeps no online copy of its own (the portal provider has no `replace`): the save lives
 * in the SDK's data module, which the game's store writes through under the same keys. A reset must reach it.
 */
describe("resetting progress on the CrazyGames build", () => {
  it("overwrites the portal's data copy and this device's copy, so nothing earned is left to read back", async () => {
    const portal = new Map<string, string>();
    const device = new Map<string, string>();
    const storage: SyncStringStorage = {
      getItem: (key) => device.get(key) ?? null,
      setItem: (key, value) => void device.set(key, value),
      removeItem: (key) => void device.delete(key),
    };
    const sdk: CrazyGamesSdkShape = {
      init: () => Promise.resolve(),
      environment: "crazygames",
      data: {
        getItem: (key) => portal.get(key) ?? null,
        setItem: (key, value) => void portal.set(key, value),
      },
    };
    const { CG } = createLegacyPlatformCompatibility({
      target: "crazygames",
      sdk,
      storage,
      createCrazyGamesServices: createCrazyGamesPlatformServices,
    });
    await expect(CG.init()).resolves.toBe(true);
    expect(CG.live).toBe(true);
    CG.store.set("tear_profile_v2", earnedProfile);
    CG.store.set("tear_profile", JSON.stringify({ shards: 30, stats: { kills: 900 } }));
    CG.store.set("tear_meta", earnedMeta);

    const profile = createProfileStore({
      store: CG.store,
      getAchievements: () => undefined,
      getMeta: () => undefined,
      writerId: () => "crazygames",
    });
    const meta = createMetaProgression({
      store: CG.store,
      config: structuredClone(CONFIG),
      cloud: { loggedIn: () => false, push: () => Promise.resolve() },
      random: { next: () => 0 },
      upgrades: [],
      applyUpgrade: () => undefined,
    }).META;
    profile.load();
    meta.load();
    expect(profile.data.shards).toBe(30);

    // The portal build has no online copy of its own to replace.
    const result = await resetProgress({
      store: CG.store,
      cloud: { replaceSave: () => Promise.resolve("no-online-copy") },
      profile,
      meta,
      now: () => 1000,
      writerId: () => "crazygames",
    });
    expect(result).toBe("erased");

    for (const copy of [portal, device]) {
      expect(JSON.parse(copy.get("tear_profile_v2") ?? "{}").profile).toMatchObject({
        shards: 0,
        stats: {},
        modes: {},
      });
      expect(JSON.parse(copy.get("tear_profile") ?? "{}")).toMatchObject({ shards: 0, stats: {} });
      expect(JSON.parse(copy.get("tear_meta") ?? "{}")).toMatchObject({ lifetimeEarned: 0, lifetimeSpent: 0, buy: {} });
      expect(copy.get("tear_profile_v2")).not.toContain("Someone");
    }
    // What the game reads next start, from the portal first, is blank too.
    expect(JSON.parse(CG.store.get("tear_profile_v2") ?? "{}").profile.shards).toBe(0);
    expect(profile.data.shards).toBe(0);
    expect(meta.data.lifetimeEarned).toBe(0);
  });
});
