import type { createProfileStore } from "../../persistence/profile-store";

type Profile = Pick<ReturnType<typeof createProfileStore>, "markBiome" | "maxStat">;

/** Composition-owned operation for campaign biome discovery progress. */
export interface BiomeProgressPersistence {
  readonly remember: (name: string) => void;
}

export function createLiveBiomeProgressPersistence(profile: Profile): BiomeProgressPersistence {
  return Object.freeze({
    remember: (name: string) => { profile.maxStat("biomesSeen", profile.markBiome(name)); },
  });
}
