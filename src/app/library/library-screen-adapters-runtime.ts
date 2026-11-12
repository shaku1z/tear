import type { createLiveBeatThisRunController } from "../replay/beat-this-run-controller";
import type { CareerPort } from "./ghost-career-controller";
import type { LibraryScreenServices as SharedLibraryScreenServices } from "./library-screen-adapters";
import { legacyCareerRow } from "../../ghost/career-archive";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import { createGhostCareerController } from "./ghost-career-controller";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { BrowserGamepad } from "../../input/browser-input-contracts";
import { BOSS_ROSTER } from "../../gameplay/run/content-director";
import {
  ABILITY_CATEGORY_ORDER, CODEX_TABS, SPECIAL_ABILITY_COLOR, abilityBadge,
  buildBestiaryView, buildCodexAbilityCards, buildCodexGuide, buildCodexScreenSnapshot,
} from "../../presentation/codex-snapshots";
import { buildAchievementSnapshot } from "../../presentation/achievement-snapshot";
import type { AchievementSource } from "../../presentation/achievement-snapshot";
import { buildFeedLeaderboardSnapshot, buildRankedLeaderboardSnapshot } from "../../presentation/leaderboard-snapshots";
import { buildLeaderboardRow, buildProfileRecords, buildProfileReplays, buildProfileSnapshot, buildProfileStats,
  type LeaderboardRowSource } from "../../presentation/profile-snapshots";
import { ReplayLibraryController } from "./replay-library-controller";
import { renderReplayThumbnail } from "../../presentation/replay-thumbnail";
import type { GhostVaultLibraryPort } from "./ghost-vault-library-controller";
import type { LiveGhostOwnerRecoveryController } from "../replay/ghost-owner-recovery-controller";
import type { GhostTheaterOpenResult } from "../../ghost/theater-open-result";
import { createLiveBestiaryPreview } from "./bestiary-preview";

type Dependencies = Pick<GameRuntimeDependencies, "ACH" | "AFFIXES" | "Aldric" | "Armored" | "Bomber" | "Charger" |
  "Chimera" | "Cloud" | "Colossus" | "CONFIG" | "DAILY" | "Echo" | "FirebaseProvider" | "Flyer" |
  "META" | "PROFILE" | "Ranged" | "Rootbinder" | "Rootbound" | "Source" | "STAGES" | "Support" | "UI" | "UPGRADES" | "VARIANTS" | "VAULT" |
  "Warden" | "Wraith" | "applyVariant"> & Readonly<{ PAD: BrowserGamepad }>;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;
type Category = Readonly<{ name: string; color: string }>;

export interface LibraryScreenServices {
  readonly beat?: Pick<ReturnType<typeof createLiveBeatThisRunController>, "action" | "snapshot" | "cancel">;
  readonly chase?: NonNullable<SharedLibraryScreenServices["chase"]>;
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
  readonly career?: CareerPort;
  readonly enterCareerSource?: (id: string, command: string, expectedManifestHash?: string) => unknown;
  readonly ghostVault: GhostVaultLibraryPort;
  readonly ownerRecovery?: Pick<LiveGhostOwnerRecoveryController, "snapshot" | "close">;
  readonly enterReplay: (record: unknown, from: string) => boolean;
  readonly enterGhostTheater: (id: string) => Promise<GhostTheaterOpenResult>;
  readonly enterGhostComparison: (ids: readonly string[]) => Promise<boolean>;
}

