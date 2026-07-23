export type LegacyScreenId =
  | "menu" | "setup" | "playing" | "paused" | "draft" | "reserve" | "tierup"
  | "settings" | "continue" | "gameover" | "win" | "replay" | "confirmquit"
  | "shop" | "codex" | "profile" | "achievements" | "leaderboards" | "rename"
  | "pgmenu" | "pglab";

export type ScreenAction =
  | { readonly type: "navigate"; readonly to: LegacyScreenId; readonly resetScroll?: boolean; readonly tab?: string }
  | { readonly type: "menu.resumeFinale" }
  | { readonly type: "menu.claimFinale" }
  | { readonly type: "setup.selectMode"; readonly id: string }
  | { readonly type: "setup.selectDifficulty"; readonly id: string }
  | { readonly type: "setup.selectWeapon"; readonly id: string }
  | { readonly type: "setup.selectBoss"; readonly id: string }
  | { readonly type: "setup.start" }
  | { readonly type: "codex.selectTab"; readonly id: string }
  | { readonly type: "codex.selectFilter"; readonly id: string }
  | { readonly type: "codex.cycleSort" }
  | { readonly type: "codex.inspect"; readonly id: string }
  | { readonly type: "shop.buy"; readonly id: string }
  | { readonly type: "profile.selectTab"; readonly id: string }
  | { readonly type: "profile.watchReplay"; readonly id: string }
  | { readonly type: "profile.signIn" }
  | { readonly type: "profile.signOut" }
  | { readonly type: "profile.rename" }
  | { readonly type: "profile.openAchievements" }
  | { readonly type: "profile.play" }
  | { readonly type: "profile.pinReplay"; readonly id: string; readonly pinned: boolean }
  | { readonly type: "profile.publishReplay"; readonly id: string }
  | { readonly type: "profile.deleteReplay"; readonly id: string }
  | { readonly type: "achievements.selectCategory"; readonly id: string }
  | { readonly type: "achievements.inspect"; readonly id: string }
  | { readonly type: "leaderboards.selectTab"; readonly id: string }
  | { readonly type: "leaderboards.selectBoard"; readonly id: string }
  | { readonly type: "leaderboards.watchReplay"; readonly id: string }
  | { readonly type: "replay.togglePause" }
  | { readonly type: "replay.seek"; readonly delta: number }
  | { readonly type: "replay.seekTo"; readonly fraction: number }
  | { readonly type: "replay.jumpChapter"; readonly direction: -1 | 1 }
  | { readonly type: "replay.restart" }
  | { readonly type: "replay.toggleInfo" }
  | { readonly type: "replay.speed"; readonly value: number }
  | { readonly type: "replay.exit" }
  | { readonly type: "settings.selectTab"; readonly id: string }
  | { readonly type: "settings.step"; readonly key: string; readonly delta: number }
  | { readonly type: "settings.toggle"; readonly key: string }
  | { readonly type: "settings.activate"; readonly key: string }
  | { readonly type: "settings.reset" }
  | { readonly type: "rename.submit" }
  | { readonly type: "rename.cancel" }
  | { readonly type: "draft.choose"; readonly index: number }
  | { readonly type: "draft.reroll" }
  | { readonly type: "reserve.choose"; readonly index: number }
  | { readonly type: "tierup.choose"; readonly index: number }
  | { readonly type: "run.resume" }
  | { readonly type: "run.restart" }
  | { readonly type: "run.quit" }
  | { readonly type: "continue.revive" }
  | { readonly type: "continue.giveUp" }
  | { readonly type: "results.retry" }
  | { readonly type: "results.watchReplay" }
  | { readonly type: "results.descendAgain" }
  | { readonly type: "playground.action"; readonly id: string };

export interface ScreenControl {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly label: string; readonly action: ScreenAction;
  readonly enabled?: boolean | undefined; readonly selected?: boolean | undefined; readonly ghost?: boolean | undefined; readonly chip?: boolean | undefined;
  readonly hero?: boolean | undefined; readonly glyph?: string | undefined; readonly dot?: string | undefined; readonly sub?: string | undefined; readonly accent?: string | undefined;
  readonly confirm?: boolean | undefined; readonly hiddenBox?: boolean | undefined; readonly size?: number | undefined;
  readonly pips?: Readonly<{ readonly n: number; readonly filled: number; readonly color: string }> | undefined;
}

