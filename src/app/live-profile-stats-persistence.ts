import type { createLegacyProfile } from "../persistence/legacy-profile";

type Profile = Pick<ReturnType<typeof createLegacyProfile>, "addStat" | "maxStat">;

/** Shared composition-owned profile-stat port for generic gameplay callers. */
export interface ProfileStatsPersistence {
  readonly add: (stat: string, amount: number) => void;
  readonly max: (stat: string, value: number) => void;
}

export function createLiveProfileStatsPersistence(profile: Profile): ProfileStatsPersistence {
  return Object.freeze({
    add: (stat: string, amount: number) => { profile.addStat(stat, amount); },
    max: (stat: string, value: number) => { profile.maxStat(stat, value); },
  });
}
