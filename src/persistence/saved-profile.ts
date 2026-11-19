import { emptyCosmeticState } from "../domain/cosmetics";
import { asRecord } from "../domain/records";
import {
  PROFILE_ENVELOPE_VERSION,
  migrateProfileEnvelope,
  mutableProfileWorkingCopy,
  type ProfileEnvelopeV2,
} from "./profile-envelope";
import type { SaveProblem } from "../domain/save-problems";

export type Tracker = Record<string, unknown>;

export interface ProfileData extends Record<string, unknown> {
  v: number;
  shards: number;
  ach: Record<string, number>;
  stats: Record<string, number | Tracker>;
  seen: Record<string, boolean>;
  modes: Record<string, boolean>;
  created: number;
  achCoinsRetrofit: boolean;
  username?: string;
  usernameSetAt?: number;
  pendingFinale?: Tracker;
  rewards?: Tracker;
  weaponsWon?: Record<string, number>;
  advDiffs?: Record<string, number>;
  /** Cosmetic ownership and equipped slots (version 4); read through `cosmetics()`. */
  cosmetics?: unknown;
  /** The Gauntlet personal best per difficulty, an optional field; read through `gauntletBest()`. */
  gauntletBest?: unknown;
}

/** The two keys a profile lives under: the versioned envelope, and the plain copy older builds read. */
export const PROFILE_ENVELOPE_KEY = "tear_profile_v2";
export const PROFILE_MIRROR_KEY = "tear_profile";

/** A profile with nothing earned yet. Every field a saved one carries is present from the start. */
export function freshProfile(now: number): ProfileData {
  return {
    v: 1,
    shards: 0,
    ach: {},
    stats: {},
    seen: {},
    modes: {},
    created: now,
    achCoinsRetrofit: false,
    // The same empty ledger migration gives an older save.
    cosmetics: emptyCosmeticState(),
    gauntletBest: {},
  };
}

/** What the stored profile held when it was read. */
export interface StoredProfile {
  /** The profile's fields, or null when nothing readable was stored. */
  readonly raw: Tracker | null;
  /** The envelope to keep writing from: the one read, null after an unreadable read, else `previous`. */
  readonly envelope: ProfileEnvelopeV2 | null;
  /** False when the stored data must not be overwritten (unreadable, or from a newer build). */
  readonly writable: boolean;
  /** What the player has to be told, if anything went wrong. */
  readonly problem: SaveProblem | null;
}

/**
 * Reads the stored profile: the envelope first, then the plain copy older builds wrote. A stored value that
 * cannot be read is never overwritten (`writable` false) and is reported, so the player is told instead of
 * silently starting over. A missing value is not a problem: it is a new player.
 */
export function readStoredProfile(
  store: Readonly<{ get(key: string): string | null }>,
  previous: ProfileEnvelopeV2 | null,
  nowMs: number,
): StoredProfile {
  let raw: Tracker | null = null;
  let envelope = previous;
  let writable = true;
  let problem: SaveProblem | null = null;
  try {
    const text = store.get(PROFILE_ENVELOPE_KEY);
    if (text) {
      const migrated = migrateProfileEnvelope(JSON.parse(text) as unknown, nowMs);
      if (migrated.ok) {
        envelope = migrated.value;
        raw = mutableProfileWorkingCopy(migrated.value);
      } else {
        writable = false;
        problem = migrated.code === "unsupported-version" ? "profile-newer-version" : "profile-unreadable";
      }
    }
  } catch {
    envelope = null;
    writable = false;
    problem = "profile-unreadable";
  }
  if (!raw) {
    let legacy: unknown;
    try {
      const text = store.get(PROFILE_MIRROR_KEY);
      legacy = JSON.parse(text ?? "{}") as unknown;
    } catch {
      legacy = {};
      problem ??= "profile-unreadable";
    }
    const migrated = migrateProfileEnvelope(legacy, nowMs);
    if (migrated.ok) {
      envelope = migrated.value;
      raw = mutableProfileWorkingCopy(migrated.value);
    } else problem ??= migrated.code === "unsupported-version" ? "profile-newer-version" : "profile-unreadable";
  }
  return { raw, envelope, writable, problem };
}

/** The text of a profile envelope holding a profile with nothing earned, for the revision after `revision`. */
export function blankProfileEnvelopeText(nowMs: number, writerId: string, revision: number): string | null {
  const migrated = migrateProfileEnvelope(
    {
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      revision: revision + 1,
      updatedAtMs: nowMs,
      writerId,
      profile: freshProfile(nowMs),
      extensions: {},
    },
    nowMs,
  );
  return migrated.ok ? JSON.stringify(migrated.value) : null;
}

/** The revision of the envelope in `text`, or 0 when it holds none that can be read. */
export function storedRevision(text: string | null): number {
  if (text === null) return 0;
  try {
    const revision = asRecord(JSON.parse(text) as unknown)?.revision;
    return typeof revision === "number" && Number.isSafeInteger(revision) ? revision : 0;
  } catch {
    return 0;
  }
}
