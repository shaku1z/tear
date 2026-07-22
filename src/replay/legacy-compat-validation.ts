import type { TearScoreReplayMetadata } from "./envelope";
import {
  migrateVisualRecording,
  verifyVisualReplayPacket,
  type VisualRecordingV2,
} from "./visual-replay";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arrayValue<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError("Replay track index is out of bounds.");
  return value;
}

function isCanonicalPacket(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.format === "tear-replay") return true;
  return value.schema === "tear.replay" && isRecord(value.recording) && value.recording.format === "tear-replay";
}

export function acceptedRecording(value: unknown): VisualRecordingV2 | null {
  const canonical = isRecord(value) && value.schema === "tear.replay" ? value.recording : value;
  if (isCanonicalPacket(value) && !verifyVisualReplayPacket(canonical)) return null;
  const migrated = migrateVisualRecording(value);
  return migrated.ok ? migrated.recording : null;
}

export function tearScoreMetadata(value: unknown): TearScoreReplayMetadata {
  if (!isRecord(value) || typeof value.enabled !== "boolean") return { enabled: false, reason: "not-recorded" };
  if (!value.enabled) return value.reason === "disabled" || value.reason === "fallback" || value.reason === "not-recorded"
    ? { enabled: false, reason: value.reason } : { enabled: false, reason: "not-recorded" };
  return typeof value.engineVersion === "string" && value.engineVersion.length > 0
    && typeof value.scoreVersion === "string" && value.scoreVersion.length > 0
    && typeof value.seed === "string" && value.seed.length > 0
    && typeof value.eventJournalHash === "string" && value.eventJournalHash.length > 0
    ? {
      enabled: true,
      engineVersion: value.engineVersion,
      scoreVersion: value.scoreVersion,
      seed: value.seed,
      eventJournalHash: value.eventJournalHash,
    }
    : { enabled: false, reason: "not-recorded" };
}
