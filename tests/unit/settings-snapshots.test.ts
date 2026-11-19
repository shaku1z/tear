import { describe, expect, it } from "vitest";
import { buildSettingsSections, type SettingsResetView } from "../../src/presentation/settings-snapshots";

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
  progressReset: { stage: "idle", confirmable: false, failure: null },
  credits: [
    {
      label: "FONTS",
      entries: [
        { id: "plex", name: "IBM Plex Mono", note: "text · © 2017 IBM Corp. · SIL OFL 1.1", hasLicenceText: true },
        { id: "vite", name: "Vite", note: "builds the game · MIT License", hasLicenceText: false },
      ],
    },
  ],
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
        .slice(-4),
    ).toEqual(["install", "update", "resetProgress", "version"]);
    for (const tab of ["audio", "video", "accessibility", "controls"])
      expect(buildSettingsSections(tab, settings, environment).flatMap((section) => section.rows)).not.toContainEqual(
        expect.objectContaining({ key: "version" }),
      );
  });
  it("shows the erase of progress in General as one row, then a confirming row with a way back, then a wait", () => {
    const general = (progressReset: SettingsResetView) =>
      buildSettingsSections("general", settings, { ...environment, progressReset })[0]?.rows.filter((row) =>
        row.key.startsWith("reset"),
      );
    expect(general({ stage: "idle", confirmable: false, failure: null })).toEqual([
      { key: "resetProgress", label: "Reset progress", value: "RESET…", kind: "cycle" },
    ]);
    const armed = general({ stage: "armed", confirmable: false, failure: null });
    expect(armed?.map((row) => row.key)).toEqual(["resetNote", "resetProgress", "resetCancel"]);
    // Pressing ERASE does nothing until the delay after arming has passed, and the row says so by being off.
    expect(armed?.[1]).toMatchObject({ value: "ERASE", enabled: false });
    expect(general({ stage: "armed", confirmable: true, failure: null })?.[1]).toMatchObject({ enabled: true });
    expect(armed?.[0]?.label).toContain("Leaderboard entries and replays stay");
    expect(general({ stage: "working", confirmable: false, failure: null })).toEqual([
      { key: "resetProgress", label: "Erasing all progress…", value: "", kind: "info" },
    ]);
  });

  it("says why an erase changed nothing, above the button to try again", () => {
    const rows = (failure: "online-failed" | "device-failed") =>
      buildSettingsSections("general", settings, {
        ...environment,
        progressReset: { stage: "idle", confirmable: false, failure },
      })[0]?.rows.filter((row) => row.key.startsWith("reset"));
    expect(rows("online-failed")?.map((row) => row.key)).toEqual(["resetNote", "resetProgress"]);
    expect(rows("online-failed")?.[0]?.label).toBe("Could not reach your online save. Nothing was erased.");
    expect(rows("device-failed")?.[0]?.label).toBe("This device would not save the erase. Try again.");
  });

  it("never offers the erase on another tab", () => {
    for (const tab of ["controls", "audio", "video", "accessibility", "credits"])
      expect(
        buildSettingsSections(tab, settings, environment)
          .flatMap((section) => section.rows)
          .some((row) => row.key.startsWith("reset")),
      ).toBe(false);
  });

  it("lists the credits tab from the build's credits: a row that opens a shipped licence, and plain rows", () => {
    expect(buildSettingsSections("credits", settings, environment)).toEqual([
      {
        label: "FONTS",
        rows: [
          {
            key: "licence:plex",
            label: "IBM Plex Mono",
            value: "LICENCE",
            kind: "cycle",
            note: "text · © 2017 IBM Corp. · SIL OFL 1.1",
          },
          { key: "credit:vite", label: "Vite", value: "", kind: "info", note: "builds the game · MIT License" },
        ],
      },
    ]);
    // The other tabs never carry credit rows.
    for (const tab of ["general", "controls", "audio", "video", "accessibility"])
      expect(
        buildSettingsSections(tab, settings, environment)
          .flatMap((section) => section.rows)
          .some((row) => row.key.startsWith("credit") || row.key.startsWith("licence")),
      ).toBe(false);
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
