import type { VictoryProgressionIntent } from "../gameplay/run/outcome-planner";

export interface VictoryProgressionPort {
  profileAdd(stat: string, value: number): void;
  profileMax(stat: string, value: number): void;
  dailyBump(challenge: string, value: number): void;
  markWeaponWin(weaponId: string): void;
  setProfileReward(reward: string): void;
  markAdventureDifficulty(difficulty: string): void;
  achievementCheck(): void;
  cloudLog(payload: Readonly<Record<string, unknown>>): void;
  finishRecording(won: boolean): void;
}

export function dispatchVictoryProgressionIntents(
  intents: readonly VictoryProgressionIntent[],
  port: VictoryProgressionPort,
): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "profile-add": port.profileAdd(intent.stat, intent.value); break;
      case "profile-max": port.profileMax(intent.stat, intent.value); break;
      case "daily-bump": port.dailyBump(intent.challenge, intent.value); break;
      case "mark-weapon-win": port.markWeaponWin(intent.weaponId); break;
      case "set-profile-reward": port.setProfileReward(intent.reward); break;
      case "mark-adventure-difficulty": port.markAdventureDifficulty(intent.difficulty); break;
      case "achievement-check": port.achievementCheck(); break;
      case "cloud-log": port.cloudLog(intent.payload); break;
      case "finish-recording": port.finishRecording(intent.won); break;
    }
  }
}

export function bindVictoryProgressionIntents(
  port: VictoryProgressionPort,
): (intents: readonly VictoryProgressionIntent[]) => void {
  return (intents) => { dispatchVictoryProgressionIntents(intents, port); };
}
