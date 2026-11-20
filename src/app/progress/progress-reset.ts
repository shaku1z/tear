import type { AcknowledgedStorage } from "../../platform/contracts";
import type { CloudSavePayload, CloudReplaceResult } from "../../platform/cloud";
import { META_STORE_KEY, migrateMetaData } from "../../gameplay/progression/meta";
import {
  blankProfileEnvelopeText,
  freshProfile,
  PROFILE_ENVELOPE_KEY,
  PROFILE_MIRROR_KEY,
  storedRevision,
} from "../../persistence/saved-profile";

/** How erasing the saved progress ended. Only "erased" changed anything. */
export type ProgressResetOutcome =
  /** The online copy and this device's copy are both blank, and the game has re-read them. */
  | "erased"
  /** The online copy could not be replaced, so nothing was changed anywhere. */
  | "online-failed"
  /** This device could not write the blank save. The online copy, if there is one, is already blank. */
  | "device-failed";

export interface ProgressResetPorts {
  readonly store: Readonly<{
    acknowledged?: AcknowledgedStorage;
    get(key: string): string | null;
    set(key: string, value: string): void;
  }>;
  readonly cloud: Readonly<{ replaceSave(payload: CloudSavePayload): Promise<CloudReplaceResult> }>;
  /** Re-read the saved profile into memory. */
  readonly profile: Readonly<{ load(): unknown }>;
  /** Re-read the saved coins and upgrades into memory. */
  readonly meta: Readonly<{ load(): unknown }>;
  readonly now: () => number;
  readonly writerId: () => string;
}

/** Writes `text` over whatever is stored under `key`, however it reads: unlike a commit, nothing is merged in. */
async function overwrite(store: ProgressResetPorts["store"], key: string, text: string): Promise<boolean> {
  if (store.acknowledged && (await store.acknowledged.update(key, () => text)).status !== "committed") return false;
  // The plain store also keeps the device's own copy, which a portal build's acknowledged write leaves as it was:
  // an earlier copy there would come back whenever the portal's data returns nothing.
  try {
    store.set(key, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Erases the player's progress: the profile (stats, unlocks, achievements, name) and the coins and upgrades,
 * in the online copy and on this device. The online copy goes first. The cloud merge keeps the highest value
 * of every statistic, so a blank device copy next to an intact online copy would simply be refilled from it at
 * the next start; if the online copy cannot be replaced, nothing is changed and the player is told.
 *
 * Settings, replays saved on this device, personal bests and the public leaderboard are not progress in this
 * sense and are left alone.
 */
export async function resetProgress(ports: ProgressResetPorts): Promise<ProgressResetOutcome> {
  const nowMs = ports.now();
  const blankMeta = migrateMetaData({});
  const online = await ports.cloud.replaceSave({ profile: freshProfile(nowMs), meta: blankMeta });
  if (online === "failed") return "online-failed";
  const revision = storedRevision(ports.store.get(PROFILE_ENVELOPE_KEY));
  const envelope = blankProfileEnvelopeText(nowMs, ports.writerId(), revision);
  if (envelope === null) return "device-failed";
  const written = [
    await overwrite(ports.store, PROFILE_ENVELOPE_KEY, envelope),
    await overwrite(ports.store, PROFILE_MIRROR_KEY, JSON.stringify(freshProfile(nowMs))),
    await overwrite(ports.store, META_STORE_KEY, JSON.stringify(blankMeta)),
  ];
  if (written.includes(false)) return "device-failed";
  ports.profile.load();
  ports.meta.load();
  return "erased";
}
