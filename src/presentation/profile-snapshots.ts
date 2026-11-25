import { bossKillStat } from "../domain/progress-facts";
import type { ProfileScreenView, ReplayView, StatView } from "./screens/contracts";
import type { CosmeticStyles } from "./cosmetic-styles";

export interface ModeViewSource {
  readonly id: string;
  readonly label: string;
  readonly training?: boolean;
  readonly debug?: boolean;
}
export interface DifficultyViewSource {
  readonly id: string;
  readonly label: string;
}
export interface BestScoreViewSource {
  readonly wave: number;
  readonly score: number;
  readonly time?: number;
}
export interface ProfileRecordSource {
  readonly mode: ModeViewSource;
  readonly difficulty: DifficultyViewSource;
  readonly best: BestScoreViewSource;
}

export function buildProfileRecords(
  modes: readonly ModeViewSource[],
  difficulties: readonly DifficultyViewSource[],
  getBest: (mode: string, difficulty: string) => BestScoreViewSource,
): readonly ProfileRecordSource[] {
  return modes
    .flatMap((mode) =>
      difficulties.flatMap((difficulty) => {
        const best = getBest(mode.id, difficulty.id);
        return best.wave || best.score ? [{ mode, difficulty, best }] : [];
      }),
    )
    .sort((left, right) => right.best.wave - left.best.wave || right.best.score - left.best.score);
}

export interface ProfileStatColors {
  readonly danger: string;
  readonly cyan: string;
  readonly green: string;
  readonly gold: string;
}
export function buildProfileStats(
  stat: (key: string) => number,
  enterAmount: number,
  colors: ProfileStatColors,
  formatTime: (value: number) => string,
): readonly StatView[] {
  const definitions: readonly (readonly [string, string, string, string, ((value: number) => string)?])[] = [
    ["kills", "ENEMIES FELLED", "⚔", colors.danger],
    ["bossKills", "BOSSES FELLED", "☠", colors.danger],
    ["parries", "PERFECT PARRIES", "✦", colors.cyan],
    ["deflects", "DEFLECTS", "↩", colors.cyan],
    ["superslams", "POWER SLAMS", "⇊", colors.danger],
    ["updrafts", "UPDRAFTS", "⇈", colors.cyan],
    ["runs", "RUNS", "▶", colors.green],
    ["bestWave", "BEST WAVE", "▲", colors.green],
    ["longestRun", "LONGEST RUN", "◴", colors.green, formatTime],
    ["maxDamageHit", "BIGGEST HIT", "✸", colors.danger, (value) => String(Math.round(value))],
    ["coinsEarned", "COINS EARNED", "◆", colors.gold],
    ["noHitWaves", "NO-HIT WAVES", "⬡", colors.gold],
  ];
  const countUp = Math.max(0, Math.min(1, enterAmount));
  return definitions.map(([key, label, glyph, accent, format]) => {
    const raw = stat(key);
    return Object.freeze({
      label,
      glyph,
      accent,
      value: format?.(raw) ?? Math.round(raw * countUp).toLocaleString("en-US"),
    });
  });
}

/** Difficulty ids as players read them ("onehit" -> "ONE-HIT"). */
export function difficultyLabel(id: string): string {
  return id === "onehit" ? "ONE-HIT" : id.toUpperCase();
}

/** A REPLAYS list row as the list builds it (src/app/replay/replay-list.ts). */
export interface ReplayRowSource {
  readonly id: string;
  /** Wall-clock milliseconds. */
  readonly recordedAt: number;
  readonly mode?: string;
  readonly difficulty?: string;
  readonly score?: number;
  readonly wave?: number;
  /** Run time in seconds. */
  readonly time?: number;
  readonly victory: boolean;
  readonly pinned: boolean;
  readonly shared: boolean;
  readonly best: boolean;
  readonly playable: boolean;
}

/** The REPLAYS rows: what ran, how it went, when, and which actions the run offers. */
export function buildReplayRows(
  items: readonly ReplayRowSource[],
  modes: readonly ModeViewSource[],
  formatTime: (seconds: number) => string,
): readonly ReplayView[] {
  return items.map((item) => {
    const mode = modes.find((entry) => entry.id === item.mode);
    const title = [
      mode?.label ?? item.mode ?? "Run",
      item.difficulty === undefined ? "" : difficultyLabel(item.difficulty),
    ]
      .filter(Boolean)
      .join(" · ")
      .toUpperCase();
    const detail = [
      item.wave === undefined ? "" : "wave " + String(item.wave),
      item.score === undefined ? "" : item.score.toLocaleString("en-US") + " pts",
      item.time === undefined ? "" : formatTime(item.time),
      item.victory ? "★ victory" : "",
    ].filter(Boolean);
    const timestamp = [
      new Date(item.recordedAt).toLocaleDateString(),
      item.best ? "★ BEST" : "",
      item.shared ? "SHARED" : "",
      item.playable ? "" : "Made by an earlier version of the game",
    ].filter(Boolean);
    return Object.freeze({
      id: item.id,
      title,
      detail: detail.length > 0 ? detail.join(" · ") : "This replay couldn't be read",
      available: item.playable,
      local: true,
      pinned: item.pinned,
      shared: item.shared,
      canShare: item.playable && !item.shared,
      canDownload: item.playable,
      timestamp: timestamp.join(" · "),
    });
  });
}

