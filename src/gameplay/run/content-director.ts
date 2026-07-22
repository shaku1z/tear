import type { RandomSource } from "../../domain/random";

export const BOSS_ROSTER = Object.freeze([
  Object.freeze({ id: "warden", name: "The Warden" }),
  Object.freeze({ id: "colossus", name: "Iron Colossus" }),
  Object.freeze({ id: "aldric", name: "Berserker King" }),
  Object.freeze({ id: "echo", name: "The Echo" }),
  Object.freeze({ id: "source", name: "The Source" }),
] as const);

export type BossId = typeof BOSS_ROSTER[number]["id"];
export type MiniBossId = Exclude<BossId, "source">;
export type EnemyKind =
  | "charger" | "ranged" | "flyer" | "bomber" | "armored"
  | "priest" | "mender" | "herald" | "anchor" | "wraith" | "chimera";

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
): EnemyKind {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive integer");
  if (campaignPool !== null && campaignPool.length > 0) {
    const localWave = (wave - 1) % 10 + 1;
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
  return BOSS_ROSTER.find((boss) => boss.id === id)?.name ?? "";
}
