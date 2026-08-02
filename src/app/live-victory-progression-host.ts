import { bindVictoryProgressionIntents } from "./live-outcome-intent-coordinator";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type Dependencies = Pick<GameRuntimeDependencies, "Cloud" | "DAILY" | "PROFILE" | "profileStatsPersistence">;

export function createLiveVictoryProgressionExecutor(
  d: Dependencies,
  checkAchievements: () => void,
  finishRecording: (won: boolean) => void,
): ReturnType<typeof bindVictoryProgressionIntents> {
  return bindVictoryProgressionIntents({
    profileAdd: d.profileStatsPersistence.add,
    profileMax: d.profileStatsPersistence.max,
    dailyBump: (challenge, value) => { d.DAILY.bump(challenge, value); },
    markWeaponWin(weaponId) {
      const won = d.PROFILE.data.weaponsWon ?? (d.PROFILE.data.weaponsWon = {});
      won[weaponId] = 1; d.profileStatsPersistence.max("distinctWeaponsWon", Object.keys(won).length);
    },
    setProfileReward(reward) {
      const rewards = d.PROFILE.data.rewards ?? (d.PROFILE.data.rewards = {});
      rewards[reward] = true;
    },
    markAdventureDifficulty(difficulty) {
      const difficulties = d.PROFILE.data.advDiffs ?? (d.PROFILE.data.advDiffs = {});
      difficulties[difficulty] = 1; d.profileStatsPersistence.max("clearAdvAll", Object.keys(difficulties).length);
    },
    achievementCheck: checkAchievements,
    cloudLog: (payload) => { d.Cloud.logEvent("run_end", payload); },
    finishRecording,
  });
}
