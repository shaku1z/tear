import { asRecord, extensionFields, safeInteger, safeString, validateJsonObject, type JsonObject } from "./json";
import { invalid, unsupportedVersion, type MigrationResult } from "./result";

export const REPLAY_ENVELOPE_VERSION = 3;
const KNOWN_FIELDS = new Set([
  "schema", "schemaVersion", "createdAtMs", "rulesetVersion", "engineVersion", "scoreEngineVersion",
  "seed", "recording", "data", "extensions",
]);

export interface ReplayEnvelopeV3 {
  readonly schema: "tear.replay";
  readonly schemaVersion: typeof REPLAY_ENVELOPE_VERSION;
  readonly createdAtMs: number;
  readonly rulesetVersion: string;
  readonly engineVersion: string;
  readonly scoreEngineVersion: string;
  readonly seed: string;
  readonly recording: JsonObject;
  readonly extensions: JsonObject;
}

export function migrateReplayEnvelope(input: unknown, nowMs = 0): MigrationResult<ReplayEnvelopeV3> {
  const source = asRecord(input);
  if (!source) return invalid("Replay data must be an object.");
  const isEnvelope = source.schema === "tear.replay";
  const rawVersion = isEnvelope ? source.schemaVersion : source.v;
  const version = safeInteger(rawVersion, 1);
  if (version > REPLAY_ENVELOPE_VERSION) return unsupportedVersion("replay", version);

  const recordingSource = isEnvelope ? (source.recording ?? source.data ?? {}) : source;
  const recording = validateJsonObject(recordingSource);
  if (!recording.ok) return invalid(recording.error);
  const extensions = extensionFields(isEnvelope ? source : {}, KNOWN_FIELDS);
  if (!extensions.ok) return invalid(extensions.error);
  return {
    ok: true,
    migratedFrom: isEnvelope && version === REPLAY_ENVELOPE_VERSION ? null : isEnvelope ? version : "legacy",
    value: Object.freeze({
      schema: "tear.replay",
      schemaVersion: REPLAY_ENVELOPE_VERSION,
      createdAtMs: safeInteger(source.createdAtMs, nowMs),
      rulesetVersion: safeString(source.rulesetVersion, `legacy-replay-v${String(version)}`),
      engineVersion: safeString(source.engineVersion, "legacy"),
      scoreEngineVersion: safeString(source.scoreEngineVersion, "none"),
      seed: safeString(source.seed, "legacy"),
      recording: recording.value,
      extensions: extensions.value,
    }),
  };
}
