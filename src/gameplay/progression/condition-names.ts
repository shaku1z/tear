/**
 * The names a player reads for what an unlock condition refers to: a boss by its roster name, an
 * achievement by its catalog name, a stat key in words. One source for every screen that explains a
 * condition (the Shop's SHARDS tab today; music unlocks and collections later).
 */
import type { ConditionNames } from "../../domain/unlock-condition";
import { AUTHORED_BOSS_ROSTER } from "../run/content-director";
import { ACHIEVEMENT_CATALOG } from "./achievement-catalog";

/** `bossKills` to `boss kills`, `encounterEnemy:charger` to `encounter enemy charger`. */
export function statWords(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_:]+/gu, " ")
    .toLowerCase()
    .trim();
}

export const CONDITION_NAMES: ConditionNames = Object.freeze({
  boss: (bossId: string) => AUTHORED_BOSS_ROSTER.find((boss) => boss.id === bossId)?.name ?? bossId,
  achievement: (id: string) => ACHIEVEMENT_CATALOG.find((entry) => entry.id === id)?.name ?? id,
  stat: statWords,
});
