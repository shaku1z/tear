import { describe, expect, it, vi } from "vitest";
import { createLegacyPlatformCompatibility } from "../../src/platform/legacy-compat";
import { createCrazyGamesPlatformServices, type CrazyGamesSdkShape } from "../../src/platform/crazygames";
import type { SyncStringStorage } from "../../src/platform/storage";

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: SyncStringStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe("legacy platform compatibility", () => {
  it("keeps standalone synchronous saves local-first under their original keys", async () => {
    const local = memoryStorage();
    const compatibility = createLegacyPlatformCompatibility({ target: "standalone", storage: local.storage });
    compatibility.CG.store.set("tear_profile", "profile");

    expect(compatibility.CG.store.get("tear_profile")).toBe("profile");
    expect(local.values.get("tear_profile")).toBe("profile");
    await expect(compatibility.CG.init()).resolves.toBe(false);
    expect(compatibility.services.id).toBe("browser");
    expect(compatibility.CG.adsAvailable()).toBe(false);
  });

  it("gates CrazyGames calls until the injected SDK reports a portal environment", async () => {
    const local = memoryStorage();
    const remote = new Map<string, string>();
    const gameplayStart = vi.fn();
    const mute = vi.fn();
    const sdk: CrazyGamesSdkShape = {
      init: () => Promise.resolve(),
      environment: "crazygames",
      game: { settings: { muteAudio: true }, gameplayStart },
      data: {
        getItem: (key) => remote.get(key) ?? null,
        setItem: (key, value) => { remote.set(key, value); },
      },
    };
    const compatibility = createLegacyPlatformCompatibility({
      target: "crazygames", sdk, storage: local.storage, createCrazyGamesServices: createCrazyGamesPlatformServices,
    });
    compatibility.CG.setHooks(() => undefined, () => undefined, mute);
    compatibility.CG.gameplayStart();
    expect(gameplayStart).not.toHaveBeenCalled();

    await expect(compatibility.CG.init()).resolves.toBe(true);
    compatibility.CG.gameplayStart();
    compatibility.CG.store.set("tear_meta", "meta");

    expect(gameplayStart).toHaveBeenCalledOnce();
    expect(mute).toHaveBeenCalledWith(true);
    expect(remote.get("tear_meta")).toBe("meta");
    expect(local.values.get("tear_meta")).toBe("meta");
    expect(compatibility.services.id).toBe("crazygames");
  });

  it("preserves rewarded-continue success and lifecycle hooks", async () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    const reward = vi.fn();
    const done = vi.fn();
    const sdk: CrazyGamesSdkShape = {
      init: () => Promise.resolve(),
      environment: "crazygames",
      ad: {
        requestAd(_type, callbacks) {
          callbacks.adStarted();
          callbacks.adFinished();
        },
      },
    };
    const compatibility = createLegacyPlatformCompatibility({
      target: "crazygames", sdk, createCrazyGamesServices: createCrazyGamesPlatformServices,
    });
    compatibility.CG.setHooks(suspend, resume);
    await compatibility.CG.init();
    compatibility.CG.rewarded(reward, done);
    await vi.waitFor(() => { expect(done).toHaveBeenCalledWith(true); });

    expect(suspend).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(reward).toHaveBeenCalledOnce();
  });

  it("delivers a loading bracket requested while the SDK is initializing", async () => {
    const calls: string[] = [];
    let finishInit: (() => void) | undefined;
    const sdk: CrazyGamesSdkShape = {
      init: () => new Promise<void>((resolve) => { finishInit = resolve; }),
      environment: "crazygames",
      game: {
        loadingStart: () => { calls.push("loading-start"); },
        loadingStop: () => { calls.push("loading-stop"); },
      },
    };
    const compatibility = createLegacyPlatformCompatibility({
      target: "crazygames", sdk, createCrazyGamesServices: createCrazyGamesPlatformServices,
    });

    compatibility.CG.loadingStart();
    const initializing = compatibility.CG.init();
    expect(calls).toEqual([]);
    finishInit?.();
    await initializing;
    compatibility.CG.loadingStop();

    expect(calls).toEqual(["loading-start", "loading-stop"]);
  });

  it("keeps the facade gated when SDK initialization fails", async () => {
    const sdk: CrazyGamesSdkShape = {
      init: () => Promise.reject(new Error("SDK unavailable")),
      environment: "crazygames",
    };
    const compatibility = createLegacyPlatformCompatibility({
      target: "crazygames", sdk, createCrazyGamesServices: createCrazyGamesPlatformServices,
    });
    await expect(compatibility.CG.init()).resolves.toBe(false);
    expect(compatibility.CG.live).toBe(false);
    expect(compatibility.CG.on).toBe(false);
  });
});
