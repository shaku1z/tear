/**
 * The one place that says how saved profile data answers the questions of the condition language:
 * a boss is defeated when its `kill<Boss>` stat is positive, a biome is entered when `stats._biomes`
 * names it, an achievement is unlocked when `ach` holds it.
 */
import { isRecord } from "./records";
import type { ProgressFacts } from "./unlock-condition";

/** The parts of a profile the condition language reads. The saved profile body has this shape. */
export interface ProgressSource {
  readonly stats: Readonly<Record<string, unknown>>;
  readonly ach: Readonly<Record<string, unknown>>;
}

const BIOME_STAT = "_biomes";
const BOSS_KILL_STAT_PREFIX = "kill";

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * `rootbound` to `killRootbound`: the stat that counts a boss defeat. The one spelling: the kill runtime
 * writes it, the screens read it, and `progressFacts` answers `bossDefeated` from it.
 */
export function bossKillStat(bossId: string): string {
  return `${BOSS_KILL_STAT_PREFIX}${bossId.charAt(0).toUpperCase()}${bossId.slice(1)}`;
}

/** Answers from the source as it is now; it follows later changes to the source. */
export function progressFacts(source: ProgressSource): ProgressFacts {
  return {
    bossDefeated: (bossId) => finite(source.stats[bossKillStat(bossId)]) > 0,
    biomeEntered: (biome) => isRecord(source.stats[BIOME_STAT]) && source.stats[BIOME_STAT][biome] !== undefined,
    stat: (key) => finite(source.stats[key]),
    achievementUnlocked: (id) => source.ach[id] !== undefined,
  };
}

/** A frozen copy of the source as it stands now, for things that must not change mid-run (the music). */
export function snapshotProgress(source: ProgressSource): ProgressSource {
  const stats: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source.stats)) {
    if (typeof value === "number") stats[key] = value;
  }
  const biomes = source.stats[BIOME_STAT];
  if (isRecord(biomes)) stats[BIOME_STAT] = Object.fromEntries(Object.keys(biomes).map((name) => [name, 1]));
  const ach = Object.fromEntries(Object.keys(source.ach).map((id) => [id, 1]));
  return Object.freeze({ stats: Object.freeze(stats), ach: Object.freeze(ach) });
}
