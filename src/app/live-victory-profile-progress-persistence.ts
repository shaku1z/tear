import type { createLegacyProfile } from "../persistence/legacy-profile";
import type { ProfileStatsPersistence } from "./live-profile-stats-persistence";

type Profile = Pick<ReturnType<typeof createLegacyProfile>, "data">;

/** Composition-owned victory profile-data operations; outcome owns the later save request. */
export interface VictoryProfileProgressPersistence {
  readonly markWeaponWin: (weaponId: string) => void;
  readonly setReward: (reward: string) => void;
  readonly markAdventureDifficulty: (difficulty: string) => void;
}

export function createLiveVictoryProfileProgressPersistence(
  profile: Profile,
  stats: ProfileStatsPersistence,
): VictoryProfileProgressPersistence {
  return Object.freeze({
    markWeaponWin: (weaponId: string) => {
      const won = profile.data.weaponsWon ?? (profile.data.weaponsWon = {});
      won[weaponId] = 1;
      stats.max("distinctWeaponsWon", Object.keys(won).length);
    },
    setReward: (reward: string) => {
      const rewards = profile.data.rewards ?? (profile.data.rewards = {});
      rewards[reward] = true;
    },
    markAdventureDifficulty: (difficulty: string) => {
      const difficulties = profile.data.advDiffs ?? (profile.data.advDiffs = {});
      difficulties[difficulty] = 1;
      stats.max("clearAdvAll", Object.keys(difficulties).length);
    },
  });
}