export interface ScreenUiPort {
  readonly ink: string;
  font(size: number, bold?: boolean): string;
  readonly t: {
    readonly type: Record<string, number> & { readonly wordmark: number; readonly display: number; readonly h1: number; readonly h2: number; readonly title: number; readonly lead: number; readonly body: number; readonly label: number; readonly caption: number; readonly micro: number };
    readonly font: Readonly<{ readonly brand: string; readonly display: string; readonly body: string; readonly displayWeight: number; readonly bodyWeight: number; readonly bodyMediumWeight: number }>;
    readonly alpha: Record<string, number> & { readonly full: number; readonly soft: number; readonly muted: number; readonly faint: number };
    readonly color: Record<string, string> & { readonly accent: string; readonly muted: string; readonly danger: string };
    readonly metric: Record<string, number> & { readonly btnH: number; readonly btnGap: number };
  };
  text(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: CanvasTextAlign, alpha?: number): void;
  wordmark(context: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion?: boolean): void;
  displayText(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: CanvasTextAlign, alpha?: number): void;
  title(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number): void;
  tag(context: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: CanvasTextAlign, size?: number): void;
  header(context: CanvasRenderingContext2D, title: string, subtitle?: string, animation?: number, hue?: string): void;
  sectionLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number, width: number, hue?: string): number;
  card(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, hovered?: boolean,
    options?: { readonly dashed?: boolean; readonly edge?: string; readonly shimmer?: number }): void;
  panel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void;
  divider(context: CanvasRenderingContext2D, x: number, y: number, width: number, alpha?: number): void;
  bar(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fraction: number, fill?: string, line?: string): void;
  dim(context: CanvasRenderingContext2D, width: number, height: number, alpha?: number): void;
  wrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, size?: number, align?: CanvasTextAlign, alpha?: number): void;
  accentStrip(context: CanvasRenderingContext2D, x: number, y: number, width: number, color?: string, thickness?: number): void;
  fitTitle(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, startSize?: number, minSize?: number): void;
  spine(context: CanvasRenderingContext2D, x: number, y: number, height: number, color?: string, width?: number): void;
  badge(context: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: CanvasTextAlign, size?: number): number;
  avatar(context: CanvasRenderingContext2D, x: number, y: number, size: number): void;
  seal(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, glyph: string, muted?: boolean): void;
  pips(context: CanvasRenderingContext2D, rightX: number, y: number, count: number, filled: number, color?: string): void;
  tabs(context: CanvasRenderingContext2D, id: string, labels: string[], active: number, y: number,
    push?: (button: Readonly<{ x: number; y: number; w: number; h: number; label: string; _tab?: number; _hideBox?: boolean }>) => void): void;
  keyBadge(context: CanvasRenderingContext2D, x: number, y: number, size: number, label: string | number, color?: string): void;
  tierPips(context: CanvasRenderingContext2D, cx: number, y: number, count: number, next: number, color: string): void;
  scrollHint(context: CanvasRenderingContext2D, x: number, y: number, canUp: boolean, canDown: boolean): void;
  finalReward(context: CanvasRenderingContext2D, options: {
    amount: number; label: string; title: string; sigil: string; color: string; reward: string; detail: string;
  }): void;
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
  /** True physical viewport expressed in logical coordinates, including aspect-ratio overscan. */
  readonly screenRectangle: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly safeInsets: Readonly<{ l: number; r: number; t: number; b: number }>;
  enqueue(control: ScreenControl): void;
  renderPreview?(id: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>): void;
}

export interface ChoiceView {
  readonly id: string; readonly label: string; readonly description?: string;
  readonly glyph?: string | undefined; readonly selected?: boolean | undefined; readonly enabled?: boolean | undefined;
  readonly accent?: string | undefined; readonly sub?: string | undefined;
  readonly debug?: boolean | undefined;
}
export interface CardView extends ChoiceView {
  readonly category?: string; readonly badge?: string; readonly owned?: number;
  readonly level?: number; readonly maxLevel?: number; readonly cost?: string;
  readonly tier?: number; readonly tierCount?: number; readonly footer?: string;
  readonly progress?: number; readonly progressLabel?: string; readonly locked?: boolean;
  readonly rewardPrimary?: string; readonly rewardSecondary?: string; readonly rarity?: string;
  readonly previewId?: string; readonly shimmer?: number; readonly flash?: number;
  /** Bestiary detail (source drawBestiaryEntry): stat chips, kill history, rollable affixes. */
  readonly stats?: readonly Readonly<{ label: string; value: string }>[];
  readonly felled?: Readonly<{ label: string; color: string }>;
  readonly affixes?: readonly Readonly<{ id: string; color: string }>[];
  readonly variants?: string;
  readonly boss?: boolean;
}
export interface StatView { readonly label: string; readonly value: string; readonly detail?: string; readonly glyph?: string; readonly accent?: string }
export interface ReplayView { readonly id: string; readonly title: string; readonly detail: string; readonly available?: boolean; readonly badge?: string; readonly timestamp?: string; readonly thumbnailId?: string; readonly pinned?: boolean; readonly shared?: boolean; readonly local?: boolean; readonly rank?: number; readonly mine?: boolean; readonly wave?: string; readonly time?: string; readonly score?: string }
export interface ProgressView {
  readonly label: string; readonly current: number; readonly goal: number; readonly detail?: string; readonly done?: boolean;
  /** Section heading the row belongs to on the pause/defeat progress panel (source drawRunProgressPanel). */
  readonly kind?: "daily" | "achievement";
  readonly barColor?: string; readonly labelColor?: string;
}
export interface DailyChallengeView extends ProgressView { readonly reward: string }

