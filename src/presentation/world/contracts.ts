export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface WorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface WorldPoint { readonly x: number; readonly y: number }
export interface WorldSegment { readonly a: WorldPoint; readonly b: WorldPoint; readonly radius?: number }

export interface WorldUiPort {
  readonly t: {
    readonly type: Record<string, number> & {
      readonly display: number; readonly h2: number; readonly title: number; readonly lead: number;
      readonly body: number; readonly label: number; readonly caption: number; readonly micro: number;
    };
    readonly alpha: Record<string, number> & { readonly soft: number; readonly muted: number; readonly faint: number };
    readonly color: Record<string, string> & {
      readonly accent: string; readonly muted: string; readonly paper: string; readonly danger: string;
      readonly scrim: string; readonly scrimInk: string;
    };
    readonly metric: Record<string, number> & {
      readonly bossHudH: number; readonly bossNotchH: number; readonly bossGuardGap: number; readonly bossGuardH: number;
      readonly barH: number; readonly hudPad: number; readonly hudBarW: number; readonly hudAbilityRows: number;
    };
    readonly space: Readonly<{ xs: number; sm: number; md: number; lg: number; xl: number }>;
  };
  /** Live density: `compact` marks a phone-sized touch screen. */
  readonly density: Readonly<{ touch: boolean; compact: boolean }>;
  /** The live interface ink (flipped per biome); HUD marks and text use it directly. */
  readonly ink: string;
  /** A palette hue made readable as text on the current HUD surface. */
  readable(color: string, ratio?: number): string;
  /** The contrasting surface behind an in-run teaching card (tutorial lesson, playground help); never behind HUD groups. */
  hudPlate(canvas: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
  displayText(canvas: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: CanvasTextAlign, alpha?: number): void;
  fitText(canvas: CanvasRenderingContext2D, text: string, maxWidth: number, options: Readonly<{
    size: number; floor?: number; maxLines?: number; ellipsis?: boolean; wrapFirst?: boolean; bold?: boolean;
  }>): Readonly<{ size: number; lines: readonly string[]; truncated: boolean }>;
  textBox(canvas: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, options?: Readonly<{
    size?: number; floor?: number; maxLines?: number; bold?: boolean; align?: CanvasTextAlign; alpha?: number;
    color?: string; lineHeight?: number; measureOnly?: boolean;
  }>): Readonly<{ size: number; lines: readonly string[]; height: number; lineHeight: number }>;
  /** A bordered key cap; returns its width. */
  keycap(canvas: CanvasRenderingContext2D, key: string, x: number, y: number): number;
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }>;
  /** The sheet's footer row: its top, height, and the BACK control's left edge. */
  sheetFooter(): Readonly<{ y: number; h: number; backX: number }>;
  font(size: number, bold?: boolean): string;
  text(canvas: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: CanvasTextAlign, alpha?: number): void;
  title(canvas: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number): void;
  tag(canvas: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: CanvasTextAlign, size?: number): void;
  bossHud(canvas: CanvasRenderingContext2D, options: {
    readonly x: number; readonly y: number; readonly w: number; readonly h: number;
    readonly frac: number; readonly fill: string; readonly phaseMarks?: number[];
    readonly phaseFlash?: number; readonly guard?: number;
    readonly time?: number; readonly lowGraphics?: boolean;
  }): void;
  bossIntro(canvas: CanvasRenderingContext2D, options: {
    readonly screen: WorldRect; readonly bossName: string; readonly epithet: string; readonly openingLine: string;
    readonly color: string; readonly t: number; readonly dur: number;
  }): void;
}

export interface WorldRenderContext {
  readonly canvas: CanvasRenderingContext2D;
  readonly ui: WorldUiPort;
  readonly width: number;
  readonly height: number;
  readonly cssPerLogicalPixel?: number;
  readonly safe: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly screen: WorldRect;
  readonly ink: string;
  readonly darkTheme: boolean;
  readonly timeSeconds: number;
  readonly lowGraphics: boolean;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
}

