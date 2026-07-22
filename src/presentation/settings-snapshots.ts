import type { SettingRowView, SettingsScreenView } from "./screens/contracts";

export interface ControllerPresetView { readonly name: string; readonly tag: string; readonly line: string; readonly map: string }
export interface SettingsSnapshotSource {
  readonly masterVolume: number; readonly musicVolume: number; readonly sfxVolume: number; readonly interfaceVolume: number;
  readonly masterMuted: boolean; readonly musicMuted: boolean; readonly sfxMuted: boolean; readonly interfaceMuted: boolean;
  readonly gfx: string; readonly flash?: number; readonly cinematics?: string; readonly reducedMotion?: boolean; readonly highContrast?: boolean;
  readonly padPreset: string; readonly tetherMode: string; readonly dashDoubleTap?: boolean; readonly padDeadL?: number; readonly padDeadR?: number;
  readonly padAimSens?: number; readonly vibration?: string; readonly glyphStyle?: string; readonly sens: number;
  readonly controls: string; readonly touchAim?: string; readonly autoPauseDisconnect?: boolean; readonly shake: number;
}
export interface SettingsEnvironmentSnapshot {
  readonly lowGraphics: boolean; readonly touch: boolean; readonly installAvailable: boolean;
  readonly update: Readonly<{ ready: boolean; applying: boolean }>;
  readonly presets: Readonly<Record<string, ControllerPresetView>>;
}
export type SettingsSections = SettingsScreenView["sections"];
const percent = (value: number): string => String(Math.round(value * 100)) + "%";

export function buildSettingsSections(tab: string, settings: SettingsSnapshotSource, environment: SettingsEnvironmentSnapshot): SettingsSections {
  if (tab === "audio") return [{ label: "AUDIO MIX", rows: [
    { key: "masterVolume", label: "Master volume", value: percent(settings.masterVolume), kind: "stepper" },
    { key: "musicVolume", label: "Music volume", value: percent(settings.musicVolume), kind: "stepper" },
    { key: "sfxVolume", label: "Sound effects volume", value: percent(settings.sfxVolume), kind: "stepper" },
    { key: "interfaceVolume", label: "Interface volume", value: percent(settings.interfaceVolume), kind: "stepper" },
    { key: "masterMuted", label: "Master audio", value: "", kind: "toggle", on: !settings.masterMuted },
    { key: "musicMuted", label: "Music", value: "", kind: "toggle", on: !settings.musicMuted },
    { key: "sfxMuted", label: "Sound effects", value: "", kind: "toggle", on: !settings.sfxMuted },
    { key: "interfaceMuted", label: "Interface sounds", value: "", kind: "toggle", on: !settings.interfaceMuted },
  ] }];
  if (tab === "video") return [{ label: "VIDEO", rows: [
    { key: "gfx", label: "Effects", value: settings.gfx === "auto" ? "AUTO (" + (environment.lowGraphics ? "LOW" : "HIGH") + ")" : settings.gfx.toUpperCase(), kind: "cycle" },
  ] }];
  if (tab === "accessibility") return [{ label: "ACCESSIBILITY", rows: [
    { key: "flash", label: "Flash intensity", value: percent(settings.flash ?? 1), kind: "stepper" },
    { key: "cinematics", label: "Story scenes", value: (settings.cinematics ?? "full").toUpperCase(), kind: "cycle" },
    { key: "reducedMotion", label: "Reduced camera motion", value: "", kind: "toggle", on: settings.reducedMotion === true },
    { key: "highContrast", label: "High-contrast tells", value: "", kind: "toggle", on: settings.highContrast === true, note: "COMBAT TIMING IS UNCHANGED" },
  ] }];
  if (tab === "controls") {
    const preset = environment.presets[settings.padPreset] ?? environment.presets.default;
    if (preset === undefined) throw new TypeError("default controller preset is required");
    const rows: SettingRowView[] = [
      { key: "padPreset", label: "Controller preset", value: preset.name + (preset.tag ? "   " + preset.tag : ""), kind: "cycle", note: preset.line + "  ·  " + preset.map },
      { key: "tetherMode", label: "Tether behavior", value: settings.tetherMode === "toggle" ? "TOGGLE" : "HOLD", kind: "cycle" },
      { key: "dashDoubleTap", label: "Directional double-tap dash", value: "", kind: "toggle", on: settings.dashDoubleTap === true },
      { key: "padDeadL", label: "Left-stick deadzone", value: percent(settings.padDeadL ?? 0.22), kind: "stepper" },
      { key: "padDeadR", label: "Right-stick deadzone", value: percent(settings.padDeadR ?? 0.22), kind: "stepper" },
      { key: "padAimSens", label: "Controller aim sensitivity", value: percent(settings.padAimSens ?? 1), kind: "stepper" },
      { key: "vibration", label: "Vibration", value: (settings.vibration ?? "medium").toUpperCase(), kind: "cycle" },
      { key: "glyphStyle", label: "Controller glyphs", value: (settings.glyphStyle ?? "auto").toUpperCase(), kind: "cycle" },
      { key: "sens", label: "Blade / mouse sensitivity", value: settings.sens.toFixed(2), kind: "stepper" },
      { key: "controls", label: "Control mode", value: settings.controls === "auto" ? "AUTO (" + (environment.touch ? "TOUCH" : "DESKTOP") + ")" : settings.controls.toUpperCase(), kind: "cycle" },
    ];
    if (environment.touch) rows.push({ key: "touchAim", label: "Touch aim", value: (settings.touchAim ?? "stick") === "stick" ? "STICK (RADIAL)" : "DRAG (RELATIVE)", kind: "cycle" });
    rows.push({ key: "guide", label: "Full controls", value: "VIEW GUIDE  ›", kind: "cycle" });
    return [{ label: "CONTROLS", rows }];
  }
  const rows: SettingRowView[] = [
    { key: "autoPauseDisconnect", label: "Auto-pause on controller disconnect", value: "", kind: "toggle", on: settings.autoPauseDisconnect !== false },
    { key: "shake", label: "Screen shake", value: percent(settings.shake), kind: "stepper" },
    { key: "terms", label: "Terms of Service", value: "OPEN", kind: "cycle" },
    { key: "privacy", label: "Privacy Policy", value: "OPEN", kind: "cycle" },
  ];
  if (environment.installAvailable) rows.push({ key: "install", label: "Install browser app", value: "INSTALL", kind: "cycle" });
  if (environment.update.ready) rows.push({ key: "update", label: "Game update", value: environment.update.applying ? "UPDATING…" : "APPLY UPDATE", kind: "cycle", enabled: !environment.update.applying });
  return [{ label: "GENERAL", rows }];
}
