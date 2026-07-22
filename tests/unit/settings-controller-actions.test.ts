import { describe, expect, it, vi } from "vitest";
import { SettingsController } from "../../src/app/settings-controller";

function controller(): SettingsController {
  return new SettingsController({ config: { blade: { aimSensitivity: 1 }, pad: { deadL: 0, deadR: 0, aimSens: 0,
    tetherMode: "hold", doubleTapDash: false, vibration: "medium", glyphStyle: "auto" } },
    accessibility: { flashScale: 1, motionScale: 1, reducedMotion: false, highContrast: false }, graphics: { low: false },
    input: { forceMode: "auto", touchAimMode: "stick" }, gamepad: { setPreset: (value: string) => value },
    audio: { migrateSettings: (value: Record<string, unknown>) => value,
      applySettings: () => undefined },
    store: { get: () => null, set: vi.fn() }, navigator: { hardwareConcurrency: 8 }, matchMedia: () => ({ matches: false }) });
}
describe("settings UI actions", () => {
  it("steps, toggles and cycles through the authoritative controller", () => {
    const subject = controller();
    expect(subject.step("masterVolume", -1)).toBe(true); expect(subject.settings.masterVolume).toBe(0.5);
    expect(subject.toggle("musicMuted")).toBe(true); expect(subject.settings.musicMuted).toBe(true);
    expect(subject.cycle("cinematics", ["full", "brief", "off"])).toBe(true); expect(subject.settings.cinematics).toBe("brief");
  });
});
