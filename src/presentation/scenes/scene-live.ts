/**
 * Draws what moves in a painted stage: water, motes and parts that sway or
 * breathe. The caller has already moved the canvas into the owning layer's
 * coordinates. Everything is a closed form of the frame's time; `still` draws
 * the stage at rest (reduced motion, low graphics), which shows the parts that
 * belong to the picture and none of the motion.
 */
import type { Rect, SceneLive, SceneLiveMotes, SceneLivePart, SceneLiveWater, SceneSway } from "./scene-contract";
import type { SceneBitmap } from "./scene-renderer";

const TURN = Math.PI * 2;
/** The second wave train runs the other way, this much faster, at this share of the first's size. */
const COUNTER_WAVE_RATE = 1.7;
const COUNTER_WAVE_SHARE = 0.4;
/** The second train's rows are spread this much wider in phase, so the two never line up down the water. */
const COUNTER_WAVE_PHASE = 2.3;
/** A glint is lit for the top part of its cycle only, so most of the water is unlit at any moment. */
const GLINT_THRESHOLD = 0.55;
const GLINT_THICKNESS = 1.2;
/** World units over which a mote fades in and out at the edge of its area. */
const MOTE_EDGE_FADE = 28;
const MOTE_TWINKLE = 0.35;
/** A mote twinkles this many times per wander, each from its own point in the cycle. */
const MOTE_TWINKLE_RATE = 2.1;
const MOTE_TWINKLE_PHASE = 3;
/** Neighbouring sway slices overlap by this much of the image, so leaning apart never opens a slit. */
const SLICE_OVERLAP_PX = 1;

export interface LiveFrame {
  readonly timeSeconds: number;
  /** Draw the stage at rest: no motion, only the parts that are part of the picture. */
  readonly still: boolean;
  /** 0..1 fade-in of the whole stage. */
  readonly opacity: number;
}

/** The layer a live entry belongs to: its painted image and where that image sits. */
export interface LiveLayer {
  readonly bitmap: SceneBitmap;
  readonly rect: Rect;
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

function drawWater(context: CanvasRenderingContext2D, water: SceneLiveWater, layer: LiveLayer, frame: LiveFrame): void {
  const [x, y, w, h] = layer.rect;
  const scaleY = layer.bitmap.height / h;
  const turn = (frame.timeSeconds / water.period) * TURN;
  context.globalAlpha = frame.opacity;
  for (const row of water.rows) {
    const shift =
      row.reach *
      (Math.sin(turn + row.phase) +
        COUNTER_WAVE_SHARE * Math.sin(-turn * COUNTER_WAVE_RATE + row.phase * COUNTER_WAVE_PHASE));
    context.drawImage(
      layer.bitmap,
      0,
      (row.y - y) * scaleY,
      layer.bitmap.width,
      row.h * scaleY,
      x + shift,
      row.y,
      w,
      row.h,
    );
  }
  for (const glint of water.glints) {
    const lit = Math.sin((frame.timeSeconds / glint.period) * TURN + glint.phase);
    if (lit <= GLINT_THRESHOLD) continue;
    const strength = (lit - GLINT_THRESHOLD) / (1 - GLINT_THRESHOLD);
    context.fillStyle = `rgba(${water.glintColor},${String(water.glintAlpha * strength * frame.opacity)})`;
    context.fillRect(glint.x - (glint.w * strength) / 2, glint.y, glint.w * strength, GLINT_THICKNESS);
  }
}

function drawMotes(context: CanvasRenderingContext2D, field: SceneLiveMotes, frame: LiveFrame): void {
  const [x, y, w, h] = field.area;
  const time = frame.timeSeconds;
  for (const mote of field.motes) {
    const wander = Math.sin((time / field.period) * TURN + mote.phase);
    const mx = wrap(mote.x + field.drift[0] * time + field.wobble * wander, w);
    const my = wrap(mote.y + field.drift[1] * time, h);
    const edge = Math.min(
      1,
      mx / MOTE_EDGE_FADE,
      (w - mx) / MOTE_EDGE_FADE,
      my / MOTE_EDGE_FADE,
      (h - my) / MOTE_EDGE_FADE,
    );
    const twinkle =
      1 -
      MOTE_TWINKLE *
        (0.5 + 0.5 * Math.sin((time / field.period) * TURN * MOTE_TWINKLE_RATE + mote.phase * MOTE_TWINKLE_PHASE));
    context.fillStyle = `rgba(${field.color},${String(field.alpha * edge * twinkle * frame.opacity)})`;
    context.beginPath();
    context.arc(x + mx, y + my, mote.size, 0, TURN);
    context.fill();
  }
}

function drawSwaying(
  context: CanvasRenderingContext2D,
  bitmap: SceneBitmap,
  rect: Rect,
  sway: SceneSway,
  timeSeconds: number,
): void {
  const [x, y, w, h] = rect;
  const pivotY = sway.pivot === "top" ? y : y + h;
  const lean = sway.pivot === "top" ? sway.reach / h : -sway.reach / h;
  const sliceWorld = w / sway.slices;
  const slicePx = bitmap.width / sway.slices;
  const overlapWorld = (SLICE_OVERLAP_PX * w) / bitmap.width;
  for (let index = 0; index < sway.slices; index += 1) {
    const shear = lean * Math.sin((timeSeconds / sway.period - (sway.travel * index) / sway.slices) * TURN);
    context.save();
    // x' = x + shear * (y - pivotY): the pivot edge stays put and the free edge leans.
    context.transform(1, 0, shear, 1, -shear * pivotY, 0);
    context.drawImage(
      bitmap,
      Math.max(0, index * slicePx - SLICE_OVERLAP_PX),
      0,
      slicePx + SLICE_OVERLAP_PX * 2,
      bitmap.height,
      x + index * sliceWorld - (index === 0 ? 0 : overlapWorld),
      y,
      sliceWorld + overlapWorld * (index === 0 ? 1 : 2),
      h,
    );
    context.restore();
  }
}

function drawPart(context: CanvasRenderingContext2D, part: SceneLivePart, bitmap: SceneBitmap, frame: LiveFrame): void {
  const breathe = part.breathe;
  const shown =
    breathe === undefined
      ? 1
      : frame.still
        ? breathe.low
        : breathe.low + (1 - breathe.low) * (0.5 - 0.5 * Math.cos((frame.timeSeconds / breathe.period) * TURN));
  if (shown <= 0) return;
  context.globalAlpha = shown * frame.opacity;
  context.globalCompositeOperation = part.blend;
  if (part.sway === undefined || frame.still) context.drawImage(bitmap, ...part.rect);
  else drawSwaying(context, bitmap, part.rect, part.sway, frame.timeSeconds);
}

/** Draws one live entry over its layer. Leaves the context as it found it. */
export function drawLive(
  context: CanvasRenderingContext2D,
  live: SceneLive,
  layer: LiveLayer,
  images: ReadonlyMap<string, SceneBitmap>,
  frame: LiveFrame,
): void {
  context.save();
  if (live.kind === "part") {
    const bitmap = images.get(live.image);
    if (bitmap !== undefined) drawPart(context, live, bitmap, frame);
  } else if (!frame.still) {
    if (live.kind === "water") drawWater(context, live, layer, frame);
    else drawMotes(context, live, frame);
  }
  context.restore();
}
