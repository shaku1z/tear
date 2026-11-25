import type {
  LibraryScreenServices as SharedLibraryScreenServices,
  ReplayListActions,
} from "./library-screen-adapters";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { BrowserGamepad } from "../../input/browser-input-contracts";
import { BOSS_ROSTER } from "../../gameplay/run/content-director";
import {
  ABILITY_CATEGORY_ORDER,
  CODEX_TABS,
  SPECIAL_ABILITY_COLOR,
  abilityBadge,
  buildBestiaryView,
  buildCodexAbilityCards,
  buildCodexGuide,
  buildCodexScreenSnapshot,
} from "../../presentation/codex-snapshots";
import { buildAchievementSnapshot } from "../../presentation/achievement-snapshot";
import type { AchievementSource } from "../../presentation/achievement-snapshot";
import {
  buildFeedLeaderboardSnapshot,
  buildRankedLeaderboardSnapshot,
  type LocalBoardBest,
} from "../../presentation/leaderboard-snapshots";
import {
  leaderboardChoices,
  leaderboardId,
  leaderboardKind,
  type LeaderboardKindId,
  type LeaderboardRef,
} from "../../domain/leaderboards";
import {
  buildLeaderboardRow,
  buildProfileRecords,
  buildProfileSnapshot,
  buildReplayRows,
  buildProfileStats,
  type LeaderboardRowSource,
} from "../../presentation/profile-snapshots";
import { ReplayLibraryController } from "./replay-library-controller";
import { loadSharedReplay, shareReplay } from "../../replay/share";
import { createLiveBestiaryPreview } from "./bestiary-preview";
import {
  EARLIER_NOTICE_HEIGHT,
  REPLAY_TOOLBAR_HEIGHT,
  replayListState,
} from "../../presentation/screens/profile-replay-list";
import { createReplayListController } from "../replay/replay-list-controller";
import { REPLAY_LIST_FILTERS, type ReplayListFilter } from "../replay/replay-list";
import { liveReplayRecorder } from "../replay/live-replay-recorder-slot";
import { rulesetRefusal } from "../../gameplay/run/ruleset-version";
import { resolveCosmeticStyles } from "../../presentation/cosmetic-styles";
import { COSMETIC_CATALOG } from "../../gameplay/progression/cosmetic-catalog";
import { loadoutOf } from "../../domain/cosmetics";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "ACH"
  | "AFFIXES"
  | "Aldric"
  | "Armored"
  | "Bomber"
  | "Charger"
  | "Chimera"
  | "Cloud"
  | "CG"
  | "Colossus"
  | "CONFIG"
  | "DAILY"
  | "Echo"
  | "FirebaseProvider"
  | "fullscreen"
  | "Flyer"
  | "META"
  | "PROFILE"
  | "Ranged"
  | "Rootbinder"
  | "Rootbound"
  | "Source"
  | "STAGES"
  | "Support"
  | "UI"
  | "UPGRADES"
  | "VARIANTS"
  | "Warden"
  | "Wraith"
  | "applyVariant"
> &
  Readonly<{ PAD: BrowserGamepad }>;
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
  readonly browserIndexedDb: SharedLibraryScreenServices["browserIndexedDb"];
  readonly replayFiles: SharedLibraryScreenServices["replayFiles"];
  /** Opens a published replay on the replay screen. */
  readonly watchShared: SharedLibraryScreenServices["watchShared"];
  readonly watchRecord: SharedLibraryScreenServices["watchRecord"];
}

