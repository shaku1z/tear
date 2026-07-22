import type { LegacyAudioCompatibility } from "../audio/legacy-live-audio";
import { sanitizeCinematicPreference, type CinematicPreference } from "./cinematic-preference";

export type { CinematicPreference } from "./cinematic-preference";

export type GraphicsPreference = "auto" | "high" | "low";
export type ControlPreference = "auto" | "desktop" | "touch";
export type TouchAimPreference = "stick" | "drag";
export type TetherPreference = "hold" | "toggle";
export type VibrationPreference = "off" | "low" | "medium" | "high";
export type GlyphPreference = "auto" | "playstation" | "xbox" | "generic";

export interface GameSettings extends Record<string, unknown> {
  sens: number;
  shake: number;
  flash: number;
  reducedMotion: boolean;
  highContrast: boolean;
  vol: number;
  music: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  interfaceVolume: number;
  masterMuted: boolean;
  musicMuted: boolean;
  sfxMuted: boolean;
  interfaceMuted: boolean;
  gfx: GraphicsPreference;
  controls: ControlPreference;
  touchAim: TouchAimPreference;
  cinematics: CinematicPreference;
  padPreset: string;
  padDeadL: number;
  padDeadR: number;
  padAimSens: number;
  tetherMode: TetherPreference;
  dashDoubleTap: boolean;
  vibration: VibrationPreference;
  glyphStyle: GlyphPreference;
  autoPauseDisconnect: boolean;
}

interface SettingsConfig {
  blade: { aimSensitivity: number };
  pad: {
    deadL: number;
    deadR: number;
    aimSens: number;
    tetherMode: TetherPreference;
    doubleTapDash: boolean;
    vibration: VibrationPreference;
    glyphStyle: GlyphPreference;
  };
}

interface AccessibilityState {
  flashScale: number;
  motionScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
}

interface InputSettingsPort {
  forceMode: string;
  touchAimMode: string;
}

interface GamepadSettingsPort {
  setPreset(value: string): string;
}

interface SettingsStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SettingsControllerDependencies {
  config: SettingsConfig;
  accessibility: AccessibilityState;
  graphics: { low: boolean };
  input: InputSettingsPort;
  gamepad: GamepadSettingsPort;
  audio: Pick<LegacyAudioCompatibility, "migrateSettings" | "applySettings">;
  store: SettingsStore;
  navigator: Pick<Navigator, "hardwareConcurrency">;
  matchMedia(query: string): Pick<MediaQueryList, "matches">;
}

const vibrationValues: readonly VibrationPreference[] = ["off", "low", "medium", "high"];
const glyphValues: readonly GlyphPreference[] = ["auto", "playstation", "xbox", "generic"];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function defaults(aimSensitivity: number): GameSettings {
  return {
    sens: aimSensitivity,
    shake: 1,
    flash: 1,
    reducedMotion: false,
    highContrast: false,
    vol: 0.6,
    music: true,
    masterVolume: 0.6,
    musicVolume: 0.5,
    sfxVolume: 1,
    interfaceVolume: 1,
    masterMuted: false,
    musicMuted: false,
    sfxMuted: false,
    interfaceMuted: false,
    gfx: "auto",
    controls: "auto",
    touchAim: "stick",
    cinematics: "full",
    padPreset: "default",
    padDeadL: 0.22,
    padDeadR: 0.22,
    padAimSens: 1,
    tetherMode: "hold",
    dashDoubleTap: false,
    vibration: "medium",
    glyphStyle: "auto",
    autoPauseDisconnect: true,
  };
}

