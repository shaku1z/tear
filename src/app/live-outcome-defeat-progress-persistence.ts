import type { OutcomeRunState } from "../gameplay/run/outcome-planner";
import type { createLegacyProfile } from "../persistence/legacy-profile";

type Profile = Pick<ReturnType<typeof createLegacyProfile>, "addStat" | "maxStat">;
type DefeatRun = Pick<OutcomeRunState, "runTime">;

/** Composition-owned profile-stat update for a completed defeat outcome. */
export interface OutcomeDefeatProgressPersistence {
  readonly record: (run: DefeatRun) => void;
}

export function createLiveOutcomeDefeatProgressPersistence(profile: Profile): OutcomeDefeatProgressPersistence {
  return Object.freeze({
    record: (run: DefeatRun) => {
      profile.addStat("runs", 1);
      profile.maxStat("longestRun", Math.floor(run.runTime));
    },
  });
}
