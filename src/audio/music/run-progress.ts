import type { MusicRunProgress } from "../music-contracts";

/**
 * Saved progress the music needs at run start, read from profile stats: the biomes reached
 * (`stats._biomes`, written on entering a stage) and the bosses defeated (`stats.kill<BossId>`).
 * Read it before the run's first stage loads, so the biome a run starts in still counts as new.
 */
/**
 * Saved progress reaches the music only in runs that also record it: not in seed races (every
 * racer must hear the same song) and not in practice. Replays have no music director.
 */
export function admittedMusicProgress(
  progress: MusicRunProgress | null,
  run: { readonly tracksProgress: boolean; readonly seedRace: boolean; readonly practice: boolean },
): MusicRunProgress | null {
  return progress !== null && run.tracksProgress && !run.seedRace && !run.practice ? progress : null;
}

export function musicRunProgress(
  stats: Readonly<Record<string, unknown>>,
  isBossId: (id: string) => boolean,
): MusicRunProgress {
  const biomes = stats._biomes;
  const bossesDefeated = Object.entries(stats).flatMap(([key, value]) => {
    const name = /^kill([A-Z][A-Za-z0-9]*)$/u.exec(key)?.[1];
    if (!name || typeof value !== "number" || value <= 0) return [];
    const id = `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
    return isBossId(id) ? [id] : [];
  });
  return {
    biomesReached: biomes && typeof biomes === "object" ? Object.keys(biomes) : [],
    bossesDefeated,
  };
}
