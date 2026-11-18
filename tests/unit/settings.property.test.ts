/**
 * The live settings controller, whatever the `tear_settings` slot holds:
 * - loading never throws;
 * - every setting keeps the type of its default, and every number the game is
 *   handed is finite;
 * - saving and loading again gives back the settings that were loaded.
 * The audio fields are migrated by the audio port; `migrateAudioSettings` has
 * its own property in `save-migrations.property.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { SettingsController, type SettingsControllerDependencies } from "../../src/app/screens/settings-controller";
import { anyStoredText, recordLike } from "./property-arbitraries";
import { checkProperty, fc } from "./property-harness";

const SLOT = "tear_settings";

function open(values: Map<string, string>) {
  const dependencies: SettingsControllerDependencies = {
    config: {
      blade: { aimSensitivity: 0.9 },
      pad: {
        deadL: 0.22,
        deadR: 0.22,
        aimSens: 1,
        tetherMode: "hold",
        doubleTapDash: false,
        vibration: "medium",
        glyphStyle: "auto",
      },
    },
    accessibility: { flashScale: 1, motionScale: 1, reducedMotion: false, highContrast: false },
    graphics: { low: false },
    input: { forceMode: "auto", touchAimMode: "stick" },
    // As the game's pad: a known preset is kept, anything else becomes the default.
    gamepad: { setPreset: (name) => (name === "southpaw" ? name : "default") },
    audio: { migrateSettings: (settings) => settings, applySettings: () => undefined },
    store: { get: (key) => values.get(key) ?? null, set: (key, value) => values.set(key, value) },
    navigator: { hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false }),
  };
  return { controller: new SettingsController(dependencies), dependencies };
}

function openController(values: Map<string, string>): SettingsController {
  return open(values).controller;
}

const SETTING_NAMES = Object.keys(openController(new Map()).settings);
const stored = fc.option(
  fc.oneof(
    anyStoredText,
    recordLike(SETTING_NAMES).map((value) => JSON.stringify(value)),
  ),
  {
    nil: undefined,
  },
);

/** A fresh storage map per run, so the controller never writes into the generated (reported) input. */
function fill(text: string | undefined): Map<string, string> {
  return new Map(text === undefined ? [] : [[SLOT, text]]);
}

describe("settings controller", () => {
  it("loads whatever storage holds without throwing", () => {
    checkProperty(
      fc.property(stored, (text) => {
        expect(typeof openController(fill(text)).settings).toBe("object");
      }),
    );
  });

  it("every setting keeps the type of its default, and every applied number is finite", () => {
    const defaults = openController(new Map()).settings;
    checkProperty(
      fc.property(stored, (text) => {
        const { controller, dependencies } = open(fill(text));
        for (const [name, value] of Object.entries(defaults)) {
          const loaded = controller.settings[name];
          expect(typeof loaded, name).toBe(typeof value);
          if (typeof loaded === "number") expect(Number.isFinite(loaded), name).toBe(true);
        }
        const applied = [
          ...Object.values(dependencies.config.pad),
          ...Object.values(dependencies.accessibility),
          dependencies.config.blade.aimSensitivity,
          controller.shakeScale,
        ];
        for (const value of applied) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        expect(typeof dependencies.config.pad.doubleTapDash).toBe("boolean");
        expect(typeof dependencies.accessibility.reducedMotion).toBe("boolean");
        expect(typeof dependencies.input.forceMode).toBe("string");
      }),
    );
  });

  it("saving then loading gives back the loaded settings", () => {
    checkProperty(
      fc.property(stored, (text) => {
        const values = fill(text);
        const first = openController(values);
        // Compared as stored text: JSON writes -0 as 0.
        const loaded = JSON.stringify(first.settings);
        first.save();
        expect(JSON.stringify(openController(values).settings)).toBe(loaded);
      }),
    );
  });
});
