import { describe, expect, it, vi } from "vitest";

import type { LegacyAudioCompatibility } from "../../src/audio/legacy-live-audio";
import { SettingsController } from "../../src/app/settings-controller";

function fixture(serialized: string | null = null) {
  const values = new Map<string, string>();
  if (serialized !== null) values.set("tear_settings", serialized);
  const config = {
    blade: { aimSensitivity: 0.9 },
    pad: { deadL: 0, deadR: 0, aimSens: 0, tetherMode: "hold" as const, doubleTapDash: false, vibration: "medium" as const, glyphStyle: "auto" as const },
  };
  const audio = {
    migrateSettings: vi.fn((settings: Record<string, unknown>) => settings),
    applySettings: vi.fn(),
  } as unknown as LegacyAudioCompatibility;
  const dependencies = {
    config,
    accessibility: { flashScale: 1, motionScale: 1, reducedMotion: false, highContrast: false },
    graphics: { low: false },
    input: { forceMode: "auto", touchAimMode: "stick" },
    gamepad: { setPreset: vi.fn((value: string) => value === "known" ? value : "default") },
    audio,
    store: { get: (key: string) => values.get(key) ?? null, set: (key: string, value: string) => values.set(key, value) },
    navigator: { hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false }),
  };
  return { audio, config, dependencies, values };
}

describe("SettingsController", () => {
  it("migrates legacy settings and preserves a stable settings object across reloads", () => {
    const test = fixture(JSON.stringify({ vol: 0.25, music: false, padPreset: "known" }));
    const controller = new SettingsController(test.dependencies);
    const identity = controller.settings;
    test.values.set("tear_settings", JSON.stringify({ shake: 0.4, reducedMotion: true }));
    controller.reload();

    expect(controller.settings).toBe(identity);
    expect(controller.settings.shake).toBe(0.4);
    expect(controller.shakeScale).toBeCloseTo(0.072);
  });

  it("sanitizes controller tuning and applies automatic low-end quality", () => {
    const test = fixture(JSON.stringify({ padDeadL: 0, padDeadR: 2, padAimSens: 4, gfx: "auto", vibration: "invalid", glyphStyle: "invalid" }));
    test.dependencies.navigator.hardwareConcurrency = 4;
    const controller = new SettingsController(test.dependencies);

    expect(test.config.pad.deadL).toBe(0.1);
    expect(test.config.pad.deadR).toBe(0.4);
    expect(test.config.pad.aimSens).toBe(2);
    expect(test.config.pad.vibration).toBe("medium");
    expect(test.config.pad.glyphStyle).toBe("auto");
    expect(test.dependencies.graphics.low).toBe(true);
    expect(controller.settings.padPreset).toBe("default");
  });

  it("recovers from malformed storage and persists the current record", () => {
    const test = fixture("not json");
    const controller = new SettingsController(test.dependencies);
    controller.settings.musicVolume = 0.33;
    controller.save();

    expect(JSON.parse(test.values.get("tear_settings") ?? "{}")).toMatchObject({ musicVolume: 0.33 });
  });

  it("applies and round-trips mouse sensitivity and every cinematic preference", () => {
    const test = fixture(JSON.stringify({ sens: 1.65, cinematics: "off" }));
    const controller = new SettingsController(test.dependencies);

    expect(test.config.blade.aimSensitivity).toBe(1.65);
    expect(controller.settings.cinematics).toBe("off");
    controller.save();

    const reloaded = new SettingsController(test.dependencies);
    expect(reloaded.settings.sens).toBe(1.65);
    expect(reloaded.settings.cinematics).toBe("off");

    for (const preference of ["full", "brief", "off"] as const) {
      reloaded.settings.cinematics = preference;
      reloaded.save();
      reloaded.reload();
      expect(reloaded.settings.cinematics).toBe(preference);
    }
  });

  it("repairs unsupported cinematic values to full", () => {
    const test = fixture(JSON.stringify({ cinematics: "director-cut" }));
    const controller = new SettingsController(test.dependencies);
    expect(controller.settings.cinematics).toBe("full");
  });
});
