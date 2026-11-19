import { describe, expect, it } from "vitest";
import { resetProgress, type ProgressResetPorts } from "../../src/app/progress/progress-reset";
import { CONFIG } from "../../src/config/game-config";
import { createMetaProgression } from "../../src/gameplay/progression/meta";
import { PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import { createProfileStore } from "../../src/persistence/profile-store";
import type { CloudReplaceResult, CloudSavePayload } from "../../src/platform/cloud";
import type { AcknowledgedStorage } from "../../src/platform/contracts";

/** A store like the platform's: sync get/set plus the acknowledged update, with a switch for refusing writes. */
function fakeStore(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  const faults = { refuseWrites: false };
  const acknowledged: AcknowledgedStorage = {
    read: (key) => Promise.resolve({ status: "committed", value: values.get(key) ?? null }),
    update: (key, change) => {
      if (faults.refuseWrites) return Promise.resolve({ status: "unknown", reason: "refused" });
      try {
        const value = change(values.get(key) ?? null);
        values.set(key, value);
        return Promise.resolve({ status: "committed", value });
      } catch {
        // Like the platform store: a change that cannot be made leaves the stored value as it is.
        return Promise.resolve({ status: "unknown", reason: "change refused" });
      }
    },
  };
  return {
    values,
    faults,
    store: {
      acknowledged,
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => void values.set(key, value),
    },
  };
}

const earnedProfile = JSON.stringify({
  schema: "tear.profile",
  schemaVersion: PROFILE_ENVELOPE_VERSION,
  revision: 41,
  updatedAtMs: 1,
  writerId: "browser",
  profile: { shards: 30, username: "Someone", modes: { endless: true }, stats: { kills: 900 }, ach: {}, seen: {} },
  extensions: {},
});
const earnedMeta = JSON.stringify({ lifetimeEarned: 500, lifetimeSpent: 200, buy: { tough: 3 } });

const newMeta = (store: ReturnType<typeof fakeStore>["store"]) =>
  createMetaProgression({
    store,
    config: structuredClone(CONFIG),
    cloud: { loggedIn: () => false, push: () => Promise.resolve() },
    random: { next: () => 0 },
    upgrades: [],
    applyUpgrade: () => undefined,
  }).META;

function harness(cloud: CloudReplaceResult = "replaced") {
  const saved = fakeStore({
    tear_profile_v2: earnedProfile,
    tear_profile: JSON.stringify({ shards: 30, stats: { kills: 900 } }),
    tear_meta: earnedMeta,
  });
  const replaced: CloudSavePayload[] = [];
  const profile = createProfileStore({
    store: saved.store,
    getAchievements: () => undefined,
    getMeta: () => undefined,
    writerId: () => "browser",
  });
  const meta = newMeta(saved.store);
  profile.load();
  meta.load();
  const ports: ProgressResetPorts = {
    store: saved.store,
    cloud: {
      replaceSave: (payload) => {
        replaced.push(payload);
        return Promise.resolve(cloud);
      },
    },
    profile,
    meta,
    now: () => 1000,
    writerId: () => "browser",
  };
  return { saved, replaced, profile, meta, ports };
}

describe("resetting progress", () => {
  it("starts from a save that really holds progress", () => {
    const { profile, meta } = harness();
    expect(profile.data.shards).toBe(30);
    expect(profile.username()).toBe("Someone");
    expect(meta.data.lifetimeEarned).toBe(500);
  });

  it("replaces the online copy with a blank one first, then blanks this device and re-reads it", async () => {
    const { saved, replaced, profile, meta, ports } = harness();
    expect(await resetProgress(ports)).toBe("erased");
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.profile).toMatchObject({ shards: 0, stats: {}, created: 1000 });
    expect(replaced[0]?.profile.username).toBeUndefined();
    expect(replaced[0]?.meta).toMatchObject({ lifetimeEarned: 0, buy: {} });
    expect(profile.data).toMatchObject({ shards: 0, stats: {}, modes: {} });
    expect(profile.username()).toBe("");
    expect(meta.data).toMatchObject({ lifetimeEarned: 0, lifetimeSpent: 0, buy: {} });
    // Every stored copy is blank: the envelope (on the next revision), the plain copy and the coins.
    expect(JSON.parse(saved.values.get("tear_profile_v2") ?? "{}")).toMatchObject({
      revision: 42,
      profile: { shards: 0 },
    });
    expect(JSON.parse(saved.values.get("tear_profile") ?? "{}")).toMatchObject({ shards: 0, stats: {} });
    expect(JSON.parse(saved.values.get("tear_meta") ?? "{}")).toMatchObject({ lifetimeEarned: 0, buy: {} });
  });

  it("does not merge the old values back: a later save of the blank profile stays blank", async () => {
    const { profile, meta, ports } = harness();
    await resetProgress(ports);
    expect(await profile.flushAcknowledged()).toBe("committed");
    expect(await meta.flushAcknowledged()).toBe("committed");
    expect(profile.data.shards).toBe(0);
    expect(meta.data.lifetimeEarned).toBe(0);
  });

  it("changes nothing anywhere when the online copy cannot be replaced", async () => {
    const { saved, profile, ports } = harness("failed");
    expect(await resetProgress(ports)).toBe("online-failed");
    expect(saved.values.get("tear_profile_v2")).toBe(earnedProfile);
    expect(saved.values.get("tear_meta")).toBe(earnedMeta);
    expect(profile.data.shards).toBe(30);
  });

  it("goes ahead for an account with no online copy (a guest, or a portal that keeps the data itself)", async () => {
    const { ports, profile } = harness("no-online-copy");
    expect(await resetProgress(ports)).toBe("erased");
    expect(profile.data.shards).toBe(0);
  });

  it("says so when this device refuses the blank save, and leaves the in-memory profile as it was", async () => {
    const { saved, profile, ports } = harness();
    saved.faults.refuseWrites = true;
    expect(await resetProgress(ports)).toBe("device-failed");
    expect(profile.data.shards).toBe(30);
  });

  it("makes a save that could not be read writable again, which is how a stuck player gets out", async () => {
    const saved = fakeStore({ tear_profile_v2: "{", tear_profile: "not-json" });
    const problems: string[] = [];
    const profile = createProfileStore({
      store: saved.store,
      getAchievements: () => undefined,
      getMeta: () => undefined,
      writerId: () => "browser",
      reportProblem: (problem) => problems.push(problem),
    });
    profile.load();
    expect(problems).toEqual(["profile-unreadable"]);
    expect(await profile.flushAcknowledged()).toBe("unknown"); // never overwrites what it cannot read
    const outcome = await resetProgress({
      store: saved.store,
      cloud: { replaceSave: () => Promise.resolve("no-online-copy") },
      profile,
      meta: newMeta(saved.store),
      now: () => 5,
      writerId: () => "browser",
    });
    expect(outcome).toBe("erased");
    profile.markMode("endless");
    expect(await profile.flushAcknowledged()).toBe("committed");
    expect(JSON.parse(saved.values.get("tear_profile_v2") ?? "{}")).toMatchObject({
      profile: { modes: { endless: true } },
    });
  });
});
