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

/** Bound on remembered layouts; a screen lays out a few hundred distinct strings at most. */
const TEXT_LAYOUT_CACHE_LIMIT = 1_024;
/** Cannot occur in a font family or a number, so key fields never run together. */
const KEY_SEPARATOR = "\u0000";

interface RememberedLayout {
  readonly layout: TextFitLayout;
  /** The context font the measurement left behind; callers may draw or measure with it next. */
  readonly font: string | undefined;
}

/**
 * Remembers fitted layouts. A layout is a pure function of the font family and
 * weight, the box width, the fitting options and the text, given the loaded font
 * faces, so a hit returns the identical layout and leaves the context font where
 * measuring would have left it. Clear it when a font face finishes loading.
 */
export class TextLayoutCache {
  readonly #entries = new Map<string, RememberedLayout>();

  fit(ui: UiRuntime, ctx: CanvasRenderingContext2D, text: string, maxWidth: number, options: TextFitOptions, bold: boolean): TextFitLayout {
    const key = [ui.t.font.brand, bold ? "bold" : "", maxWidth, options.size, options.floor, options.maxLines, options.ellipsis,
      options.wrapFirst, text].join(KEY_SEPARATOR);
    const remembered = this.#entries.get(key);
    if (remembered !== undefined) {
      if (remembered.font !== undefined) ctx.font = remembered.font;
      return remembered.layout;
    }
    let font: string | undefined;
    const layout = fitTextLayout((value, size) => {
      font = ui.font(size, bold);
      ctx.font = font;
      return ctx.measureText(value).width;
    }, text, maxWidth, options);
    if (this.#entries.size >= TEXT_LAYOUT_CACHE_LIMIT) this.#entries.delete(this.#entries.keys().next().value ?? "");
    this.#entries.set(key, { layout, font });
    return layout;
  }

  clear(): void {
    this.#entries.clear();
  }
}

/** Wrapped / fitted text helpers shared by every screen (see ui-text-fit.ts for the rule). */
export function createUiText() {
  const layouts = new TextLayoutCache();
  return {
    /** Forgets remembered text layouts; call it when a font face finishes loading. */
    clearTextLayouts(): void {
      layouts.clear();
    },
    /**
     * A coloured label that stays readable on the current surface: on the paper
     * sheet (dark ink) palette hues are darkened to 4.5:1; on dark surfaces they pass through.
     */
    readable(this: UiRuntime, color: string, ratio = 4.5): string {
      return inkIsLight(this.ink) ? color : darkenToContrast(color, this.t.color.paper, ratio);
    },
    /** Lay out `text` inside `maxWidth` with the shared fitting rule, using the live canvas metrics. */
    fitText(
      this: UiRuntime,
      ctx: CanvasRenderingContext2D,
      text: string,
      maxWidth: number,
      options: TextFitOptions & { readonly bold?: boolean },
    ): TextFitLayout {
      return layouts.fit(this, ctx, text, maxWidth, options, options.bold === true);
    },
    /**
     * Wrapped text in a box. `y` is the first baseline. Returns the height it used so
     * callers lay out below it instead of assuming a line count. Prose wraps first and
     * keeps its size; it only shrinks toward `floor` (default: micro) when `maxLines`
     * would otherwise be exceeded, then ellipsizes the last line.
     */
    textBox(this: UiRuntime, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, options: TextBoxOptions = {}): TextBoxResult {
      const size = options.size ?? this.t.type.body;
      const layout = layouts.fit(this, ctx, text, maxWidth, {
        size,
        floor: options.floor ?? Math.min(size, this.t.type.micro),
        maxLines: options.maxLines ?? 99,
        wrapFirst: options.wrapFirst ?? true,
        ...(options.ellipsis === undefined ? {} : { ellipsis: options.ellipsis }),
      }, options.bold === true);
      const lineHeight = options.lineHeight ?? Math.round(layout.size * this.t.lineH.body);
      if (options.measureOnly !== true) {
        ctx.save();
        ctx.globalAlpha *= options.alpha ?? this.t.alpha.full;
        ctx.fillStyle = options.color ?? this.ink;
        ctx.font = this.font(layout.size, options.bold === true);
        ctx.textAlign = options.align ?? "left";
        ctx.textBaseline = "alphabetic";
        layout.lines.forEach((line, index) => {
          ctx.fillText(line, x, y + index * lineHeight);
        });
        ctx.restore();
      }
      return Object.freeze({ ...layout, height: layout.lines.length * lineHeight,
        lastBaseline: y + Math.max(0, layout.lines.length - 1) * lineHeight, lineHeight });
    },
  };
}
