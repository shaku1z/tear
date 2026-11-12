import type { createAchievements } from "../../gameplay/progression/achievements";
import type { createProfileStore } from "../../persistence/profile-store";

type Achievements = Pick<ReturnType<typeof createAchievements>, "check">;
type Profile = Pick<ReturnType<typeof createProfileStore>, "save">;

/** Narrow live adapter for style-triggered achievement checking and profile persistence. */
export interface StyleAchievementPersistence {
  readonly checkAndSave: () => void;
}

export function createLiveStyleAchievementPersistence(
  achievements: Achievements,
  profile: Profile,
): StyleAchievementPersistence {
  return Object.freeze({
    checkAndSave: () => { achievements.check(); profile.save(); },
  });
}
