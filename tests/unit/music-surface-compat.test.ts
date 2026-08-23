import { describe, expect, it } from "vitest";
import * as legacyCatalog from "../../src/audio/signal/catalog";
import * as legacyLoadout from "../../src/audio/signal/loadout";
import * as musicCatalog from "../../src/audio/music/catalog";
import * as musicLoadout from "../../src/audio/music/loadout";
import { MUSIC_SETTINGS_TAB, normalizeMusicSettingsTab } from "../../src/audio/music/settings";

describe("Music surface compatibility", () => {
  it("normalizes legacy deep-link input while canonical navigation writes music", () => {
    expect(normalizeMusicSettingsTab("signal")).toBe(MUSIC_SETTINGS_TAB);
    expect(normalizeMusicSettingsTab("music")).toBe(MUSIC_SETTINGS_TAB);
    expect(normalizeMusicSettingsTab("audio")).toBe("audio");
  });

  it("keeps old signal import paths as thin aliases of canonical Music APIs", () => {
    expect(legacyCatalog.parseMusicCatalog).toBe(musicCatalog.parseMusicCatalog);
    expect(legacyCatalog.findWork).toBe(musicCatalog.findWork);
    expect(legacyLoadout.setMenuMusic).toBe(musicLoadout.setMenuMusic);
  });
});
