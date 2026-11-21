import { describe, expect, it, vi } from "vitest";
import {
  createCloudCompatibility,
  type AccountProvider,
  type LegacyMetaPort,
  type LegacyProfilePort,
  type SharedCloudService,
} from "../../src/platform/cloud";
import { createBrowserPlatformServices } from "../../src/platform/browser";

function dependencies() {
  const profile: LegacyProfilePort = {
    data: {},
    username: () => "",
    usernameSetAt: () => 0,
    setUsername: vi.fn(),
    merge: vi.fn(),
    save: vi.fn(),
  };
  const meta: LegacyMetaPort = { data: {}, merge: vi.fn(), save: vi.fn() };
  const shared: SharedCloudService = {
    available: false,
    ranks: () => true,
    submitScore: () => Promise.resolve(false),
    topScores: () => Promise.resolve(null),
    logEvent() {
      return;
    },
    publishReplay: () => Promise.resolve(null),
    loadReplay: () => Promise.resolve(null),
    replayFeed: () => Promise.resolve(null),
    linkReplay: () => Promise.resolve(false),
    loadGhost: () => Promise.resolve(null),
  };
  return { profile, meta, shared };
}

describe("cloud compatibility", () => {
  it("initializes once and falls back to a playable local guest after provider failure", async () => {
    const deps = dependencies();
    const init = vi.fn(() => Promise.reject(new Error("offline")));
    const failing: AccountProvider = { kind: "firebase", signInLabel: "Sign in", init };
    const compatibility = createCloudCompatibility({
      target: "standalone",
      getPlatform: () => createBrowserPlatformServices({ window: {} }),
      getProfile: () => deps.profile,
      getMeta: () => deps.meta,
      statisticsAllowed: () => true,
      firebaseAccount: failing,
      shared: deps.shared,
    });

    const first = compatibility.Cloud.init();
    const second = compatibility.Cloud.init();
    await expect(first).resolves.toBe("guest");
    await expect(second).resolves.toBe("guest");
    expect(init).toHaveBeenCalledOnce();
    expect(compatibility.Cloud.provider).toBe(compatibility.LocalProvider);
    expect(compatibility.Cloud.user).toEqual({ id: "local", name: "Guest", guest: true });
  });

  it("isolates listener and shared-service failures", async () => {
    const deps = dependencies();
    const compatibility = createCloudCompatibility({
      target: "standalone",
      getPlatform: () => createBrowserPlatformServices({ window: {} }),
      getProfile: () => deps.profile,
      getMeta: () => deps.meta,
      statisticsAllowed: () => true,
      shared: { ...deps.shared, available: true, submitScore: () => Promise.reject(new Error("network")) },
    });
    compatibility.Cloud.onChange(() => {
      throw new Error("UI listener");
    });
    await expect(compatibility.Cloud.init()).resolves.toBe("guest");
    await expect(
      compatibility.Cloud.submitScore({ kind: "score", mode: "endless", difficulty: "normal" }, { score: 1 }),
    ).resolves.toBe(false);
  });

  it("replaces the online save through the provider that has one, and says when it cannot", async () => {
    const make = (provider: AccountProvider) => {
      const deps = dependencies();
      return createCloudCompatibility({
        target: "standalone",
        getPlatform: () => createBrowserPlatformServices({ window: {} }),
        getProfile: () => deps.profile,
        getMeta: () => deps.meta,
        statisticsAllowed: () => true,
        firebaseAccount: provider,
        shared: deps.shared,
      }).Cloud;
    };
    const payload = { profile: {}, meta: {} };
    const replace = vi.fn(() => Promise.resolve(true));
    const online = make({ kind: "firebase", init: () => Promise.resolve(), replace });
    await online.init();
    await expect(online.replaceSave(payload)).resolves.toBe("replaced");
    expect(replace).toHaveBeenCalledWith(online, payload);

    const refused = make({ kind: "firebase", init: () => Promise.resolve(), replace: () => Promise.resolve(false) });
    await refused.init();
    await expect(refused.replaceSave(payload)).resolves.toBe("failed");

    const throwing = make({
      kind: "firebase",
      init: () => Promise.resolve(),
      replace: () => Promise.reject(new Error("offline")),
    });
    await throwing.init();
    await expect(throwing.replaceSave(payload)).resolves.toBe("failed");

    // A provider without an online copy (a guest, or a portal that keeps the data itself) has nothing to replace.
    const guest = make({ kind: "firebase", init: () => Promise.resolve() });
    await guest.init();
    await expect(guest.replaceSave(payload)).resolves.toBe("no-online-copy");
  });

  it("passes a run statistic to the shared service only while the player allows it", () => {
    const deps = dependencies();
    const logged: string[] = [];
    let allowed = true;
    const compatibility = createCloudCompatibility({
      target: "standalone",
      getPlatform: () => createBrowserPlatformServices({ window: {} }),
      getProfile: () => deps.profile,
      getMeta: () => deps.meta,
      statisticsAllowed: () => allowed,
      shared: {
        ...deps.shared,
        logEvent: (name) => {
          logged.push(name);
        },
      },
    });
    compatibility.Cloud.logEvent("first");
    allowed = false;
    compatibility.Cloud.logEvent("second");
    allowed = true;
    compatibility.Cloud.logEvent("third");
    expect(logged).toEqual(["first", "third"]);
  });
});
