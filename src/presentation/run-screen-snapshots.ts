import type { CardView, DraftCardView, GameoverScreenView, PausedScreenView, ProgressView, ResultLogView, WinScreenView } from "./screens/contracts";

export interface UpgradePresentationSource {
  readonly id: string; readonly name: string; readonly desc: string; readonly cat: string;
  readonly unique?: boolean; readonly tiers?: readonly Readonly<{ desc: string }>[];
}
export interface UpgradeCategoryPresentation { readonly name: string; readonly color: string }
export interface UpgradePresentationState {
  readonly owned: Readonly<Record<string, number>>; readonly tier: Readonly<Record<string, number>>;
}
export interface ResultLogSource {
  readonly wave: string | number; readonly time?: number; readonly kills?: number;
  readonly peak?: number; readonly died?: boolean;
}

export function fortuneDraftDescription(owned: number): string {
  const next = Math.min(5, owned + 1);
  const multiplier = 1 + 0.12 * next + (next >= 3 ? 0.25 : 0) + (next >= 5 ? 0.35 : 0);
  if (next < 3) return "+12% final coins. PROSPERITY unlocks at 3 stacks (×1.61).";
  if (next === 3) return `+12% final coins and unlock PROSPERITY: ×${multiplier.toFixed(2)} total coins.`;
  if (next < 5) return "+12% final coins. JACKPOT unlocks at 5 stacks (×2.20).";
  return `+12% final coins and unlock JACKPOT: ×${multiplier.toFixed(2)} total coins.`;
}

export function buildDraftCard(
  upgrade: UpgradePresentationSource, state: UpgradePresentationState,
  categories: Readonly<Record<string, UpgradeCategoryPresentation>>, fallback: UpgradeCategoryPresentation,
  badge: string | Readonly<{ label: string; color: string }>, specialColor: string,
): DraftCardView {
  const category = categories[upgrade.cat] ?? fallback;
  const owned = state.owned[upgrade.id] ?? 0;
  const badgeLabel = typeof badge === "string" ? badge : badge.label;
  return Object.freeze({ id: upgrade.id, label: upgrade.name,
    description: upgrade.id === "fortune" ? fortuneDraftDescription(owned) : upgrade.desc,
    owned, badge: badgeLabel, category: category.name,
    accent: upgrade.tiers === undefined ? category.color : specialColor,
    ...(typeof badge === "string" ? {} : { badgeColor: badge.color }) });
}

export function buildAbilityCards(
  upgrades: readonly UpgradePresentationSource[], state: UpgradePresentationState,
  categories: Readonly<Record<string, UpgradeCategoryPresentation>>, fallback: UpgradeCategoryPresentation,
  categoryOrder: readonly string[], specialColor: string,
): readonly CardView[] {
  return upgrades.filter((upgrade) => (state.owned[upgrade.id] ?? 0) > 0)
    .sort((left, right) => Number(right.tiers !== undefined) - Number(left.tiers !== undefined) ||
      categoryOrder.indexOf(left.cat) - categoryOrder.indexOf(right.cat))
    .map((upgrade) => {
      const category = categories[upgrade.cat] ?? fallback;
      const tiers = upgrade.tiers;
      const special = tiers !== undefined, tier = state.tier[upgrade.id] ?? 1;
      const owned = state.owned[upgrade.id] ?? 1;
      const base = { id: upgrade.id, label: upgrade.name,
        description: tiers !== undefined && tier > 1 ? (tiers[tier - 2]?.desc ?? upgrade.desc) : upgrade.desc,
        accent: special ? specialColor : category.color };
      return special
        ? Object.freeze({ ...base, tier, footer: "TIER " + String(tier) + " / " + String(tiers.length + 1) })
        : Object.freeze({ ...base, owned, footer: upgrade.unique ? "UNIQUE" : "\u00d7" + String(owned) });
    });
}

export function buildResultLog(log: readonly ResultLogSource[]): readonly ResultLogView[] {
  return log.map((entry) => Object.freeze({ wave: String(entry.wave), time: (entry.time ?? 0).toFixed(1) + "s",
    kills: entry.kills ?? 0, peak: "\u00d7" + String(entry.peak ?? 1), died: entry.died === true }));
}

