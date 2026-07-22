export type Clock = typeof ClockValue;
export type Config = typeof ConfigValue;
export type Overscan = typeof OverscanValue;
export type Align = CanvasTextAlign;
export interface UiDependencies {
    CLOCK: Clock;
    CONFIG: Config;
    Input: {
        mode?: string;
    };
    OVERSCAN: Overscan;
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
    align?: Align;
    alpha?: number;
    amount?: number;
    anchor?: string;
    auto?: boolean;
    bossName?: string;
    canAdvance?: boolean;
    color?: string;
    composition?: string;
    count?: number;
    detail?: string;
    dur?: number;
    epithet?: string;
    fill?: string;
    frac?: number;
    guard?: number | GuardOptions;
    h?: number;
    hint?: string;
    holdRing?: number;
    hpFrac?: number;
    index?: number;
    label?: string;
    line?: string;
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
    reducedMotion?: boolean;
    reveal?: number;
    reward?: string;
    ruleW?: number;
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
export interface ChapterLayout {
    scale: number;
    SM: number;
    colW: number;
    side: string;
    x: number;
    anchorX: number;
    vw: number;
    vh: number;
    align: Align;
    labelSize: number;
    titleSize: number;
    loreSize: number;
    topY: number;
    loreY: number;
}
export interface TokenSnapshot {
    type: Record<string, number>;
    metric: Record<string, number>;
}

export interface UiRuntime {
  ink: string;
  t: UiTokens;
  _baseTokens: TokenSnapshot | null;
  _togAnim: Record<string, number>;
  _tabAnim: Record<string, number>;
  font(size: number, bold?: boolean): string;
  displayFont(size: number, weight?: number): string;
  bodyFont(size: number, weight?: number): string;
  wordmark(context: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion?: boolean): void;
  trackedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align?: Align): number;
  chapterWash(context: CanvasRenderingContext2D, side: string, washKind: string | undefined, amount: number): string;
  text(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: Align, alpha?: number): void;
  displayText(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, align?: Align, alpha?: number): void;
  title(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number): void;
  tag(context: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: Align, size?: number): void;
  divider(context: CanvasRenderingContext2D, x: number, y: number, width: number, alpha?: number): void;
  panel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void;
  pips(context: CanvasRenderingContext2D, rightX: number, y: number, count: number, filled: number, color?: string): void;
  cinematicPrompt(context: CanvasRenderingContext2D, options?: UiOptions): void;
  _chapterLayout(options: UiOptions): ChapterLayout;
  _bladeMark(context: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, direction: number): void;
}
import type { CLOCK as ClockValue, CONFIG as ConfigValue, OVERSCAN as OverscanValue } from "../config/game-config";
import type { UiTokens } from "./ui-tokens";
