import type { LegacyAudioCompatibility } from "../../audio/legacy-live-audio";
import { setMusicMode } from "../../audio/music-mode";
import { musicSourceValue, parseMusicSource, setMusicSource } from "../../audio/music/music-source";
import { sanitizeCinematicPreference, type CinematicPreference } from "../../gameplay/campaign/cinematic-preference";
import { applyKeyboardRemap, rebindKey, type RebindOutcome, type RebindableAction } from "../../domain/keyboard-remap";
import { keyboardSettings, readKeyboardSettings, type KeyboardSettingsRead } from "../../persistence/keyboard-settings";
import { asRecord } from "../../domain/records";
import type { StatisticsChoice } from "../../platform/statistics-consent";

export type { CinematicPreference } from "../../gameplay/campaign/cinematic-preference";

export type GraphicsPreference = "auto" | "high" | "low";
export type ControlPreference = "auto" | "desktop" | "touch";
export type TouchAimPreference = "stick" | "drag";
export type TetherPreference = "hold" | "toggle";
export type VibrationPreference = "off" | "low" | "medium" | "high";
export type GlyphPreference = "auto" | "playstation" | "xbox" | "generic";
/**
 * How the recorded soundtrack reacts to play.
 * `adaptive` — layers arrive/leave with fight intensity (default).
 * `full`     — every stem always plays at full arrangement.
 * `calm`     — stay in the relaxed arrangement; never escalate.
 * `dynamic`  — adaptive with a wider swing (quieter lulls, bigger peaks).
 */
export type MusicModePreference = "adaptive" | "full" | "calm" | "dynamic";

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
  /** Anonymous run statistics: on until the player turns them off (the first-run notice says so). */
  shareStatistics: boolean;
  musicMode: MusicModePreference;
  /**
   * Music: the player's pick, in menus and in runs: `default`, a song's id, or `channel:<id>`
   * (see `music-source.ts`). The key keeps its old name so existing saves carry over.
   */
  menuMusic: string;
  /** The keyboard remap, versioned (`persistence/keyboard-settings.ts`). */
  keyboard: KeyboardSettingsRead["stored"];
}

/** Settings a past build saved and this one no longer has; dropped on load, so the next save omits them. */
const RETIRED_SETTINGS = ["station"] as const;

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
  /** Where the statistics choice is published for the cloud's send gate. */
  statistics: StatisticsChoice;
  store: SettingsStore;
  navigator: Pick<Navigator, "hardwareConcurrency">;
  matchMedia(query: string): Pick<MediaQueryList, "matches">;
}

const vibrationValues: readonly VibrationPreference[] = ["off", "low", "medium", "high"];
const musicModeValues: readonly MusicModePreference[] = ["adaptive", "full", "calm", "dynamic"];
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
    shareStatistics: true,
    musicMode: "adaptive",
    menuMusic: "default",
    keyboard: keyboardSettings(),
  };
}

