import { migrateAudioSettings, type PersistedAudioSettingsV2 } from "./audio-settings";
import { asRecord, extensionFields, safeInteger, validateJsonObject, type JsonObject } from "./json";
import { invalid, unsupportedVersion, type MigrationResult } from "./result";

export const SETTINGS_ENVELOPE_VERSION = 2;
const KNOWN_FIELDS = new Set(["schema", "schemaVersion", "revision", "updatedAtMs", "audio", "values", "data", "extensions"]);

export interface SettingsEnvelopeV2 {
  readonly schema: "tear.settings";
  readonly schemaVersion: typeof SETTINGS_ENVELOPE_VERSION;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly audio: PersistedAudioSettingsV2;
  /** Non-audio settings remain lossless while their typed settings modules are extracted. */
  readonly values: JsonObject;
  readonly extensions: JsonObject;
}

export function migrateSettingsEnvelope(input: unknown, nowMs = 0): MigrationResult<SettingsEnvelopeV2> {
  const source = asRecord(input) ?? {};
  const isEnvelope = source.schema === "tear.settings";
  const version = isEnvelope ? safeInteger(source.schemaVersion, 1) : 0;
  if (version > SETTINGS_ENVELOPE_VERSION) return unsupportedVersion("settings", version);

  const valueSource = isEnvelope ? (source.values ?? source.data ?? {}) : source;
  const values = validateJsonObject(valueSource);
  if (!values.ok) return invalid(values.error);
  const extensions = extensionFields(isEnvelope ? source : {}, KNOWN_FIELDS);
  if (!extensions.ok) return invalid(extensions.error);
  const audioSource = isEnvelope ? (source.audio ?? valueSource) : source;

  return {
    ok: true,
    migratedFrom: isEnvelope && version === SETTINGS_ENVELOPE_VERSION ? null : isEnvelope ? version : "legacy",
    value: Object.freeze({
      schema: "tear.settings",
      schemaVersion: SETTINGS_ENVELOPE_VERSION,
      revision: safeInteger(source.revision, 0),
      updatedAtMs: safeInteger(source.updatedAtMs, nowMs),
      audio: migrateAudioSettings(audioSource),
      values: values.value,
      extensions: extensions.value,
    }),
  };
}
