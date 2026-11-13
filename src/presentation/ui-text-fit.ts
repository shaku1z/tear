/**
 * The one text-fitting rule shared by every interface component.
 *
 * 1. Measure the text at its requested size.
 * 2. If it is too wide, step the size down one pixel at a time to a floor
 *    (normally the `micro` token).
 * 3. If it still does not fit and the box allows more than one line, wrap.
 * 4. Only then ellipsize the last line, and never when the caller forbids it
 *    (primary navigation labels).
 *
 * The function is pure: it receives a measuring callback, so it can be unit
 * tested without a canvas and reused by any renderer.
 */
export interface TextFitOptions {
  /** Requested size in logical px. */
  readonly size: number;
  /** Smallest size the text may step down to. Defaults to `size` (no shrinking). */
  readonly floor?: number;
  /** Maximum number of lines the box can hold (default 1). */
  readonly maxLines?: number;
  /** False forbids the final ellipsis (the text may then overflow its box). */
  readonly ellipsis?: boolean;
  /** Wrap before shrinking: prose keeps its size and only shrinks if wrapping is not enough. */
  readonly wrapFirst?: boolean;
}

export interface TextFitLayout {
  readonly size: number;
  readonly lines: readonly string[];
  /** True when the last line was shortened with an ellipsis. */
  readonly truncated: boolean;
  /** True when even the final layout is wider than the box (ellipsis forbidden). */
  readonly overflow: boolean;
}

export type MeasureText = (text: string, size: number) => number;

const ELLIPSIS = "…";

/** Greedy word wrap. A single word wider than the box stays on its own line. */
export function wrapWords(measure: MeasureText, text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((word) => word.length > 0);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Greedy wrap on single spaces, the rule of the canvas paragraph helpers: a
 * word moves to a new line when the current line plus that word is wider than
 * the box. Unlike `wrapWords` it keeps empty words and newline characters as
 * written and drops a trailing empty line, so those paragraphs lay out as before.
 */
export function wrapSpaceSeparated(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shorten one line until it and an ellipsis fit. */
export function ellipsizeLine(measure: MeasureText, text: string, maxWidth: number, size: number): string {
  if (measure(text, size) <= maxWidth) return text;
  let low = 0,
    high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, middle).trimEnd() + ELLIPSIS, size) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low).trimEnd() + ELLIPSIS;
}

function widest(measure: MeasureText, lines: readonly string[], size: number): number {
  return lines.reduce((width, line) => Math.max(width, measure(line, size)), 0);
}

export function fitTextLayout(
  measure: MeasureText,
  text: string,
  maxWidth: number,
  options: TextFitOptions,
): TextFitLayout {
  const floor = Math.min(options.size, options.floor ?? options.size);
  const maxLines = Math.max(1, Math.floor(options.maxLines ?? 1));
  const allowEllipsis = options.ellipsis !== false;
  const fitsAt = (size: number, lines: number): readonly string[] | null => {
    const wrapped = lines === 1 && !text.includes("\n") ? [text] : wrapWords(measure, text, maxWidth, size);
    return wrapped.length <= lines && widest(measure, wrapped, size) <= maxWidth ? wrapped : null;
  };
  for (const [size, lines] of attemptOrder(options.size, floor, maxLines, options.wrapFirst === true)) {
    const fitted = fitsAt(size, lines);
    if (fitted !== null)
      return Object.freeze({ size, lines: Object.freeze([...fitted]), truncated: false, overflow: false });
  }
  // Nothing fits: keep the floor size, keep the allowed lines, then ellipsize the last one.
  const wrapped = wrapWords(measure, text, maxWidth, floor);
  const kept = wrapped.slice(0, maxLines);
  const rest = wrapped.slice(maxLines - 1).join(" ");
  if (!allowEllipsis) {
    const lines = maxLines === 1 ? [text] : [...kept.slice(0, -1), rest];
    return Object.freeze({ size: floor, lines: Object.freeze(lines), truncated: false, overflow: true });
  }
  const last = ellipsizeLine(measure, rest, maxWidth, floor);
  const lines = [...kept.slice(0, -1), last];
  return Object.freeze({ size: floor, lines: Object.freeze(lines), truncated: last !== rest, overflow: false });
}

/**
 * The [size, lines] layouts to try, in order. Wrap-first keeps the requested size
 * across every line count before stepping down; otherwise every size is tried on
 * one line before wrapping at the floor size.
 */
function attemptOrder(
  size: number,
  floor: number,
  maxLines: number,
  wrapFirst: boolean,
): readonly (readonly [number, number])[] {
  if (wrapFirst) {
    return [
      ...lineCounts(maxLines).flatMap((lines) => [[size, lines] as const]),
      ...sizes(size, floor)
        .slice(1)
        .flatMap((candidate) => lineCounts(maxLines).map((lines) => [candidate, lines] as const)),
    ];
  }
  return [
    ...sizes(size, floor).map((candidate) => [candidate, 1] as const),
    ...lineCounts(maxLines)
      .slice(1)
      .flatMap((lines) => [[floor, lines] as const]),
  ];
}

function sizes(from: number, floor: number): number[] {
  const values: number[] = [];
  for (let size = from; size >= floor; size -= 1) values.push(size);
  if (values.length === 0) values.push(from);
  return values;
}

function lineCounts(maxLines: number): number[] {
  return Array.from({ length: maxLines }, (_, index) => index + 1);
}
