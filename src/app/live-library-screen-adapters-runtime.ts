import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import { BOSS_ROSTER } from "../gameplay/run/content-director";
import {
  ABILITY_CATEGORY_ORDER, CODEX_TABS, SPECIAL_ABILITY_COLOR, abilityBadge,
  buildBestiaryView, buildCodexAbilityCards, buildCodexGuide, buildCodexScreenSnapshot,
} from "../presentation/codex-snapshots";
import { buildAchievementSnapshot } from "../presentation/achievement-snapshot";
import type { AchievementSource } from "../presentation/achievement-snapshot";
import { buildFeedLeaderboardSnapshot, buildRankedLeaderboardSnapshot } from "../presentation/leaderboard-snapshots";
import { buildLeaderboardRow, buildProfileRecords, buildProfileReplays, buildProfileSnapshot, buildProfileStats,
  type LeaderboardRowSource } from "../presentation/profile-snapshots";
import { ReplayLibraryController } from "./replay-library-controller";
import { renderReplayThumbnail } from "../presentation/replay-thumbnail";

type Dependencies = Pick<GameRuntimeDependencies, "ACH" | "Cloud" | "CONFIG" | "DAILY" | "FirebaseProvider" |
  "META" | "PROFILE" | "STAGES" | "UI" | "UPGRADES" | "VAULT">;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;
type Category = Readonly<{ name: string; color: string }>;

export interface LibraryScreenServices {
  readonly dependencies: Dependencies;
  readonly renderers: Renderers;
  readonly canvas: CanvasRenderingContext2D;
  readonly height: number;
  readonly time: () => number;
  readonly enterSeconds: () => number;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly stepTab: (tabs: readonly (readonly [string, string])[], current: string, changed: () => void) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly ease: (value: number) => number;
  readonly formatTime: (seconds: number) => string;
  readonly getBest: (mode: string, difficulty: string) => Readonly<{ wave: number; score: number; time?: number }>;
  readonly enterReplay: (record: unknown, from: string) => boolean;
}

