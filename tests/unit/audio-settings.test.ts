import { describe, expect, it } from "vitest";
import { effectiveGain } from "../../src/audio/mixer";
import { migrateAudioSettings } from "../../src/persistence/audio-settings";

describe("audio settings migration", () => {
  it("preserves legacy master volume and music choice", () => {
    const settings = migrateAudioSettings({ vol: 0.8, music: false });
    expect(settings.masterVolume).toBe(0.8);
    expect(settings.musicMuted).toBe(true);
    expect(settings.sfxMuted).toBe(false);
  });

  it("keeps temporary platform mute separate from user settings", () => {
    const settings = migrateAudioSettings({ masterVolume: 0.5, musicVolume: 0.4 });
    expect(effectiveGain("music", settings)).toBeCloseTo(0.2);
    expect(effectiveGain("music", settings, new Set(["ad"]))).toBe(0);
    expect(settings.musicVolume).toBe(0.4);
  });
});
