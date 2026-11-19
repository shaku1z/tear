import { normalizeCosmeticState } from "../domain/cosmetics";
import { asRecord } from "../domain/records";
import { achievementOutbox, addGrant, dailyReceiptId, tutorialLedger } from "../domain/reward-receipts";
import {
  extensionFields,
  mutableJsonClone,
  safeInteger,
  safeString,
  validateJsonObject,
  type JsonObject,
  type MutableJsonObject,
} from "./json";
import { invalid, unsupportedVersion, type MigrationResult } from "./result";

export const PROFILE_ENVELOPE_VERSION = 5;
/** Version 4 added the cosmetics ledger. */
const COSMETICS_VERSION = 4;
/** Version 5 pays daily challenges through receipts in the achievement outbox (`migrateDailyClaims`). */
const DAILY_RECEIPTS_VERSION = 5;
const KNOWN_FIELDS = new Set([
  "schema",
  "schemaVersion",
  "revision",
  "updatedAtMs",
  "writerId",
  "profile",
  "data",
  "extensions",
]);

export interface ProfileEnvelopeV2 {
  readonly schema: "tear.profile";
  readonly schemaVersion: typeof PROFILE_ENVELOPE_VERSION;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly writerId: string;
  readonly profile: JsonObject;
  readonly extensions: JsonObject;
}

/** A saved count as a whole number of coins or shards, as the outbox stores it. */
const wholeCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/**
 * An older save marks the daily challenges it paid in `daily.done`, and their shards are already in its total.
 * Each becomes a receipt worth nothing, which only stops that challenge paying again; `done` is then dropped.
 */
function migrateDailyClaims(profile: JsonObject): JsonObject {
  const daily = asRecord(profile.daily);
  if (!daily || !Object.hasOwn(daily, "done")) return profile;
  const done = asRecord(daily.done) ?? {};
  const progress = Object.fromEntries(Object.entries(daily).filter(([key]) => key !== "done"));
  const date = daily.date;
  const stats = asRecord(profile.stats);
  const counted = { coins: wholeCount(stats?.coinsEarned), shards: wholeCount(profile.shards) };
  let outbox = achievementOutbox(profile.achievementOutbox, counted.coins, counted.shards);
  const before = outbox;
  for (const [challenge, paid] of Object.entries(done)) {
    // The version 4 reader counted any truthy mark as paid.
    if (typeof date !== "string" || !paid) continue;
    const id = dailyReceiptId(date, challenge);
    outbox = addGrant(outbox, id, { coins: 0, shards: 0, acknowledged: true }, counted) ?? outbox;
  }
  const migrated = validateJsonObject({
    ...profile,
    daily: progress,
    ...(outbox === before ? {} : { achievementOutbox: outbox }),
  });
  return migrated.ok ? migrated.value : profile;
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
  try {
    if (profile.value.tutorialCompletion !== undefined) tutorialLedger(profile.value.tutorialCompletion);
    if (profile.value.achievementOutbox !== undefined) achievementOutbox(profile.value.achievementOutbox);
  } catch {
    return invalid("Invalid profile completion/reward ledger.");
  }
  const withReceipts = version < DAILY_RECEIPTS_VERSION ? migrateDailyClaims(profile.value) : profile.value;
  // Older saves get the empty cosmetics ledger; a present value is always re-validated (malformed entries
  // dropped, unknown ids kept) before it reaches game code.
  const cosmetics =
    version < COSMETICS_VERSION || withReceipts.cosmetics !== undefined
      ? validateJsonObject(normalizeCosmeticState(withReceipts.cosmetics))
      : null;
  if (cosmetics && !cosmetics.ok) return invalid(cosmetics.error);
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
      profile: cosmetics ? { ...withReceipts, cosmetics: cosmetics.value } : withReceipts,
      extensions: extensions.value,
    }),
  };
}
