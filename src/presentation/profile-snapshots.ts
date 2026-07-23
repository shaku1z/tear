import type { ProfileScreenView, ReplayView, StatView } from "./screens/contracts";

export interface ModeViewSource { readonly id: string; readonly label: string; readonly training?: boolean; readonly debug?: boolean }
export interface DifficultyViewSource { readonly id: string; readonly label: string }
export interface BestScoreViewSource { readonly wave: number; readonly score: number; readonly time?: number }
export interface ProfileRecordSource { readonly mode: ModeViewSource; readonly difficulty: DifficultyViewSource; readonly best: BestScoreViewSource }

export function buildProfileRecords(modes: readonly ModeViewSource[], difficulties: readonly DifficultyViewSource[],
  getBest: (mode: string, difficulty: string) => BestScoreViewSource): readonly ProfileRecordSource[] {
  return modes.flatMap((mode) => difficulties.flatMap((difficulty) => {
    const best = getBest(mode.id, difficulty.id);
    return best.wave || best.score ? [{ mode, difficulty, best }] : [];
  })).sort((left, right) => right.best.wave - left.best.wave || right.best.score - left.best.score);
}

export interface ProfileStatColors { readonly danger: string; readonly cyan: string; readonly green: string; readonly gold: string }
export function buildProfileStats(stat: (key: string) => number, enterAmount: number,
  colors: ProfileStatColors, formatTime: (value: number) => string): readonly StatView[] {
  const definitions: readonly (readonly [string, string, string, string, ((value: number) => string)?])[] = [
    ["kills", "ENEMIES FELLED", "⚔", colors.danger], ["bossKills", "BOSSES FELLED", "☠", colors.danger],
    ["parries", "PERFECT PARRIES", "✦", colors.cyan], ["deflects", "DEFLECTS", "↩", colors.cyan],
    ["superslams", "POWER SLAMS", "⇊", colors.danger], ["updrafts", "UPDRAFTS", "⇈", colors.cyan],
    ["runs", "RUNS", "▶", colors.green], ["bestWave", "BEST WAVE", "▲", colors.green],
    ["longestRun", "LONGEST RUN", "◴", colors.green, formatTime],
    ["maxDamageHit", "BIGGEST HIT", "✸", colors.danger, (value) => String(Math.round(value))],
    ["coinsEarned", "COINS EARNED", "◆", colors.gold], ["noHitWaves", "NO-HIT WAVES", "⬡", colors.gold],
  ];
  const countUp = Math.max(0, Math.min(1, enterAmount));
  return definitions.map(([key, label, glyph, accent, format]) => {
    const raw = stat(key);
    return Object.freeze({ label, glyph, accent, value: format?.(raw) ?? Math.round(raw * countUp).toLocaleString() });
  });
}

export interface ReplayIndexSource {
  readonly id: string; readonly ts: number; readonly pin?: boolean; readonly shareId?: string;
  readonly sum?: Readonly<{ name?: string; mode?: string; diff?: string; wave?: number; score?: number; won?: boolean; thumb?: string }>;
}
export function buildProfileReplays(entries: readonly ReplayIndexSource[], modes: readonly ModeViewSource[]): readonly ReplayView[] {
  return entries.map((entry) => {
    const summary = entry.sum ?? {}, mode = modes.find((item) => item.id === summary.mode);
    return Object.freeze({ id: entry.id,
      title: (summary.name ?? "You") + " — " + (mode?.label ?? summary.mode ?? "Run") + " · " + (summary.diff ?? ""),
      detail: "wave " + String(summary.wave ?? 0) + " · " + String(summary.score ?? 0) + " pts" + (summary.won ? " · ★ victory" : ""),
      available: true, local: true, pinned: entry.pin === true, shared: entry.shareId !== undefined,
      ...(summary.thumb === undefined ? {} : { thumbnailId: summary.thumb }),
      timestamp: new Date(entry.ts).toLocaleDateString() + (entry.shareId === undefined ? "" : " · PUBLISHED") });
  });
}

export interface LeaderboardRowSource {
  readonly replayId?: string; readonly shareId?: string; readonly name?: string; readonly uid?: string;
  readonly mode?: string; readonly diff?: string; readonly wave?: number; readonly score?: number; readonly time?: number;
  readonly thumb?: string; readonly lb?: boolean; readonly won?: boolean; readonly createdAt?: string | number | Date;
}
export function buildLeaderboardRow(row: LeaderboardRowSource, modes: readonly ModeViewSource[],
  currentUserId: string | undefined, formatTime: (seconds: number) => string, fallbackId?: string): ReplayView {
  const mode = modes.find((entry) => entry.id === row.mode), id = row.replayId ?? row.shareId ?? fallbackId ?? "unavailable";
  const mine = row.uid !== undefined && row.uid === currentUserId;
  return Object.freeze({ id, title: row.mode !== undefined
      ? (row.name ?? "Player") + " — " + (mode?.label ?? row.mode) + " · " + (row.diff ?? "")
      : (row.name ?? "Player") + (mine ? " (you)" : ""),
    detail: row.mode !== undefined
      ? "wave " + String(row.wave ?? 0) + " · " + (row.score ?? 0).toLocaleString() + " pts" + (row.won ? " · ★ victory" : "")
      : "wave " + String(row.wave ?? 0) + " · " + formatTime(row.time ?? 0) + " · " + (row.score ?? 0).toLocaleString() + " pts",
    available: row.replayId !== undefined || row.shareId !== undefined || fallbackId !== undefined, mine,
    wave: String(row.wave ?? 0), time: formatTime(row.time ?? 0), score: (row.score ?? 0).toLocaleString(),
    ...(row.thumb === undefined ? {} : { thumbnailId: row.thumb }),
    ...(row.lb ? { badge: "LEADERBOARD RUN" } : {}),
    ...(row.createdAt === undefined ? {} : { timestamp: new Date(row.createdAt).toLocaleDateString()
      + (row.lb ? " · LEADERBOARD RUN" : "") }) });
}

