import type { TextBoxOptions, TextBoxResult } from "../ui-text";
import type { TextFitLayout, TextFitOptions } from "../ui-text-fit";

/** The design tokens screen renderers read (a structural view of the live UI token set). */
export interface ScreenUiTokens {
  readonly type: Record<string, number> & {
    readonly wordmark: number;
    readonly display: number;
    readonly h1: number;
    readonly h2: number;
    readonly title: number;
    readonly lead: number;
    readonly body: number;
    readonly label: number;
    readonly caption: number;
    readonly micro: number;
  };
  readonly font: Readonly<{
    readonly brand: string;
    readonly display: string;
    readonly body: string;
    readonly displayWeight: number;
    readonly bodyWeight: number;
    readonly bodyMediumWeight: number;
  }>;
  readonly space: Readonly<{
    readonly xs: number;
    readonly sm: number;
    readonly md: number;
    readonly lg: number;
    readonly xl: number;
  }>;
  readonly alpha: Record<string, number> & {
    readonly full: number;
    readonly soft: number;
    readonly muted: number;
    readonly faint: number;
    readonly rail: number;
    readonly railMid: number;
    readonly sheet: number;
  };
  readonly color: Record<string, string> & {
    readonly accent: string;
    readonly muted: string;
    readonly danger: string;
    readonly paper: string;
    readonly rail: string;
    readonly railInk: string;
    readonly unique: string;
  };
  readonly metric: Record<string, number> & {
    readonly btnH: number;
    readonly btnW: number;
    readonly panelPad: number;
    readonly btnGap: number;
    readonly pageTitleY: number;
    readonly pageBodyTop: number;
    readonly backW: number;
    readonly settingsRowH: number;
    readonly settingsControlW: number;
    readonly settingsControlH: number;
    readonly settingsStepperW: number;
    readonly minTarget: number;
    /** Shortest row of a button list; `buttonFitHeight` never answers less. */
    readonly listRowH: number;
    readonly railFadeW: number;
    readonly railFadeMid: number;
  };
}

/** The text of a default button, which is all its fitted size depends on. */
export type ButtonText = Readonly<{
  label: string;
  size?: number | undefined;
  glyph?: string | undefined;
  sub?: string | undefined;
  pips?: Readonly<{ n: number; filled: number; color: string }> | undefined;
}>;

/** The drawing components screen renderers use; the live UI runtime satisfies it structurally. */
export interface ScreenUiPort {
  readonly ink: string;
  /** Live density: `compact` marks a phone-sized touch screen (fewer columns, scrolling pages). */
  readonly density: Readonly<{ touch: boolean; compact: boolean }>;
  font(size: number, bold?: boolean): string;
  readonly t: ScreenUiTokens;
  text(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size?: number,
    align?: CanvasTextAlign,
    alpha?: number,
  ): void;
  wordmark(context: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion?: boolean): void;
  displayText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size?: number,
    align?: CanvasTextAlign,
    alpha?: number,
  ): void;
  title(context: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number): void;
  tag(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color?: string,
    align?: CanvasTextAlign,
    size?: number,
  ): void;
  /** A key legend ("A D / ← →") in the bold tag face, arrows drawn with the letters' weight; returns its width. */
  keyLegend(
    context: CanvasRenderingContext2D,
    legend: string,
    x: number,
    y: number,
    color?: string,
    align?: CanvasTextAlign,
    size?: number,
  ): number;
  header(context: CanvasRenderingContext2D, title: string, subtitle?: string, animation?: number, hue?: string): void;
  sectionLabel(
    context: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    width: number,
    hue?: string,
  ): number;
  card(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    hovered?: boolean,
    options?: { readonly dashed?: boolean; readonly edge?: string; readonly shimmer?: number },
  ): void;
  panel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void;
  divider(context: CanvasRenderingContext2D, x: number, y: number, width: number, alpha?: number): void;
  bar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fraction: number,
    fill?: string,
    line?: string,
  ): void;
  dim(context: CanvasRenderingContext2D, width: number, height: number, alpha?: number): void;
  wrappedText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    size?: number,
    align?: CanvasTextAlign,
    alpha?: number,
  ): void;
  accentStrip(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    color?: string,
    thickness?: number,
  ): void;
  fitTitle(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    startSize?: number,
    minSize?: number,
  ): void;
  spine(context: CanvasRenderingContext2D, x: number, y: number, height: number, color?: string, width?: number): void;
  badge(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color?: string,
    align?: CanvasTextAlign,
    size?: number,
  ): number;
  avatar(context: CanvasRenderingContext2D, x: number, y: number, size: number): void;
  seal(
    context: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    color: string,
    glyph: string,
    muted?: boolean,
  ): void;
  pips(
    context: CanvasRenderingContext2D,
    rightX: number,
    y: number,
    count: number,
    filled: number,
    color?: string,
  ): void;
  tabs(
    context: CanvasRenderingContext2D,
    id: string,
    labels: string[],
    active: number,
    y: number,
    push?: (
      button: Readonly<{
        x: number;
        y: number;
        w: number;
        h: number;
        label: string;
        _tab?: number;
        _hideBox?: boolean;
      }>,
    ) => void,
    maxWidth?: number,
    frame?: Readonly<{ x: number; w: number; h: number }>,
  ): void;
  keyBadge(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    label: string | number,
    color?: string,
  ): void;
  tierPips(context: CanvasRenderingContext2D, cx: number, y: number, count: number, next: number, color: string): void;
  scrollHint(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    canUp: boolean,
    canDown: boolean,
    align?: CanvasTextAlign,
  ): void;
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }>;
  sheetFooter(): Readonly<{ y: number; h: number; backX: number }>;
  readable(color: string, ratio?: number): string;
  textBox(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    options?: TextBoxOptions,
  ): TextBoxResult;
  fitText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    options: TextFitOptions & { readonly bold?: boolean },
  ): TextFitLayout;
  /** The width a default button needs for its label (and sub line) on one line at full size. */
  buttonFitWidth(context: CanvasRenderingContext2D, button: ButtonText): number;
  /** The height a default button `w` wide needs for its text at full size (at least a list row). */
  buttonFitHeight(context: CanvasRenderingContext2D, button: ButtonText & Readonly<{ w: number }>): number;
  emptyState(
    context: CanvasRenderingContext2D,
    glyph: string,
    line: string,
    cx: number,
    cy: number,
    detail?: string,
    width?: number,
  ): number;
  finalReward(
    context: CanvasRenderingContext2D,
    options: {
      amount: number;
      label: string;
      title: string;
      sigil: string;
      color: string;
      reward: string;
      detail: string;
      actions?: boolean;
    },
  ): Readonly<{ x: number; y: number; w: number; h: number; actionsY: number }>;
}
