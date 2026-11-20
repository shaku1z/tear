/**
 * Key legends ("A D / ← →", "S/↓ + SHIFT") drawn with the arrow keys as shapes. A font's arrow
 * glyphs are hairlines next to its bold capitals, so the arrows would read as lighter keys than
 * the letters beside them. Here each arrow is a stroked shaft and a filled head with the weight
 * of a bold capital's stem, and it advances like a capital, so every legend keeps one weight.
 * Every key cap and the controls guide draw their legends through this module.
 */

/** Direction of each arrow key's legend, as a unit step (x right, y down). */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  "←": [-1, 0],
  "→": [1, 0],
  "↑": [0, -1],
  "↓": [0, 1],
});

/** Proportions of the drawn arrow, as fractions of the font size. */
const ARROW = Object.freeze({
  /** Horizontal room an arrow takes: about a bold capital's advance. */
  advance: 0.78,
  /** Tip-to-tail length: a capital's height, so an up or down arrow stands as tall as the letters. */
  length: 0.66,
  /** Shaft weight: a bold capital's stem. */
  weight: 0.15,
  /** Head length along the shaft, and its half-width across it. */
  head: 0.3,
  headHalf: 0.25,
  /** Height of the arrow's centre above the baseline: half a capital's height. */
  middle: 0.32,
});

type LegendRun = Readonly<{ text: string }> | Readonly<{ arrow: readonly [number, number] }>;

/** The legend split into plain text and arrows, in reading order. */
export function keyLegendRuns(legend: string): readonly LegendRun[] {
  const runs: LegendRun[] = [];
  let text = "";
  for (const character of legend) {
    const arrow = ARROWS[character];
    if (arrow === undefined) {
      text += character;
      continue;
    }
    if (text !== "") runs.push({ text });
    text = "";
    runs.push({ arrow });
  }
  if (text !== "") runs.push({ text });
  return runs;
}

const advanceOf = (context: CanvasRenderingContext2D, run: LegendRun, size: number): number =>
  "text" in run ? context.measureText(run.text).width : Math.round(size * ARROW.advance);

/** The width `drawKeyLegend` takes for this legend in the context's current font of `size` px. */
export function measureKeyLegend(context: CanvasRenderingContext2D, legend: string, size: number): number {
  return keyLegendRuns(legend).reduce((width, run) => width + advanceOf(context, run, size), 0);
}

function drawArrow(
  context: CanvasRenderingContext2D,
  [dx, dy]: readonly [number, number],
  left: number,
  baseline: number,
  size: number,
): void {
  const centreX = left + Math.round(size * ARROW.advance) / 2,
    centreY = baseline - size * ARROW.middle,
    half = (size * ARROW.length) / 2,
    head = size * ARROW.head,
    across = size * ARROW.headHalf;
  const tipX = centreX + dx * half,
    tipY = centreY + dy * half,
    baseX = tipX - dx * head,
    baseY = tipY - dy * head;
  context.save();
  context.strokeStyle = context.fillStyle;
  context.lineWidth = Math.max(1.5, size * ARROW.weight);
  context.lineCap = "butt";
  context.beginPath();
  context.moveTo(centreX - dx * half, centreY - dy * half);
  context.lineTo(baseX + dx * 0.5, baseY + dy * 0.5); // into the head, so no seam shows
  context.stroke();
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(baseX - dy * across, baseY + dx * across);
  context.lineTo(baseX + dy * across, baseY - dx * across);
  context.closePath();
  context.fill();
  context.restore();
}

/**
 * Draws a key legend in the context's current font (`size` px) and fill, aligned on `x` like
 * `fillText` on the alphabetic baseline `y`. Returns the width drawn.
 */
export function drawKeyLegend(
  context: CanvasRenderingContext2D,
  legend: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign = "left",
): number {
  const width = measureKeyLegend(context, legend, size);
  let cursor = align === "center" ? x - width / 2 : align === "right" || align === "end" ? x - width : x;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const run of keyLegendRuns(legend)) {
    if ("text" in run) context.fillText(run.text, cursor, y);
    else drawArrow(context, run.arrow, cursor, y, size);
    cursor += advanceOf(context, run, size);
  }
  context.restore();
  return width;
}
