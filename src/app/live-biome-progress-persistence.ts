import type { createLegacyProfile } from "../persistence/legacy-profile";

type Profile = Pick<ReturnType<typeof createLegacyProfile>, "markBiome" | "maxStat">;

/** Composition-owned operation for campaign biome discovery progress. */
export interface BiomeProgressPersistence {
  readonly remember: (name: string) => void;
}

export function createLiveBiomeProgressPersistence(profile: Profile): BiomeProgressPersistence {
  return Object.freeze({
    remember: (name: string) => { profile.maxStat("biomesSeen", profile.markBiome(name)); },
  });
}
