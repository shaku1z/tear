import type { RandomSource } from "../../domain/random";
import { BOSS_DEFINITIONS, type BOSS_IDENTITY_IDS, type BossDefinition } from "./boss-definitions";
import { bossIdsAvailableOn, STAGE_CONTENT_AVAILABILITY, type ContentAvailabilitySurface, type StageId } from "../stages";

type BossRosterProjection<T extends readonly BossDefinition[]> = {
  readonly [K in keyof T]: T[K] extends BossDefinition
    ? Readonly<{ id: T[K]["id"]; name: T[K]["name"] }>
    : never;
};

function projectBossRoster<T extends readonly BossDefinition[]>(definitions: T): BossRosterProjection<T> {
  return definitions.map(({ id, name }) => Object.freeze({ id, name })) as BossRosterProjection<T>;
}

/** Ordinary production roster; preview bosses remain authored but require an explicit Playground path. */
const PUBLISHED_BOSS_IDS = new Set(bossIdsAvailableOn("published"));
type PublishedBossDefinitions = readonly [
  typeof BOSS_DEFINITIONS[0], typeof BOSS_DEFINITIONS[1], typeof BOSS_DEFINITIONS[2],
  typeof BOSS_DEFINITIONS[3], typeof BOSS_DEFINITIONS[5], typeof BOSS_DEFINITIONS[6],
];
const publishedBossDefinitions = BOSS_DEFINITIONS.filter(({ id }) => PUBLISHED_BOSS_IDS.has(id)) as unknown as PublishedBossDefinitions;
export const BOSS_ROSTER = Object.freeze(projectBossRoster(
  publishedBossDefinitions,
));
export const AUTHORED_BOSS_ROSTER = Object.freeze(projectBossRoster(BOSS_DEFINITIONS));

export type BossId = typeof BOSS_IDENTITY_IDS[number];
/** Campaign-only or factory-unavailable bosses cannot enter the mini-boss selector. */
export type MiniBossId = Exclude<BossId, "source" | "rootbound" | "white-hart">;
export const ENEMY_KIND_IDS = Object.freeze([
  "charger", "ranged", "flyer", "bomber", "armored",
  "priest", "mender", "herald", "anchor", "wraith", "chimera",
] as const);
export const ENEMY_IDENTITY_IDS = Object.freeze([...ENEMY_KIND_IDS, "rootbinder", "rimehound"] as const);
export type ActiveEnemyKind = typeof ENEMY_KIND_IDS[number];
export type EnemyKind = typeof ENEMY_IDENTITY_IDS[number];

/** Stage-native families inherit availability from their home; legacy families are universal. */
export const ENEMY_HOME_STAGE = Object.freeze({
  rootbinder: "verdant-sanctum",
  rimehound: "pale-traverse",
} as const satisfies Readonly<Partial<Record<EnemyKind, StageId>>>);

export function enemyIdsAvailableOn(surface: ContentAvailabilitySurface): readonly EnemyKind[] {
  return Object.freeze(ENEMY_IDENTITY_IDS.filter((id) => {
    const home = (ENEMY_HOME_STAGE as Readonly<Partial<Record<EnemyKind, StageId>>>)[id];
    return home === undefined || STAGE_CONTENT_AVAILABILITY[home][surface];
  }));
}

export const PUBLISHED_ENEMY_IDENTITY_IDS = enemyIdsAvailableOn("published");

export interface CampaignPoolEntry {
  readonly kind: EnemyKind;
  readonly weight: number;
  readonly unlockWave: number;
}

const MINI_BOSSES = Object.freeze(["warden", "colossus", "aldric", "echo"] as const);

function weightedPick<T>(entries: readonly (readonly [T, number])[], random: RandomSource): T {
  if (entries.length === 0) throw new RangeError("a weighted pool must not be empty");
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new RangeError("weighted pool must have a finite positive total");
  let cursor = random.next() * total;
  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  const fallback = entries[entries.length - 1];
  if (fallback === undefined) throw new RangeError("a weighted pool must not be empty");
  return fallback[0];
}

export function shuffledBossRoster(random: RandomSource): BossId[] {
  const result: BossId[] = BOSS_ROSTER.map((boss) => boss.id);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random.next() * (index + 1));
    const current = result[index];
    const swap = result[target];
    if (current === undefined || swap === undefined) throw new RangeError("boss shuffle index escaped roster bounds");
    result[index] = swap;
    result[target] = current;
  }
  return result;
}

export function pickMiniBoss(random: RandomSource): MiniBossId {
  const selected = MINI_BOSSES[Math.floor(random.next() * MINI_BOSSES.length)];
  if (selected === undefined) throw new RangeError("mini-boss selection escaped roster bounds");
  return selected;
}

export function pickEnemyKind(
  wave: number,
  random: RandomSource,
  campaignPool: readonly CampaignPoolEntry[] | null = null,
  localWave?: number,
): EnemyKind {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive integer");
  if (campaignPool !== null && campaignPool.length > 0) {
    if (typeof localWave !== "number" || !Number.isSafeInteger(localWave) || localWave < 1 || localWave > 10) {
      throw new RangeError("campaign pool selection requires an explicit localWave from 1 through 10");
    }
    const unlocked = campaignPool.filter((entry) => localWave >= entry.unlockWave);
    const candidates = unlocked.length > 0 ? unlocked : campaignPool;
    return weightedPick(candidates.map((entry) => [entry.kind, entry.weight] as const), random);
  }

  const pool: (readonly [EnemyKind, number])[] = [["charger", 1]];
  if (wave >= 2) pool.push(["ranged", 0.6]);
  if (wave >= 3) pool.push(["flyer", 0.5]);
  if (wave >= 4) pool.push(["bomber", 0.4]);
  if (wave >= 5) pool.push(["armored", 0.35]);
  if (wave >= 6) pool.push(["priest", 0.18], ["mender", 0.16]);
  if (wave >= 7) pool.push(["herald", 0.16], ["anchor", 0.14], ["wraith", 0.2]);
  if (wave >= 8) pool.push(["chimera", 0.16]);
  return weightedPick(pool, random);
}

export function bossName(id: string): string {
  return AUTHORED_BOSS_ROSTER.find((boss) => boss.id === id)?.name ?? "";
}