export interface LibraryScreenAdapters {
  readonly categories: Readonly<Record<string, Category>>;
  readonly fallbackCategory: Category;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (upgrade: GameRuntimeDependencies["UPGRADES"][number]) => Readonly<{ label: string; color: string }>;
  readonly renderCodex: () => void;
  readonly renderProfile: () => void;
  readonly renderAchievements: () => void;
  readonly renderLeaderboards: () => void;
  readonly drawReplayPreview: (source: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
  readonly selectCodexTab: (id: string) => void;
  readonly selectCodexFilter: (id: string) => void;
  readonly cycleCodexSort: () => void;
  readonly inspectCodexAbility: (id: string) => void;
  readonly selectProfileTab: (id: string) => void;
  readonly setProfileMessage: (message: string) => void;
  readonly selectAchievementCategory: (id: string) => void;
  readonly selectLeaderboardTab: (id: string) => void;
  readonly selectLeaderboardBoard: (id: string) => void;
  readonly watchReplay: (id: string) => void;
  readonly publishReplay: (id: string) => void;
}

export function createLiveLibraryScreenAdaptersRuntime(services: LibraryScreenServices): LibraryScreenAdapters {
  const d = services.dependencies, colors = d.CONFIG.colors;
  const categories: Readonly<Record<string, Category>> = Object.freeze({
    offense: { name: "OFFENSE", color: colors.charger }, throw: { name: "THROW", color: colors.bomber },
    parry: { name: "PARRY", color: colors.perfect }, mobility: { name: "MOBILITY", color: colors.ranged },
    resilience: { name: "RESILIENCE", color: colors.deflected }, utility: { name: "UTILITY", color: colors.armored },
  });
  const fallbackCategory = categories.utility ?? { name: "UTILITY", color: colors.armored };
  const profileTabs = [["bests", "BESTS"], ["replays", "REPLAYS"], ["stats", "STATS"]] as const;
  const leaderboardTabs = [["global", "GLOBAL"], ["feed", "FEED"]] as const;
  const difficultyHeat: Readonly<Record<string, string | null>> = {
    easy: "#2f9e6b", normal: "#13c4d6", hard: "#e0a326", extreme: null, onehit: "#b06cff",
  };
  const replayThumbs: Record<string, HTMLImageElement> = {};
  let codexTab = "abilities", codexFilter = "all", codexSort = "category", bestiaryFilter = "all";
  const codexTierView: Record<string, number> = {};
  let profileTab = "bests", profileMessage = "", achievementFilter = "all";
  let leaderboardTab = "global", leaderboardMode = "", leaderboardDifficulty = "normal", leaderboardKey = "";
  let leaderboardData: readonly LeaderboardRowSource[] | null = null, leaderboardLoading = false, leaderboardMessage = "";
  let feedData: readonly LeaderboardRowSource[] | null = null, feedLoading = false;

  const replayLibrary = new ReplayLibraryController({ vault: d.VAULT, cloud: d.Cloud,
    enterReplay: (record, from) => services.enterReplay(record, from),
    setProfileMessage: (message) => { profileMessage = message; },
    setLeaderboardMessage: (message) => { leaderboardMessage = message; } });
  const rowView = (row: LeaderboardRowSource, fallbackId?: string) =>
    buildLeaderboardRow(row, d.CONFIG.modes, d.Cloud.user?.id, services.formatTime, fallbackId);

  const renderCodex = (): void => {
    codexTab = services.stepTab(CODEX_TABS, codexTab, () => { services.setScroll(0); });
    const bestiary = buildBestiaryView(bestiaryFilter,
      Object.fromEntries(Object.entries(categories).map(([id, category]) => [id, category.color])),
      d.UI.t.color.danger, d.UI.t.color.accent);
    const cards = buildCodexAbilityCards({ upgrades: d.UPGRADES, filter: codexFilter, sort: codexSort,
      tierView: codexTierView, categories, fallbackCategory, uniqueColor: d.UI.t.color.unique, mutedColor: d.UI.t.color.muted });
    const guide = codexTab === "guide" ? buildCodexGuide(d.CONFIG.trick.pts, d.CONFIG.trick.tiers) : undefined;
    const result = buildCodexScreenSnapshot({ tab: codexTab, filter: codexFilter, sort: codexSort,
      scroll: services.scroll(), tabs: CODEX_TABS, abilityCards: cards,
      abilityFilters: [["all", "ALL"], ...ABILITY_CATEGORY_ORDER.map((id) => [id, categories[id]?.name ?? id] as const)],
      bestiaryCards: bestiary.cards, bestiaryFilters: bestiary.filters, bestiaryFilter,
      ...(guide === undefined ? {} : { guide }) });
    services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll));
    services.renderers.codex(result.view);
  };
  const renderProfile = (): void => {
    profileTab = services.stepTab(profileTabs, profileTab, () => { services.setScroll(0); profileMessage = ""; });
    const signedIn = d.Cloud.loggedIn(), canSignIn = d.Cloud.canSignIn();
    const records = buildProfileRecords(d.CONFIG.modes, d.CONFIG.difficulties, services.getBest);
    const stats = profileTab === "stats" ? buildProfileStats((key) => d.PROFILE.stat(key),
      services.ease(services.clamp(services.enterSeconds() / 0.5, 0, 1)),
      { danger: d.UI.t.color.danger, cyan: "#13c4d6", green: "#2f9e6b", gold: "#e0a326" }, services.formatTime) : [];
    const result = buildProfileSnapshot({ tab: profileTab, tabs: profileTabs, signedIn,
      firebase: d.Cloud.provider === d.FirebaseProvider, canSignIn, canRename: signedIn && d.Cloud.canRename(),
      hasCustomName: signedIn && d.Cloud.hasCustomName(), renameCooldownDays: signedIn ? d.Cloud.renameCooldownDays() : 0,
      authRetryPrompt: canSignIn && d.Cloud.authRetryPrompt, signInLabel: canSignIn ? d.Cloud.signInLabel() : "",
      username: d.PROFILE.username(), displayName: signedIn ? d.Cloud.displayName() : "", coins: d.META.coins(),
      shards: d.PROFILE.shards(), unlockedCount: d.PROFILE.unlockedCount(), totalAchievements: d.ACH.list.length,
      records, replays: profileTab === "replays" ? buildProfileReplays(d.VAULT.index().map((entry) => ({
        id: entry.id, ts: entry.ts, pin: entry.pin, sum: entry.sum,
        ...(typeof entry.shareId === "string" ? { shareId: entry.shareId } : {}),
      })), d.CONFIG.modes) : [], stats,
      message: profileMessage, height: services.height, scroll: services.scroll(), achievements: d.ACH.list,
      unlocked: (id) => d.PROFILE.unlocked(id), categoryIcon: (category) => Object.entries(d.ACH.CATS).find(([id]) => id === category)?.[1].icon ?? "★",
      rarityColor: (rarity) => (Object.entries(d.ACH.RARITY).find(([id]) => id === rarity)?.[1] ?? d.ACH.RARITY.common).color, stages: d.STAGES, bosses: BOSS_ROSTER,
      stat: (key) => d.PROFILE.stat(key), formatTime: services.formatTime,
      difficultyAccent: (id) => difficultyHeat[id] ?? d.UI.t.color.danger });
    services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll));
    services.renderers.profile(result.view);
  };
  const renderAchievements = (): void => {
    const findAchievement = (source: AchievementSource) => {
      const match = d.ACH.list.find((entry) => entry.id === source.id);
      if (match === undefined) throw new Error(`Unknown achievement: ${source.id}`);
      return match;
    };
    const result = buildAchievementSnapshot({ achievements: d.ACH.list, filter: achievementFilter,
      categories: d.ACH.CATS, rarities: d.ACH.RARITY, commonRarity: d.ACH.RARITY.common,
      unlocked: (id) => d.PROFILE.unlocked(id), progress: (achievement) => d.ACH.progress(findAchievement(achievement)),
      progressText: (achievement) => d.ACH.progressText(findAchievement(achievement)), shardsFor: (achievement) => d.ACH.shardsFor(findAchievement(achievement)),
      coinsFor: (achievement) => d.ACH.coinsFor(findAchievement(achievement)), unlockedCount: d.PROFILE.unlockedCount(),
      shards: d.PROFILE.shards(), resetsIn: d.DAILY.resetsInText(), dailies: d.DAILY.today().map((challenge) => ({
        label: challenge.txt(challenge.goal), current: d.DAILY.progress(challenge), goal: challenge.goal,
        done: d.DAILY.isDone(challenge), reward: "◆ +" + String(challenge.shards) })), height: services.height,
      scroll: services.scroll(), time: services.time(), mutedColor: d.UI.t.color.muted });
    services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll));
    services.renderers.achievements(result.view);
  };
  const renderLeaderboards = (): void => {
    leaderboardTab = services.stepTab(leaderboardTabs, leaderboardTab, () => { services.setScroll(0); profileMessage = ""; });
    const cloud = d.Cloud.hasLeaderboards();
    if (leaderboardTab === "feed") {
      if (cloud && feedData === null && !feedLoading) {
        feedLoading = true;
        void d.Cloud.replayFeed(20).then((rows) => { feedData = rows ?? []; feedLoading = false; })
          .catch(() => { feedData = []; feedLoading = false; profileMessage = "couldn't load the feed"; });
      }
      const result = buildFeedLeaderboardSnapshot({ tabs: leaderboardTabs, tab: leaderboardTab, cloudAvailable: cloud,
        message: profileMessage, loading: feedLoading, height: services.height, scroll: services.scroll(),
        rows: (feedData ?? []).map((row) => rowView(row, row.shareId)) });
      services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll)); services.renderers.leaderboards(result.view); return;
    }
    const modes = d.CONFIG.modes.filter((mode) => !mode.training && !mode.debug);
    if (!leaderboardMode || !modes.some((mode) => mode.id === leaderboardMode)) leaderboardMode = modes[0]?.id ?? "";
    const key = leaderboardMode + "_" + leaderboardDifficulty;
    if (cloud && key !== leaderboardKey) {
      leaderboardKey = key; leaderboardData = null; leaderboardLoading = true;
      void d.Cloud.topScores(leaderboardMode, leaderboardDifficulty, 25).then((rows) => {
        if (leaderboardKey === key) { leaderboardData = rows ?? []; leaderboardLoading = false; }
      }).catch(() => { if (leaderboardKey === key) { leaderboardData = []; leaderboardLoading = false; leaderboardMessage = "couldn't load the ranks"; } });
    }
    const result = buildRankedLeaderboardSnapshot({ tabs: leaderboardTabs, tab: leaderboardTab, cloudAvailable: cloud,
      message: leaderboardMessage, loading: leaderboardLoading, height: services.height, scroll: services.scroll(),
      data: leaderboardData ?? [], modes, difficulties: d.CONFIG.difficulties, mode: leaderboardMode,
      difficulty: leaderboardDifficulty, ...(d.Cloud.user === null ? {} : { currentUserId: d.Cloud.user.id }), localBest: services.getBest(leaderboardMode, leaderboardDifficulty),
      rowView: (row) => rowView(row) });
    services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll)); services.renderers.leaderboards(result.view);
  };
  const adapters: LibraryScreenAdapters = { categories, fallbackCategory, categoryOrder: ABILITY_CATEGORY_ORDER, specialColor: SPECIAL_ABILITY_COLOR,
    abilityBadge: (upgrade) => abilityBadge(upgrade, d.UI.t.color.unique, d.UI.t.color.muted),
    renderCodex, renderProfile, renderAchievements, renderLeaderboards,
    drawReplayPreview: (source, bounds) => { renderReplayThumbnail({ canvas: services.canvas, source, bounds,
      cache: replayThumbs, createImage: () => new Image(), ink: d.UI.ink }); },
    selectCodexTab: (id) => { codexTab = id; services.setScroll(0); },
    selectCodexFilter: (id) => { if (codexTab === "bestiary") bestiaryFilter = id; else codexFilter = id; services.setScroll(0); },
    cycleCodexSort: () => { codexSort = codexSort === "category" ? "name" : codexSort === "name" ? "type" : "category"; services.setScroll(0); },
    inspectCodexAbility: (id) => { if (codexTab !== "abilities") return; const upgrade = d.UPGRADES.find((entry) => entry.id === id);
      const count = 1 + (upgrade?.tiers?.length ?? 0); if (count > 1) codexTierView[id] = ((codexTierView[id] ?? 0) + 1) % count; },
    selectProfileTab: (id) => { profileTab = id; services.setScroll(0); profileMessage = ""; }, setProfileMessage: (message) => { profileMessage = message; },
    selectAchievementCategory: (id) => { achievementFilter = id; services.setScroll(0); },
    selectLeaderboardTab: (id) => { leaderboardTab = id; services.setScroll(0); profileMessage = ""; },
    selectLeaderboardBoard: (id) => { const [kind, value = ""] = id.split(":"); if (kind === "mode") leaderboardMode = value;
      else if (kind === "difficulty") leaderboardDifficulty = value; services.setScroll(0); },
    watchReplay: (id) => { replayLibrary.watch(id); }, publishReplay: (id) => { replayLibrary.publish(id); },
  };
  return Object.freeze(adapters);
}