export interface MenuScreenView {
  readonly id: "menu"; readonly playerName: string; readonly signedIn: boolean;
  readonly coins: number; readonly shards: number; readonly unlocked: number;
  readonly modeLabel: string; readonly difficultyLabel: string; readonly biome?: string;
  readonly pendingFinale?: boolean;
}
export interface SetupScreenView {
  readonly id: "setup"; readonly modes: readonly ChoiceView[]; readonly difficulties: readonly ChoiceView[];
  readonly weapons: readonly ChoiceView[]; readonly showDifficulty: boolean; readonly startSummary: string;
  readonly bestSummary?: string; readonly bountySummary?: string;
  readonly bossChoices?: readonly ChoiceView[];
  readonly bounties?: readonly Readonly<{ label: string; detail: string; done: boolean }>[];
}
export interface PlayingScreenView { readonly id: "playing" }
export interface CodexScreenView {
  readonly id: "codex"; readonly tab: string; readonly tabs: readonly ChoiceView[];
  readonly filter?: string; readonly sort?: string; readonly filters?: readonly ChoiceView[];
  readonly cards: readonly CardView[]; readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
  readonly guide?: {
    readonly controls: readonly { readonly keys: readonly string[]; readonly description: string }[];
    readonly controller: readonly string[];
    readonly tricks: readonly { readonly glyph: string; readonly name: string; readonly points: number; readonly description: string }[];
    readonly ladder: readonly { readonly name: string; readonly multiplier: number; readonly fraction: number }[];
    readonly variety: string;
  };
}
export interface ShopScreenView {
  readonly id: "shop"; readonly coins: number; readonly ownedLevels: number; readonly totalLevels: number;
  readonly lifetimeEarned: number; readonly sections: readonly { readonly label: string; readonly items: readonly CardView[] }[];
  readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
}
export interface ProfileScreenView {
  readonly id: "profile"; readonly tab: string; readonly tabs: readonly ChoiceView[]; readonly name: string;
  readonly signedIn: boolean; readonly cloudStatus?: string; readonly stats: readonly StatView[];
  readonly message?: string;
  readonly replays?: readonly ReplayView[]; readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
  readonly passport?: {
    readonly coins: number; readonly shards: number; readonly achievements: string;
    readonly renameLabel?: string; readonly canRename: boolean; readonly canSignIn: boolean; readonly canSignOut: boolean;
    readonly signInLabel?: string; readonly showcases: readonly { readonly glyph: string; readonly color: string }[];
  };
  readonly finest?: { readonly headline: string; readonly detail: string };
  readonly records?: readonly { readonly mode: string; readonly difficulty: string; readonly wave: string; readonly time: string; readonly score: string; readonly accent?: string }[];
  readonly journey?: { readonly biomes: readonly ChoiceView[]; readonly bosses: readonly ChoiceView[] };
  readonly emptyMessage?: string;
}
export interface AchievementsScreenView {
  readonly id: "achievements"; readonly category: string; readonly categories: readonly ChoiceView[];
  readonly unlocked: number; readonly total: number; readonly cards: readonly CardView[];
  readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
  readonly shards?: number; readonly resetsIn?: string; readonly dailies?: readonly DailyChallengeView[]; readonly nextUp?: string;
}
export interface LeaderboardsScreenView {
  readonly id: "leaderboards"; readonly tab: string; readonly tabs: readonly ChoiceView[];
  readonly board?: string; readonly boards?: readonly ChoiceView[]; readonly rows: readonly ReplayView[];
  readonly message?: string; readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
  readonly modes?: readonly ChoiceView[]; readonly difficulties?: readonly ChoiceView[];
  readonly podium?: readonly { readonly rank: number; readonly name: string; readonly detail: string; readonly color: string; readonly mine?: boolean; readonly replayId?: string }[];
  readonly ownRank?: string; readonly signInRequired?: boolean; readonly legacyGhostId?: string;
}
export interface ReplayChapterView { readonly fraction: number; readonly boss: boolean }
export interface ReplayScreenView {
  readonly id: "replay"; readonly title: string; readonly detail: string; readonly paused: boolean;
  readonly speed: number; readonly elapsed: string; readonly duration: string; readonly progress: number;
  readonly stage?: string; readonly score?: string;
  readonly chapters?: readonly ReplayChapterView[]; readonly wave?: number; readonly infoVisible?: boolean;
  readonly infoRows?: readonly StatView[]; readonly loadout?: readonly CardView[];
}
export interface SettingRowView {
  readonly key: string; readonly label: string; readonly value: string; readonly kind: "stepper" | "toggle" | "cycle";
  readonly on?: boolean; readonly enabled?: boolean; readonly note?: string;
}
export interface SettingsScreenView {
  readonly id: "settings"; readonly tab: string; readonly tabs: readonly ChoiceView[];
  readonly sections: readonly { readonly label: string; readonly rows: readonly SettingRowView[] }[];
  readonly returnTo: LegacyScreenId;
  readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
}
export interface RenameScreenView {
  readonly id: "rename"; readonly value: string; readonly length: number; readonly maxLength: number;
  readonly firstRun: boolean; readonly message?: string; readonly minLength?: number;
}
export interface DraftCardView extends CardView { readonly tier?: number; readonly nextTier?: number; readonly badgeColor?: string }
export interface DraftScreenView {
  readonly id: "draft"; readonly wave: number; readonly cards: readonly DraftCardView[]; readonly rerolls: number;
}
export interface ReserveScreenView { readonly id: "reserve"; readonly cards: readonly DraftCardView[] }
export interface TierUpScreenView {
  readonly id: "tierup"; readonly cards: readonly DraftCardView[]; readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
}
export interface PausedScreenView {
  readonly id: "paused"; readonly runSummary?: string; readonly abilities: readonly CardView[]; readonly progress: readonly ProgressView[];
}
export interface ConfirmQuitScreenView { readonly id: "confirmquit" }
export interface ContinueScreenView { readonly id: "continue"; readonly seconds: number; readonly requesting: boolean }
export interface ResultLogView { readonly wave: string; readonly time: string; readonly kills: number; readonly peak: string; readonly peakColor?: string; readonly died?: boolean }
export interface GameoverScreenView {
  readonly id: "gameover"; readonly summary: string; readonly isNew: boolean; readonly best?: string;
  readonly earned: number; readonly coins: number; readonly replayAvailable: boolean;
  readonly abilities: readonly CardView[]; readonly progress: readonly ProgressView[]; readonly log: readonly ResultLogView[];
}
export interface WinScreenView {
  readonly id: "win"; readonly campaign: boolean; readonly score: number; readonly time: string;
  readonly isNew: boolean; readonly earned: number; readonly coins: number; readonly difficulty?: string;
  readonly log: readonly ResultLogView[];
}
export interface PlaygroundScreenView {
  readonly id: "pgmenu" | "pglab"; readonly title: string; readonly subtitle?: string;
  readonly sections: readonly { readonly label: string; readonly choices: readonly ChoiceView[] }[];
  readonly canScrollUp?: boolean; readonly canScrollDown?: boolean;
}

export type LegacyScreenView = MenuScreenView | SetupScreenView | PlayingScreenView | CodexScreenView
  | ShopScreenView | ProfileScreenView | AchievementsScreenView | LeaderboardsScreenView
  | ReplayScreenView | SettingsScreenView | RenameScreenView | DraftScreenView | ReserveScreenView
  | TierUpScreenView | PausedScreenView | ConfirmQuitScreenView | ContinueScreenView
  | GameoverScreenView | WinScreenView | PlaygroundScreenView;

export type ScreenViewById<Id extends LegacyScreenId, View = LegacyScreenView> =
  View extends Readonly<{ id: infer ViewId }> ? Id extends ViewId ? View : never : never;
export type ScreenRenderer<Id extends LegacyScreenId> = (view: ScreenViewById<Id>) => void;
export type LegacyScreenRendererRegistry = { readonly [Id in LegacyScreenId]: ScreenRenderer<Id> };