export interface LibraryScreenAdapters {
  readonly categories: Readonly<Record<string, Category>>;
  readonly fallbackCategory: Category;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (
    upgrade: GameRuntimeDependencies["UPGRADES"][number],
  ) => Readonly<{ label: string; color: string }>;
  readonly renderCodex: () => void;
  readonly renderProfile: () => void;
  readonly renderAchievements: () => void;
  readonly renderLeaderboards: () => void;
  readonly drawCreaturePreview: (
    name: string,
    bounds: Readonly<{ x: number; y: number; w: number; h: number }>,
  ) => void;
  readonly selectCodexTab: (id: string) => void;
  readonly selectCodexFilter: (id: string) => void;
  readonly cycleCodexSort: () => void;
  readonly inspectCodexAbility: (id: string) => void;
  readonly selectProfileTab: (id: string) => void;
  readonly setProfileMessage: (message: string) => void;
  readonly selectAchievementCategory: (id: string) => void;
  readonly selectLeaderboardTab: (id: string) => void;
  readonly selectLeaderboardBoard: (id: string) => void;
  readonly watchReplay: (id: string, from?: "profile" | "leaderboards") => void;
  readonly replays: ReplayListActions;
}

/** The REPLAYS filters as the toolbar names them. */
const REPLAY_FILTER_LABELS: Readonly<Record<ReplayListFilter, string>> = Object.freeze({
  all: "ALL",
  bests: "BESTS",
  pinned: "PINNED",
});
const REPLAY_FILTER_CHOICES = REPLAY_LIST_FILTERS.map((id) => [id, REPLAY_FILTER_LABELS[id]] as const);

