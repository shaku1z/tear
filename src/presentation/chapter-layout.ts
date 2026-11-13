/**
 * Pure geometry of the living-biome chapter composition (no canvas).
 *
 * A chapter writes itself into the upper sky on one side of the arena: a tracked
 * label (the chapter numeral), a condensed display title with a short accent rule,
 * an optional page caption and a mono lore column. The block stays above the
 * arena's platforms; `tests/unit/chapter-layout.test.ts` proves that for every
 * authored stage. The renderer measures with the live canvas, the test with the
 * fonts' fixed advances, and both run this one layout.
 */
export type ChapterTextRole = "label" | "title" | "caption" | "body" | "line" | "prompt";

/** Advance width of `text` in `role` at `size`, including that role's tracking. */
export type ChapterMeasure = (text: string, role: ChapterTextRole, size: number) => number;

export interface ChapterLayoutTokens {
  readonly safeMargin: number;
  readonly safeVW: number;
  readonly bodyColW: number;
  readonly titleMaxW: number;
  readonly labelY: number;
  readonly titleGap: number;
  readonly ruleGap: number;
  readonly captionGap: number;
  readonly bodyGap: number;
  readonly bodyMaxLines: number;
  readonly floorY: number;
  readonly promptY: number;
}

export interface ChapterTypeSizes {
  readonly label: number;
  readonly title: number;
  readonly titleFloor: number;
  readonly caption: number;
  readonly body: number;
  readonly bodyFloor: number;
  readonly line: number;
  readonly prompt: number;
  readonly bodyLineHeight: number;
  readonly titleLineHeight: number;
}

export interface ChapterPageInput {
  readonly vw: number;
  readonly side: string;
  readonly sizes: ChapterTypeSizes;
  readonly title: string;
  readonly caption?: string | undefined;
  readonly text?: string | undefined;
  readonly line?: string | undefined;
}

export interface ChapterBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ChapterPageLayout {
  readonly side: "left" | "right";
  readonly align: "left" | "right";
  readonly anchorX: number;
  readonly columnW: number;
  readonly labelY: number;
  readonly titleSize: number;
  readonly titleLines: readonly string[];
  readonly titleY: readonly number[];
  readonly ruleY: number;
  readonly captionY: number;
  readonly bodySize: number;
  readonly bodyLineHeight: number;
  readonly bodyLines: readonly string[];
  readonly bodyY: number;
  readonly lineY: number;
  readonly promptY: number;
  /** Every glyph this page draws above the floor, for the clear-field contract. */
  readonly bounds: ChapterBounds;
  /** Distance from the composition's screen edge that the fade keeps dense. */
  readonly reach: number;
}

/** Greedy word wrap; a single word wider than the column keeps its own line. */
export function wrapChapterWords(text: string, maxWidth: number, width: (value: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitTitle(input: ChapterPageInput, maxWidth: number, measure: ChapterMeasure) {
  const { sizes } = input;
  let size = sizes.title;
  let lines = wrapChapterWords(input.title, maxWidth, (value) => measure(value, "title", size));
  while (lines.length > 2 && size > sizes.titleFloor) {
    size = Math.max(sizes.titleFloor, size - 4);
    lines = wrapChapterWords(input.title, maxWidth, (value) => measure(value, "title", size));
  }
  return { size, lines };
}

function fitBody(input: ChapterPageInput, columnW: number, maxLines: number, measure: ChapterMeasure) {
  const { sizes } = input;
  let size = sizes.body;
  let lines = wrapChapterWords(input.text ?? "", columnW, (value) => measure(value, "body", size));
  while (lines.length > maxLines && size > sizes.bodyFloor) {
    size = Math.max(sizes.bodyFloor, size - 1);
    lines = wrapChapterWords(input.text ?? "", columnW, (value) => measure(value, "body", size));
  }
  return { size, lines };
}

/** Lays out one chapter page (or the biome reveal, which passes `line` instead of `text`). */
export function layoutChapterPage(
  input: ChapterPageInput,
  tokens: ChapterLayoutTokens,
  measure: ChapterMeasure,
): ChapterPageLayout {
  const { sizes, vw } = input;
  const margin = Math.max(tokens.safeMargin, vw * tokens.safeVW);
  const columnW = Math.min(Math.max(tokens.bodyColW, sizes.body * 0.6 * 46), vw - margin * 2);
  const side = input.side === "right" ? "right" : "left";
  const anchorX = side === "right" ? vw - margin : margin;
  const title = fitTitle(input, Math.min(tokens.titleMaxW, vw - margin * 2), measure);
  const titleY = title.lines.map(
    (_line, index) => tokens.labelY + tokens.titleGap + title.size * 0.74 + index * title.size * sizes.titleLineHeight,
  );
  const ruleY = (titleY.at(-1) ?? tokens.labelY) + tokens.ruleGap;
  const captionY = ruleY + tokens.captionGap;
  const body = fitBody(input, columnW, tokens.bodyMaxLines, measure);
  const bodyLineHeight = body.size * sizes.bodyLineHeight;
  const bodyY = (input.caption ? captionY : ruleY) + tokens.bodyGap;
  const lineY = ruleY + tokens.bodyGap;
  const widths = [
    measure(input.caption ?? "", "caption", sizes.caption),
    ...title.lines.map((value) => measure(value, "title", title.size)),
    ...body.lines.map((value) => measure(value, "body", body.size)),
    input.line ? measure(input.line, "line", sizes.line) : 0,
  ];
  const extent = Math.max(columnW, ...widths); // the whole column: the field stays stable across pages
  const bottom =
    body.lines.length > 0
      ? bodyY + (body.lines.length - 1) * bodyLineHeight + body.size * 0.3
      : input.line
        ? lineY + sizes.line * 0.3
        : ruleY + 2;
  const bounds =
    side === "right"
      ? { left: anchorX - extent, right: anchorX, top: tokens.labelY - sizes.label, bottom }
      : { left: anchorX, right: anchorX + extent, top: tokens.labelY - sizes.label, bottom };
  return {
    side,
    align: side,
    anchorX,
    columnW,
    labelY: tokens.labelY,
    titleSize: title.size,
    titleLines: title.lines,
    titleY,
    ruleY,
    captionY,
    bodySize: body.size,
    bodyLineHeight,
    bodyLines: body.lines,
    bodyY,
    lineY,
    promptY: tokens.promptY,
    bounds,
    reach: margin + extent,
  };
}
