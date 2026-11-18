import type { CareerRow, CareerQuery, CareerUsage } from "../../ghost/career-archive";
import type { ScreenAction } from "../../domain/screen-actions";
import type { AppScreen } from "../../domain/screen-catalog";
import type { TutorialSessionView } from "../../gameplay/training/tutorial-controller";
import type { ScreenUiPort } from "./screen-ui-port";
export type { ScreenAction } from "../../domain/screen-actions";
export type { ScreenUiPort, ScreenUiTokens } from "./screen-ui-port";

export interface ScreenControl {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
  readonly action: ScreenAction;
  readonly enabled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly ghost?: boolean | undefined;
  readonly chip?: boolean | undefined;
  readonly hero?: boolean | undefined;
  readonly glyph?: string | undefined;
  readonly dot?: string | undefined;
  readonly sub?: string | undefined;
  readonly accent?: string | undefined;
  readonly confirm?: boolean | undefined;
  readonly hiddenBox?: boolean | undefined;
  readonly size?: number | undefined;
  readonly pips?: Readonly<{ readonly n: number; readonly filled: number; readonly color: string }> | undefined;
}

export interface ScreenRenderContext {
  readonly canvas: CanvasRenderingContext2D;
  readonly ui: ScreenUiPort;
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly enterAmount: number;
  /** Raw seconds since the screen was entered (drives staggered deal-in animations). */
  readonly enterSeconds: number;
  /** UI-frame delta seconds (drives hover-animation lerps). */
  readonly deltaSeconds: number;
  /** Logical-space pointer position for canvas hover states. */
  readonly mouse: Readonly<{ x: number; y: number }>;
  readonly scroll: number;
  readonly focus: number;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  /** Device pixels per logical unit this frame (the canvas backing scale): what image art picks its size by. */
  readonly pixelScale: number;
  /** True physical viewport expressed in logical coordinates, including aspect-ratio overscan. */
  readonly screenRectangle: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly safeInsets: Readonly<{ l: number; r: number; t: number; b: number }>;
  enqueue(control: ScreenControl): void;
  /** A phone composition owns its scroll extent: it writes back the clamped scroll it measured. */
  setScroll?(value: number): void;
  /** Whether an action's surface is available in this build (layout hint; unavailable controls are never enqueued). */
  available?(action: ScreenAction): boolean;
  renderPreview?(id: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>): void;
}

