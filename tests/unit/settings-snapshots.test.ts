import { describe, expect, it } from "vitest";
import { buildSettingsSections } from "../../src/presentation/settings-snapshots";

const settings = {
  masterVolume: 1,
  musicVolume: 0.5,
  sfxVolume: 0.4,
  interfaceVolume: 0.3,
  masterMuted: false,
  musicMuted: false,
  sfxMuted: false,
  interfaceMuted: false,
  gfx: "auto",
  padPreset: "default",
  tetherMode: "hold",
  sens: 1,
  controls: "auto",
  shake: 1,
};
const environment = {
  lowGraphics: false,
  touch: false,
  installAvailable: false,
  update: { ready: false, applying: false },
  presets: { default: { name: "DEFAULT", tag: "", line: "familiar", map: "L1 tether" } },
  controllerGlyphs: ["✕", "◯", "▢", "△"],
};

describe("settings snapshots", () => {
  it("keeps hierarchical audio channels separate", () => {
    const rows = buildSettingsSections("audio", settings, environment)[0]?.rows ?? [];
    // One row per channel (each volume carries its own mute switch); music preferences live on the MUSIC screen.
    expect(rows.map((row) => row.key)).toEqual(["masterVolume", "musicVolume", "sfxVolume", "interfaceVolume"]);
    expect(rows.slice(0, 4).map((row) => row.muteKey)).toEqual([
      "masterMuted",
      "musicMuted",
      "sfxMuted",
      "interfaceMuted",
    ]);
  });
  it("lands the old music and signal tabs on AUDIO, which keeps only the mix", () => {
    const audio = buildSettingsSections("audio", settings, environment);
    expect(buildSettingsSections("signal", settings, environment)).toEqual(audio);
    expect(buildSettingsSections("music", settings, environment)).toEqual(audio);
  });
  it("exposes the full cinematic preference in accessibility", () => {
    expect(
      buildSettingsSections("accessibility", settings, environment)[0]?.rows.find((row) => row.key === "cinematics")
        ?.value,
    ).toBe("FULL");
  });
  it("previews the active controller glyph family instead of hardcoding one console", () => {
    expect(
      buildSettingsSections("controls", settings, environment)[0]?.rows.find((row) => row.key === "glyphStyle")?.value,
    ).toContain("✕  ◯  ▢  △");
  });
});
