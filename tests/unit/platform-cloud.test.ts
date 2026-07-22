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
    data: {}, username: () => "", usernameSetAt: () => 0, setUsername: vi.fn(), merge: vi.fn(), save: vi.fn(),
  };
  const meta: LegacyMetaPort = { data: {}, merge: vi.fn(), save: vi.fn() };
  const shared: SharedCloudService = {
    available: false,
    submitScore: () => Promise.resolve(false),
    topScores: () => Promise.resolve(null),
    logEvent() { return; },
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
      shared: { ...deps.shared, available: true, submitScore: () => Promise.reject(new Error("network")) },
    });
    compatibility.Cloud.onChange(() => { throw new Error("UI listener"); });
    await expect(compatibility.Cloud.init()).resolves.toBe("guest");
    await expect(compatibility.Cloud.submitScore("endless", "normal", { score: 1 })).resolves.toBe(false);
  });
});