export interface LibraryScreenAdapters {
  readonly categories: Readonly<Record<string, Category>>;
  readonly fallbackCategory: Category;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (upgrade: GameRuntimeDependencies["UPGRADES"][number]) => Readonly<{ label: string; color: string }>;
  readonly renderCodex: () => void;
  readonly careerAction: (command: string, id?: string) => void;
  readonly renderProfile: () => void;
  readonly renderAchievements: () => void;
  readonly renderLeaderboards: () => void;
  readonly drawReplayPreview: (source: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
  readonly drawCreaturePreview: (name: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
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
  readonly watchGhostCapsule: (id: string) => void;
  readonly compareGhostCapsule: (id: string) => void;
  readonly openGhostComparison: () => void;
  readonly publishReplay: (id: string) => void;
  readonly repairGhostCapsule: (id: string) => void;
}

export function createLiveLibraryScreenAdaptersRuntime(services: LibraryScreenServices): LibraryScreenAdapters {
  const d = services.dependencies, colors = d.CONFIG.colors;
  const careerPort = services.career;
  const career = careerPort ? createGhostCareerController({ ...careerPort,
    list: async (signal) => [...await careerPort.list(signal), ...d.VAULT.index().map(legacyCareerRow)],
    current: async (entry) => entry.kind === "legacy-visual" ? d.VAULT.index().some((row) => row.id === entry.id && legacyCareerRow(row).entry.manifestHash === entry.manifestHash) : careerPort.current(entry),
    annotate: async (entry, notes, tags, retention) => { if (entry.kind !== "legacy-visual") return careerPort.annotate(entry, notes, tags, retention);
      if (tags.length || !["recent", "pinned"].includes(retention)) throw new Error("Visual-only legacy recordings support original PIN controls; canonical tags and retention are unavailable.");
      const raw = d.VAULT.index().find((row) => row.id === entry.id); if (!raw || legacyCareerRow(raw).entry.manifestHash !== entry.manifestHash || !d.VAULT.pin(entry.id, retention === "pinned")) throw new Error("Legacy recording changed or original pin limit reached"); },
    remove: async (entry, notes) => { if (entry.kind !== "legacy-visual") return careerPort.remove(entry, notes); const raw = d.VAULT.index().find((row) => row.id === entry.id);
      if (!raw || legacyCareerRow(raw).entry.manifestHash !== entry.manifestHash) throw new Error("Legacy recording changed"); d.VAULT.remove(entry.id); },
  }) : undefined;
  const categories: Readonly<Record<string, Category>> = Object.freeze({
    offense: { name: "OFFENSE", color: colors.charger }, throw: { name: "THROW", color: colors.bomber },
    parry: { name: "PARRY", color: colors.perfect }, mobility: { name: "MOBILITY", color: colors.ranged },
    resilience: { name: "RESILIENCE", color: colors.deflected }, utility: { name: "UTILITY", color: colors.armored },
  });
  const fallbackCategory = categories.utility ?? { name: "UTILITY", color: colors.armored };
  const profileTabs = [["bests", "BESTS"], ["replays", "REPLAYS"], ["vault", "VAULT"], ["career", "CAREER"], ["stats", "STATS"]] as const;
  const leaderboardTabs = [["global", "GLOBAL"], ["feed", "FEED"]] as const;
  const difficultyHeat: Readonly<Record<string, string | null>> = {
    easy: "#2f9e6b", normal: "#13c4d6", hard: "#e0a326", extreme: null, onehit: "#b06cff",
  };
  const replayThumbs: Record<string, HTMLImageElement> = {};
  let codexTab = "abilities", codexFilter = "all", codexSort = "category", bestiaryFilter = "all";
  const codexTierView: Record<string, number> = {};
  let profileTab = "bests", profileMessage = "", comparisonSources: string[] = [], achievementFilter = "all";
  let leaderboardTab = "global", leaderboardMode = "", leaderboardDifficulty = "normal", leaderboardKey = "";
  let leaderboardData: readonly LeaderboardRowSource[] | null = null, leaderboardLoading = false, leaderboardMessage = "";
  let feedData: readonly LeaderboardRowSource[] | null = null, feedLoading = false, feedFailed = false, leaderboardFailed = false;

  const replayLibrary = new ReplayLibraryController({ vault: d.VAULT, cloud: d.Cloud,
    enterReplay: (record, from) => services.enterReplay(record, from),
    setProfileMessage: (message) => { profileMessage = message; },
    setLeaderboardMessage: (message) => { leaderboardMessage = message; } });
  const rowView = (row: LeaderboardRowSource, fallbackId?: string) =>
    buildLeaderboardRow(row, d.CONFIG.modes, d.Cloud.user?.id, services.formatTime, fallbackId);

  // ---- bestiary live instances (source bestiary(): one preview enemy per entry) ----
  const bestiaryPreview = createLiveBestiaryPreview(d);

  const renderCodex = (): void => {
    codexTab = services.stepTab(CODEX_TABS, codexTab, () => { services.setScroll(0); });
    const bestiary = buildBestiaryView(bestiaryFilter,
      Object.fromEntries(Object.entries(categories).map(([id, category]) => [id, category.color])),
      d.UI.t.color.danger, d.UI.t.color.accent, bestiaryPreview.detail);
    const cards = buildCodexAbilityCards({ upgrades: d.UPGRADES, filter: codexFilter, sort: codexSort,
      tierView: codexTierView, categories, fallbackCategory, uniqueColor: d.UI.t.color.unique, mutedColor: d.UI.t.color.muted });
    const guide = codexTab === "guide" ? buildCodexGuide(d.CONFIG.trick.pts, d.CONFIG.trick.tiers, {
      jump: d.PAD.bindingLabel("jump"), dash: d.PAD.bindingLabel("dash"),
      throw: d.PAD.bindingLabel("throw"), tether: d.PAD.bindingLabel("tether"), pause: d.PAD.glyph(9),
    }) : undefined;
    const result = buildCodexScreenSnapshot({ tab: codexTab, filter: codexFilter, sort: codexSort,
      scroll: services.scroll(), tabs: CODEX_TABS, abilityCards: cards,
      abilityFilters: [["all", "ALL"], ...ABILITY_CATEGORY_ORDER.map((id) => [id, categories[id]?.name ?? id] as const)],
      bestiaryCards: bestiary.cards, bestiaryFilters: bestiary.filters, bestiaryFilter,
      ...(guide === undefined ? {} : { guide }) });
    services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll));
    services.renderers.codex(result.view);
  };
  const renderProfile = (): void => {
    if (profileTab === "career") career?.open();
    profileTab = services.stepTab(profileTabs, profileTab, () => { services.setScroll(0); profileMessage = ""; services.ownerRecovery?.close(); if (profileTab !== "career") career?.close(); });
    let ghostVault = services.ghostVault.snapshot();
    if (profileTab === "vault" && ghostVault.status === "idle") {
      services.ghostVault.refresh();
      ghostVault = services.ghostVault.snapshot();
    }
    const healthyCapsuleIds = new Set(ghostVault.capsules.filter((capsule) => capsule.healthy && capsule.status === "complete")
      .map((capsule) => capsule.id));
    comparisonSources = comparisonSources.filter((id) => healthyCapsuleIds.has(id));
    const vaultReplays = ghostVault.capsules.map((capsule) => Object.freeze({
      id: capsule.id,
      // Player wording: these are saved replays (recordings); no ids, hashes or byte counts.
      title: "SAVED REPLAY",
      detail: `${capsule.status === "complete" ? "Complete recording" : "Recording still saving"} · ${capsule.healthy ? "ready to watch" : "needs repair"}${capsule.repairChildId === undefined ? "" : " · repaired copy available"}`,
      badge: "SAVED REPLAY",
      available: capsule.healthy && capsule.status === "complete" && capsule.theaterEligible,
      theaterUnavailable: !capsule.theaterEligible,
      repairable: capsule.repairable,
      canDownloadArchive: capsule.healthy && capsule.status === "complete",
      canDownloadLinkedPair: capsule.canDownloadLinkedPair === true,
      timestamp: new Date(capsule.createdAt).toLocaleDateString(),
      comparisonSelected: comparisonSources.includes(capsule.id),
      comparisonSourceCount: comparisonSources.length,
    }));
    if (profileTab === "vault" && ghostVault.message !== undefined) profileMessage = ghostVault.message;
    else if (profileTab === "vault" && ghostVault.status === "loading") profileMessage = "Opening your saved replays…";
    else if (profileTab === "vault" && ghostVault.evictedCapsuleIds.length > 0) {
      profileMessage = `${String(ghostVault.evictedCapsuleIds.length)} older saved ${ghostVault.evictedCapsuleIds.length === 1 ? "replay was" : "replays were"} removed to make room.`;
    }
    else if (profileTab === "vault" && ghostVault.status === "ready" && ghostVault.capsules.length === 0) {
      profileMessage = "";
    }
    if (profileTab === "vault" && ghostVault.status === "ready" && ghostVault.capsules.length > 0 && profileMessage === "Opening your saved replays…") profileMessage = "";
    const signedIn = d.Cloud.loggedIn(), canSignIn = d.Cloud.canSignIn();
    const records = buildProfileRecords(d.CONFIG.modes, d.CONFIG.difficulties, services.getBest);
    const stats = profileTab === "stats" ? buildProfileStats((key) => d.PROFILE.stat(key),
      services.ease(services.clamp(services.enterSeconds() / 0.5, 0, 1)),
      { danger: d.UI.t.color.danger, cyan: "#13c4d6", green: "#2f9e6b", gold: "#e0a326" }, services.formatTime) : [];
    // The vault toolbar (import / account restore) sits above the list: profile-achievements vaultToolbar.
    const archiveInset = profileTab === "vault" && (ghostVault.archive !== undefined || services.ownerRecovery !== undefined) ? 84 : 0;
    const result = buildProfileSnapshot({ tab: profileTab, tabs: profileTabs, signedIn, replayListInset: archiveInset,
      firebase: d.Cloud.provider === d.FirebaseProvider, canSignIn, canRename: signedIn && d.Cloud.canRename(),
      hasCustomName: signedIn && d.Cloud.hasCustomName(), renameCooldownDays: signedIn ? d.Cloud.renameCooldownDays() : 0,
      authRetryPrompt: canSignIn && d.Cloud.authRetryPrompt, signInLabel: canSignIn ? d.Cloud.signInLabel() : "",
      username: d.PROFILE.username(), displayName: signedIn ? d.Cloud.displayName() : "", coins: d.META.coins(),
      shards: d.PROFILE.shards(), unlockedCount: d.PROFILE.unlockedCount(), totalAchievements: d.ACH.list.length,
      records, replays: profileTab === "replays" ? buildProfileReplays(d.VAULT.index().map((entry) => ({
        id: entry.id, ts: entry.ts, pin: entry.pin, sum: entry.sum,
        ...(typeof entry.shareId === "string" ? { shareId: entry.shareId } : {}),
      })), d.CONFIG.modes) : (profileTab === "vault" ? vaultReplays : []), stats,
      message: profileMessage, height: services.height, scroll: services.scroll(), achievements: d.ACH.list,
      unlocked: (id) => d.PROFILE.unlocked(id), categoryIcon: (category) => Object.entries(d.ACH.CATS).find(([id]) => id === category)?.[1].icon ?? "★",
      rarityColor: (rarity) => (Object.entries(d.ACH.RARITY).find(([id]) => id === rarity)?.[1] ?? d.ACH.RARITY.common).color, stages: d.STAGES, bosses: BOSS_ROSTER,
      stat: (key) => d.PROFILE.stat(key), formatTime: services.formatTime,
      difficultyAccent: (id) => difficultyHeat[id] ?? d.UI.t.color.danger });
    const ownerRecovery = profileTab === "vault" ? services.ownerRecovery?.snapshot() : undefined;
    const maximumScroll = ownerRecovery?.catalogVisible === true ? Math.max(0, ownerRecovery.entries.length * 96 - (services.height - 110 - 390)) : result.maximumScroll;
    services.setScroll(services.clamp(services.scroll(), 0, maximumScroll));
    const beatMessage = services.beat?.snapshot().message;
    const chaseMessage = beatMessage !== undefined && beatMessage.length > 0 ? beatMessage : services.chase?.snapshot().message;
    services.renderers.profile({ ...result.view, ...(profileTab === "career" && career ? { career: { ...career.snapshot(), message: chaseMessage === undefined || chaseMessage.length === 0 ? career.snapshot().message : chaseMessage } } : {}), ...(ownerRecovery === undefined ? {} : { ownerRecovery }),
      ...(ownerRecovery?.catalogVisible === true ? { canScrollUp: services.scroll() > 0, canScrollDown: services.scroll() < maximumScroll } : {}),
      ...(profileTab === "vault" && ghostVault.archive !== undefined ? { archive: ghostVault.archive } : {}) });
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
    leaderboardTab = services.stepTab(leaderboardTabs, leaderboardTab, () => { services.setScroll(0); leaderboardMessage = ""; });
    const cloud = d.Cloud.hasLeaderboards();
    if (leaderboardTab === "feed") {
      if (cloud && feedData === null && !feedLoading) {
        feedLoading = true;
        void d.Cloud.replayFeed(20).then((rows) => { feedData = rows ?? []; feedLoading = false; feedFailed = false; })
          .catch(() => { feedData = []; feedLoading = false; feedFailed = true; });
      }
      const result = buildFeedLeaderboardSnapshot({ tabs: leaderboardTabs, tab: leaderboardTab, cloudAvailable: cloud,
        message: leaderboardMessage, loading: feedLoading, failed: feedFailed, height: services.height, scroll: services.scroll(),
        rows: (feedData ?? []).map((row) => rowView(row, row.shareId)) });
      services.setScroll(services.clamp(services.scroll(), 0, result.maximumScroll)); services.renderers.leaderboards(result.view); return;
    }
    const modes = d.CONFIG.modes.filter((mode) => !mode.training && !mode.debug);
    if (!leaderboardMode || !modes.some((mode) => mode.id === leaderboardMode)) leaderboardMode = modes[0]?.id ?? "";
    const key = leaderboardMode + "_" + leaderboardDifficulty;
    if (cloud && key !== leaderboardKey) {
      leaderboardKey = key; leaderboardData = null; leaderboardLoading = true;
      void d.Cloud.topScores(leaderboardMode, leaderboardDifficulty, 25).then((rows) => {
        if (leaderboardKey === key) { leaderboardData = rows ?? []; leaderboardLoading = false; leaderboardFailed = false; }
      }).catch(() => { if (leaderboardKey === key) { leaderboardData = []; leaderboardLoading = false; leaderboardFailed = true; } });
    }
    const result = buildRankedLeaderboardSnapshot({ tabs: leaderboardTabs, tab: leaderboardTab, cloudAvailable: cloud,
      message: leaderboardMessage, loading: leaderboardLoading, failed: leaderboardFailed, height: services.height, scroll: services.scroll(),
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
    // source drawCreature: render the live enemy instance scaled into its preview box
    drawCreaturePreview: (name, bounds) => {
      const context = services.canvas, inst = bestiaryPreview.instance(name);
      if (inst === null) { context.fillStyle = "#eee"; context.fillRect(bounds.x + 8, bounds.y + 8, bounds.w - 16, bounds.h - 16); return; }
      const maxDim = Math.max(inst.hw * 2, inst.hh * 2) + 18;
      const scale = Math.min((bounds.w - 22) / maxDim, (bounds.h - 22) / maxDim);
      inst.x = 0; inst.y = 0; inst.facing = 1; inst.flash = 0; inst.stun = 0; inst.spawnT = 0; inst._noBar = true;
      context.save();
      context.beginPath(); context.rect(bounds.x, bounds.y, bounds.w, bounds.h); context.clip();
      context.translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2); context.scale(scale, scale);
      try { inst.draw(context, bestiaryPreview.previewPlayer); } catch { /* fall back to nothing */ }
      context.restore();
    },
    selectCodexTab: (id) => { codexTab = id; services.setScroll(0); },
    selectCodexFilter: (id) => { if (codexTab === "bestiary") bestiaryFilter = id; else codexFilter = id; services.setScroll(0); },
    cycleCodexSort: () => { codexSort = codexSort === "category" ? "name" : codexSort === "name" ? "type" : "category"; services.setScroll(0); },
    inspectCodexAbility: (id) => { if (codexTab !== "abilities") return; const upgrade = d.UPGRADES.find((entry) => entry.id === id);
      const count = 1 + (upgrade?.tiers?.length ?? 0); if (count > 1) codexTierView[id] = ((codexTierView[id] ?? 0) + 1) % count; },
    careerAction: (command, id) => { if (command.startsWith("beat")) { const entry = career?.snapshot().selected?.entry; services.beat?.action(command, entry?.id, entry?.manifestHash); return; } if (command !== "suspend") services.beat?.cancel(); if (command !== "chase" && command !== "race") services.chase?.cancelPreparation(); if (command === "suspend") career?.close(); else if (command === "select" && id) career?.select(id); else if (["watch", "coach", "challenge", "download", "publish", "chase", "race"].includes(command)) { void career?.sourceAction(async (source) => { if (career.snapshot().selected?.entry.kind === "legacy-visual") { if (command !== "watch") throw new Error("This tool requires a canonical capsule"); replayLibrary.watch(source, "profile"); return undefined; } else { if (command === "challenge" && career.snapshot().selected?.entry.seedRaceRole) throw new Error("Seed-Locked Race requires a fresh Race This Reference start; local challenge forks are unsupported"); await services.enterCareerSource?.(source, command, career.snapshot().selected?.entry.manifestHash); if ((command === "chase" || command === "race") && !services.chase?.snapshot().active && services.chase?.snapshot().message) throw new Error(services.chase.snapshot().message); } }); } else career?.control(command); },
    selectProfileTab: (id) => { if (id !== "career") career?.close(); services.ownerRecovery?.close(); profileTab = id; services.setScroll(0); profileMessage = ""; }, setProfileMessage: (message) => { profileMessage = message; },
    selectAchievementCategory: (id) => { achievementFilter = id; services.setScroll(0); },
    selectLeaderboardTab: (id) => { leaderboardTab = id; services.setScroll(0); leaderboardMessage = ""; },
    selectLeaderboardBoard: (id) => { const [kind, value = ""] = id.split(":"); if (kind === "mode") leaderboardMode = value;
      else if (kind === "difficulty") leaderboardDifficulty = value; services.setScroll(0); leaderboardMessage = ""; },
    watchReplay: (id, from) => { replayLibrary.watch(id, from); },
    watchGhostCapsule: (id) => {
      profileMessage = "Opening the replay…";
      void services.enterGhostTheater(id).then((result) => {
        if (result.kind === "refused") {
          services.ghostVault.setTheaterEligibility(id, result);
          profileMessage = "This replay can't be played back right now.";
        }
      });
    },
    compareGhostCapsule: (id) => {
      const capsule = services.ghostVault.snapshot().capsules.find((entry) => entry.id === id);
      if (capsule?.healthy !== true || capsule.status !== "complete" || !capsule.theaterEligible) {
        profileMessage = "Only complete saved replays can be compared.";
        return;
      }
      if (comparisonSources.includes(id)) {
        comparisonSources = comparisonSources.filter((source) => source !== id);
        profileMessage = comparisonSources.length === 0 ? "Comparison selection cleared."
          : `${String(comparisonSources.length)} comparison source(s) selected.`;
        return;
      }
      if (comparisonSources.length >= 9) {
        profileMessage = "You can compare up to nine replays at once.";
        return;
      }
      comparisonSources = [...comparisonSources, id];
      profileMessage = comparisonSources.length < 2
        ? "Replay selected. Choose at least one more to compare."
        : `${String(comparisonSources.length)} comparison sources selected. Press COMPARE to open them.`;
    },
    openGhostComparison: () => {
      if (comparisonSources.length < 2) {
        profileMessage = "Choose at least two saved replays to compare.";
        return;
      }
      const sources = Object.freeze([...comparisonSources]);
      profileMessage = "Opening the comparison…";
      void services.enterGhostComparison(sources).then((opened) => {
        if (opened) comparisonSources = [];
        else profileMessage = "Those replays could not be opened for comparison.";
      });
    },
    publishReplay: (id) => { replayLibrary.publish(id); },
    repairGhostCapsule: (id) => { services.ghostVault.repair(id); },
  };
  return Object.freeze(adapters);
}
