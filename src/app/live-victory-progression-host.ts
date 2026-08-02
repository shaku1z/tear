import { bindVictoryProgressionIntents } from "./live-outcome-intent-coordinator";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type Dependencies = Pick<GameRuntimeDependencies, "Cloud" | "DAILY" | "profileStatsPersistence" | "victoryProfileProgressPersistence">;

export function createLiveVictoryProgressionExecutor(
  d: Dependencies,
  checkAchievements: () => void,
  finishRecording: (won: boolean) => void,
): ReturnType<typeof bindVictoryProgressionIntents> {
  return bindVictoryProgressionIntents({
    profileAdd: d.profileStatsPersistence.add,
    profileMax: d.profileStatsPersistence.max,
    dailyBump: (challenge, value) => { d.DAILY.bump(challenge, value); },
    markWeaponWin: d.victoryProfileProgressPersistence.markWeaponWin,
    setProfileReward: d.victoryProfileProgressPersistence.setReward,
    markAdventureDifficulty: d.victoryProfileProgressPersistence.markAdventureDifficulty,
    achievementCheck: checkAchievements,
    cloudLog: (payload) => { d.Cloud.logEvent("run_end", payload); },
    finishRecording,
  });
}