export interface LeaderboardRowSource {
  readonly replayId?: string;
  readonly shareId?: string;
  readonly name?: string;
  readonly uid?: string;
  readonly mode?: string;
  readonly diff?: string;
  readonly wave?: number;
  readonly score?: number;
  readonly time?: number;
  readonly lb?: boolean;
  readonly won?: boolean;
  readonly createdAt?: string | number | Date;
}
export function buildLeaderboardRow(
  row: LeaderboardRowSource,
  modes: readonly ModeViewSource[],
  currentUserId: string | undefined,
  formatTime: (seconds: number) => string,
  fallbackId?: string,
): ReplayView {
  const mode = modes.find((entry) => entry.id === row.mode),
    id = row.replayId ?? row.shareId ?? fallbackId ?? "unavailable";
  const mine = row.uid !== undefined && row.uid === currentUserId;
  return Object.freeze({
    id,
    title:
      row.mode !== undefined
        ? (row.name ?? "Player") +
          " — " +
          ((mode?.label ?? row.mode) + (row.diff ? " · " + difficultyLabel(row.diff) : "")).toUpperCase()
        : (row.name ?? "Player") + (mine ? " (you)" : ""),
    detail:
      row.mode !== undefined
        ? "wave " +
          String(row.wave ?? 0) +
          " · " +
          (row.score ?? 0).toLocaleString("en-US") +
          " pts" +
          (row.won ? " · ★ victory" : "")
        : "wave " +
          String(row.wave ?? 0) +
          " · " +
          formatTime(row.time ?? 0) +
          " · " +
          (row.score ?? 0).toLocaleString("en-US") +
          " pts",
    available: row.replayId !== undefined || row.shareId !== undefined || fallbackId !== undefined,
    mine,
    wave: String(row.wave ?? 0),
    time: formatTime(row.time ?? 0),
    score: (row.score ?? 0).toLocaleString("en-US"),
    ...(row.lb ? { badge: "LEADERBOARD RUN" } : {}),
    ...(row.createdAt === undefined
      ? {}
      : { timestamp: new Date(row.createdAt).toLocaleDateString() + (row.lb ? " · LEADERBOARD RUN" : "") }),
  });
}

export interface ProfileAchievementSource {
  readonly id: string;
  readonly cat: string;
  readonly rarity: string;
}
export interface ProfileStageSource {
  readonly id?: string;
  readonly name: string;
}
export interface ProfileBossSource {
  readonly id: string;
  readonly name: string;
}
export interface ProfileSnapshotResult {
  readonly view: ProfileScreenView;
  readonly maximumScroll: number;
}
/** The worn parts of the passport's look, or nothing when the player wears neither. */
function passportLook({ title, banner }: Pick<CosmeticStyles, "title" | "banner">) {
  if (!title.worn && !banner.worn) return {};
  return {
    look: {
      ...(title.worn ? { title: title.text } : {}),
      ...(banner.worn ? { banner: { colors: banner.colors, pattern: banner.pattern } } : {}),
    },
  };
}