export interface EnemyStatusSnapshot {
  readonly x: number; readonly y: number; readonly halfWidth: number; readonly halfHeight: number;
  readonly bleedStacks: number; readonly bleedMaximum: number; readonly burnTime: number; readonly markTime: number;
  readonly bleedColor: string; readonly burnColor: string; readonly markColor: string;
}

export interface DebugPlatformSnapshot extends WorldRect {
  readonly id: string; readonly isVoid: boolean; readonly state?: string | undefined;
  readonly lane?: string | undefined; readonly chunkId?: number | undefined;
}

export interface DebugProjectileSnapshot {
  readonly x: number; readonly y: number; readonly radius: number; readonly family: string;
  readonly counterplay: string; readonly sweeperState?: string | undefined;
}

export interface DebugZoneSnapshot {
  readonly x: number; readonly width: number; readonly nextOn: boolean; readonly warningAmount: number;
}

export interface DebugEnemySnapshot {
  readonly geometry: readonly WorldSegment[];
  readonly zones: readonly DebugZoneSnapshot[];
}

export interface PantheonDebugSnapshot {
  readonly enabled: boolean;
  readonly visibleBounds?: WorldBounds | undefined;
  readonly paintedBounds?: WorldBounds | undefined;
  readonly platforms: readonly DebugPlatformSnapshot[];
  readonly brokenPlatforms: readonly DebugPlatformSnapshot[];
  readonly transferWindows: readonly { readonly x0: number; readonly x1: number }[];
  readonly connections: readonly WorldSegment[];
  readonly projectiles: readonly DebugProjectileSnapshot[];
  readonly enemies: readonly DebugEnemySnapshot[];
  readonly sourceUpperY: number; readonly sourceLowerY: number; readonly groundY: number; readonly defaultZoneWidth: number;
}

export interface FinaleAnchorSnapshot {
  readonly x: number; readonly y: number; readonly radius: number; readonly depth: number; readonly cut: boolean;
}

export interface FinaleWorldSnapshot {
  readonly phase: string; readonly origin: WorldPoint; readonly anchors: readonly FinaleAnchorSnapshot[];
  readonly severedIndex: number; readonly restoredColor: boolean; readonly restoring: boolean;
  readonly restoredGravity: boolean; readonly tearClosed: boolean; readonly restoreAmount: number;
  readonly cutFlash: number; readonly relicProgress: number; readonly fragmentCap: number;
  readonly stageAccents: readonly string[]; readonly groundY: number; readonly perfectColor: string;
  readonly relicColors: readonly [string, string, string, string];
  readonly blade?: WorldPoint | undefined;
}

export interface PlayerHudSnapshot {
  readonly hp: number; readonly maxHp: number; readonly hpFraction: number; readonly lagHpFraction: number;
  readonly lowHpPulse: number; readonly oneHit: boolean; readonly accent: string;
  readonly dashCharges: number; readonly maxDashCharges: number; readonly dashRechargeFraction: number; readonly dashColor: string;
  readonly shield: number; readonly maxShield: number; readonly shieldColor: string;
  readonly abilities: readonly string[];
}

export interface RunHudSnapshot {
  readonly mode: string; readonly bossWave: boolean; readonly wave: number; readonly score: number;
  readonly timeLabel: string; readonly remaining: number; readonly multiplier: number; readonly rank?: string | undefined;
  readonly multiplierPop: number; readonly comboFraction: number; readonly trickColor: string;
}

export interface BossHudSnapshot {
  readonly name: string; readonly epithet?: string | undefined; readonly phaseTag?: string | undefined;
  readonly color: string; readonly hpFraction: number; readonly phaseMarks?: readonly number[] | undefined;
  readonly phaseFlash: number; readonly guard?: number | undefined; readonly introSweep?: number | undefined;
}

export interface HudSnapshot {
  readonly player: PlayerHudSnapshot;
  readonly run: RunHudSnapshot;
  readonly boss?: BossHudSnapshot | undefined;
}