export function buildTierCards(upgrades: readonly UpgradePresentationSource[], state: UpgradePresentationState,
  categories: Readonly<Record<string, UpgradeCategoryPresentation>>, fallback: UpgradeCategoryPresentation,
  nextDescription: (upgrade: UpgradePresentationSource) => string): readonly DraftCardView[] {
  return upgrades.map((upgrade) => {
    const category = categories[upgrade.cat] ?? fallback, next = (state.tier[upgrade.id] ?? 1) + 1;
    return Object.freeze({ id: upgrade.id, label: upgrade.name, description: nextDescription(upgrade),
      category: category.name, accent: category.color, tier: next - 1, nextTier: next });
  });
}

export interface ProgressSource { readonly label: string; readonly current: number; readonly goal: number;
  readonly done: boolean; readonly reward?: string; readonly detail?: string }
export function buildRunProgressRows(dailies: readonly ProgressSource[], earned: readonly ProgressSource[],
  locked: readonly ProgressSource[]): readonly ProgressView[] {
  return [...dailies, ...earned, ...locked].slice(0, dailies.length + 5).map((row) => Object.freeze({
    label: row.label, current: row.current, goal: row.goal, done: row.done,
    ...(row.detail === undefined ? {} : { detail: row.detail }) }));
}

export interface AchievementProgressSource { readonly id: string; readonly name: string }
export function buildRunProgressSnapshot(input: {
  readonly dailies: readonly ProgressSource[];
  readonly achievementIds: readonly string[]; readonly runAchievementIds: readonly string[];
  readonly achievements: readonly AchievementProgressSource[];
  readonly byId: (id: string) => AchievementProgressSource | undefined;
  readonly unlocked: (id: string) => boolean; readonly progress: (achievement: AchievementProgressSource) => number;
  readonly progressText: (achievement: AchievementProgressSource) => string;
  readonly shardsFor: (achievement: AchievementProgressSource) => number;
  readonly coinsFor: (achievement: AchievementProgressSource) => number;
}): readonly ProgressView[] {
  const earned = input.achievementIds.filter((id) => !input.runAchievementIds.includes(id))
    .flatMap((id) => { const achievement = input.byId(id); return achievement === undefined ? [] : [achievement]; });
  const locked = input.achievements.filter((achievement) => !input.unlocked(achievement.id))
    .sort((left, right) => input.progress(right) - input.progress(left));
  const project = (achievement: AchievementProgressSource, isEarned: boolean): ProgressSource => ({
    label: (isEarned ? "✓ " : "") + achievement.name, current: input.progress(achievement), goal: 1, done: isEarned,
    detail: isEarned ? `◆ +${String(input.shardsFor(achievement))}  +${String(input.coinsFor(achievement))}c` : input.progressText(achievement),
  });
  return buildRunProgressRows(input.dailies, earned.map((entry) => project(entry, true)), locked.map((entry) => project(entry, false)));
}

export function buildPausedSnapshot(input: { readonly summary?: string; readonly abilities: readonly CardView[];
  readonly progress: readonly ProgressView[] }): PausedScreenView {
  return Object.freeze({ id: "paused", ...(input.summary === undefined ? {} : { runSummary: input.summary }),
    abilities: input.abilities, progress: input.progress });
}

export function buildGameoverSnapshot(input: {
  readonly wave: number; readonly score: number; readonly time: number; readonly isNew: boolean;
  readonly best?: Readonly<{ wave: number; score: number }>; readonly earned: number; readonly coins: number;
  readonly replayAvailable: boolean; readonly abilities: readonly CardView[]; readonly progress: readonly ProgressView[];
  readonly log: readonly ResultLogView[]; readonly formatTime: (seconds: number) => string;
}): GameoverScreenView {
  return Object.freeze({ id: "gameover", summary: `wave ${String(input.wave)}   ·   ${String(input.score)} pts   ·   ${input.formatTime(input.time)}`,
    isNew: input.isNew, ...(input.best === undefined ? {} : { best: `best: wave ${String(input.best.wave)} · ${String(input.best.score)} pts` }),
    earned: input.earned, coins: input.coins, replayAvailable: input.replayAvailable,
    abilities: input.abilities, progress: input.progress, log: input.log });
}

export function buildWinSnapshot(input: {
  readonly campaign: boolean; readonly score: number; readonly time: number; readonly isNew: boolean;
  readonly earned: number; readonly coins: number; readonly difficulty: string; readonly log: readonly ResultLogView[];
  readonly formatTime: (seconds: number) => string;
}): WinScreenView {
  return Object.freeze({ id: "win", campaign: input.campaign, score: input.score, time: input.formatTime(input.time),
    isNew: input.isNew, earned: input.earned, coins: input.coins, difficulty: input.difficulty, log: input.log });
}
