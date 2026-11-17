import type {
  MusicCollectionView,
  MusicScreenView,
  MusicShelfView,
  MusicSongView,
  ScreenAction,
  ScreenRenderContext,
} from "../contracts";
import type { ScrollBlock, ScrollView } from "../compact-page";
import { drawCover, highlight, textWidth, twoLines } from "./draw";

/** Sizes one density hands the shelves: the column and the tile/row measures. */
export interface MusicMetrics {
  readonly x: number;
  readonly w: number;
  readonly compact: boolean;
  /** Largest and smallest square tile; tiles wrap into rows rather than scroll sideways. */
  readonly tileMax: number;
  readonly tileMin: number;
  readonly rowH: number;
  readonly cover: number;
  readonly columns: number;
  readonly rowsDeep: number;
  readonly gap: number;
}

export const openCollection = (id: string): ScreenAction => ({
  type: "navigate",
  to: "music",
  tab: `collection:${id}`,
});

/** Preview a song with the songs it was listed among as the queue; a second press stops it. */
export const playSong = (song: MusicSongView, queue: readonly MusicSongView[]): ScreenAction =>
  song.previewing
    ? { type: "music.stopPreview" }
    : { type: "music.preview", id: song.id, queue: queue.map((s) => s.id) };

export const songCount = (count: number): string => `${String(count)} ${count === 1 ? "song" : "songs"}`;

/** One song row: cover, title over where it plays and the ▶/■ mark; the whole row is the target. */
export function songRow(
  context: ScreenRenderContext,
  view: ScrollView,
  song: MusicSongView,
  queue: readonly MusicSongView[],
  box: Readonly<{ x: number; y: number; w: number; h: number; cover: number; number?: boolean }>,
): void {
  const { canvas, ui } = context,
    t = ui.t,
    lit = song.previewing || song.playing;
  if (lit) highlight(context, box.x - t.space.sm, box.y + 1, box.w + t.space.sm * 2, box.h - 2);
  let x = box.x;
  const middle = box.y + box.h / 2 + Math.round(t.type.label * 0.35);
  if (box.number) {
    const numberW = textWidth(context, "00", t.type.label);
    const mark = lit ? ui.readable(t.color.accent) : t.color.muted;
    ui.tag(canvas, lit ? "♪" : String(song.number), x + numberW, middle, mark, "right", t.type.label);
    x += numberW + t.space.md;
  }
  drawCover(context, song.art, x, box.y + (box.h - box.cover) / 2, box.cover, box.cover);
  const markW = textWidth(context, "■", t.type.label),
    right = box.x + box.w;
  ui.tag(
    canvas,
    song.previewing ? "■" : "▶",
    right,
    middle,
    song.previewing ? ui.readable(t.color.accent) : ui.ink,
    "right",
    t.type.label,
  );
  const textX = x + box.cover + t.space.md;
  twoLines(context, song.title, song.where, textX, box.y, box.h, right - markW - t.space.lg - textX, t.type.label);
  view.enqueue({ x: box.x, y: box.y, w: box.w, h: box.h, label: "", hiddenBox: true, action: playSong(song, queue) });
}

/** A shelf heading; with `open` it reads "Heading ›" and opens that collection. */
function heading(context: ScreenRenderContext, m: MusicMetrics, text: string, open?: string): ScrollBlock {
  const t = context.ui.t,
    size = m.compact ? t.type.title : t.type.h2,
    height = open ? Math.max(size + t.space.lg, m.compact ? m.rowH : t.metric.minTarget) : size + t.space.lg;
  return {
    height,
    draw: (y, view) => {
      const label = open ? `${text} ›` : text;
      context.ui.displayText(context.canvas, label, m.x, y + height - t.space.sm, size, "left");
      if (!open) return;
      const w = textWidth(context, label, size) + t.space.sm;
      view.enqueue({ x: m.x, y, w, h: height, label: "", hiddenBox: true, action: openCollection(open) });
    },
  };
}