export interface TutorialCardSnapshot {
  readonly annex?: boolean;
  readonly enemyPractice?: boolean; readonly bossPractice?: boolean;
  readonly lessonIndex: number; readonly lessonCount: number; readonly title: string; readonly description: string;
  readonly keys: readonly string[]; readonly final: boolean; readonly completedBeat: number;
  readonly arenaLabel?: string; readonly teachingFocus?: string;
  readonly progress?: { readonly current: number; readonly goal: number } | undefined;
  /** Lowest edge of an on-screen control in the top-right corner (touch pause) the card must clear. */
  readonly clearTop?: number | undefined;
}

export interface PlaygroundHelpSnapshot {
  readonly weaponId: string; readonly heldHits: number; readonly throws: number; readonly throwHits: number;
  readonly perfectParries: number; readonly breakTriggers: number;
  /** Lowest edge of an on-screen control in the top-right corner (touch pause) the panel must clear. */
  readonly clearTop?: number | undefined;
}

export interface AchievementToastSnapshot {
  readonly name: string; readonly description: string; readonly rarityName: string; readonly rarityColor: string;
  readonly categoryIcon: string; readonly shards: number; readonly coins: number; readonly reveal: number;
  /**
   * Where the toast rests: "hud" in a run (top-right of the HUD frame), "corner" on menus
   * and run overlays (bottom-right), "sheet-footer" on sheet screens (left of BACK).
   */
  readonly placement?: "hud" | "corner" | "sheet-footer";
  /** In a run, the lowest on-screen control the toast must stay below (the touch pause button). */
  readonly clearTop?: number;
}

export interface TouchButtonSnapshot extends WorldPoint {
  readonly radius: number; readonly label: string; readonly held: boolean; readonly prominent?: boolean | undefined;
}

export interface TouchControlsSnapshot {
  readonly joystick: {
    readonly active: boolean; readonly anchorX: number; readonly anchorY: number; readonly dx: number; readonly dy: number;
    /** Ring radius and resting position, from the input layer's touch layout. */
    readonly radius: number; readonly homeX: number; readonly homeY: number;
  };
  readonly aim?: { readonly x: number; readonly y: number } | undefined;
  readonly aimPad: { readonly x: number; readonly y: number; readonly r: number };
  readonly buttons: readonly TouchButtonSnapshot[];
  readonly onboardingAlpha: number;
}

export interface WaveBannerSnapshot {
  readonly remainingFraction: number; readonly bossWave: boolean; readonly wave: number;
  readonly waveTag?: string | undefined; readonly horde: boolean; readonly hordeColor: string; readonly normalColor: string;
}

export interface BossIntroSnapshot {
  readonly screen: WorldRect; readonly bossName: string; readonly epithet: string; readonly openingLine: string;
  readonly color: string; readonly elapsed: number; readonly duration: number;
}

export interface StageBannerSnapshot {
  readonly elapsed: number; readonly mode: string; readonly stageIndex: number; readonly stageName: string;
  readonly blurb: string; readonly accent: string;
}

export interface ReticleSnapshot {
  readonly x: number; readonly y: number; readonly power?: "slam" | "updraft" | undefined;
  readonly slamColor: string; readonly updraftColor: string;
}

export interface WorldRendererRegistry {
  enemyStatus(snapshot: EnemyStatusSnapshot): void;
  pantheonDebug(snapshot: PantheonDebugSnapshot): void;
  finaleWorld(layer: "rear" | "front", snapshot: FinaleWorldSnapshot): void;
  hud(snapshot: HudSnapshot): void;
  tutorialCard(snapshot: TutorialCardSnapshot): void;
  playgroundHelp(snapshot: PlaygroundHelpSnapshot): void;
  achievementToast(snapshot: AchievementToastSnapshot): void;
  touchControls(snapshot: TouchControlsSnapshot): void;
  waveBanner(snapshot: WaveBannerSnapshot): void;
  bossIntro(snapshot: BossIntroSnapshot): void;
  stageBanner(snapshot: StageBannerSnapshot): void;
  reticle(snapshot: ReticleSnapshot): void;
}
