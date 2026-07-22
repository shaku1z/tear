import { describe, expect, it, vi } from "vitest";
import { createCrazyGamesPlatformServices, type CrazyGamesSdkShape } from "../../src/platform/crazygames";
import type { PlatformLifecycleEvent } from "../../src/platform/contracts";

describe("CrazyGames platform contract", () => {
  it("does not activate portal capabilities when SDK initialization fails", async () => {
    const sdk: CrazyGamesSdkShape = {
      init: () => Promise.reject(new Error("blocked")),
      environment: "crazygames",
      ad: { requestAd() { throw new Error("must not run"); } },
    };
    const platform = await createCrazyGamesPlatformServices({ sdk });
    expect(platform.environment).toBe("disabled");
    expect(platform.active).toBe(false);
    expect(platform.live).toBe(false);
    expect(platform.ads.available).toBe(false);
  });

  it("routes lifecycle calls and portal mute changes through the adapter", async () => {
    let settingsListener: (() => void) | undefined;
    const settings = { muteAudio: false };
    const gameplayStart = vi.fn();
    const sdk: CrazyGamesSdkShape = {
      init() { return Promise.resolve(); },
      environment: "crazygames",
      game: {
        settings,
        addSettingsChangeListener(listener) { settingsListener = listener; },
        gameplayStart,
      },
    };
    const platform = await createCrazyGamesPlatformServices({ sdk });
    const events: PlatformLifecycleEvent[] = [];
    platform.lifecycle.subscribe((event) => events.push(event));
    platform.lifecycle.gameplayStarted();
    settings.muteAudio = true;
    settingsListener?.();

    expect(gameplayStart).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "temporary-mute-changed", reason: "portal", muted: true });
    expect(platform.ads.available).toBe(false);
  });

  it("uses the current SDK v3 loading and gameplay lifecycle methods in order", async () => {
    const calls: string[] = [];
    const sdk: CrazyGamesSdkShape = {
      init() { calls.push("init"); return Promise.resolve(); },
      environment: "local",
      game: {
        loadingStart() { calls.push("loading-start"); },
        loadingStop() { calls.push("loading-stop"); },
        gameplayStart() { calls.push("gameplay-start"); },
        gameplayStop() { calls.push("gameplay-stop"); },
      },
    };
    const platform = await createCrazyGamesPlatformServices({ sdk });
    platform.lifecycle.loadingStarted();
    platform.lifecycle.loadingFinished();
    platform.lifecycle.gameplayStarted();
    platform.lifecycle.gameplayFinished();

    expect(calls).toEqual(["init", "loading-start", "loading-stop", "gameplay-start", "gameplay-stop"]);
    expect(platform.active).toBe(true);
    expect(platform.live).toBe(false);
    expect(platform.ads.available).toBe(false);
  });

  it("brackets rewarded ads with suspension and temporary muting", async () => {
    const sdk: CrazyGamesSdkShape = {
      init() { return Promise.resolve(); },
      environment: "crazygames",
      ad: {
        requestAd(type, callbacks) {
          expect(type).toBe("rewarded");
          callbacks.adStarted();
          callbacks.adFinished();
        },
      },
    };
    const platform = await createCrazyGamesPlatformServices({ sdk });
    if (!platform.ads.available) throw new Error("expected ads");
    const events: PlatformLifecycleEvent[] = [];
    platform.lifecycle.subscribe((event) => events.push(event));

    await expect(platform.ads.service.showRewardedContinue()).resolves.toBe("completed");
    expect(events).toEqual([
      { type: "suspend-requested", reason: "ad" },
      { type: "temporary-mute-changed", reason: "ad", muted: true },
      { type: "temporary-mute-changed", reason: "ad", muted: false },
      { type: "resume-requested", reason: "ad" },
    ]);
  });

  it("uses injected data storage and mirrors it locally", async () => {
    const values = new Map<string, string>();
    const sdk: CrazyGamesSdkShape = {
      init() { return Promise.resolve(); },
      environment: "crazygames",
      data: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
      },
    };
    const platform = await createCrazyGamesPlatformServices({ sdk });
    await platform.settingsStorage.set("active", "yes");
    expect(values.get("active")).toBe("yes");
    expect(await platform.settingsStorage.get("active")).toBe("yes");
  });
});
