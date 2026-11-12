import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createLegacyProfile } from "../../src/persistence/legacy-profile";
import { createMetaProgression } from "../../src/gameplay/progression/meta";
import { createAchievements } from "../../src/gameplay/progression/achievements";
import { createLegacyPlatformCompatibility, type LegacyCrazyGamesFacade } from "../../src/platform/legacy-compat";
import { createCrazyGamesPlatformServices } from "../../src/platform/crazygames";
import { createLiveTutorialCompletionPersistence } from "../../src/app/progress/tutorial-completion-persistence";
import type { SyncStringStorage } from "../../src/platform/storage";

const idA = "00000000-0000-4000-8000-000000000001", idB = "00000000-0000-4000-8000-000000000002";
function backing(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  const noFault = (key: string): unknown => { void key; return undefined; };
  const fault = { beforeRead: noFault, beforeWrite: noFault, afterWrite: noFault };
  const storage: SyncStringStorage = {
    getItem(key) { fault.beforeRead(key); return values.get(key) ?? null; },
    setItem(key, value) { fault.beforeWrite(key); values.set(key, value); fault.afterWrite(key); },
    removeItem(key) { values.delete(key); },
  };
  return { values, storage, fault };
}
function runtime(storage: SyncStringStorage, ids = [idA, idB]) {
  const { CG } = createLegacyPlatformCompatibility({ target: "standalone", storage });
  return owners(CG.store, ids);
}
function owners(store: LegacyCrazyGamesFacade["store"], ids = [idA, idB]) {
  const profile = createLegacyProfile({ store, writerId: () => "unit", now: () => 1,
    getAchievements: () => achievements, getMeta: () => meta,
    onCommitted: () => { if (profile.pendingRewards().length > 0) void authority.retry(); },
    onLoaded: () => { void authority.retry(); } });
  const { META: meta, SHOP } = createMetaProgression({ store, config: structuredClone(CONFIG),
    cloud: { loggedIn: () => false, push: () => Promise.resolve() }, random: { next: () => 0 }, upgrades: [], applyUpgrade: () => undefined });
  const achievements = createAchievements({ meta, profile, shop: SHOP, audio: { rankup() { /* no audio in storage tests */ } }, clamp: (value, low, high) => Math.max(low, Math.min(high, value)) });
  const authority = createLiveTutorialCompletionPersistence(profile, meta, achievements, () => ids.shift() ?? idB);
  meta.load(); profile.load();
  return { profile, meta, authority, achievements, store };
}

