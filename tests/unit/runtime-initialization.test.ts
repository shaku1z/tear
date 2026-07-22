import { describe, expect, it, vi } from "vitest";

import {
  InstallPromptController,
  createConfigRestorer,
  initializePlatformServices,
  shouldPromptForUsername,
} from "../../src/app/runtime-initialization";

describe("runtime initialization", () => {
  it("captures and consumes the browser install prompt once", () => {
    const target = new EventTarget();
    const controller = new InstallPromptController(target as Window);
    const event = new Event("beforeinstallprompt") as Event & { prompt: ReturnType<typeof vi.fn> };
    event.prompt = vi.fn();
    const prevent = vi.spyOn(event, "preventDefault");
    target.dispatchEvent(event);
    expect(prevent).toHaveBeenCalled();
    expect(controller.available).toBe(true);
    expect(controller.prompt()).toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(controller.prompt()).toBe(false);
  });

  it("restores a deep config snapshot without replacing the root object", () => {
    const config = { player: { speed: 10 }, modes: ["a"] };
    const restore = createConfigRestorer(config);
    config.player.speed = 99;
    config.modes.push("b");
    restore();
    expect(config).toEqual({ player: { speed: 10 }, modes: ["a"] });
  });

  it("orders local load, portal readiness, reload and cloud observation", async () => {
    const calls: string[] = [];
    let listener: ((user: { guest: boolean } | null, state: string) => void) | undefined;
    initializePlatformServices({
      audio: { init: () => calls.push("audio.init"), mute: (muted, reason) => calls.push(`${reason}:${String(muted)}`) },
      meta: { load: () => calls.push("meta.load") }, profile: { load: () => calls.push("profile.load") },
      settings: { reload: () => calls.push("settings.reload") }, backfillProgress: () => calls.push("backfill"),
      portal: {
        setHooks(start, finish, mute) { start(); finish(); mute(true); },
        loadingStart: () => calls.push("loading.start"), loadingStop: () => calls.push("loading.stop"),
        init: () => { calls.push("portal.init"); return Promise.resolve(); },
      },
      cloud: { init: () => { calls.push("cloud.init"); return Promise.resolve(); }, onChange: (next) => { listener = next; calls.push("cloud.listen"); } },
      onCloudChange: (_user, state) => { calls.push(`cloud:${state}`); },
    });
    await vi.waitFor(() => { expect(listener).toBeDefined(); });
    if (listener) listener({ guest: false }, "signedin");
    expect(calls).toEqual([
      "audio.init", "meta.load", "profile.load", "backfill", "ad:true", "ad:false", "cg:true",
      "loading.start", "portal.init", "meta.load", "profile.load", "settings.reload", "loading.stop",
      "cloud.init", "cloud.listen", "cloud:signedin",
    ]);
  });

  it("requires a real named-provider account and an idle rename flow", () => {
    const provider = {};
    const base = { state: "signedin", user: { guest: false }, provider, expectedProvider: provider,
      username: "", alreadyPrompted: false, screen: "menu", renameActive: false };
    expect(shouldPromptForUsername(base)).toBe(true);
    expect(shouldPromptForUsername({ ...base, user: { guest: true } })).toBe(false);
    expect(shouldPromptForUsername({ ...base, alreadyPrompted: true })).toBe(false);
  });
});
