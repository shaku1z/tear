import { describe, expect, it } from "vitest";
import { dispatchVictoryProgressionIntents } from "../../src/app/live-outcome-intent-coordinator";
import type { VictoryProgressionIntent } from "../../src/gameplay/run/outcome-planner";

describe("live outcome intent coordinator", () => {
  it("dispatches every victory progression intent in source order", () => {
    const calls: string[] = [];
    const intents: VictoryProgressionIntent[] = [
      { type: "profile-add", stat: "wins", value: 1 }, { type: "profile-max", stat: "score", value: 8 },
      { type: "daily-bump", challenge: "victory", value: 1 }, { type: "mark-weapon-win", weaponId: "hammer" },
      { type: "set-profile-reward", reward: "restoredBladeTrail" }, { type: "mark-adventure-difficulty", difficulty: "hard" },
      { type: "achievement-check" }, { type: "cloud-log", payload: { won: true } },
      { type: "finish-recording", won: true },
    ];
    dispatchVictoryProgressionIntents(intents, {
      profileAdd: (stat, value) => { calls.push(`add:${stat}:${String(value)}`); },
      profileMax: (stat, value) => { calls.push(`max:${stat}:${String(value)}`); },
      dailyBump: (challenge, value) => { calls.push(`daily:${challenge}:${String(value)}`); },
      markWeaponWin: (id) => { calls.push(`weapon:${id}`); }, setProfileReward: (id) => { calls.push(`reward:${id}`); },
      markAdventureDifficulty: (id) => { calls.push(`difficulty:${id}`); },
      achievementCheck: () => { calls.push("check"); }, cloudLog: (payload) => { calls.push(`cloud:${String(payload.won)}`); },
      finishRecording: (won) => { calls.push(`recording:${String(won)}`); },
    });
    expect(calls).toEqual(["add:wins:1", "max:score:8", "daily:victory:1", "weapon:hammer", "reward:restoredBladeTrail",
      "difficulty:hard", "check", "cloud:true", "recording:true"]);
  });
});
