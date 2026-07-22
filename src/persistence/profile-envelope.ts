import {
  asRecord,
  extensionFields,
  mutableJsonClone,
  safeInteger,
  safeString,
  validateJsonObject,
  type JsonObject,
  type MutableJsonObject,
} from "./json";
import { invalid, unsupportedVersion, type MigrationResult } from "./result";

export const PROFILE_ENVELOPE_VERSION = 2;
const KNOWN_FIELDS = new Set(["schema", "schemaVersion", "revision", "updatedAtMs", "writerId", "profile", "data", "extensions"]);

export interface ProfileEnvelopeV2 {
  readonly schema: "tear.profile";
  readonly schemaVersion: typeof PROFILE_ENVELOPE_VERSION;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly writerId: string;
  readonly profile: JsonObject;
  readonly extensions: JsonObject;
}

export function mutableProfileWorkingCopy(envelope: ProfileEnvelopeV2): MutableJsonObject {
  return mutableJsonClone(envelope.profile) as MutableJsonObject;
}

export function migrateProfileEnvelope(input: unknown, nowMs = 0): MigrationResult<ProfileEnvelopeV2> {
  const source = asRecord(input);
  if (!source) return invalid("Profile data must be an object.");
  const isEnvelope = source.schema === "tear.profile";
  const version = isEnvelope ? safeInteger(source.schemaVersion, 1) : 0;
  if (version > PROFILE_ENVELOPE_VERSION) return unsupportedVersion("profile", version);

  const profile = validateJsonObject(isEnvelope ? (source.profile ?? source.data ?? {}) : source);
  if (!profile.ok) return invalid(profile.error);
  const extensions = extensionFields(isEnvelope ? source : {}, KNOWN_FIELDS);
  if (!extensions.ok) return invalid(extensions.error);
  return {
    ok: true,
    migratedFrom: isEnvelope && version === PROFILE_ENVELOPE_VERSION ? null : isEnvelope ? version : "legacy",
    value: Object.freeze({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      revision: safeInteger(source.revision, 0),
      updatedAtMs: safeInteger(source.updatedAtMs, nowMs),
      writerId: safeString(source.writerId, "legacy"),
      profile: profile.value,
      extensions: extensions.value,
    }),
  };
}
