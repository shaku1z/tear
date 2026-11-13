import type { ChapterMeasure, ChapterPageLayout, ChapterTextRole, ChapterTypeSizes } from "./chapter-layout";
export type Clock = TearWorldClock;
export type Align = CanvasTextAlign;
export interface UiPalette {
    readonly bomber: string;
    readonly charger: string;
    readonly perfect: string;
}
export interface UiPresentationPolicy {
    readonly view: Readonly<{ w: number; h: number }>;
    readonly colors: UiPalette;
    readonly overscan: Readonly<{ x: number; y: number }>;
}
export interface UiDependencies {
    CLOCK: Clock;
    presentation: UiPresentationPolicy;
    Input: {
        mode?: string;
    };
    controllerGlyph?: (buttonIndex: number) => string;
    clamp: (value: number, minimum: number, maximum: number) => number;
}
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface ButtonSpec extends Rect {
    label: string;
    enabled?: boolean;
    size?: number;
    sel?: boolean;
    ghost?: boolean;
    glyph?: string;
    dot?: string;
    sub?: string;
    hero?: boolean;
    accent?: string;
    pips?: {
        n: number;
        filled: number;
        color: string;
    };
    _a?: number;
    _k?: string;
    _tab?: number;
    _hideBox?: boolean;
}
export interface CardOptions {
    dashed?: boolean;
    edge?: string;
    shimmer?: number;
}
export interface GuardOptions {
    frac: number;
    color?: string;
}
export interface UiOptions {
    /** finalReward: reserve a footer row for action buttons inside the panel. */
    actions?: boolean;
    align?: Align;
    alpha?: number;
    amount?: number;
    anchor?: string;
    auto?: boolean;
    bossName?: string;
    canAdvance?: boolean;
    /** chapter: the per-page caption above the lore column. */
    caption?: string;
    color?: string;
    composition?: string;
    count?: number;
    detail?: string;
    dur?: number;
    epithet?: string;
    /** chapter: the fade amount when it differs from the text amount. */
    fade?: number;
    fill?: string;
    frac?: number;
    guard?: number | GuardOptions;
    /** chapter: the floor colour the prompt is inked against. */
    ground?: string;
    h?: number;
    hint?: string;
    /** chapter: skip-hold charge, 0..1. */
    hold?: number;
    holdRing?: number;
    hpFrac?: number;
    index?: number;
    label?: string;
    line?: string;
    openingLine?: string;
    lowGraphics?: boolean;
    maxWidth?: number;
    morphK?: number;
    morphTo?: string;
    name?: string;
    number?: number | string;
    phaseFlash?: number;
    phaseMarks?: number[];
    rallyFrac?: number;
    ready?: boolean;
    /** chapter: progress through the READY beat, 0..1. */
    readyK?: number;
    /** chapter: a minimum fade reach (logical px from the screen edge). */
    reach?: number;
    reducedMotion?: boolean;
    reveal?: number;
    reward?: string;
    ruleW?: number;
    /** chapter: the biome sky colour (the haze tone and the ink that reads on it). */
    sky?: string;
    screen?: Rect;
    sigil?: string;
    speaker?: string;
    t?: number;
    text?: string;
    time?: number;
    title?: string;
    w?: number;
    wash?: string;
    x?: number;
    y?: number;
}
export type ChapterLayout = ChapterPageLayout & Readonly<{ vw: number; vh: number; sizes: ChapterTypeSizes }>;
export interface TokenSnapshot {
    type: Record<string, number>;
    metric: Record<string, number>;
}

export type CompactLayoutMode = "always" | "phone" | "never";

export interface UiRuntime {
  ink: string;
  t: UiTokens;
  _baseTokens: TokenSnapshot | null;
  /**
   * Live density: touch input owns the UI; compact = phone-sized touch composition;
   * wideSheet = the current screen's phone composition uses the wide compact sheet.
   */
  density: { touch: boolean; compact: boolean; wideSheet: boolean; cssPerLogicalPixel: number; textScale: number };
  _densityProfile: { readonly touch: boolean; readonly cssPerLogicalPixel: number };
  /** always: compact floors on every touch screen; phone: only at phone density; never: plain touch profile. */
  _compactMode: CompactLayoutMode;
  _applyDensity(): void;
  useCompactLayout(ready: boolean, phoneOnly?: boolean): void;
  _togAnim: Record<string, number>;
  _tabAnim: Record<string, number>;
  font(size: number, bold?: boolean): string;
  displayFont(size: number, weight?: number): string;
  bodyFont(size: number, weight?: number): string;
  wordmark(context: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion?: boolean): void;
  trackedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align?: Align): number;
  chapterWash(context: CanvasRenderingContext2D, side: string, amount: number, reach: number, sky?: string): string;
  _chapterTone(options: UiOptions): Readonly<{ ink: string; accent: string }>;
  text(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: Align, alpha?: number): void;
  displayText(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: Align, alpha?: number): void;
  title(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number): void;
  tag(context: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: Align, size?: number): void;
  divider(context: CanvasRenderingContext2D, x: number, y: number, width: number, alpha?: number): void;
  panel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void;
  pips(context: CanvasRenderingContext2D, rightX: number, y: number, count: number, filled: number, color?: string): void;
  cinematicPrompt(context: CanvasRenderingContext2D, options?: UiOptions): void;
  _chapterLayout(options: UiOptions, context?: CanvasRenderingContext2D): ChapterLayout;
  _chapterSizes(): ChapterTypeSizes;
  _chapterFont(role: ChapterTextRole, size: number): string;
  _chapterMeasure(context: CanvasRenderingContext2D): ChapterMeasure;
  _chapterText(context: CanvasRenderingContext2D, text: string, role: ChapterTextRole, size: number, x: number, y: number, align: CanvasTextAlign): void;
  _chapterTicks(context: CanvasRenderingContext2D, layout: ChapterLayout, labelWidth: number, color: string,
    count: number, index: number, amount: number): void;
  chapterHeader(context: CanvasRenderingContext2D, options?: UiOptions): ChapterLayout;
  _fitLabel(context: CanvasRenderingContext2D, label: string, maxWidth: number, size: number, height: number, nav: boolean): TextFitLayout;
  _drawLines(context: CanvasRenderingContext2D, lines: readonly string[], x: number, centerY: number, size: number): void;
  readable(color: string, ratio?: number): string;
  sheetRect(): Rect;
  fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, options: TextFitOptions & { readonly bold?: boolean }): TextFitLayout;
}
import type { TearWorldClock } from "../gameplay/runtime/tear-world-clock";
import type { UiTokens } from "./ui-tokens";
import type { TextFitLayout, TextFitOptions } from "./ui-text-fit";
