import type { Align, UiRuntime } from "./ui-contracts";
import { darkenToContrast, inkIsLight } from "./ui-color";
import { fitTextLayout, type TextFitLayout, type TextFitOptions } from "./ui-text-fit";

export interface TextBoxOptions extends Partial<TextFitOptions> {
  readonly bold?: boolean;
  readonly align?: Align;
  readonly alpha?: number;
  readonly color?: string;
  /** Distance between baselines; defaults to round(size × lineH.body). */
  readonly lineHeight?: number;
  /** Measure only; draw nothing. */
  readonly measureOnly?: boolean;
}

export interface TextBoxResult extends TextFitLayout {
  /** Vertical space consumed: lines × lineHeight. */
  readonly height: number;
  /** Baseline of the last drawn line. */
  readonly lastBaseline: number;
  readonly lineHeight: number;
}

/** Wrapped / fitted text helpers shared by every screen (see ui-text-fit.ts for the rule). */
export function createUiText() {
  return {
    /**
     * A coloured label that stays readable on the current surface: on the paper
     * sheet (dark ink) palette hues are darkened to 4.5:1; on dark surfaces they pass through.
     */
    readable(this: UiRuntime, color: string, ratio = 4.5): string {
      return inkIsLight(this.ink) ? color : darkenToContrast(color, this.t.color.paper, ratio);
    },
    /** Lay out `text` inside `maxWidth` with the shared fitting rule, using the live canvas metrics. */
    fitText(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, maxWidth: number, options: TextFitOptions & { readonly bold?: boolean }): TextFitLayout {
      const bold = options.bold === true;
      return fitTextLayout((value, size) => { ctx.font = this.font(size, bold); return ctx.measureText(value).width; },
        text, maxWidth, options);
    },
    /**
     * Wrapped text in a box. `y` is the first baseline. Returns the height it used so
     * callers lay out below it instead of assuming a line count. Prose wraps first and
     * keeps its size; it only shrinks toward `floor` (default: micro) when `maxLines`
     * would otherwise be exceeded, then ellipsizes the last line.
     */
    textBox(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, options: TextBoxOptions = {}): TextBoxResult {
      const size = options.size ?? this.t.type.body;
      const layout = fitTextLayout((value, candidate) => { ctx.font = this.font(candidate, options.bold === true); return ctx.measureText(value).width; },
        text, maxWidth, { size, floor: options.floor ?? Math.min(size, this.t.type.micro), maxLines: options.maxLines ?? 99,
          wrapFirst: options.wrapFirst ?? true, ...(options.ellipsis === undefined ? {} : { ellipsis: options.ellipsis }) });
      const lineHeight = options.lineHeight ?? Math.round(layout.size * this.t.lineH.body);
      if (options.measureOnly !== true) {
        ctx.save();
        ctx.globalAlpha *= options.alpha ?? this.t.alpha.full;
        ctx.fillStyle = options.color ?? this.ink;
        ctx.font = this.font(layout.size, options.bold === true);
        ctx.textAlign = options.align ?? "left";
        ctx.textBaseline = "alphabetic";
        layout.lines.forEach((line, index) => { ctx.fillText(line, x, y + index * lineHeight); });
        ctx.restore();
      }
      return Object.freeze({ ...layout, height: layout.lines.length * lineHeight,
        lastBaseline: y + Math.max(0, layout.lines.length - 1) * lineHeight, lineHeight });
    },
  };
}