export function buildProfileSnapshot(input: {
  /** The title and banner the player wears (the resolver's styles for their loadout). */
  readonly cosmetics: Pick<CosmeticStyles, "title" | "banner">;
  readonly tab: string;
  readonly tabs: readonly (readonly [string, string])[];
  readonly signedIn: boolean;
  readonly firebase: boolean;
  readonly canSignIn: boolean;
  readonly canRename: boolean;
  readonly hasCustomName: boolean;
  readonly renameCooldownDays: number;
  readonly authRetryPrompt: boolean;
  readonly signInLabel: string;
  readonly username: string;
  readonly displayName: string;
  readonly coins: number;
  readonly shards: number;
  readonly unlockedCount: number;
  readonly totalAchievements: number;
  readonly records: readonly ProfileRecordSource[];
  readonly replays: readonly ReplayView[];
  readonly stats: readonly StatView[];
  readonly message: string;
  readonly height: number;
  readonly scroll: number;
  readonly achievements: readonly ProfileAchievementSource[];
  /** REPLAYS only: the toolbar (filters and import) height above the list. */
  readonly replayListInset?: number;
  /** REPLAYS only: the list filters as [id, label], the chosen filter, and the list's state. */
  readonly replayFilters?: readonly (readonly [string, string])[];
  readonly replayFilter?: string;
  readonly replayList?: "opening" | "failed";
  readonly canImport?: boolean;
  /** REPLAYS only: recordings made before this update that the save still holds. */
  readonly earlierReplays?: number;
  readonly unlocked: (id: string) => boolean;
  readonly categoryIcon: (category: string) => string;
  readonly rarityColor: (rarity: string) => string;
  readonly stages: readonly ProfileStageSource[];
  readonly bosses: readonly ProfileBossSource[];
  readonly stat: (key: string) => number;
  readonly formatTime: (seconds: number) => string;
  readonly difficultyAccent: (difficultyId: string) => string;
}): ProfileSnapshotResult {
  // Visible list height: page body bottom (height - 110) minus the content top (306),
  // a possible notice line (24) and the REPLAYS toolbar inset.
  const maximumScroll = Math.max(0, input.replays.length * 96 - (input.height - 440 - (input.replayListInset ?? 0)));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  const rarityRank: Readonly<Record<string, number>> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
  const showcases = input.achievements
    .filter((entry) => input.unlocked(entry.id))
    .sort((left, right) => (rarityRank[left.rarity] ?? 5) - (rarityRank[right.rarity] ?? 5))
    .slice(0, 3)
    .map((entry) => ({ glyph: input.categoryIcon(entry.cat), color: input.rarityColor(entry.rarity) }));
  const lockedName = input.signedIn && !input.canRename,
    top = input.records[0];
  const view: ProfileScreenView = {
    id: "profile",
    tab: input.tab,
    tabs: input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab })),
    name: input.username || (input.signedIn ? input.displayName : "GUEST"),
    signedIn: input.signedIn,
    cloudStatus: input.signedIn
      ? "Signed in — progress synced"
      : input.canSignIn
        ? "Guest — sign in to keep progress everywhere"
        : "Progress saved on this device",
    message: input.message,
    stats: input.tab === "stats" ? input.stats : [],
    replays: input.replays,
    ...(input.tab === "replays"
      ? {
          replayFilters: (input.replayFilters ?? []).map(([id, label]) => ({
            id,
            label,
            selected: id === input.replayFilter,
          })),
          canImport: input.canImport === true,
          ...((input.earlierReplays ?? 0) > 0 ? { earlierReplays: input.earlierReplays } : {}),
          ...(input.replayList === undefined ? {} : { replayList: input.replayList }),
        }
      : {}),
    canScrollUp: scroll > 0,
    canScrollDown: scroll < maximumScroll,
    passport: {
      coins: input.coins,
      shards: input.shards,
      achievements: String(input.unlockedCount) + " / " + String(input.totalAchievements),
      ...(input.signedIn
        ? {
            renameLabel: lockedName
              ? "NAME LOCKED · " + String(input.renameCooldownDays) + "d"
              : input.hasCustomName
                ? "CHANGE NAME"
                : "SET DISPLAY NAME",
          }
        : {}),
      canRename: input.signedIn && !lockedName,
      canSignIn: !input.signedIn && input.canSignIn,
      canSignOut: input.signedIn && input.firebase,
      ...(input.canSignIn
        ? { signInLabel: (input.authRetryPrompt ? "RETRY · " : "") + input.signInLabel.toUpperCase() }
        : {}),
      showcases,
      ...passportLook(input.cosmetics),
    },
    ...(input.tab === "bests" && top !== undefined
      ? {
          finest: {
            headline: "WAVE " + String(top.best.wave) + " · " + top.best.score.toLocaleString("en-US") + " PTS",
            detail:
              "YOUR FINEST — " +
              (top.mode.label + " · " + top.difficulty.label).toUpperCase() +
              " · " +
              input.formatTime(top.best.time ?? 0),
          },
        }
      : {}),
    ...(input.tab === "bests"
      ? {
          records: input.records.slice(0, 10).map(({ mode, difficulty, best }) => ({
            mode: mode.label,
            difficulty: difficulty.label,
            wave: String(best.wave),
            time: input.formatTime(best.time ?? 0),
            score: best.score.toLocaleString("en-US"),
            accent: input.difficultyAccent(difficulty.id),
          })),
        }
      : {}),
    ...(input.tab === "stats"
      ? {
          journey: {
            biomes: input.stages.map((stage, index) => ({
              id: stage.id ?? String(index),
              label: stage.name,
              selected: index < input.stat("biomesSeen"),
            })),
            bosses: input.bosses.map((boss) => ({
              id: boss.id,
              label: boss.name,
              selected: input.stat(bossKillStat(boss.id)) > 0,
            })),
          },
        }
      : {}),
    ...(input.tab === "bests" && input.records.length === 0
      ? { emptyMessage: "No runs recorded yet — go make some history." }
      : {}),
    ...(input.tab === "replays" && input.replays.length === 0
      ? { emptyMessage: "No runs recorded yet — every real run lands here automatically." }
      : {}),
  };
  return Object.freeze({ view: Object.freeze(view), maximumScroll });
}
