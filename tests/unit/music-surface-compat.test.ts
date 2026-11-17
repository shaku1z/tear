import { describe, expect, it } from "vitest";
import * as legacyCatalog from "../../src/audio/signal/catalog";
import * as legacyLoadout from "../../src/audio/signal/loadout";
import * as musicCatalog from "../../src/audio/music/catalog";
import * as musicLoadout from "../../src/audio/music/loadout";
import { isLegacyMusicSettingsTab, normalizeMusicSettingsTab } from "../../src/audio/music/settings";

describe("Music surface compatibility", () => {
  it("recognizes the old music settings tabs and lands them on AUDIO inside Settings", () => {
    expect(isLegacyMusicSettingsTab("signal")).toBe(true);
    expect(isLegacyMusicSettingsTab("music")).toBe(true);
    expect(isLegacyMusicSettingsTab("audio")).toBe(false);
    expect(normalizeMusicSettingsTab("signal")).toBe("audio");
    expect(normalizeMusicSettingsTab("music")).toBe("audio");
    expect(normalizeMusicSettingsTab("video")).toBe("video");
    expect(normalizeMusicSettingsTab(undefined)).toBe("general");
  });

  it("keeps old signal import paths as thin aliases of canonical Music APIs", () => {
    expect(legacyCatalog.parseMusicCatalog).toBe(musicCatalog.parseMusicCatalog);
    expect(legacyCatalog.findWork).toBe(musicCatalog.findWork);
    expect(legacyLoadout.setMenuMusic).toBe(musicLoadout.setMenuMusic);
  });
});
