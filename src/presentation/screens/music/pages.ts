import type { MusicCollectionView, ScreenAction, ScreenRenderContext, SettingRowView } from "../contracts";
import type { ScrollBlock } from "../compact-page";
import { drawCover, textWidth, twoLines } from "./draw";
import { playSong, songCount, songRow, type MusicMetrics } from "./shelf";

/**
 * A collection's page (Songs is the whole soundtrack's): cover, kicker, title, "N songs",
 * ▶ PLAY (the collection in order, through the transport), then the numbered track list.
 */
export function collectionBlocks(
  context: ScreenRenderContext,
  m: MusicMetrics,
  collection: MusicCollectionView,
  crumb: Readonly<{ label: string; action: ScreenAction }> | null,
): ScrollBlock[] {
  const { ui } = context,
    t = ui.t;
  const cover = m.compact ? 96 : 180,
    playH = t.metric.btnH;
  const first = collection.songs[0];
  const previewing = collection.songs.some((song) => song.previewing);
  const play: ScreenAction | null = previewing
    ? { type: "music.stopPreview" }
    : first
      ? playSong(first, collection.songs)
      : null;
  const playLabel = previewing ? "■  STOP" : "▶  PLAY";
  const headerH = m.compact ? cover + t.space.md + playH : cover;
  const blocks: ScrollBlock[] = [];
  if (crumb)
    blocks.push({
      height: t.metric.minTarget,
      draw: (y, view) => {
        // A plain text link, like the rail: the page's one button is PLAY.
        const w = textWidth(context, crumb.label, t.type.label) + t.space.md,
          h = t.metric.minTarget;
        ui.textBox(context.canvas, crumb.label, m.x, y + h / 2 + Math.round(t.type.label * 0.35), w, {
          size: t.type.label,
          color: ui.readable(t.color.accent),
          maxLines: 1,
        });
        view.enqueue({ x: m.x, y, w, h, label: "", hiddenBox: true, action: crumb.action });
      },
    });
  blocks.push({
    height: headerH,
    draw: (y, view) => {
      drawCover(context, collection.cover, m.x, y, cover, cover);
      const textX = m.x + cover + t.space.lg,
        textW = m.x + m.w - textX;
      const kickerY = y + t.type.micro + (m.compact ? 0 : t.space.lg);
      ui.textBox(context.canvas, collection.kicker.toUpperCase(), textX, kickerY, textW, {
        size: t.type.micro,
        color: t.color.muted,
      });
      const titleSize = m.compact ? t.type.title : t.type.h1;
      ui.displayText(context.canvas, collection.title, textX, kickerY + t.space.sm + titleSize, titleSize, "left");
      const total = songCount(collection.songs.length);
      ui.textBox(context.canvas, total, textX, kickerY + t.space.md + titleSize + t.type.caption, textW, {
        size: t.type.caption,
        color: t.color.muted,
      });
      if (!play) return;
      if (m.compact) {
        view.enqueue({
          x: m.x,
          y: y + cover + t.space.md,
          w: m.w,
          h: playH,
          label: playLabel,
          size: t.type.label,
          hero: true,
          action: play,
        });
        return;
      }
      const w = textWidth(context, playLabel, t.type.label) + t.space.xl * 2;
      view.enqueue({
        x: textX,
        y: y + cover - playH,
        w,
        h: playH,
        label: playLabel,
        size: t.type.label,
        hero: true,
        action: play,
      });
    },
  });
  blocks.push({ height: t.space.md, draw: () => undefined });
  collection.songs.forEach((song, index) =>
    blocks.push({
      height: m.rowH,
      draw: (y, view) => {
        songRow(context, view, song, collection.songs, {
          x: m.x,
          y,
          w: m.w,
          h: m.rowH,
          cover: m.cover,
          number: index + 1,
        });
        ui.divider(context.canvas, m.x, y + m.rowH, m.w, 0.12);
      },
    }),
  );
  return blocks;
}

/** The playback settings: one cycling row each. */
export function settingsBlocks(
  context: ScreenRenderContext,
  m: MusicMetrics,
  rows: readonly SettingRowView[],
): ScrollBlock[] {
  const { ui } = context,
    t = ui.t;
  const widest = Math.max(...rows.map((row) => textWidth(context, row.value, t.type.label)));
  const controlW = m.compact ? Math.min(m.w * 0.42, widest + t.space.lg * 2) : t.metric.settingsControlW;
  const controlH = m.compact ? t.metric.minTarget : t.metric.settingsControlH;
  const rowH = m.compact ? m.rowH : t.metric.settingsRowH + t.space.sm;
  return rows.map((row) => ({
    height: rowH,
    draw: (y, view) => {
      const controlX = m.x + m.w - controlW;
      twoLines(
        context,
        row.label,
        row.note ?? "",
        m.x,
        y,
        rowH,
        controlX - m.x - t.space.lg,
        m.compact ? t.type.label : t.type.body,
      );
      view.enqueue({
        x: controlX,
        y: y + (rowH - controlH) / 2,
        w: controlW,
        h: controlH,
        label: row.value,
        size: t.type.label,
        action: { type: "settings.activate", key: row.key },
      });
      ui.divider(context.canvas, m.x, y + rowH, m.w, 0.12);
    },
  }));
}
