/**
 * The saved keyboard remap, the `keyboard` field of the stored settings.
 *
 * Version 1 is `{ version: 1, primary: { jump: "KeyK", … } }`. A save from before
 * rebinding has no field and reads as the defaults. A version this build does not know
 * is kept as stored (so saving here does not erase a newer build's remap) and the
 * defaults stand. Every stored value is untrusted: see `sanitizeKeyboardRemap`.
 */
import { sanitizeKeyboardRemap, type KeyboardRemap } from "../domain/keyboard-remap";

export const KEYBOARD_SETTINGS_VERSION = 1;

export interface KeyboardSettingsV1 {
  readonly version: typeof KEYBOARD_SETTINGS_VERSION;
  readonly primary: KeyboardRemap;
}

export function keyboardSettings(primary: KeyboardRemap = {}): KeyboardSettingsV1 {
  return Object.freeze({ version: KEYBOARD_SETTINGS_VERSION, primary });
}

export interface KeyboardSettingsRead {
  /** What the settings field holds after loading: the clean current version, or a newer one unchanged. */
  readonly stored: KeyboardSettingsV1 | Readonly<Record<string, unknown>>;
  /** The remap to make live. */
  readonly remap: KeyboardRemap;
  /** The field held a version newer than this build reads. */
  readonly future: boolean;
}

export function readKeyboardSettings(value: unknown): KeyboardSettingsRead {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return Object.freeze({ stored: keyboardSettings(), remap: Object.freeze({}), future: false });
  const record = value as Readonly<Record<string, unknown>>;
  const version = record.version;
  if (typeof version === "number" && Number.isInteger(version) && version > KEYBOARD_SETTINGS_VERSION)
    return Object.freeze({ stored: record, remap: Object.freeze({}), future: true });
  const remap = sanitizeKeyboardRemap(record.primary);
  return Object.freeze({ stored: keyboardSettings(remap), remap, future: false });
}