function parseStoredSettings(serialized: string | null): Record<string, unknown> {
  if (serialized === null) return {};
  try {
    const parsed: unknown = JSON.parse(serialized);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

/**
 * The stored values that can be trusted: a setting keeps its stored value only when it has the type of its default
 * (and, for a number, is finite). A value of another type is dropped, so the default stands. Names without a default
 * (the audio record, values a newer build wrote) pass through unchanged.
 */
function typedLikeDefaults(defaultValues: GameSettings, stored: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(stored)) {
    const sameType = !Object.hasOwn(defaultValues, name) || typeof value === typeof defaultValues[name];
    if (sameType && (typeof value !== "number" || Number.isFinite(value))) kept[name] = value;
  }
  return kept;
}

export class SettingsController {
  readonly settings: GameSettings;
  readonly api = Object.freeze({
    apply: (): void => {
      this.apply();
    },
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
    const defaultValues = defaults(this.dependencies.config.blade.aimSensitivity);
    const merged = Object.assign(defaultValues, typedLikeDefaults(defaultValues, stored));
    const migrated = this.dependencies.audio.migrateSettings(merged, stored);
    for (const key of RETIRED_SETTINGS) Reflect.deleteProperty(migrated, key);
    for (const key of Object.keys(this.settings)) {
      if (!Object.hasOwn(migrated, key)) Reflect.deleteProperty(this.settings, key);
    }
    Object.assign(this.settings, migrated);
    this.apply();
  }

  apply(): void {
    const { accessibility, config, gamepad, graphics, input, navigator, audio } = this.dependencies;
    const settings = this.settings;
    const sensitivity =
      typeof settings.sens === "number" && Number.isFinite(settings.sens) ? settings.sens : this.#defaultAimSensitivity;
    settings.sens = clamp(sensitivity, 0.2, 3);
    config.blade.aimSensitivity = settings.sens;
    accessibility.flashScale = clamp(settings.flash, 0, 1);
    accessibility.reducedMotion = settings.reducedMotion;
    accessibility.motionScale = settings.reducedMotion ? 0.18 : 1;
    accessibility.highContrast = settings.highContrast;
    this.#shakeScale = settings.shake * accessibility.motionScale;
    const lowEnd =
      (navigator.hardwareConcurrency || 8) <= 4 || this.dependencies.matchMedia("(pointer: coarse)").matches;
    graphics.low = settings.gfx === "low" || (settings.gfx === "auto" && lowEnd);
    input.forceMode = settings.controls;
    input.touchAimMode = settings.touchAim;
    settings.cinematics = sanitizeCinematicPreference(settings.cinematics);
    settings.padPreset = gamepad.setPreset(settings.padPreset);
    config.pad.deadL = clamp(settings.padDeadL, 0.1, 0.4);
    config.pad.deadR = clamp(settings.padDeadR, 0.08, 0.4);
    config.pad.aimSens = clamp(settings.padAimSens, 0.5, 2);
    config.pad.tetherMode = settings.tetherMode === "toggle" ? "toggle" : "hold";
    config.pad.doubleTapDash = settings.dashDoubleTap;
    config.pad.vibration = vibrationValues.includes(settings.vibration) ? settings.vibration : "medium";
    config.pad.glyphStyle = glyphValues.includes(settings.glyphStyle) ? settings.glyphStyle : "auto";
    settings.musicMode = musicModeValues.includes(settings.musicMode) ? settings.musicMode : "adaptive";
    setMusicMode(settings.musicMode);
    // A value that is not a pick at all reads as the default; one this build does not know (a song
    // or channel from a later catalog) is kept and plays as the default until it can be heard.
    settings.menuMusic = musicSourceValue(parseMusicSource(settings.menuMusic));
    setMusicSource(settings.menuMusic);
    this.dependencies.statistics.share = settings.shareStatistics;
    const keyboard = readKeyboardSettings(settings.keyboard);
    settings.keyboard = keyboard.stored;
    applyKeyboardRemap(keyboard.remap);
    audio.applySettings(settings);
  }

  save(): void {
    Object.assign(this.settings, this.dependencies.audio.migrateSettings(this.settings));
    this.dependencies.store.set("tear_settings", JSON.stringify(this.settings));
  }

  trySave(): boolean {
    try {
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    // A privacy choice is not a preference to put back: resetting the game's settings never turns statistics on again.
    const { shareStatistics } = this.settings;
    for (const key of Object.keys(this.settings)) Reflect.deleteProperty(this.settings, key);
    Object.assign(this.settings, defaults(this.#defaultAimSensitivity), { shareStatistics });
    this.apply();
    this.save();
  }

  /** Makes `code` the action's key (see `rebindKey`); a refused key leaves the bindings as they were. */
  rebindKey(action: RebindableAction, code: string): RebindOutcome {
    const outcome = rebindKey(readKeyboardSettings(this.settings.keyboard).remap, action, code);
    if (outcome.kind === "assigned" || outcome.kind === "swapped") {
      this.settings.keyboard = keyboardSettings(outcome.remap);
      this.apply();
      this.save();
    }
    return outcome;
  }

  /** Every key back to its default; the other settings stay. */
  resetKeys(): void {
    this.settings.keyboard = keyboardSettings();
    this.apply();
    this.save();
  }

  step(key: string, direction: number): boolean {
    const steps: Readonly<Record<string, number>> = {
      masterVolume: 0.1,
      musicVolume: 0.1,
      sfxVolume: 0.1,
      interfaceVolume: 0.1,
      padDeadL: 0.02,
      padDeadR: 0.02,
      padAimSens: 0.1,
      sens: 0.1,
      flash: 0.25,
      shake: 0.25,
    };
    const limits: Readonly<Record<string, readonly [number, number]>> = {
      masterVolume: [0, 1],
      musicVolume: [0, 1],
      sfxVolume: [0, 1],
      interfaceVolume: [0, 1],
      padDeadL: [0.1, 0.4],
      padDeadR: [0.08, 0.4],
      padAimSens: [0.5, 2],
      sens: [0.2, 3],
      flash: [0, 1],
      shake: [0, 2],
    };
    const step = steps[key],
      range = limits[key];
    if (step === undefined || range === undefined) return false;
    const current = this.settings[key];
    const numeric = typeof current === "number" ? current : 1;
    this.settings[key] = clamp(Number((numeric + step * direction).toFixed(2)), range[0], range[1]);
    this.apply();
    this.save();
    return true;
  }

  toggle(key: string): boolean {
    const current = this.settings[key];
    if (typeof current !== "boolean") return false;
    this.settings[key] = !current;
    this.apply();
    this.save();
    return true;
  }

  /** Sets a choice setting to one of its values; a value not offered is ignored. */
  choose(key: string, value: string, values: readonly string[]): boolean {
    if (!values.includes(value)) return false;
    this.settings[key] = value;
    this.apply();
    this.save();
    return true;
  }

  cycle(key: string, values: readonly string[]): boolean {
    if (values.length === 0) return false;
    const current = this.settings[key];
    const index = Math.max(0, values.indexOf(typeof current === "string" ? current : ""));
    this.settings[key] = values[(index + 1) % values.length] ?? values[0];
    this.apply();
    this.save();
    return true;
  }
}
