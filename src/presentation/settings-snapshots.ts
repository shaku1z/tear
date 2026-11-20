import type { SettingRowView, SettingsScreenView } from "./screens/contracts";
import { normalizeMusicSettingsTab } from "../audio/music/settings";
import {
  keyCodeLabel,
  keyboardBindings,
  keyboardLabel,
  type KeyboardAction,
  type KeyboardContext,
} from "../domain/keyboard-bindings";
import { REBINDABLE_ACTIONS, type RebindOutcome, type RebindableAction } from "../domain/keyboard-remap";

/** The Controls tab's keyboard rows, one per rebindable action. */
export const REBIND_ROW_LABELS: Readonly<Record<RebindableAction, string>> = Object.freeze({
  "move-left": "Move left",
  "move-right": "Move right",
  "move-up": "Up / aim dash up",
  "move-down": "Down / drop",
  jump: "Jump",
  dash: "Dash",
  throw: "Throw / recall",
  tether: "Tether",
});

/** The settings row key of an action's keyboard row. */
export const rebindRowKey = (action: RebindableAction): string => `rebind:${action}`;

const actionName = (action: KeyboardAction): string =>
  (REBIND_ROW_LABELS as Readonly<Record<string, string>>)[action] ?? action.replaceAll("-", " ");

/**
 * Places whose keys stay reserved for them, by binding context. A refused key bound in one
 * of these contexts is named by its place ("T is used by the Playground"), read from the
 * binding table the place itself reads.
 */
const RESERVED_BY: Readonly<Partial<Record<KeyboardContext, string>>> = Object.freeze({
  playground: "the Playground",
  tutorial: "the Tutorial",
  engineering: "engineering tools",
});

/** What the keyboard row says after a rebind: nothing when the key simply took. */
export function rebindNote(action: RebindableAction, outcome: RebindOutcome, code: string): string | null {
  const key = keyCodeLabel(code);
  if (outcome.kind === "swapped") return `Swapped: ${actionName(outcome.with)} now uses the old key.`;
  if (outcome.kind !== "refused") return null;
  if (outcome.by === action) return `${key} can't be bound. Pick another key.`;
  const place = RESERVED_BY[keyboardBindings()[outcome.by].context];
  if (place !== undefined)
    return `${key} is used by ${place} (${actionName(outcome.by).toLowerCase()}). Pick another key.`;
  return `${key} already means ${actionName(outcome.by).toLowerCase()}. Pick another key.`;
}

/** The keyboard rows' live state: the row waiting for a key, and the last rebind's note. */
export interface KeyboardRowsState {
  readonly listening: RebindableAction | null;
  readonly note: Readonly<{ row: string; text: string }> | null;
}

export interface ControllerPresetView {
  readonly name: string;
  readonly tag: string;
  readonly line: string;
  readonly map: string;
}
export interface SettingsSnapshotSource {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly interfaceVolume: number;
  readonly masterMuted: boolean;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  readonly interfaceMuted: boolean;
  readonly gfx: string;
  readonly flash?: number;
  readonly cinematics?: string;
  readonly reducedMotion?: boolean;
  readonly highContrast?: boolean;
  readonly padPreset: string;
  readonly tetherMode: string;
  readonly dashDoubleTap?: boolean;
  readonly padDeadL?: number;
  readonly padDeadR?: number;
  readonly padAimSens?: number;
  readonly vibration?: string;
  readonly glyphStyle?: string;
  readonly sens: number;
  readonly controls: string;
  readonly touchAim?: string;
  readonly autoPauseDisconnect?: boolean;
  readonly shareStatistics?: boolean;
  readonly shake: number;
}
/** What the General tab says about the player's data, as the build's privacy stance resolves it. */
export interface SettingsPrivacyView {
  readonly privacyLink: boolean;
  readonly termsLink: boolean;
  /** A line shown in place of links (a build that keeps everything in the browser); null for none. */
  readonly note: string | null;
  /** Show the switch for anonymous run statistics. */
  readonly statistics: boolean;
}
/** The Credits tab's content as the build resolves it: the works it contains, grouped. */
export interface SettingsCreditGroup {
  readonly label: string;
  readonly entries: readonly Readonly<{
    id: string;
    name: string;
    /** What it is used for, its copyright line and its licence, as one line. */
    note: string;
    /** The licence text ships with the game and opens from the row. */
    hasLicenceText: boolean;
  }>[];
}
/** The tab id of the read-only Credits list: nothing on it is a setting to reset. */
export const CREDITS_TAB = "credits";
/** A credit row opens its licence text through this key prefix. */
export const LICENCE_KEY_PREFIX = "licence:";
export interface SettingsEnvironmentSnapshot {
  readonly lowGraphics: boolean;
  readonly touch: boolean;
  readonly installAvailable: boolean;
  readonly update: Readonly<{ ready: boolean; applying: boolean }>;
  readonly privacy: SettingsPrivacyView;
  readonly credits: readonly SettingsCreditGroup[];
  /** The running build as the player reads it (version and short revision). */
  readonly buildLabel: string;
  readonly presets: Readonly<Record<string, ControllerPresetView>>;
  readonly controllerGlyphs?: readonly string[];
  /** Desktop only: the keyboard rows' state. Absent, the Controls tab has no keyboard section. */
  readonly keyboard?: KeyboardRowsState;
}
export type SettingsSections = SettingsScreenView["sections"];
const percent = (value: number): string => String(Math.round(value * 100)) + "%";
function keyboardRows(state: KeyboardRowsState): SettingRowView[] {
  const note = (row: string): { note?: string } => (state.note?.row === row ? { note: state.note.text } : {});
  const rows: SettingRowView[] = REBINDABLE_ACTIONS.map((action) => ({
    key: rebindRowKey(action),
    label: REBIND_ROW_LABELS[action],
    value: state.listening === action ? "PRESS A KEY" : keyboardLabel(action),
    kind: "cycle",
    ...(state.listening === action ? { note: "Press the new key. Esc cancels." } : note(rebindRowKey(action))),
  }));
  rows.push({ key: "resetKeys", label: "Reset keys", value: "DEFAULTS", kind: "cycle", ...note("resetKeys") });
  return rows;
}

