import type { AchievementsScreenView, DailyChallengeView } from "./screens/contracts";

export interface AchievementSource {
  readonly id: string; readonly name: string; readonly desc: string; readonly cat: string; readonly rarity: string;
}
export interface AchievementCategorySource { readonly name: string; readonly icon?: string }
export interface AchievementRaritySource { readonly name: string; readonly color: string }
export interface AchievementSnapshotResult { readonly view: AchievementsScreenView; readonly maximumScroll: number }

export function buildAchievementSnapshot(input: {
  readonly achievements: readonly AchievementSource[]; readonly filter: string;
  readonly categories: Readonly<Record<string, AchievementCategorySource>>;
  readonly rarities: Readonly<Record<string, AchievementRaritySource>>; readonly commonRarity: AchievementRaritySource;
  readonly unlocked: (id: string) => boolean; readonly progress: (achievement: AchievementSource) => number;
  readonly progressText: (achievement: AchievementSource) => string; readonly shardsFor: (achievement: AchievementSource) => number;
  readonly coinsFor: (achievement: AchievementSource) => number; readonly unlockedCount: number; readonly shards: number;
  readonly resetsIn: string; readonly dailies: readonly DailyChallengeView[]; readonly height: number; readonly scroll: number;
  readonly time: number; readonly mutedColor: string;
}): AchievementSnapshotResult {
  const all = input.achievements, list = input.filter === "all" ? all : all.filter((entry) => entry.cat === input.filter);
  const maximumScroll = Math.max(0, Math.ceil(list.length / 2) * 124 - (input.height - 382 - 130));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  const categories = ["all", ...Object.keys(input.categories)].map((id) => {
    const members = id === "all" ? all : all.filter((entry) => entry.cat === id);
    return { id, label: (id === "all" ? "ALL" : (input.categories[id]?.name ?? id).toUpperCase()) + "  " +
      String(members.filter((entry) => input.unlocked(entry.id)).length) + "/" + String(members.length), selected: id === input.filter };
  });
  const nextUp = all.filter((entry) => !input.unlocked(entry.id)).sort((left, right) => input.progress(right) - input.progress(left))
    .slice(0, 2).map((entry) => entry.name + "  " + input.progressText(entry)).join(" · ");
  const view: AchievementsScreenView = { id: "achievements", category: input.filter, categories,
    unlocked: input.unlockedCount, total: all.length, shards: input.shards, resetsIn: input.resetsIn, dailies: input.dailies, nextUp,
    cards: list.map((entry) => {
      const rarity = input.rarities[entry.rarity] ?? input.commonRarity, category = input.categories[entry.cat];
      const unlocked = input.unlocked(entry.id);
      return { id: entry.id, label: entry.name, description: entry.desc,
        ...(category === undefined ? {} : { category: category.name }),
        ...(category?.icon === undefined ? {} : { glyph: category.icon }),
        badge: rarity.name, locked: !unlocked, progress: input.progress(entry),
        progressLabel: unlocked ? "UNLOCKED" : input.progressText(entry),
        rewardPrimary: "◆ " + String(input.shardsFor(entry)) + " SHARDS", rewardSecondary: "◆ " + String(input.coinsFor(entry)) + " COINS",
        rarity: entry.rarity, accent: unlocked ? rarity.color : input.mutedColor,
        ...(unlocked && entry.rarity === "legendary" ? { shimmer: (input.time * 0.35) % 1 } : {}),
        ...(unlocked ? { footer: "EARNED" } : {}) };
    }), canScrollUp: scroll > 0, canScrollDown: scroll < maximumScroll };
  return Object.freeze({ view: Object.freeze(view), maximumScroll });
}