export interface ChoiceView {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly glyph?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly enabled?: boolean | undefined;
  readonly accent?: string | undefined;
  readonly sub?: string | undefined;
  readonly detail?: string | undefined;
  readonly debug?: boolean | undefined;
}
export interface CardView extends ChoiceView {
  readonly category?: string;
  readonly badge?: string;
  readonly owned?: number;
  readonly level?: number;
  readonly maxLevel?: number;
  readonly cost?: string;
  readonly tier?: number;
  readonly tierCount?: number;
  readonly footer?: string;
  readonly progress?: number;
  readonly progressLabel?: string;
  readonly locked?: boolean;
  readonly rewardPrimary?: string;
  readonly rewardSecondary?: string;
  readonly rarity?: string;
  readonly previewId?: string;
  readonly shimmer?: number;
  readonly flash?: number;
  /** Bestiary detail (source drawBestiaryEntry): stat chips, kill history, rollable affixes. */
  readonly stats?: readonly Readonly<{ label: string; value: string }>[];
  readonly felled?: Readonly<{ label: string; color: string }>;
  readonly affixes?: readonly Readonly<{ id: string; color: string }>[];
  readonly variants?: string;
  readonly boss?: boolean;
}
export interface StatView {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly glyph?: string;
  readonly accent?: string;
}
export interface ReplayView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly available?: boolean;
  readonly repairable?: boolean;
  readonly canDownloadArchive?: boolean;
  readonly canDownloadLinkedPair?: boolean;
  readonly theaterUnavailable?: boolean;
  readonly comparisonSelected?: boolean;
  readonly comparisonSourceCount?: number;
  readonly badge?: string;
  readonly timestamp?: string;
  readonly thumbnailId?: string;
  readonly pinned?: boolean;
  readonly shared?: boolean;
  readonly local?: boolean;
  readonly rank?: number;
  readonly mine?: boolean;
  readonly wave?: string;
  readonly time?: string;
  readonly score?: string;
}
export interface GhostArchiveOperationView {
  readonly status:
    | "idle"
    | "unavailable"
    | "picking"
    | "validating"
    | "ready"
    | "restoring"
    | "reselect-required"
    | "complete"
    | "cancelled"
    | "failed"
    | "download-requested";
  readonly detail: string;
  readonly canPick: boolean;
  readonly jobId?: string;
  readonly revision?: number;
  readonly capsuleId?: string;
  readonly schemaVersion?: number;
  readonly byteLength?: number;
  readonly sha256?: string;
  readonly rootIntegrity?: string;
  readonly pairedCapsuleIds?: readonly string[];
  readonly canRestore?: boolean;
  readonly canReselect?: boolean;
  readonly canCancel?: boolean;
  readonly canCancelSelection?: boolean;
}
export interface ProgressView {
  readonly label: string;
  readonly current: number;
  readonly goal: number;
  readonly detail?: string;
  readonly done?: boolean;
  /** Section heading the row belongs to on the pause/defeat progress panel (source drawRunProgressPanel). */
  readonly kind?: "daily" | "achievement";
  readonly barColor?: string;
  readonly labelColor?: string;
}
export interface DailyChallengeView extends ProgressView {
  readonly reward: string;
}

