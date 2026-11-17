import type { MusicScreenView, ScreenAction, ScreenControl, ScreenRenderContext } from "../contracts";
import { drawCover, twoLines } from "./draw";

/**
 * The one floating control over the sheet: cover, title over where it plays, ◀◀ ▶/■ ▶▶ over the
 * queue the preview started from, and a thin line along the top edge for the position in the
 * loop. Dark fill with light text; one capsule, no halo. On a phone ◀◀ is dropped for width.
 */
export function drawTransport(
  context: ScreenRenderContext,
  view: MusicScreenView,
  box: Readonly<{ x: number; y: number; w: number; h: number; compact: boolean }>,
  enqueue: (control: ScreenControl) => void,
): void {
  const { canvas, ui } = context,
    t = ui.t,
    now = view.nowPlaying;
  const { x, y, w, h } = box,
    pad = box.compact ? t.space.xs : t.space.sm,
    cover = h - pad * 2;
  canvas.save();
  canvas.fillStyle = ui.ink;
  canvas.fillRect(x, y, w, h);
  if (now?.progress !== null && now?.progress !== undefined) {
    canvas.fillStyle = t.color.accent;
    canvas.fillRect(x, y, Math.round(w * Math.min(1, Math.max(0, now.progress))), 3);
  }
  canvas.restore();
  drawCover(context, now?.art ?? null, x + pad, y + pad, cover, cover);
  const size = box.compact ? cover : Math.min(cover, t.metric.minTarget),
    gap = t.space.xs;
  const playing = view.songs.find((song) => song.playing);
  const play: ScreenAction | null = now?.previewing
    ? { type: "music.stopPreview" }
    : playing && view.start
      ? { type: "music.preview", id: playing.id, queue: view.start.queue }
      : view.start
        ? { type: "music.preview", id: view.start.id, queue: view.start.queue }
        : null;
  const buttons: { label: string; action: ScreenAction | null; enabled: boolean }[] = [
    ...(box.compact
      ? []
      : [{ label: "◀◀", action: { type: "music.step", delta: -1 } as const, enabled: view.canStep }]),
    { label: now?.previewing ? "■" : "▶", action: play, enabled: play !== null },
    { label: "▶▶", action: { type: "music.step", delta: 1 } as const, enabled: view.canStep },
  ];
  // The step buttons carry two glyphs, so they are wider than the square play button.
  const widthOf = (label: string): number => (label.length > 1 ? Math.round(size * (box.compact ? 1.25 : 1.6)) : size);
  const controlsW = buttons.reduce((sum, button) => sum + widthOf(button.label), 0) + (buttons.length - 1) * gap;
  let controlX = x + w - pad - controlsW;
  for (const button of buttons) {
    if (button.action)
      enqueue({
        x: controlX,
        y: y + (h - size) / 2,
        w: widthOf(button.label),
        h: size,
        label: button.label,
        size: t.type.label,
        chip: true,
        enabled: button.enabled,
        action: button.action,
      });
    controlX += widthOf(button.label) + gap;
  }
  const textX = x + pad * 2 + cover,
    textW = x + w - pad - controlsW - t.space.lg - textX;
  const where = now
    ? now.previewing
      ? `Preview · ${now.where || "Tear soundtrack"}`
      : now.where || "Plays on the menu"
    : "";
  twoLines(context, now ? now.title : "Nothing playing", where, textX, y, h, textW, t.type.label, t.color.paper);
}
