import { describe, expect, it } from "vitest";
import { buildSettingsSections } from "../../src/presentation/settings-snapshots";

const settings = { masterVolume: 1, musicVolume: 0.5, sfxVolume: 0.4, interfaceVolume: 0.3,
  masterMuted: false, musicMuted: false, sfxMuted: false, interfaceMuted: false, gfx: "auto",
  padPreset: "default", tetherMode: "hold", sens: 1, controls: "auto", shake: 1 };
const environment = { lowGraphics: false, touch: false, installAvailable: false, update: { ready: false, applying: false },
  presets: { default: { name: "DEFAULT", tag: "", line: "familiar", map: "L1 tether" } },
  controllerGlyphs: ["✕", "◯", "▢", "△"] };

describe("settings snapshots", () => {
  it("keeps hierarchical audio channels separate", () => {
    expect(buildSettingsSections("audio", settings, environment)[0]?.rows.map((row) => row.key)).toEqual([
      // Volumes, then Music preferences, then the mute toggles.
      "masterVolume", "musicVolume", "sfxVolume", "interfaceVolume",
      "menuMusic", "musicMode",
      "masterMuted", "musicMuted", "sfxMuted", "interfaceMuted",
    ]);
  });
  it("normalizes the legacy signal tab to the canonical Music surface", () => {
    const legacy = buildSettingsSections("signal", settings, environment);
    const canonical = buildSettingsSections("music", settings, environment);
    expect(legacy).toEqual(canonical);
    expect(canonical[0]?.label).toBe("MUSIC");
  });
  it("exposes the full cinematic preference in accessibility", () => {
    expect(buildSettingsSections("accessibility", settings, environment)[0]?.rows.find((row) => row.key === "cinematics")?.value).toBe("FULL");
  });
  it("previews the active controller glyph family instead of hardcoding one console", () => {
    expect(buildSettingsSections("controls", settings, environment)[0]?.rows
      .find((row) => row.key === "glyphStyle")?.value).toContain("✕  ◯  ▢  △");
  });
});