export function createLiveLibraryScreenAdaptersRuntime(services: LibraryScreenServices): LibraryScreenAdapters {
  const d = services.dependencies,
    colors = d.CONFIG.colors;
  const categories: Readonly<Record<string, Category>> = Object.freeze({
    offense: { name: "OFFENSE", color: colors.charger },
    throw: { name: "THROW", color: colors.bomber },
    parry: { name: "PARRY", color: colors.perfect },
    mobility: { name: "MOBILITY", color: colors.ranged },
    resilience: { name: "RESILIENCE", color: colors.deflected },
    utility: { name: "UTILITY", color: colors.armored },
  });
  const fallbackCategory = categories.utility ?? { name: "UTILITY", color: colors.armored };
  const profileTabs = [
    ["bests", "BESTS"],
    ["replays", "REPLAYS"],
    ["stats", "STATS"],
  ] as const;
  const leaderboardTabs = [
    ["global", "GLOBAL"],
    ["feed", "FEED"],
  ] as const;
  const difficultyHeat: Readonly<Record<string, string | null>> = {
    easy: "#2f9e6b",
    normal: "#13c4d6",
    hard: "#e0a326",
    extreme: null,
    onehit: "#b06cff",
  };
  let codexTab = "abilities",
    codexFilter = "all",
    codexSort = "category",
    bestiaryFilter = "all";
  const codexTierView: Record<string, number> = {};
  let profileTab = "bests",
    profileMessage = "",
    achievementFilter = "all";
  let leaderboardTab = "global",
    leaderboardBoard = "",
    leaderboardDifficulty = "normal",
    leaderboardKey = "";
  let leaderboardData: readonly LeaderboardRowSource[] | null = null,
    leaderboardLoading = false,
    leaderboardMessage = "";
  let feedData: readonly LeaderboardRowSource[] | null = null,
    feedLoading = false,
    feedFailed = false,
    leaderboardFailed = false;

  const replayLibrary = new ReplayLibraryController({
    loadShared: (shareId) => loadSharedReplay(d.Cloud, shareId),
    watch: (record, key, from) => services.watchShared(record, key, from),
    setProfileMessage: (message) => {
      replays.setMessage(message);
    },
    setLeaderboardMessage: (message) => {
      leaderboardMessage = message;
    },
  });
  const replays = createReplayListController({
    openStore: () =>
      liveReplayRecorder.ensure().then((module) => module.openReplayRecordStore(services.browserIndexedDb ?? null)),
    files: services.replayFiles,
    playableRuleset: (ruleset) => rulesetRefusal(ruleset) === null,
    watchRecord: (key) => services.watchRecord(key),
    canShare: () => d.Cloud.hasLeaderboards(),
    share: (record) => shareReplay(d.Cloud, record),
    earlier: d.CG.store,
  });
  /** The list is read again each time the REPLAYS tab is shown or the profile entered, so a run kept since is in it. */
  let replaysShown = false,
    profileEntered = Number.POSITIVE_INFINITY;
  /** The player's own best on each kind of board, as this device keeps it. */
  const localBoardBest: Readonly<Record<LeaderboardKindId, (board: LeaderboardRef) => LocalBoardBest | null>> = {
    score: (board) => {
      const best = services.getBest(board.mode, board.difficulty);
      return { count: best.wave, score: best.score };
    },
    "gauntlet-clear": (board) => {
      const best = d.PROFILE.gauntletBest(board.difficulty);
      return best === null ? null : { score: best.ticks };
    },
  };
  const rowView = (row: LeaderboardRowSource, fallbackId?: string) =>
    buildLeaderboardRow(row, d.CONFIG.modes, d.Cloud.user?.id, services.formatTime, fallbackId);
  /** Clamps the shared scroll to a snapshot's extent; a phone composition (compact density) measures and clamps its own. */
  const clampScroll = (maximum: number): void => {
    if (!d.UI.density.compact) services.setScroll(services.clamp(services.scroll(), 0, maximum));
  };

  // ---- bestiary live instances (source bestiary(): one preview enemy per entry) ----
  const bestiaryPreview = createLiveBestiaryPreview(d);

  const renderCodex = (): void => {
    codexTab = services.stepTab(CODEX_TABS, codexTab, () => {
      services.setScroll(0);
    });
    const bestiary = buildBestiaryView(
      bestiaryFilter,
      Object.fromEntries(Object.entries(categories).map(([id, category]) => [id, category.color])),
      d.UI.t.color.danger,
      d.UI.t.color.accent,
      bestiaryPreview.detail,
    );
    const cards = buildCodexAbilityCards({
      upgrades: d.UPGRADES,
      filter: codexFilter,
      sort: codexSort,
      tierView: codexTierView,
      categories,
      fallbackCategory,
      uniqueColor: d.UI.t.color.unique,
      mutedColor: d.UI.t.color.muted,
    });
    const guide =
      codexTab === "guide"
        ? buildCodexGuide(
            d.CONFIG.trick.pts,
            d.CONFIG.trick.tiers,
            {
              jump: d.PAD.bindingLabel("jump"),
              dash: d.PAD.bindingLabel("dash"),
              throw: d.PAD.bindingLabel("throw"),
              tether: d.PAD.bindingLabel("tether"),
              pause: d.PAD.glyph(9),
            },
            d.fullscreen().available,
          )
        : undefined;
    const result = buildCodexScreenSnapshot({
      tab: codexTab,
      filter: codexFilter,
      sort: codexSort,
      scroll: services.scroll(),
      tabs: CODEX_TABS,
      abilityCards: cards,
      abilityFilters: [
        ["all", "ALL"],
        ...ABILITY_CATEGORY_ORDER.map((id) => [id, categories[id]?.name ?? id] as const),
      ],
      bestiaryCards: bestiary.cards,
      bestiaryFilters: bestiary.filters,
      bestiaryFilter,
      ...(guide === undefined ? {} : { guide }),
    });
    clampScroll(result.maximumScroll);
    services.renderers.codex(result.view);
  };
  const renderProfile = (): void => {
    profileTab = services.stepTab(profileTabs, profileTab, () => {
      services.setScroll(0);
      profileMessage = "";
    });
    const listing = profileTab === "replays",
      entered = services.enterSeconds() < profileEntered;
    profileEntered = services.enterSeconds();
    if (listing && (!replaysShown || entered)) replays.refresh();
    replaysShown = listing;
    const list = listing ? replays.snapshot() : undefined;
    const listState = list === undefined ? undefined : replayListState(list.status);
    const signedIn = d.Cloud.loggedIn(),
      canSignIn = d.Cloud.canSignIn();
    const records = buildProfileRecords(d.CONFIG.modes, d.CONFIG.difficulties, services.getBest);
    const stats =
      profileTab === "stats"
        ? buildProfileStats(
            (key) => d.PROFILE.stat(key),
            services.ease(services.clamp(services.enterSeconds() / 0.5, 0, 1)),
            { danger: d.UI.t.color.danger, cyan: "#13c4d6", green: "#2f9e6b", gold: "#e0a326" },
            services.formatTime,
          )
        : [];
    const result = buildProfileSnapshot({
      // The passport has no motion, so the calm looks (which only still motion) never apply to it.
      cosmetics: resolveCosmeticStyles(COSMETIC_CATALOG, loadoutOf(COSMETIC_CATALOG, d.PROFILE.cosmetics()), false),
      tab: profileTab,
      tabs: profileTabs,
      signedIn,
      // The REPLAYS toolbar (filters and import), and the earlier-replays notice when there is one, sit above
      // the list: profile-achievements replayToolbar.
      replayListInset: list === undefined ? 0 : REPLAY_TOOLBAR_HEIGHT + (list.earlier > 0 ? EARLIER_NOTICE_HEIGHT : 0),
      ...(list === undefined
        ? {}
        : {
            replayFilters: REPLAY_FILTER_CHOICES,
            replayFilter: list.filter,
            canImport: list.canImport,
            earlierReplays: list.earlier,
            ...(listState === undefined ? {} : { replayList: listState }),
          }),
      firebase: d.Cloud.provider === d.FirebaseProvider,
      canSignIn,
      canRename: signedIn && d.Cloud.canRename(),
      hasCustomName: signedIn && d.Cloud.hasCustomName(),
      renameCooldownDays: signedIn ? d.Cloud.renameCooldownDays() : 0,
      authRetryPrompt: canSignIn && d.Cloud.authRetryPrompt,
      signInLabel: canSignIn ? d.Cloud.signInLabel() : "",
      username: d.PROFILE.username(),
      displayName: signedIn ? d.Cloud.displayName() : "",
      coins: d.META.coins(),
      shards: d.PROFILE.shards(),
      unlockedCount: d.PROFILE.unlockedCount(),
      totalAchievements: d.ACH.list.length,
      records,
      replays: list === undefined ? [] : buildReplayRows(list.items, d.CONFIG.modes, services.formatTime),
      stats,
      message: list === undefined ? profileMessage : list.message,
      height: services.height,
      scroll: services.scroll(),
      achievements: d.ACH.list,
      unlocked: (id) => d.PROFILE.unlocked(id),
      categoryIcon: (category) => Object.entries(d.ACH.CATS).find(([id]) => id === category)?.[1].icon ?? "★",
      rarityColor: (rarity) =>
        (Object.entries(d.ACH.RARITY).find(([id]) => id === rarity)?.[1] ?? d.ACH.RARITY.common).color,
      stages: d.STAGES,
      bosses: BOSS_ROSTER,
      stat: (key) => d.PROFILE.stat(key),
      formatTime: services.formatTime,
      difficultyAccent: (id) => difficultyHeat[id] ?? d.UI.t.color.danger,
    });
    clampScroll(result.maximumScroll);
    services.renderers.profile(result.view);
  };
  const renderAchievements = (): void => {
    const findAchievement = (source: AchievementSource) => {
      const match = d.ACH.list.find((entry) => entry.id === source.id);
      if (match === undefined) throw new Error(`Unknown achievement: ${source.id}`);
      return match;
    };
    const result = buildAchievementSnapshot({
      achievements: d.ACH.list,
      filter: achievementFilter,
      categories: d.ACH.CATS,
      rarities: d.ACH.RARITY,
      commonRarity: d.ACH.RARITY.common,
      unlocked: (id) => d.PROFILE.unlocked(id),
      progress: (achievement) => d.ACH.progress(findAchievement(achievement)),
      progressText: (achievement) => d.ACH.progressText(findAchievement(achievement)),
      shardsFor: (achievement) => d.ACH.shardsFor(findAchievement(achievement)),
      coinsFor: (achievement) => d.ACH.coinsFor(findAchievement(achievement)),
      unlockedCount: d.PROFILE.unlockedCount(),
      shards: d.PROFILE.shards(),
      resetsIn: d.DAILY.resetsInText(),
      dailies: d.DAILY.today().map((challenge) => ({
        label: challenge.txt(challenge.goal),
        current: d.DAILY.progress(challenge),
        goal: challenge.goal,
        done: d.DAILY.isDone(challenge),
        reward: "◆ +" + String(challenge.shards),
      })),
      height: services.height,
      scroll: services.scroll(),
      time: services.time(),
      mutedColor: d.UI.t.color.muted,
    });
    clampScroll(result.maximumScroll);
    services.renderers.achievements(result.view);
  };
  const renderLeaderboards = (): void => {
    leaderboardTab = services.stepTab(leaderboardTabs, leaderboardTab, () => {
      services.setScroll(0);
      leaderboardMessage = "";
    });
    const cloud = d.Cloud.hasLeaderboards();
    if (leaderboardTab === "feed") {
      if (cloud && feedData === null && !feedLoading) {
        feedLoading = true;
        void d.Cloud.replayFeed(20)
          .then((rows) => {
            feedData = rows ?? [];
            feedLoading = false;
            feedFailed = false;
          })
          .catch(() => {
            feedData = [];
            feedLoading = false;
            feedFailed = true;
          });
      }
      const result = buildFeedLeaderboardSnapshot({
        tabs: leaderboardTabs,
        tab: leaderboardTab,
        cloudAvailable: cloud,
        message: leaderboardMessage,
        loading: feedLoading,
        failed: feedFailed,
        height: services.height,
        scroll: services.scroll(),
        rows: (feedData ?? []).map((row) => rowView(row, row.shareId)),
      });
      clampScroll(result.maximumScroll);
      services.renderers.leaderboards(result.view);
      return;
    }
    const modes = d.CONFIG.modes.filter((mode) => !mode.training && !mode.debug);
    // Boards this target ranks: a direction the provider cannot rank is not offered (see LEADERBOARD_KINDS).
    const boards = leaderboardChoices(modes, (direction) => !cloud || d.Cloud.ranksLeaderboard(direction));
    const choice = boards.find((entry) => entry.id === leaderboardBoard) ?? boards[0];
    leaderboardBoard = choice?.id ?? "";
    const board: LeaderboardRef = {
      kind: choice?.kind ?? "score",
      mode: choice?.mode ?? "",
      difficulty: leaderboardDifficulty,
    };
    const key = leaderboardId(board);
    if (cloud && key !== leaderboardKey) {
      leaderboardKey = key;
      leaderboardData = null;
      leaderboardLoading = true;
      void d.Cloud.topScores(board, 25)
        .then((rows) => {
          if (leaderboardKey === key) {
            leaderboardData = rows ?? [];
            leaderboardLoading = false;
            leaderboardFailed = false;
          }
        })
        .catch(() => {
          if (leaderboardKey === key) {
            leaderboardData = [];
            leaderboardLoading = false;
            leaderboardFailed = true;
          }
        });
    }
    const result = buildRankedLeaderboardSnapshot({
      tabs: leaderboardTabs,
      tab: leaderboardTab,
      cloudAvailable: cloud,
      message: leaderboardMessage,
      loading: leaderboardLoading,
      failed: leaderboardFailed,
      height: services.height,
      scroll: services.scroll(),
      data: leaderboardData ?? [],
      boards,
      board: leaderboardBoard,
      kind: leaderboardKind(board),
      difficulties: d.CONFIG.difficulties,
      difficulty: leaderboardDifficulty,
      ...(d.Cloud.user === null ? {} : { currentUserId: d.Cloud.user.id }),
      localBest: localBoardBest[board.kind](board),
      formatTime: services.formatTime,
      rowView: (row) => rowView(row),
    });
    clampScroll(result.maximumScroll);
    services.renderers.leaderboards(result.view);
  };
  const adapters: LibraryScreenAdapters = {
    categories,
    fallbackCategory,
    categoryOrder: ABILITY_CATEGORY_ORDER,
    specialColor: SPECIAL_ABILITY_COLOR,
    abilityBadge: (upgrade) => abilityBadge(upgrade, d.UI.t.color.unique, d.UI.t.color.muted),
    renderCodex,
    renderProfile,
    renderAchievements,
    renderLeaderboards,
    // source drawCreature: render the live enemy instance scaled into its preview box
    drawCreaturePreview: (name, bounds) => {
      const context = services.canvas,
        inst = bestiaryPreview.instance(name);
      if (inst === null) {
        context.fillStyle = "#eee";
        context.fillRect(bounds.x + 8, bounds.y + 8, bounds.w - 16, bounds.h - 16);
        return;
      }
      const maxDim = Math.max(inst.hw * 2, inst.hh * 2) + 18;
      const scale = Math.min((bounds.w - 22) / maxDim, (bounds.h - 22) / maxDim);
      inst.x = 0;
      inst.y = 0;
      inst.facing = 1;
      inst.flash = 0;
      inst.stun = 0;
      inst.spawnT = 0;
      inst._noBar = true;
      context.save();
      context.beginPath();
      context.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      context.clip();
      context.translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      context.scale(scale, scale);
      try {
        inst.draw(context, bestiaryPreview.previewPlayer);
      } catch {
        /* fall back to nothing */
      }
      context.restore();
    },
    selectCodexTab: (id) => {
      codexTab = id;
      services.setScroll(0);
    },
    selectCodexFilter: (id) => {
      if (codexTab === "bestiary") bestiaryFilter = id;
      else codexFilter = id;
      services.setScroll(0);
    },
    cycleCodexSort: () => {
      codexSort = codexSort === "category" ? "name" : codexSort === "name" ? "type" : "category";
      services.setScroll(0);
    },
    inspectCodexAbility: (id) => {
      if (codexTab !== "abilities") return;
      const upgrade = d.UPGRADES.find((entry) => entry.id === id);
      const count = 1 + (upgrade?.tiers?.length ?? 0);
      if (count > 1) codexTierView[id] = ((codexTierView[id] ?? 0) + 1) % count;
    },
    selectProfileTab: (id) => {
      profileTab = id;
      services.setScroll(0);
      profileMessage = "";
    },
    setProfileMessage: (message) => {
      profileMessage = message;
      replays.setMessage(message);
    },
    selectAchievementCategory: (id) => {
      achievementFilter = id;
      services.setScroll(0);
    },
    selectLeaderboardTab: (id) => {
      leaderboardTab = id;
      services.setScroll(0);
      leaderboardMessage = "";
    },
    selectLeaderboardBoard: (id) => {
      const [kind, value = ""] = id.split(":");
      if (kind === "board") leaderboardBoard = value;
      else if (kind === "difficulty") leaderboardDifficulty = value;
      services.setScroll(0);
      leaderboardMessage = "";
    },
    watchReplay: (id, from) => {
      replayLibrary.watch(id, from);
    },
    replays: Object.freeze({
      filter: (id: string) => {
        const filter = REPLAY_LIST_FILTERS.find((candidate) => candidate === id);
        if (filter === undefined) return;
        replays.setFilter(filter);
        services.setScroll(0);
      },
      watch: replays.watch,
      share: replays.share,
      download: replays.download,
      pin: replays.pin,
      remove: replays.remove,
      importFile: replays.importFile,
      downloadEarlier: replays.downloadEarlier,
      clearEarlier: replays.clearEarlier,
    }),
  };
  return Object.freeze(adapters);
}