describe("durable tutorial completion", () => {
  it("reconstructs exact retries from bytes and credits distinct fresh courses additively", async () => {
    const saved = backing(), first = runtime(saved.storage);
    const course = await first.authority.issue(); expect(course.status).toBe("committed");
    expect(await first.authority.complete(course.id)).toBe("committed");
    expect(first.profile.stat("tutorialDone")).toBe(1); expect(first.meta.coins()).toBe(75);
    const restored = runtime(saved.storage, [idB]);
    expect(await restored.authority.complete(course.id)).toBe("already");
    expect(restored.profile.stat("tutorialDone")).toBe(1); expect(restored.meta.coins()).toBe(75);
    const fresh = await restored.authority.issue(); expect(fresh.id).not.toBe(course.id);
    expect(await restored.authority.complete(fresh.id)).toBe("committed");
    expect(restored.profile.stat("tutorialDone")).toBe(2); expect(restored.meta.coins()).toBe(75);
    expect(await restored.authority.complete("unissued")).toBe("unknown");
    expect(await restored.authority.complete("00000000-0000-4000-8000-000000000099")).toBe("unknown");
    expect(restored.profile.stat("tutorialDone")).toBe(2);
    restored.profile.setPendingFinale({ stage: 1 }); await restored.profile.flushAcknowledged();
    restored.profile.clearPendingFinale(); await restored.profile.flushAcknowledged();
    expect(runtime(saved.storage).profile.pendingFinale()).toBeNull();
  });

  it("recovers a committed profile with failed META write without losing or doubling Apprentice coins", async () => {
    const saved = backing(), first = runtime(saved.storage), course = await first.authority.issue();
    saved.fault.beforeWrite = (key) => { if (key === "tear_meta") throw new Error("quota"); };
    expect(await first.authority.complete(course.id)).toBe("unknown");
    expect(first.profile.stat("tutorialDone")).toBe(1); expect(first.meta.coins()).toBe(0);
    saved.fault.beforeWrite = () => undefined;
    const boot = runtime(saved.storage); expect(await boot.authority.retry()).toBe("committed");
    expect(boot.profile.stat("tutorialDone")).toBe(1); expect(boot.meta.coins()).toBe(75);
    expect(boot.profile.pendingRewards()).toEqual([]);
    expect(await boot.authority.retry()).toBe("committed"); expect(boot.meta.coins()).toBe(75);
  });

  it("resolves lost profile and META acknowledgements from stored receipts after reload", async () => {
    const saved = backing(), first = runtime(saved.storage), course = await first.authority.issue();
    let failedKey: string | undefined = "tear_profile_v2", lost = false;
    saved.fault.afterWrite = (key) => { if (key === failedKey && saved.values.get(key)?.includes("achievement:student")) { lost = true; throw new Error("lost acknowledgement"); } };
    saved.fault.beforeRead = (key) => { if (lost && key === failedKey) throw new Error("read unavailable"); };
    expect(await first.authority.complete(course.id)).toBe("unknown");
    saved.fault.afterWrite = () => undefined; saved.fault.beforeRead = () => undefined;
    const second = runtime(saved.storage); failedKey = "tear_meta"; lost = false;
    saved.fault.afterWrite = (key) => { if (key === failedKey && saved.values.get(key)?.includes("achievement:student")) { lost = true; throw new Error("lost acknowledgement"); } };
    saved.fault.beforeRead = (key) => { if (lost && key === failedKey) throw new Error("read unavailable"); };
    expect(await second.authority.retry()).toBe("unknown");
    saved.fault.afterWrite = () => undefined; saved.fault.beforeRead = () => undefined;
    const third = runtime(saved.storage); expect(await third.authority.retry()).toBe("committed");
    expect(third.profile.stat("tutorialDone")).toBe(1); expect(third.meta.coins()).toBe(75);
    expect(await third.authority.complete(course.id)).toBe("already"); expect(third.meta.coins()).toBe(75);
  });

  it("does not turn unavailable or rejected backing writes into memory-only completion credit", async () => {
    const saved = backing(), owner = runtime(saved.storage), course = await owner.authority.issue();
    saved.fault.beforeWrite = (key) => { if (key === "tear_profile_v2") throw new Error("blocked"); };
    expect(await owner.authority.complete(course.id)).toBe("unknown");
    expect(owner.profile.stat("tutorialDone")).toBe(0); expect(owner.meta.coins()).toBe(0);
    const unavailable = createLegacyPlatformCompatibility({ target: "standalone", storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { /* no backing */ } } });
    unavailable.CG.store.set("playable", "memory"); expect(unavailable.CG.store.get("playable")).toBe("memory");
    expect((await unavailable.CG.store.acknowledged?.update("playable", () => "durable"))?.status).not.toBe("committed");
  });

  it("merges receipt unions repeatedly and keeps a higher historical floor additive for new work", async () => {
    const a = backing(), b = backing(), left = runtime(a.storage, [idA]), right = runtime(b.storage, [idB]);
    await left.authority.complete((await left.authority.issue()).id);
    await right.authority.complete((await right.authority.issue()).id);
    left.profile.merge(right.profile.data); right.profile.merge(left.profile.data); left.profile.merge(right.profile.data);
    left.meta.merge(right.meta.data); right.meta.merge(left.meta.data); left.meta.merge(right.meta.data);
    expect(left.profile.stat("tutorialDone")).toBe(2); expect(right.profile.stat("tutorialDone")).toBe(2);
    expect(left.meta.coins()).toBe(75); expect(right.meta.coins()).toBe(75);
    left.profile.merge({ stats: { tutorialDone: 10 }, extension: { retained: true } });
    left.meta.merge({ lifetimeEarned: 1000, lifetimeSpent: 0, buy: {}, future: { retained: true } });
    const id = "00000000-0000-4000-8000-000000000003";
    await left.profile.issueTutorial(id); await left.authority.complete(id);
    expect(left.profile.stat("tutorialDone")).toBe(11);
    await left.meta.grantReward("achievement:first_blood", 75);
    expect(left.meta.coins()).toBe(1075); expect(left.meta.data.future).toEqual({ retained: true });
    expect(left.profile.data.extension).toEqual({ retained: true });
  });

  it("drains a later achievement and preserves ordinary earnings queued during a payout", async () => {
    const saved = backing(), owner = runtime(saved.storage), course = await owner.authority.issue();
    let emitted = false;
    saved.fault.afterWrite = (key) => {
      if (key === "tear_meta" && !emitted) {
        emitted = true; owner.meta.addCoins(10); owner.achievements.unlock("first_blood");
      }
    };
    expect(await owner.authority.complete(course.id)).toBe("committed");
    expect(owner.profile.pendingRewards()).toEqual([]); expect(owner.meta.coins()).toBe(160);
    const boot = runtime(saved.storage); await boot.authority.retry(); expect(boot.meta.coins()).toBe(160);
  });

  it("awaits the fake portal backing and serializes a later ordinary save behind a receipt write", async () => {
    const remote = new Map<string, string>(); let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; }); let first = true;
    const { CG } = createLegacyPlatformCompatibility({ target: "crazygames", createCrazyGamesServices: createCrazyGamesPlatformServices,
      sdk: { init: () => Promise.resolve(), environment: "crazygames", data: {
        getItem: (key) => Promise.resolve(remote.get(key) ?? null),
        async setItem(key, value) { if (first) { first = false; await blocked; } remote.set(key, value); },
      } } });
    await CG.init();
    const channel = CG.store.acknowledged;
    if (!channel) throw new Error("acknowledged adapter missing");
    const firstWrite = channel.update("test", () => "receipt");
    const secondWrite = channel.update("test", (current) => `${current ?? ""}+ordinary`);
    await Promise.resolve(); expect(remote.size).toBe(0); release?.();
    expect((await firstWrite).status).toBe("committed"); expect((await secondWrite).status).toBe("committed");
    expect(remote.get("test")).toBe("receipt+ordinary");
    const saved = backing(), completed = runtime(saved.storage);
    await completed.authority.complete((await completed.authority.issue()).id);
    for (const [key, value] of saved.values) remote.set(key, value);
    const boot = owners(CG.store);
    expect(await boot.authority.retry()).toBe("committed");
    expect(boot.profile.stat("tutorialDone")).toBe(1); expect(boot.meta.coins()).toBe(75);
    expect(boot.profile.pendingRewards()).toEqual([]);
  });
});