/** "Now playing": one landscape card with the song the game would play now, and ▶/■. */
function feature(
  context: ScreenRenderContext,
  m: MusicMetrics,
  song: MusicSongView | null,
  start: MusicScreenView["start"],
): ScrollBlock {
  const { ui } = context,
    t = ui.t,
    pad = t.space.md;
  const coverH = m.compact ? 96 : 184,
    coverW = Math.min(m.compact ? 150 : 328, m.w * 0.4),
    height = coverH + pad * 2;
  return {
    height,
    draw: (y, view) => {
      ui.card(context.canvas, m.x, y, m.w, height, false);
      drawCover(context, song?.art ?? null, m.x + pad, y + pad, coverW, coverH);
      const label = song?.previewing ? "■  STOP" : "▶  PLAY",
        w = textWidth(context, label, t.type.label) + t.space.xl * 2,
        h = t.metric.btnH;
      const textX = m.x + pad * 2 + coverW,
        textW = m.x + m.w - pad - textX - (m.compact ? w + t.space.md : 0);
      const kickerY = y + pad + t.type.micro;
      ui.textBox(context.canvas, "NOW PLAYING", textX, kickerY, textW, { size: t.type.micro, color: t.color.muted });
      const titleSize = m.compact ? t.type.title : t.type.h1;
      ui.displayText(
        context.canvas,
        song?.title ?? "Nothing playing",
        textX,
        kickerY + t.space.sm + titleSize,
        titleSize,
        "left",
      );
      const note = song ? song.where || "Plays between runs" : "Start the soundtrack from its first song";
      ui.textBox(context.canvas, note, textX, kickerY + t.space.md + titleSize + t.type.caption, textW, {
        size: t.type.caption,
        color: t.color.muted,
        maxLines: m.compact ? 1 : 2,
      });
      const action: ScreenAction | null = song
        ? song.previewing
          ? { type: "music.stopPreview" }
          : { type: "music.preview", id: song.id, ...(start ? { queue: start.queue } : {}) }
        : start
          ? { type: "music.preview", id: start.id, queue: start.queue }
          : null;
      // On a phone the button sits at the card's right edge, beside the text rather than under it.
      const buttonX = m.compact ? m.x + m.w - pad - w : textX,
        buttonY = m.compact ? y + (height - h) / 2 : y + height - pad - h;
      if (action) view.enqueue({ x: buttonX, y: buttonY, w, h, label, size: t.type.label, hero: true, action });
    },
  };
}

/** Square stage tiles, wrapped into rows; a tile opens its collection's page. */
function tiles(
  context: ScreenRenderContext,
  m: MusicMetrics,
  collections: readonly MusicCollectionView[],
): ScrollBlock[] {
  const { ui } = context,
    t = ui.t;
  const fits = Math.max(1, Math.min(collections.length, Math.floor((m.w + m.gap) / (m.tileMin + m.gap))));
  // Balanced rows: six stages that do not fit one row become two rows of three, not five and one.
  const perRow = Math.ceil(collections.length / Math.ceil(collections.length / fits));
  const size = Math.floor(Math.min(m.tileMax, (m.w - m.gap * (perRow - 1)) / perRow));
  const textH = t.space.sm + t.type.label + t.space.xs + t.type.micro + t.space.sm;
  const blocks: ScrollBlock[] = [];
  for (let start = 0; start < collections.length; start += perRow) {
    const row = collections.slice(start, start + perRow);
    blocks.push({
      height: size + textH,
      draw: (y, view) => {
        row.forEach((entry, index) => {
          const x = m.x + index * (size + m.gap);
          drawCover(context, entry.cover, x, y, size, size);
          const titleY = y + size + t.space.sm + t.type.label;
          ui.textBox(context.canvas, entry.title, x, titleY, size, { size: t.type.label, maxLines: 1 });
          const kicker = `${entry.kicker} · ${songCount(entry.songs.length)}`;
          ui.textBox(context.canvas, kicker, x, titleY + t.space.xs + t.type.micro, size, {
            size: t.type.micro,
            color: t.color.muted,
            maxLines: 1,
          });
          view.enqueue({
            x,
            y,
            w: size,
            h: size + textH,
            label: "",
            hiddenBox: true,
            action: openCollection(entry.id),
          });
        });
      },
    });
  }
  return blocks;
}

