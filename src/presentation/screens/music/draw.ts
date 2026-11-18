import type { MusicCoverView, ScreenRenderContext } from "../contracts";
import { coverPainting, noteCoverDrawn } from "../../music-cover-art";
import type { SceneBitmap } from "../../scenes/scene-renderer";

/** Paper grey for locked covers (used from the lock PR on). */
const LOCKED = "#c9c6cf";

/** The paintings a cover can show now: every one it names, loaded, or none. */
function loadedPaintings(cover: MusicCoverView, devicePixels: number): SceneBitmap[] | null {
  if (!cover?.art || cover.art.length === 0 || cover.locked) return null;
  const paintings: SceneBitmap[] = [];
  for (const stageId of cover.art) {
    const painting = coverPainting(stageId, devicePixels);
    if (painting === null) return null;
    paintings.push(painting);
  }
  return paintings;
}

/** Draws `image` to fill the box, cropped at its centre. */
function fillWith(canvas: CanvasRenderingContext2D, image: SceneBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale,
    sh = h / scale;
  canvas.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * The one way a song or collection is pictured, at every size. A cover whose stages have
 * paintings shows them (one painting, or a 2x2 grid for a mixed collection) once they have all
 * loaded. Until then, and for the Pale Traverse and locked songs: solid bands of stage hue (one
 * band for a stage, up to four for a mixed collection), the chapter glyph large and off-centre
 * bottom-right, cropped by the block, in a darker shade of the hue. Both get a hairline frame.
 * The title is never drawn on the cover.
 */
export function drawCover(
  context: ScreenRenderContext,
  cover: MusicCoverView,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const { canvas, ui } = context;
  const scale = typeof canvas.getTransform === "function" ? Math.abs(canvas.getTransform().a) : 1;
  const paintings = loadedPaintings(cover, w * scale);
  if (paintings) {
    canvas.save();
    canvas.imageSmoothingEnabled = true;
    canvas.imageSmoothingQuality = "high";
    const [only] = paintings;
    if (paintings.length === 1 && only) fillWith(canvas, only, x, y, w, h);
    else {
      // A 2x2 grid; two or three paintings repeat to fill it.
      const cw = w / 2,
        ch = h / 2;
      for (let cell = 0; cell < 4; cell += 1) {
        const painting = paintings[cell % paintings.length];
        if (painting)
          fillWith(canvas, painting, x + (cell % 2) * cw, y + Math.floor(cell / 2) * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
    canvas.restore();
    frame(canvas, x, y, w, h);
    noteCoverDrawn(context.time, "paintings");
    return;
  }
  noteCoverDrawn(context.time, cover?.art?.length && !cover.locked ? "waiting" : "bands");
  const hues = cover && cover.hues.length > 0 ? cover.hues : [ui.t.color.accent];
  const glyph = cover?.locked ? "⚿" : (cover?.glyph ?? "♪"),
    band = w / hues.length;
  canvas.save();
  canvas.beginPath();
  canvas.rect(x, y, w, h);
  canvas.clip();
  hues.forEach((hue, index) => {
    canvas.fillStyle = cover?.locked ? LOCKED : hue;
    canvas.fillRect(x + band * index, y, Math.ceil(band) + 1, h);
  });
  const size = Math.round(Math.min(w, h) * 0.95);
  canvas.globalAlpha = 0.32;
  canvas.fillStyle = "#000";
  canvas.font = ui.font(size, true);
  canvas.textAlign = "center";
  canvas.textBaseline = "middle";
  canvas.fillText(glyph, x + w * 0.74, y + h * 0.7);
  canvas.restore();
  frame(canvas, x, y, w, h);
}

function frame(canvas: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  canvas.save();
  canvas.strokeStyle = "rgba(0, 0, 0, 0.28)";
  canvas.lineWidth = 1;
  canvas.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  canvas.restore();
}

/** A title over a muted note, vertically centred in a band of height `h`. */
export function twoLines(
  context: ScreenRenderContext,
  title: string,
  note: string,
  x: number,
  y: number,
  h: number,
  w: number,
  size: number,
  color?: string,
): void {
  const { canvas, ui } = context,
    t = ui.t;
  const baseline = note ? y + h / 2 - t.space.xs : y + h / 2 + Math.round(size * 0.35);
  ui.textBox(canvas, title, x, baseline, w, { size, maxLines: 1, ...(color ? { color } : {}) });
  if (!note) return;
  const noteBox = { size: t.type.micro, color: color ?? t.color.muted, alpha: color ? 0.7 : 1, maxLines: 1 };
  ui.textBox(canvas, note, x, baseline + t.space.xs + t.type.micro, w, noteBox);
}

/** The faint accent band behind the song that is playing or previewing. */
export function highlight(context: ScreenRenderContext, x: number, y: number, w: number, h: number): void {
  const { canvas, ui } = context;
  canvas.save();
  canvas.globalAlpha = 0.1;
  canvas.fillStyle = ui.t.color.accent;
  canvas.fillRect(x, y, w, h);
  canvas.restore();
}

export function textWidth(context: ScreenRenderContext, text: string, size: number, bold = true): number {
  context.canvas.font = context.ui.font(size, bold);
  return context.canvas.measureText(text).width;
}
