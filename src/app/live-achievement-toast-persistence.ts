import type { createLegacyProfile } from "../persistence/legacy-profile";

type Profile = Pick<ReturnType<typeof createLegacyProfile>, "data" | "save">;

/** Narrow live adapter for achievement-toast profile persistence. */
export interface AchievementToastPersistence {
  readonly markSeen: (id: string) => void;
  readonly save: () => void;
}

export function createLiveAchievementToastPersistence(profile: Profile): AchievementToastPersistence {
  return Object.freeze({
    markSeen: (id: string) => { profile.data.seen[id] = true; },
    save: () => { profile.save(); },
  });
}
