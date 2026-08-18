import type { createLegacyProfile } from "../persistence/legacy-profile";

import type { PendingFinaleRecord } from "./live-pending-finale-controller";

type Profile = Pick<ReturnType<typeof createLegacyProfile>,
  "clearPendingFinale" | "pendingFinale" | "save" | "setPendingFinale">;

/** Composition-owned profile operations used by the live outcome and recovery host. */
export interface PendingFinalePersistence {
  readonly persist: (record: PendingFinaleRecord) => void;
  readonly saveProfile: () => void;
  readonly clear: () => void;
  readonly pending: () => PendingFinaleRecord | null;
}

export function createLivePendingFinalePersistence(profile: Profile): PendingFinalePersistence {
  return Object.freeze({
    persist: (record: PendingFinaleRecord) => { profile.setPendingFinale(record); },
    saveProfile: () => { profile.save(); },
    clear: () => { profile.clearPendingFinale(); },
    pending: () => profile.pendingFinale(),
  });
}
