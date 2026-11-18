/**
 * The one place that says how saved profile data answers the questions of the condition language:
 * a boss is defeated when its `kill<Boss>` stat is positive, a biome is entered when `stats._biomes`
 * names it, an achievement is unlocked when `ach` holds it. Every lookup reads own keys only.
 */
import { finiteOrZero, hasOwnKey, isRecord, isSafeKey, ownValue } from "./records";
import type { ProgressFacts } from "./unlock-condition";

/** The parts of a profile the condition language reads. The saved profile body has this shape. */
export interface ProgressSource {
  readonly stats: Readonly<Record<string, unknown>>;
  readonly ach: Readonly<Record<string, unknown>>;
}

const BIOME_STAT = "_biomes";
const BOSS_KILL_STAT_PREFIX = "kill";

/**
 * `rootbound` to `killRootbound`: the stat that counts a boss defeat. The one spelling: the kill runtime
 * writes it, the screens read it, and `progressFacts` answers `bossDefeated` from it.
 */
export function bossKillStat(bossId: string): string {
  return `${BOSS_KILL_STAT_PREFIX}${bossId.charAt(0).toUpperCase()}${bossId.slice(1)}`;
}

/** Answers from the source as it is now; it follows later changes to the source. */
export function progressFacts(source: ProgressSource): ProgressFacts {
  const stat = (key: string): number => finiteOrZero(ownValue(source.stats, key));
  return {
    bossDefeated: (bossId) => stat(bossKillStat(bossId)) > 0,
    biomeEntered: (biome) => {
      const biomes = ownValue(source.stats, BIOME_STAT);
      return isRecord(biomes) && hasOwnKey(biomes, biome);
    },
    stat,
    achievementUnlocked: (id) => ownValue(source.ach, id) !== undefined,
  };
}

/** A frozen copy of the source as it stands now, for things that must not change mid-run (the music). */
export function snapshotProgress(source: ProgressSource): ProgressSource {
  const safe = (keys: readonly string[]): string[] => keys.filter(isSafeKey);
  const stats: Record<string, unknown> = {};
  for (const key of safe(Object.keys(source.stats))) {
    const value = source.stats[key];
    if (typeof value === "number") stats[key] = value;
  }
  const biomes = ownValue(source.stats, BIOME_STAT);
  if (isRecord(biomes)) stats[BIOME_STAT] = Object.fromEntries(safe(Object.keys(biomes)).map((name) => [name, 1]));
  const ach = Object.fromEntries(safe(Object.keys(source.ach)).map((id) => [id, 1]));
  return Object.freeze({ stats: Object.freeze(stats), ach: Object.freeze(ach) });
}