/** Small song rows in `columns` columns, `rowsDeep` deep; on a phone, "See all ›" when there are more. */
function rows(
  context: ScreenRenderContext,
  m: MusicMetrics,
  songs: readonly MusicSongView[],
  open: string,
): ScrollBlock[] {
  const t = context.ui.t,
    shown = songs.slice(0, m.columns * m.rowsDeep);
  const columnW = (m.w - m.gap * (m.columns - 1)) / m.columns;
  const blocks: ScrollBlock[] = [];
  for (let start = 0; start < shown.length; start += m.columns) {
    const line = shown.slice(start, start + m.columns);
    blocks.push({
      height: m.rowH,
      draw: (y, view) => {
        line.forEach((song, index) => {
          const x = m.x + index * (columnW + m.gap);
          songRow(context, view, song, songs, { x, y, w: columnW, h: m.rowH, cover: m.cover });
          context.ui.divider(context.canvas, x, y + m.rowH, columnW, 0.12);
        });
      },
    });
  }
  if (shown.length < songs.length)
    blocks.push({
      height: m.rowH,
      draw: (y, view) => {
        const label = "See all ›",
          w = textWidth(context, label, t.type.label) + t.space.lg * 2;
        view.enqueue({ x: m.x, y, w, h: m.rowH, label, size: t.type.label, ghost: true, action: openCollection(open) });
      },
    });
  return blocks;
}

/** Home's last row: the whole soundtrack, opening its page. */
function soundtrackRow(context: ScreenRenderContext, m: MusicMetrics, all: MusicCollectionView): ScrollBlock {
  const { ui } = context,
    t = ui.t,
    pad = t.space.sm,
    cover = m.compact ? 48 : 56,
    height = Math.max(cover + pad * 2, m.rowH);
  return {
    height,
    draw: (y, view) => {
      ui.card(context.canvas, m.x, y, m.w, height, false);
      drawCover(context, all.cover, m.x + pad, y + (height - cover) / 2, cover, cover);
      const note = `${all.kicker} · ${songCount(all.songs.length)}`;
      const textX = m.x + pad * 2 + cover;
      twoLines(
        context,
        `The whole soundtrack · ${all.title}`,
        note,
        textX,
        y,
        height,
        m.x + m.w - t.space.xl - textX,
        t.type.label,
      );
      ui.tag(
        context.canvas,
        "›",
        m.x + m.w - pad,
        y + height / 2 + Math.round(t.type.h2 * 0.35),
        ui.ink,
        "right",
        t.type.h2,
      );
      view.enqueue({ x: m.x, y, w: m.w, h: height, label: "", hiddenBox: true, action: openCollection(all.id) });
    },
  };
}

/** Home: every shelf, then the whole-soundtrack row. */
export function homeBlocks(context: ScreenRenderContext, m: MusicMetrics, view: MusicScreenView): ScrollBlock[] {
  const blocks: ScrollBlock[] = [];
  const shelf = (entry: MusicShelfView): void => {
    if (entry.layout === "feature") {
      blocks.push(heading(context, m, entry.heading), feature(context, m, entry.song, view.start));
      return;
    }
    if (entry.layout === "tiles") {
      blocks.push(heading(context, m, entry.heading), ...tiles(context, m, entry.collections));
      return;
    }
    blocks.push(heading(context, m, entry.heading, entry.open), ...rows(context, m, entry.songs, entry.open));
  };
  view.shelves.forEach(shelf);
  if (view.soundtrack) blocks.push(soundtrackRow(context, m, view.soundtrack));
  if (view.loading)
    blocks.push({
      height: context.ui.t.type.label * 2,
      draw: (y) => {
        context.ui.text(
          context.canvas,
          "Loading the songs…",
          m.x,
          y + context.ui.t.type.label,
          context.ui.t.type.label,
          "left",
          context.ui.t.alpha.muted,
        );
      },
    });
  return blocks;
}
