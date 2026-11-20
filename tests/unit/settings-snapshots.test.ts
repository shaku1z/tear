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
  privacy: { privacyLink: true, termsLink: false, note: null, statistics: true },
  buildLabel: "v0.1.0 · 820e8e9",
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
  it("ends the general list with the build as a read-only row, even when install and update rows show", () => {
    const rows = (env: typeof environment) => buildSettingsSections("general", settings, env)[0]?.rows ?? [];
    expect(rows(environment).at(-1)).toEqual({
      key: "version",
      label: "Version",
      value: "v0.1.0 · 820e8e9",
      kind: "info",
    });
    const busy = { ...environment, installAvailable: true, update: { ready: true, applying: false } };
    expect(
      rows(busy)
        .map((row) => row.key)
        .slice(-3),
    ).toEqual(["install", "update", "version"]);
    for (const tab of ["audio", "video", "accessibility", "controls"])
      expect(buildSettingsSections(tab, settings, environment).flatMap((section) => section.rows)).not.toContainEqual(
        expect.objectContaining({ key: "version" }),
      );
  });
  it("shows the data rows the build's privacy stance asks for, and no others", () => {
    const keys = (privacy: typeof environment.privacy) =>
      buildSettingsSections("general", settings, { ...environment, privacy })[0]?.rows.map((row) => row.key) ?? [];
    const own = keys(environment.privacy);
    expect(own).toContain("shareStatistics");
    expect(own).toContain("privacy");
    expect(own).not.toContain("terms");
    const portal = keys({ privacyLink: true, termsLink: true, note: null, statistics: false });
    expect(portal).toContain("terms");
    expect(portal).not.toContain("shareStatistics");
    const local = buildSettingsSections("general", settings, {
      ...environment,
      privacy: {
        privacyLink: false,
        termsLink: false,
        note: "Progress is stored only in this browser.",
        statistics: false,
      },
    })[0]?.rows;
    expect(local).toContainEqual({
      key: "privacyNote",
      label: "Progress is stored only in this browser.",
      value: "",
      kind: "info",
    });
    expect(local?.map((row) => row.key)).not.toContain("privacy");
  });
  it("previews the active controller glyph family instead of hardcoding one console", () => {
    expect(
      buildSettingsSections("controls", settings, environment)[0]?.rows.find((row) => row.key === "glyphStyle")?.value,
    ).toContain("✕  ◯  ▢  △");
  });
});