export interface ProfileAchievementSource { readonly id: string; readonly cat: string; readonly rarity: string }
export interface ProfileStageSource { readonly id?: string; readonly name: string }
export interface ProfileBossSource { readonly id: string; readonly name: string }
export interface ProfileSnapshotResult { readonly view: ProfileScreenView; readonly maximumScroll: number }
export function buildProfileSnapshot(input: {
  readonly tab: string; readonly tabs: readonly (readonly [string, string])[]; readonly signedIn: boolean; readonly firebase: boolean;
  readonly canSignIn: boolean; readonly canRename: boolean; readonly hasCustomName: boolean; readonly renameCooldownDays: number;
  readonly authRetryPrompt: boolean; readonly signInLabel: string; readonly username: string; readonly displayName: string;
  readonly coins: number; readonly shards: number; readonly unlockedCount: number; readonly totalAchievements: number;
  readonly records: readonly ProfileRecordSource[]; readonly replays: readonly ReplayView[]; readonly stats: readonly StatView[];
  readonly message: string; readonly height: number; readonly scroll: number; readonly achievements: readonly ProfileAchievementSource[];
  readonly unlocked: (id: string) => boolean; readonly categoryIcon: (category: string) => string;
  readonly rarityColor: (rarity: string) => string; readonly stages: readonly ProfileStageSource[]; readonly bosses: readonly ProfileBossSource[];
  readonly stat: (key: string) => number; readonly formatTime: (seconds: number) => string;
  readonly difficultyAccent: (difficultyId: string) => string;
}): ProfileSnapshotResult {
  const maximumScroll = Math.max(0, input.replays.length * 96 - (input.height - 432));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  const rarityRank: Readonly<Record<string, number>> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
  const showcases = input.achievements.filter((entry) => input.unlocked(entry.id))
    .sort((left, right) => (rarityRank[left.rarity] ?? 5) - (rarityRank[right.rarity] ?? 5)).slice(0, 3)
    .map((entry) => ({ glyph: input.categoryIcon(entry.cat), color: input.rarityColor(entry.rarity) }));
  const lockedName = input.signedIn && !input.canRename, top = input.records[0];
  const view: ProfileScreenView = { id: "profile", tab: input.tab,
    tabs: input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab })),
    name: input.username || (input.signedIn ? input.displayName : "GUEST"), signedIn: input.signedIn,
    cloudStatus: input.signedIn ? "Signed in — progress synced to the cloud"
      : (input.canSignIn ? "Playing as a guest — sign in to keep your progress everywhere" : "Progress saved on this device"),
    message: input.message, stats: input.tab === "stats" ? input.stats : [], replays: input.replays,
    canScrollUp: scroll > 0, canScrollDown: scroll < maximumScroll,
    passport: { coins: input.coins, shards: input.shards, achievements: String(input.unlockedCount) + " / " + String(input.totalAchievements),
      ...(input.signedIn ? { renameLabel: lockedName ? "NAME LOCKED · " + String(input.renameCooldownDays) + "d"
        : (input.hasCustomName ? "CHANGE NAME" : "SET DISPLAY NAME") } : {}),
      canRename: input.signedIn && !lockedName, canSignIn: !input.signedIn && input.canSignIn,
      canSignOut: input.signedIn && input.firebase,
      ...(input.canSignIn ? { signInLabel: (input.authRetryPrompt ? "RETRY · " : "") + input.signInLabel.toUpperCase() } : {}), showcases },
    ...(input.tab === "bests" && top !== undefined ? { finest: { headline: "WAVE " + String(top.best.wave) + " · " + top.best.score.toLocaleString() + " PTS",
      detail: "YOUR FINEST — " + (top.mode.label + " · " + top.difficulty.label).toUpperCase() + " · " + input.formatTime(top.best.time ?? 0) } } : {}),
    ...(input.tab === "bests" ? { records: input.records.slice(0, 10).map(({ mode, difficulty, best }) => ({
      mode: mode.label, difficulty: difficulty.label, wave: String(best.wave), time: input.formatTime(best.time ?? 0),
      score: best.score.toLocaleString(), accent: input.difficultyAccent(difficulty.id) })) } : {}),
    ...(input.tab === "stats" ? { journey: {
      biomes: input.stages.map((stage, index) => ({ id: stage.id ?? String(index), label: stage.name, selected: index < input.stat("biomesSeen") })),
      bosses: input.bosses.map((boss) => ({ id: boss.id, label: boss.name,
        selected: input.stat("kill" + boss.id.charAt(0).toUpperCase() + boss.id.slice(1)) > 0 })) } } : {}),
    ...(input.tab === "bests" && input.records.length === 0 ? { emptyMessage: "No runs recorded yet — go make some history." } : {}),
    ...(input.tab === "replays" && input.replays.length === 0 ? { emptyMessage: "No runs recorded yet — every real run lands here automatically." } : {}) };
  return Object.freeze({ view: Object.freeze(view), maximumScroll });
}