function parseStoredSettings(serialized: string | null): Record<string, unknown> {
  if (serialized === null) return {};
  try {
    const parsed: unknown = JSON.parse(serialized);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export class SettingsController {
  readonly settings: GameSettings;
  readonly api = Object.freeze({
    apply: (): void => { this.apply(); },
    save: (): boolean => this.trySave(),
  });
  #shakeScale = 1;
  readonly #defaultAimSensitivity: number;

  constructor(private readonly dependencies: SettingsControllerDependencies) {
    this.#defaultAimSensitivity = dependencies.config.blade.aimSensitivity;
    this.settings = defaults(dependencies.config.blade.aimSensitivity);
    this.reload();
  }

  get shakeScale(): number {
    return this.#shakeScale;
  }

  reload(): void {
    const stored = parseStoredSettings(this.dependencies.store.get("tear_settings"));
    const merged = Object.assign(defaults(this.dependencies.config.blade.aimSensitivity), stored);
    const migrated = this.dependencies.audio.migrateSettings(merged, stored);
    for (const key of Object.keys(this.settings)) {
      if (!Object.hasOwn(migrated, key)) Reflect.deleteProperty(this.settings, key);
    }
    Object.assign(this.settings, migrated);
    this.apply();
  }

  apply(): void {
    const { accessibility, config, gamepad, graphics, input, navigator, audio } = this.dependencies;
    const settings = this.settings;
    const sensitivity = typeof settings.sens === "number" && Number.isFinite(settings.sens)
      ? settings.sens : this.#defaultAimSensitivity;
    settings.sens = clamp(sensitivity, 0.2, 3);
    config.blade.aimSensitivity = settings.sens;
    accessibility.flashScale = clamp(settings.flash, 0, 1);
    accessibility.reducedMotion = settings.reducedMotion;
    accessibility.motionScale = settings.reducedMotion ? 0.18 : 1;
    accessibility.highContrast = settings.highContrast;
    this.#shakeScale = settings.shake * accessibility.motionScale;
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || this.dependencies.matchMedia("(pointer: coarse)").matches;
    graphics.low = settings.gfx === "low" || (settings.gfx === "auto" && lowEnd);
    input.forceMode = settings.controls;
    input.touchAimMode = settings.touchAim;
    settings.cinematics = sanitizeCinematicPreference(settings.cinematics);
    settings.padPreset = gamepad.setPreset(settings.padPreset);
    config.pad.deadL = clamp(settings.padDeadL, 0.10, 0.40);
    config.pad.deadR = clamp(settings.padDeadR, 0.08, 0.40);
    config.pad.aimSens = clamp(settings.padAimSens, 0.5, 2);
    config.pad.tetherMode = settings.tetherMode === "toggle" ? "toggle" : "hold";
    config.pad.doubleTapDash = settings.dashDoubleTap;
    config.pad.vibration = vibrationValues.includes(settings.vibration) ? settings.vibration : "medium";
    config.pad.glyphStyle = glyphValues.includes(settings.glyphStyle) ? settings.glyphStyle : "auto";
    audio.applySettings(settings);
  }

  save(): void {
    Object.assign(this.settings, this.dependencies.audio.migrateSettings(this.settings));
    this.dependencies.store.set("tear_settings", JSON.stringify(this.settings));
  }

  trySave(): boolean {
    try { this.save(); return true; } catch { return false; }
  }

  reset(): void {
    for (const key of Object.keys(this.settings)) Reflect.deleteProperty(this.settings, key);
    Object.assign(this.settings, defaults(this.#defaultAimSensitivity));
    this.apply();
    this.save();
  }

  step(key: string, direction: number): boolean {
    const steps: Readonly<Record<string, number>> = { masterVolume: 0.1, musicVolume: 0.1, sfxVolume: 0.1, interfaceVolume: 0.1,
      padDeadL: 0.02, padDeadR: 0.02, padAimSens: 0.1, sens: 0.1, flash: 0.25, shake: 0.25 };
    const limits: Readonly<Record<string, readonly [number, number]>> = { masterVolume: [0, 1], musicVolume: [0, 1], sfxVolume: [0, 1], interfaceVolume: [0, 1],
      padDeadL: [0.1, 0.4], padDeadR: [0.08, 0.4], padAimSens: [0.5, 2], sens: [0.2, 3], flash: [0, 1], shake: [0, 2] };
    const step = steps[key], range = limits[key];
    if (step === undefined || range === undefined) return false;
    const current = this.settings[key];
    const numeric = typeof current === "number" ? current : 1;
    this.settings[key] = clamp(Number((numeric + step * direction).toFixed(2)), range[0], range[1]);
    this.apply(); this.save();
    return true;
  }

  toggle(key: string): boolean {
    const current = this.settings[key];
    if (typeof current !== "boolean") return false;
    this.settings[key] = !current; this.apply(); this.save();
    return true;
  }

  cycle(key: string, values: readonly string[]): boolean {
    if (values.length === 0) return false;
    const current = this.settings[key];
    const index = Math.max(0, values.indexOf(typeof current === "string" ? current : ""));
    this.settings[key] = values[(index + 1) % values.length] ?? values[0];
    this.apply(); this.save();
    return true;
  }
}
