import type { LegacyScreenId, ScreenAction } from "../../domain/screen-actions";
export type { LegacyScreenId, ScreenAction } from "../../domain/screen-actions";

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
  readonly detail?: string | undefined;
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
export interface ReplayView { readonly id: string; readonly title: string; readonly detail: string; readonly available?: boolean; readonly repairable?: boolean; readonly comparisonSelected?: boolean; readonly comparisonSourceCount?: number; readonly badge?: string; readonly timestamp?: string; readonly thumbnailId?: string; readonly pinned?: boolean; readonly shared?: boolean; readonly local?: boolean; readonly rank?: number; readonly mine?: boolean; readonly wave?: string; readonly time?: string; readonly score?: string }
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
  readonly nowPlaying?: Readonly<{ label: string; detail: string }>;
}
export interface SetupScreenView {
  readonly id: "setup"; readonly modes: readonly ChoiceView[]; readonly difficulties: readonly ChoiceView[];
  readonly weapons: readonly ChoiceView[]; readonly showDifficulty: boolean; readonly startSummary: string;
  readonly startGlyph: string;
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
export interface ReplayComparisonView {
  readonly eventType: string; readonly occurrence: number; readonly index: number; readonly total: number;
  readonly runs: readonly Readonly<{ sourceId: string; tick: number | null; semanticHash: string | null }>[];
}
export interface ReplayScreenView {
  readonly id: "replay"; readonly title: string; readonly detail: string; readonly paused: boolean;
  readonly speed: number; readonly elapsed: string; readonly duration: string; readonly progress: number;
  readonly stage?: string; readonly score?: string;
  readonly chapters?: readonly ReplayChapterView[]; readonly wave?: number; readonly infoVisible?: boolean;
  readonly infoRows?: readonly StatView[]; readonly loadout?: readonly CardView[];
  /** Ghost 3's semantic Theater reuses the mature replay transport chrome. */
  readonly theater?: boolean;
  /** Only verified recorded checkpoints can begin an unranked practice child. */
  readonly practiceAvailable?: boolean;
  /** C29 comparison is semantic source-simulation evidence, not output-device fidelity. */
  readonly comparison?: ReplayComparisonView;
  readonly notice?: string;
  /** C37 Coach is an explicit, local same-build comparison; missing domains stay unavailable. */
  readonly coach?: Readonly<{
    readonly targetId: string; readonly baselineId?: string; readonly buildId?: string; readonly provenanceHash?: string;
    readonly candidates: readonly Readonly<{ id: string; enabled: boolean; detail: string }>[];
    readonly findings: readonly Readonly<{ id: string; domain: string; detail: string; practiceAvailable: boolean }>[];
    readonly unavailable: readonly string[];
  }>;
  /** C37 verified, immutable Run DNA projection; absent metrics remain explicitly unavailable. */
  readonly runDna?: Readonly<{
    readonly available: boolean; readonly formulaVersion: string; readonly evidenceCustody: string;
    readonly sourceMetrics: Readonly<Record<string, number | undefined>>;
    readonly dimensions?: Readonly<Record<string, number>>; readonly unavailable: readonly string[];
  }>;
  /** C37 local-only immutable Studio decision list; no media renderer is wired. */
  readonly studioCutList?: Readonly<{
    readonly available: boolean; readonly sourceGhostId?: string; readonly sourceRootHash?: string;
    readonly fromTick?: number; readonly toTick?: number; readonly edlHash?: string; readonly unavailable?: string;
  }>;
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
  /** Present only for a locally running Player Watch; never a Foundry operation. */
  readonly playerWatch?: Readonly<{ readonly status: "running" | "paused"; readonly decisions: number }>;
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
export interface AcademyScreenView {
  readonly id: "academy";
  readonly status: "loading" | "ready" | "unavailable";
  readonly subtitle: string;
  readonly rows: readonly Readonly<{ readonly label: string; readonly value: string }>[];
  readonly records: readonly (Readonly<{ readonly id: string; readonly state: string; readonly detail: string; readonly candidateHash?: string; readonly canWithdrawModelTraining?: boolean }>)[];
  readonly manifests: readonly (Readonly<{ readonly id: string; readonly detail: string }>)[];
  readonly lessons?: readonly (Readonly<{ readonly id: string; readonly state: string; readonly detail: string }>)[];
  /** C33 exposes immutable plan progress and only session-gated decisions authorized by that plan; it cannot activate or promote a policy. */
  readonly daggerPrograms?: readonly (Readonly<{ readonly id: string; readonly state: string; readonly detail: string; readonly programId?: string; readonly canAdvance?: boolean;
    readonly correctionHash?: string; readonly canReview?: boolean }>)[];
  /** C35 local, signed-in consent decision. It is never inferred from a recording or ordinary Academy custody. */
  readonly humanCalibrationConsent?: Readonly<{ readonly state: "loading" | "unavailable" | "not-enrolled" | "enabled" | "revoked"; readonly detail: string;
    readonly canOptIn: boolean; readonly canRevoke: boolean }>;
}

/** Read-only C36 local recovery projection. It deliberately contains no custody or model data. */
export interface FoundryScreenView {
  readonly id: "foundry";
  readonly status: "loading" | "unavailable" | "ready";
  readonly subtitle: string;
  /** Local lifecycle scheduler state; it never implies a worker, cloud task, policy activation, or promotion. */
  readonly automation: "unavailable" | "local";
  /** Opaque launch-authority state only. No profile inputs, hashes, or custody cross into presentation. */
  readonly launchProfiles: readonly Readonly<{ readonly profileId: string; readonly disposition: "eligible" | "blocked"; }>[];
  readonly jobs: readonly Readonly<{ readonly jobHash: string; readonly phase: string; readonly nextManualPhase: string | null;
    readonly resumable: boolean; readonly eventCount: number; readonly lastEventHash: string; readonly projectionHash: string; }>[];
  /** Configured local scheduling intent only; it does not imply an installed worker or execution. */
  readonly schedules: readonly Readonly<{ readonly scheduleHash: string; readonly jobHash: string; readonly state: "enabled" | "disabled";
    readonly disposition: string; readonly dueAt: string | null; readonly intervalMs: number; readonly revision: number;
    readonly runtimeStatus: "disabled" | "configured" | "due" | "running" | "blocked" | "error"; }>[];
}

/** Normal-build C37 hub. It projects only player-safe local routes and explicit gaps. */
export interface GhostLabScreenView {
  readonly id: "ghostlab";
  readonly subtitle: string;
  readonly routes: readonly Readonly<{
    readonly id: "academy" | "foundry" | "vault" | "watch" | "botevidence";
    readonly label: string;
    readonly detail: string;
  }>[];
  readonly unavailable: readonly Readonly<{ readonly label: string; readonly detail: string }>[];
  readonly watch: Readonly<{ readonly status: "checking" | "unavailable" | "ready" | "starting" | "running" | "paused" | "stopped"; readonly detail: string; readonly decisions: number }>;
}

/** A read-only projection of exactly one retained C35 canonical report. */
export interface BotEvidenceScreenView {
  readonly id: "botevidence";
  readonly status: "unavailable" | "ready";
  readonly subtitle: string;
  readonly detail: string;
  readonly report?: Readonly<{
    readonly reportHash: string; readonly planHash: string; readonly artifactId: string;
    readonly approvalHash: string; readonly promotionReceiptHash: string; readonly artifactHash: string;
    readonly activationHash: string; readonly candidatePayloadHash: string;
    readonly episodes: number; readonly completionRate: number; readonly meanTicks: number; readonly maxTicksPerCase: number;
    readonly placement: "unassigned"; readonly humanCalibration: "not-compared"; readonly certification: "not-certified";
  }>;
}

/** C38 review is a local authority-and-intent screen, never a transport status. */
export interface GhostPublicationScreenView {
  readonly id: "ghostpublication"; readonly status: "unavailable" | "ready" | "queued" | "uploading" | "terminal";
  readonly detail: string; readonly capsuleId?: string; readonly rootIntegrity?: string;
  readonly capability: string; readonly privacy: "pseudonymous"; readonly visibility: "private";
  readonly training: "no-training"; readonly canGrant: boolean; readonly canRun?: boolean; readonly canCancel?: boolean;
  readonly attempts?: number; readonly retryAt?: string; readonly terminal?: string;
}

export type LegacyScreenView = MenuScreenView | SetupScreenView | PlayingScreenView | CodexScreenView
  | ShopScreenView | ProfileScreenView | AchievementsScreenView | LeaderboardsScreenView
  | ReplayScreenView | SettingsScreenView | RenameScreenView | DraftScreenView | ReserveScreenView
  | TierUpScreenView | PausedScreenView | ConfirmQuitScreenView | ContinueScreenView
  | GameoverScreenView | WinScreenView | PlaygroundScreenView | AcademyScreenView | FoundryScreenView | GhostLabScreenView | BotEvidenceScreenView | GhostPublicationScreenView;

export type ScreenViewById<Id extends LegacyScreenId, View = LegacyScreenView> =
  View extends Readonly<{ id: infer ViewId }> ? Id extends ViewId ? View : never : never;
export type ScreenRenderer<Id extends LegacyScreenId> = (view: ScreenViewById<Id>) => void;
export type LegacyScreenRendererRegistry = { readonly [Id in LegacyScreenId]: ScreenRenderer<Id> };