export interface MenuScreenView {
  readonly practiceAvailable?: boolean;
  readonly id: "menu";
  readonly playerName: string;
  readonly signedIn: boolean;
  readonly coins: number;
  readonly shards: number;
  readonly unlocked: number;
  readonly modeLabel: string;
  readonly difficultyLabel: string;
  readonly biome?: string;
  /** Replaces the PLAY sub-label (mode · difficulty), e.g. the first-run tutorial nudge. */
  readonly playSub?: string;
  readonly pendingFinale?: boolean;
  readonly nowPlaying?: Readonly<{ label: string; detail: string }>;
}
export interface SetupScreenView {
  readonly practiceAvailable?: boolean;
  readonly id: "setup";
  readonly modes: readonly ChoiceView[];
  readonly difficulties: readonly ChoiceView[];
  readonly weapons: readonly ChoiceView[];
  readonly showDifficulty: boolean;
  readonly startSummary: string;
  /** Context glyph for START; empty unless a controller owns input. */
  readonly startGlyph: string;
  /** One line of plain first-run guidance shown near START. */
  readonly guidance?: string;
  readonly bestSummary?: string;
  readonly bountySummary?: string;
  readonly bossChoices?: readonly ChoiceView[];
  readonly bounties?: readonly Readonly<{ label: string; detail: string; done: boolean }>[];
  /** Engineering builds only: the selected mode can create a Seed-Locked Race. */
  readonly raceAvailable?: boolean;
}
export interface PlayingScreenView {
  readonly id: "playing";
}
export interface CodexScreenView {
  readonly id: "codex";
  readonly tab: string;
  readonly tabs: readonly ChoiceView[];
  readonly filter?: string;
  readonly sort?: string;
  readonly filters?: readonly ChoiceView[];
  readonly cards: readonly CardView[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
  readonly guide?: {
    readonly controls: readonly { readonly keys: readonly string[]; readonly description: string }[];
    readonly controller: readonly string[];
    readonly tricks: readonly {
      readonly glyph: string;
      readonly name: string;
      readonly points: number;
      readonly description: string;
    }[];
    readonly ladder: readonly { readonly name: string; readonly multiplier: number; readonly fraction: number }[];
    readonly variety: string;
  };
}
/** The colours and text a cosmetic look is made of, for the small preview on its card. */
export interface ShardSwatchView {
  readonly colors: readonly string[];
  readonly text?: string;
}
/** One card on a shelf. `id` is null for the game own look in that slot. */
export interface ShardCardView {
  readonly id: string | null;
  readonly slot: string;
  readonly label: string;
  readonly tier: string;
  readonly state: "equipped" | "owned" | "available" | "locked" | "elsewhere";
  /** Shown while the item is for sale. */
  readonly price?: number;
  readonly affordable: boolean;
  /** What to do to get it, for a locked or earned-elsewhere item; empty otherwise. */
  readonly note: string;
  readonly isNew: boolean;
  readonly swatch: ShardSwatchView;
}
export interface ShardShelfView {
  readonly slot: string;
  readonly label: string;
  /** False when nothing draws this slot in a run yet. */
  readonly hookReady: boolean;
  readonly cards: readonly ShardCardView[];
}
export interface ShardsView {
  /** Shards left to spend. */
  readonly balance: number;
  /** Shards earned in total. */
  readonly earned: number;
  readonly shelves: readonly ShardShelfView[];
}
export interface ShopScreenView {
  readonly tab: string;
  readonly tabs: readonly ChoiceView[];
  readonly shards?: ShardsView;
  readonly race?: Readonly<{ ordinal: number; carried?: DraftCardView; pass: boolean }>;
  readonly onboarding?: string;
  readonly id: "shop";
  readonly coins: number;
  readonly ownedLevels: number;
  readonly totalLevels: number;
  readonly lifetimeEarned: number;
  readonly sections: readonly { readonly label: string; readonly items: readonly CardView[] }[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
}
export interface ProfileScreenView {
  readonly id: "profile";
  readonly tab: string;
  readonly tabs: readonly ChoiceView[];
  readonly name: string;
  readonly signedIn: boolean;
  readonly cloudStatus?: string;
  readonly stats: readonly StatView[];
  readonly message?: string;
  readonly replays?: readonly ReplayView[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
  readonly passport?: {
    readonly coins: number;
    readonly shards: number;
    readonly achievements: string;
    readonly renameLabel?: string;
    readonly canRename: boolean;
    readonly canSignIn: boolean;
    readonly canSignOut: boolean;
    readonly signInLabel?: string;
    readonly showcases: readonly { readonly glyph: string; readonly color: string }[];
  };
  readonly finest?: { readonly headline: string; readonly detail: string };
  readonly records?: readonly {
    readonly mode: string;
    readonly difficulty: string;
    readonly wave: string;
    readonly time: string;
    readonly score: string;
    readonly accent?: string;
  }[];
  readonly journey?: { readonly biomes: readonly ChoiceView[]; readonly bosses: readonly ChoiceView[] };
  readonly emptyMessage?: string;
  readonly career?: Readonly<{
    usage?: CareerUsage;
    status: "idle" | "loading" | "ready" | "failed";
    indexing: boolean;
    message: string;
    query: CareerQuery;
    rows: readonly CareerRow[];
    selected: CareerRow | undefined;
    confirming: boolean;
    retained: number;
    known: number;
    total: number;
    page: number;
    pages: number;
  }>;
  readonly archive?: GhostArchiveOperationView;
}
export interface AchievementsScreenView {
  readonly id: "achievements";
  readonly category: string;
  readonly categories: readonly ChoiceView[];
  readonly unlocked: number;
  readonly total: number;
  readonly cards: readonly CardView[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
  readonly shards?: number;
  readonly resetsIn?: string;
  readonly dailies?: readonly DailyChallengeView[];
  readonly nextUp?: string;
}
export interface LeaderboardsScreenView {
  readonly id: "leaderboards";
  readonly tab: string;
  readonly tabs: readonly ChoiceView[];
  readonly board?: string;
  readonly boards?: readonly ChoiceView[];
  readonly rows: readonly ReplayView[];
  readonly message?: string;
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
  readonly modes?: readonly ChoiceView[];
  readonly difficulties?: readonly ChoiceView[];
  readonly podium?: readonly {
    readonly rank: number;
    readonly name: string;
    readonly detail: string;
    readonly color: string;
    readonly mine?: boolean;
    readonly replayId?: string;
  }[];
  readonly ownRank?: string;
  readonly signInRequired?: boolean;
  readonly legacyGhostId?: string;
  /** Distinct designed states: account needed, loading, unreachable, nothing recorded yet, or rows to show. */
  readonly status?: "signin" | "loading" | "offline" | "empty" | "ready";
}
export interface ReplayChapterView {
  readonly fraction: number;
  readonly boss: boolean;
}
export interface ReplayComparisonView {
  readonly eventType: string;
  readonly occurrence: number;
  readonly index: number;
  readonly total: number;
  readonly runs: readonly Readonly<{ sourceId: string; tick: number | null; semanticHash: string | null }>[];
}
export interface ReplayScreenView {
  readonly finaleNavigation?: "FINALE CONTINUATION" | "BACK TO SCORED RUN";
  readonly id: "replay";
  readonly title: string;
  readonly detail: string;
  readonly paused: boolean;
  readonly speed: number;
  readonly elapsed: string;
  readonly duration: string;
  readonly progress: number;
  readonly stage?: string;
  readonly score?: string;
  readonly chapters?: readonly ReplayChapterView[];
  readonly wave?: number;
  readonly infoVisible?: boolean;
  readonly infoRows?: readonly StatView[];
  readonly loadout?: readonly CardView[];
  /** Ghost 3's semantic Theater reuses the mature replay transport chrome. */
  readonly theater?: boolean;
  /** Only verified recorded checkpoints can begin an unranked practice child. */
  readonly practiceAvailable?: boolean;
  /** C29 comparison is semantic source-simulation evidence, not output-device fidelity. */
  readonly comparison?: ReplayComparisonView;
  readonly notice?: string;
  /** Explicit selected-recording observations; no skill or accuracy inference. */
  readonly bossMemory?: Readonly<{ available: boolean; title?: string; notes?: string; result?: string }>;
  readonly challenge?: Readonly<{
    tick: number;
    choices: readonly Readonly<{ id: string; label: string }>[];
    result?: string;
    elapsedTicks?: number;
  }>;
  /** C37 verified, immutable Run DNA projection; absent metrics remain explicitly unavailable. */
  readonly runDna?: Readonly<{
    readonly available: boolean;
    readonly formulaVersion: string;
    readonly evidenceCustody: string;
    readonly nativePolicy?: string;
    readonly sourceMetrics: Readonly<Record<string, number | undefined>>;
    readonly dimensions?: Readonly<Record<string, number>>;
    readonly unavailable: readonly string[];
  }>;
  readonly worldVisible?: boolean;
  readonly studioMedia?: Readonly<{
    available: boolean;
    status: string;
    markIn: number | undefined;
    thumbnail: string | undefined;
    duration: number | undefined;
  }>;
  /** C37 immutable decision list; media work stays in the app adapter. */
  readonly studioCutList?: Readonly<{
    readonly available: boolean;
    readonly sourceGhostId?: string;
    readonly sourceRootHash?: string;
    readonly fromTick?: number;
    readonly toTick?: number;
    readonly edlHash?: string;
    readonly unavailable?: string;
    readonly clipCount?: number;
  }>;
}
export interface SettingRowView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly kind: "stepper" | "toggle" | "cycle";
  readonly on?: boolean;
  readonly enabled?: boolean;
  readonly note?: string;
  /** A stepper's companion mute switch (toggled through settings.toggle with this key). */
  readonly muteKey?: string;
  readonly muted?: boolean;
}
export interface SettingsScreenView {
  readonly id: "settings";
  readonly tab: string;
  readonly tabs: readonly ChoiceView[];
  readonly sections: readonly { readonly label: string; readonly rows: readonly SettingRowView[] }[];
  readonly returnTo: AppScreen;
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
}
/**
 * How a song or collection is pictured: one hue per band (a single stage is one band; a mixed
 * collection splits into up to four) and one glyph, and, where its stages have paintings, `art`
 * (up to four stage ids), drawn instead of the bands once loaded. Null draws the default.
 */
export type MusicCoverView = Readonly<{
  hues: readonly string[];
  glyph: string;
  art?: readonly string[];
  locked?: boolean;
}> | null;
/** One song wherever the MUSIC screen shows it: a track row, a shelf row or the transport. */
export interface MusicSongView {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  /** For example "The Grounds", "Boss · Echo" or "Menu"; empty when no route plays it. */
  readonly where: string;
  readonly art: MusicCoverView;
  /** Length of one loop of the song, in seconds; null before the music index has loaded. */
  readonly seconds: number | null;
  readonly previewing: boolean;
  readonly playing: boolean;
}
/** A set of songs with a page of its own: the whole soundtrack, one stage, the boss themes. */
export interface MusicCollectionView {
  readonly id: string;
  readonly title: string;
  /** Small line above the title: "Stage", "Soundtrack", "Collection". */
  readonly kicker: string;
  readonly cover: MusicCoverView;
  readonly songs: readonly MusicSongView[];
  /** Sum of the songs' loop lengths. */
  readonly seconds: number;
}
/** One Home shelf. Three layouts only; a new shelf is data. */
export type MusicShelfView =
  | Readonly<{ layout: "feature"; heading: string; song: MusicSongView | null; queue: readonly string[] }>
  | Readonly<{ layout: "tiles"; heading: string; collections: readonly MusicCollectionView[] }>
  | Readonly<{ layout: "rows"; heading: string; open: string; songs: readonly MusicSongView[] }>;
/** Home (shelves), a collection's page (Songs is the whole soundtrack's) or the playback settings. */
export type MusicPage = "home" | "collection" | "settings";
export interface MusicScreenView {
  readonly id: "music";
  readonly page: MusicPage;
  readonly title: string;
  /** Rail (desktop) or chip strip (phone): Home · Songs · Settings, the current one selected. */
  readonly rail: readonly ChoiceView[];
  /** The stage collections, in campaign order, for the rail's Stages list. */
  readonly stages: readonly MusicCollectionView[];
  readonly shelves: readonly MusicShelfView[];
  /** The whole soundtrack, for Home's last row; null while loading. */
  readonly soundtrack: MusicCollectionView | null;
  /** The open collection on a collection page. */
  readonly collection: MusicCollectionView | null;
  /** Where BACK (and controller B) goes: up one level, then out to the menu. */
  readonly back: ScreenAction;
  /** What is sounding now, for the transport; null before anything has played. */
  readonly nowPlaying: Readonly<{
    title: string;
    where: string;
    art: MusicCoverView;
    previewing: boolean;
    /** Position in the loop, 0..1; null when unknown. */
    progress: number | null;
  }> | null;
  /** ◀◀/▶▶ step through the queue the preview started from. */
  readonly canStep: boolean;
  /** The first song of the soundtrack, which ▶ plays when nothing is playing. */
  readonly start: Readonly<{ id: string; queue: readonly string[] }> | null;
  /** Every catalogued song in catalog order; empty while the music index is still loading. */
  readonly songs: readonly MusicSongView[];
  readonly loading: boolean;
  /** Menu music and soundtrack behavior, activated through `settings.activate`. */
  readonly playback: readonly SettingRowView[];
}
export interface RenameScreenView {
  readonly id: "rename";
  readonly value: string;
  readonly length: number;
  readonly maxLength: number;
  readonly firstRun: boolean;
  readonly message?: string;
  readonly minLength?: number;
}
export interface DraftCardView extends CardView {
  readonly tier?: number;
  readonly nextTier?: number;
  readonly badgeColor?: string;
}
export interface DraftScreenView {
  readonly race?: Readonly<{ ordinal: number; carried?: DraftCardView; pass: boolean }>;
  readonly onboarding?: string;
  readonly id: "draft";
  readonly wave: number;
  readonly cards: readonly DraftCardView[];
  readonly rerolls: number;
}
export interface ReserveScreenView {
  readonly race?: boolean;
  readonly keepCarried?: boolean;
  readonly id: "reserve";
  readonly cards: readonly DraftCardView[];
}
export interface TierUpScreenView {
  readonly id: "tierup";
  readonly cards: readonly DraftCardView[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
}
export interface PausedScreenView {
  readonly ghostChase?: Readonly<{ visible: boolean; message: string }>;
  readonly tutorial?: TutorialSessionView;
  /** A paused Playground run: the pause offers the Playground menu. */
  readonly playground?: boolean;
  readonly id: "paused";
  readonly runSummary?: string;
  readonly abilities: readonly CardView[];
  readonly progress: readonly ProgressView[];
}
export interface ConfirmQuitScreenView {
  readonly id: "confirmquit";
  readonly practice?: boolean;
}
export interface ContinueScreenView {
  readonly id: "continue";
  readonly seconds: number;
  readonly requesting: boolean;
}
export interface ResultLogView {
  readonly wave: string;
  readonly time: string;
  readonly kills: number;
  readonly peak: string;
  readonly peakColor?: string;
  readonly died?: boolean;
}
export interface GameoverScreenView {
  readonly id: "gameover";
  readonly summary: string;
  readonly isNew: boolean;
  readonly best?: string;
  readonly earned: number;
  readonly coins: number;
  readonly replayAvailable: boolean;
  /** The run scored: rewards get the celebration styling (a 0-point run keeps its coins quietly). */
  readonly celebrate: boolean;
  readonly abilities: readonly CardView[];
  readonly progress: readonly ProgressView[];
  readonly log: readonly ResultLogView[];
}
export interface WinScreenView {
  readonly id: "win";
  readonly campaign: boolean;
  /** A mode's own title and first line ("GAUNTLET CLEARED"); the generic VICTORY otherwise. */
  readonly title?: string;
  readonly headline?: string;
  readonly score: number;
  readonly time: string;
  readonly isNew: boolean;
  readonly earned: number;
  readonly coins: number;
  readonly difficulty?: string;
  readonly log: readonly ResultLogView[];
}
export interface PlaygroundScreenView {
  readonly id: "pgmenu" | "pglab";
  readonly title: string;
  readonly subtitle?: string;
  /** The tabs of the Playground menu (SPAWN … ABILITIES); the selected one is on screen. */
  readonly tabs?: readonly ChoiceView[];
  readonly sections: readonly { readonly label: string; readonly choices: readonly ChoiceView[] }[];
  readonly canScrollUp?: boolean;
  readonly canScrollDown?: boolean;
}
export type ScreenView =
  | MenuScreenView
  | SetupScreenView
  | PlayingScreenView
  | CodexScreenView
  | ShopScreenView
  | ProfileScreenView
  | AchievementsScreenView
  | LeaderboardsScreenView
  | ReplayScreenView
  | SettingsScreenView
  | MusicScreenView
  | RenameScreenView
  | DraftScreenView
  | ReserveScreenView
  | TierUpScreenView
  | PausedScreenView
  | ConfirmQuitScreenView
  | ContinueScreenView
  | GameoverScreenView
  | WinScreenView
  | PlaygroundScreenView;

export type ScreenViewById<Id extends AppScreen, View = ScreenView> =
  View extends Readonly<{ id: infer ViewId }> ? (Id extends ViewId ? View : never) : never;
export type ScreenRenderer<Id extends AppScreen> = (view: ScreenViewById<Id>) => void;
export type ScreenRendererTable = { readonly [Id in AppScreen]: ScreenRenderer<Id> };