export function buildSettingsSections(
  tab: string,
  settings: SettingsSnapshotSource,
  environment: SettingsEnvironmentSnapshot,
): SettingsSections {
  const normalizedTab = normalizeMusicSettingsTab(tab);
  if (normalizedTab === CREDITS_TAB)
    return environment.credits.map((group) => ({
      label: group.label,
      rows: group.entries.map((entry): SettingRowView =>
        entry.hasLicenceText
          ? { key: LICENCE_KEY_PREFIX + entry.id, label: entry.name, value: "LICENCE", kind: "cycle", note: entry.note }
          : { key: "credit:" + entry.id, label: entry.name, value: "", kind: "info", note: entry.note },
      ),
    }));
  if (normalizedTab === "audio")
    return [
      {
        label: "AUDIO MIX",
        rows: [
          // One row per channel: the volume stepper carries its own mute switch.
          {
            key: "masterVolume",
            label: "Master volume",
            value: percent(settings.masterVolume),
            kind: "stepper",
            muteKey: "masterMuted",
            muted: settings.masterMuted,
          },
          {
            key: "musicVolume",
            label: "Music volume",
            value: percent(settings.musicVolume),
            kind: "stepper",
            muteKey: "musicMuted",
            muted: settings.musicMuted,
          },
          {
            key: "sfxVolume",
            label: "Sound effects volume",
            value: percent(settings.sfxVolume),
            kind: "stepper",
            muteKey: "sfxMuted",
            muted: settings.sfxMuted,
          },
          {
            key: "interfaceVolume",
            label: "Interface volume",
            value: percent(settings.interfaceVolume),
            kind: "stepper",
            muteKey: "interfaceMuted",
            muted: settings.interfaceMuted,
          },
        ],
      },
    ];
  if (tab === "video")
    return [
      {
        label: "VIDEO",
        rows: [
          {
            key: "gfx",
            label: "Effects",
            value:
              settings.gfx === "auto"
                ? "AUTO (" + (environment.lowGraphics ? "LOW" : "HIGH") + ")"
                : settings.gfx.toUpperCase(),
            kind: "cycle",
          },
        ],
      },
    ];
  if (tab === "accessibility")
    return [
      {
        label: "ACCESSIBILITY",
        rows: [
          { key: "flash", label: "Flash intensity", value: percent(settings.flash ?? 1), kind: "stepper" },
          {
            key: "cinematics",
            label: "Story scenes",
            value: (settings.cinematics ?? "full").toUpperCase(),
            kind: "cycle",
          },
          {
            key: "reducedMotion",
            label: "Reduced camera motion",
            value: "",
            kind: "toggle",
            on: settings.reducedMotion === true,
          },
          {
            key: "highContrast",
            label: "High-contrast tells",
            value: "",
            kind: "toggle",
            on: settings.highContrast === true,
            note: "COMBAT TIMING IS UNCHANGED",
          },
        ],
      },
    ];
  if (tab === "controls") {
    const preset = environment.presets[settings.padPreset] ?? environment.presets.default;
    if (preset === undefined) throw new TypeError("default controller preset is required");
    const rows: SettingRowView[] = [
      {
        key: "padPreset",
        label: "Controller preset",
        value: preset.name + (preset.tag ? "   " + preset.tag : ""),
        kind: "cycle",
        note: preset.line + "  ·  " + preset.map,
      },
      {
        key: "tetherMode",
        label: "Tether behavior",
        value: settings.tetherMode === "toggle" ? "TOGGLE" : "HOLD",
        kind: "cycle",
      },
      {
        key: "dashDoubleTap",
        label: "Directional double-tap dash",
        value: "",
        kind: "toggle",
        on: settings.dashDoubleTap === true,
      },
      { key: "padDeadL", label: "Left-stick deadzone", value: percent(settings.padDeadL ?? 0.22), kind: "stepper" },
      { key: "padDeadR", label: "Right-stick deadzone", value: percent(settings.padDeadR ?? 0.22), kind: "stepper" },
      {
        key: "padAimSens",
        label: "Controller aim sensitivity",
        value: percent(settings.padAimSens ?? 1),
        kind: "stepper",
      },
      { key: "vibration", label: "Vibration", value: (settings.vibration ?? "medium").toUpperCase(), kind: "cycle" },
      {
        key: "glyphStyle",
        label: "Controller glyphs",
        value:
          (settings.glyphStyle ?? "auto").toUpperCase() +
          (environment.controllerGlyphs?.length ? "   " + environment.controllerGlyphs.join("  ") : ""),
        kind: "cycle",
      },
      { key: "sens", label: "Blade / mouse sensitivity", value: settings.sens.toFixed(2), kind: "stepper" },
    ];
    // Touch or desktop controls is a choice only where the build has touch (mobile is paused).
    if (__TEAR_MOBILE__)
      rows.push({
        key: "controls",
        label: "Control mode",
        value:
          settings.controls === "auto"
            ? "AUTO (" + (environment.touch ? "TOUCH" : "DESKTOP") + ")"
            : settings.controls.toUpperCase(),
        kind: "cycle",
      });
    if (environment.touch)
      rows.push({
        key: "touchAim",
        label: "Touch aim",
        value: (settings.touchAim ?? "stick") === "stick" ? "STICK (RADIAL)" : "DRAG (RELATIVE)",
        kind: "cycle",
      });
    rows.push({ key: "guide", label: "Full controls", value: "VIEW GUIDE  ›", kind: "cycle" });
    const keyboard = environment.touch ? undefined : environment.keyboard;
    return keyboard === undefined
      ? [{ label: "CONTROLS", rows }]
      : [
          { label: "CONTROLS", rows },
          { label: "KEYBOARD", rows: keyboardRows(keyboard) },
        ];
  }
  const rows: SettingRowView[] = [
    {
      key: "autoPauseDisconnect",
      label: "Auto-pause on controller disconnect",
      value: "",
      kind: "toggle",
      on: settings.autoPauseDisconnect !== false,
    },
    { key: "shake", label: "Screen shake", value: percent(settings.shake), kind: "stepper" },
  ];
  const { privacy } = environment;
  if (privacy.statistics)
    rows.push({
      key: "shareStatistics",
      label: "Share anonymous run statistics",
      value: "",
      kind: "toggle",
      on: settings.shareStatistics !== false,
      note: "No name or account is attached. Off sends nothing.",
    });
  if (privacy.termsLink) rows.push({ key: "terms", label: "Terms of Service", value: "OPEN", kind: "cycle" });
  if (privacy.privacyLink) rows.push({ key: "privacy", label: "Privacy Policy", value: "OPEN", kind: "cycle" });
  if (privacy.note !== null) rows.push({ key: "privacyNote", label: privacy.note, value: "", kind: "info" });
  if (environment.installAvailable)
    rows.push({ key: "install", label: "Install browser app", value: "INSTALL", kind: "cycle" });
  if (environment.update.ready)
    rows.push({
      key: "update",
      label: "Game update",
      value: environment.update.applying ? "UPDATING…" : "APPLY UPDATE",
      kind: "cycle",
      enabled: !environment.update.applying,
    });
  // Last, so it reads as the footer of the list: what a player quotes when they report a problem.
  rows.push({ key: "version", label: "Version", value: environment.buildLabel, kind: "info" });
  return [{ label: "GENERAL", rows }];
}
