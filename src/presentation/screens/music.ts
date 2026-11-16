import type {
  MusicArtView,
  MusicScreenView,
  MusicSongView,
  ScreenAction,
  ScreenControl,
  ScreenRenderContext,
  SettingRowView,
} from "./contracts";
import { createCompactPage, type ScrollBlock } from "./compact-page";
import { clipBody, pageFooter, pageLayout } from "./screen-primitives";

/** One line of the MUSIC body: a big heading, a track, a settings row or a plain note. */
type MusicLine =
  | Readonly<{ kind: "heading"; text: string }>
  | Readonly<{ kind: "song"; song: MusicSongView }>
  | Readonly<{ kind: "setting"; row: SettingRowView }>
  | Readonly<{ kind: "note"; text: string }>;

type Enqueue = (control: ScreenControl) => void;

/** Geometry one layout hands the shared drawing: the column, its settings controls and a visibility-checked enqueue. */
interface Column {
  readonly x: number;
  readonly w: number;
  readonly labelSize: number;
  readonly controlW: number;
  readonly controlH: number;
  readonly enqueue: Enqueue;
}

const back: ScreenAction = { type: "navigate", to: "menu" };
const previewAction = (song: MusicSongView): ScreenAction =>
  song.previewing ? { type: "music.stopPreview" } : { type: "music.preview", id: song.id };

/**
 * The body of the current view, top to bottom. Only the Songs view exists; a later
 * Playlist or Radio view adds its own lines here and a tab strip above them.
 */
function musicLines(view: MusicScreenView): readonly MusicLine[] {
  const lines: MusicLine[] = [{ kind: "heading", text: "Songs" }];
  if (view.loading) lines.push({ kind: "note", text: "Loading the songs…" });
  for (const song of view.songs) lines.push({ kind: "song", song });
  lines.push({ kind: "heading", text: "Settings" });
  for (const row of view.playback) lines.push({ kind: "setting", row });
  return lines;
}

/** MUSIC: an album-style header, the track list with previews, the playback settings and a mini-player. */
export function createMusicRenderers(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);
  const enqueueAll: Enqueue = (control) => {
    context.enqueue(control);
  };

  /** A song's square art tile: its stage hue as a tint, a hairline and the stage symbol (or a note). */
  function artTile(art: MusicArtView, x: number, y: number, size: number): void {
    const { canvas } = context,
      hue = art?.hue ?? ui.t.color.accent;
    canvas.save();
    canvas.globalAlpha = 0.2;
    canvas.fillStyle = hue;
    canvas.fillRect(x, y, size, size);
    canvas.globalAlpha = 1;
    canvas.strokeStyle = hue;
    canvas.lineWidth = 1;
    canvas.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    canvas.restore();
    const glyph = Math.max(ui.t.type.micro, Math.round(size * 0.5));
    const baseline = y + size / 2 + Math.round(glyph * 0.35);
    ui.tag(canvas, art?.glyph ?? "♪", x + size / 2, baseline, ui.readable(hue), "center", glyph);
  }

  /** The album-style header: cover tile, title, subtitle and the PLAY pill (it previews the first song). */
  function header(view: MusicScreenView, x: number, y: number, tile: number, enqueue: Enqueue): void {
    const t = ui.t,
      { canvas } = context,
      textX = x + tile + t.space.lg;
    artTile(null, x, y, tile);
    ui.displayText(canvas, view.title, textX, y + t.type.h1, t.type.h1, "left");
    const subtitleY = y + t.type.h1 + t.space.sm + t.type.caption;
    ui.text(canvas, view.subtitle, textX, subtitleY, t.type.caption, "left", t.alpha.muted);
    const first = view.songs[0];
    if (!first) return;
    const label = "▶  PLAY",
      w = kit.textWidth(label, t.type.label, true) + t.space.xl * 2,
      h = t.metric.btnH;
    enqueue({ x: textX, y: y + tile - h, w, h, label, size: t.type.label, hero: true, action: previewAction(first) });
  }

  /** The now-playing capsule: tile, title and where it plays, and STOP while a preview plays. */
  function miniPlayer(view: MusicScreenView, x: number, y: number, w: number, h: number, enqueue: Enqueue): void {
    const t = ui.t,
      { canvas } = context,
      now = view.nowPlaying,
      pad = t.space.sm,
      tile = h - pad * 2;
    ui.card(canvas, x, y, w, h, false);
    artTile(now?.art ?? null, x + pad, y + pad, tile);
    const stop = "■  STOP",
      stopW = now?.previewing ? kit.textWidth(stop, t.type.label, true) + t.space.lg * 2 : 0;
    const textX = x + pad * 2 + tile,
      textW = x + w - pad - stopW - t.space.lg - textX;
    const where = now?.where ? `Now playing · ${now.where}` : "Now playing";
    twoLines(now ? now.title : "Nothing playing yet", where, textX, y, h, textW, t.type.label);
    if (!now?.previewing) return;
    const stopH = Math.min(h - pad * 2, t.metric.btnH);
    const action: ScreenAction = { type: "music.stopPreview" };
    enqueue({
      x: x + w - pad - stopW,
      y: y + (h - stopH) / 2,
      w: stopW,
      h: stopH,
      label: stop,
      size: t.type.label,
      action,
    });
  }

  /** A title over a muted note, vertically centred in the row. */
  function twoLines(title: string, note: string, x: number, y: number, h: number, w: number, size: number): void {
    const t = ui.t,
      { canvas } = context;
    const baseline = note ? y + h / 2 - t.space.xs : y + h / 2 + Math.round(size * 0.35);
    ui.textBox(canvas, title, x, baseline, w, { size, maxLines: 1 });
    if (!note) return;
    const noteBox = { size: t.type.micro, color: t.color.muted, maxLines: 1 };
    ui.textBox(canvas, note, x, baseline + t.space.xs + t.type.micro, w, noteBox);
  }

  function lineHeight(line: MusicLine, rowH: number): number {
    const t = ui.t;
    if (line.kind === "heading") return t.type.h2 + t.space.xl;
    return line.kind === "note" ? kit.lineHeight(t.type.label) + t.space.md : rowH;
  }

  /** One track: number (or the playing mark), art tile, title over where it plays and the preview control. */
  function track(song: MusicSongView, y: number, h: number, column: Column): void {
    const t = ui.t,
      { canvas } = context,
      { x, w } = column,
      lit = song.previewing || song.playing;
    if (lit) {
      canvas.save();
      canvas.globalAlpha = 0.1;
      canvas.fillStyle = t.color.accent;
      canvas.fillRect(x - t.space.sm, y + 1, w + t.space.sm * 2, h - 2);
      canvas.restore();
    }
    const middle = y + h / 2 + Math.round(t.type.label * 0.35),
      numberW = kit.textWidth("00", t.type.label, true);
    const markColor = lit ? ui.readable(t.color.accent) : t.color.muted;
    ui.tag(canvas, lit ? "♪" : String(song.number), x + numberW, middle, markColor, "right", t.type.label);
    const tile = Math.min(h - t.space.md, t.metric.minTarget * 1.5),
      tileX = x + numberW + t.space.md;
    artTile(song.art, tileX, y + (h - tile) / 2, tile);
    const size = t.metric.minTarget * 1.5,
      controlX = x + w - size;
    const textX = tileX + tile + t.space.md;
    twoLines(song.title, song.where, textX, y, h, controlX - t.space.md - textX, column.labelSize);
    column.enqueue({
      x: controlX,
      y: y + (h - size) / 2,
      w: size,
      h: size,
      label: song.previewing ? "■" : "▶",
      chip: true,
      size: t.type.label,
      selected: song.previewing,
      action: previewAction(song),
    });
  }

  function drawLine(line: MusicLine, y: number, h: number, column: Column): void {
    const t = ui.t,
      { canvas } = context,
      { x, w } = column;
    if (line.kind === "heading") {
      ui.displayText(canvas, line.text, x, y + h - t.space.md, t.type.h2, "left");
      return;
    }
    if (line.kind === "note") {
      ui.text(canvas, line.text, x, y + h / 2, column.labelSize, "left", t.alpha.muted);
      return;
    }
    if (line.kind === "song") track(line.song, y, h, column);
    else {
      const { row } = line,
        controlX = x + w - column.controlW;
      twoLines(row.label, row.note ?? "", x, y, h, controlX - x - t.space.lg, column.labelSize);
      column.enqueue({
        x: controlX,
        y: y + (h - column.controlH) / 2,
        w: column.controlW,
        h: column.controlH,
        label: row.value,
        size: t.type.label,
        action: { type: "settings.activate", key: row.key },
      });
    }
    ui.divider(canvas, x, y + h, w, 0.12);
  }

  /** Phone landscape: the same order as one scrolling column; the header and mini-player are its first blocks. */
  function compact(view: MusicScreenView, lines: readonly MusicLine[]): void {
    const t = ui.t,
      page = kit.header({ title: view.title });
    const widest = Math.max(...view.playback.map((row) => kit.textWidth(row.value, t.type.label, true)));
    const rowH = Math.max(t.metric.minTarget * 1.5, kit.lineHeight(t.type.label) + kit.lineHeight(t.type.micro));
    const column = (enqueue: Enqueue): Column => ({
      x: page.left,
      w: page.width,
      labelSize: t.type.label,
      controlW: Math.min(page.width * 0.42, widest + t.space.lg * 2),
      controlH: t.metric.minTarget,
      enqueue,
    });
    const tile = t.metric.btnH * 2,
      playerH = t.metric.minTarget + t.space.sm * 2;
    const parts: (readonly [number, (y: number, enqueue: Enqueue) => void])[] = [
      [
        tile,
        (y, enqueue) => {
          header(view, page.left, y, tile, enqueue);
        },
      ],
      [
        playerH,
        (y, enqueue) => {
          miniPlayer(view, page.left, y, page.width, playerH, enqueue);
        },
      ],
      ...lines.map((line) => {
        const h = lineHeight(line, rowH + t.space.md);
        return [
          h,
          (y: number, enqueue: Enqueue) => {
            drawLine(line, y, h, column(enqueue));
          },
        ] as const;
      }),
    ];
    const blocks = parts.map(([height, draw]): ScrollBlock => ({
      height,
      draw: (y, scroll) => {
        draw(y, (control) => {
          scroll.enqueue(control);
        });
      },
    }));
    kit.footer(page, kit.scroll(page, blocks, 0), back);
  }

  function music(view: MusicScreenView): void {
    const lines = musicLines(view);
    if (ui.density.compact) {
      compact(view, lines);
      return;
    }
    const t = ui.t,
      layout = pageLayout(context),
      x = layout.left + 60,
      w = layout.contentWidth - 120,
      tile = 132;
    const headerTop = layout.sheet.y + t.space.xl;
    header(view, x, headerTop, tile, enqueueAll);
    const top = headerTop + tile + t.space.md,
      playerH = t.metric.btnH + t.space.md,
      playerY = layout.footerY - t.space.md - playerH,
      bottom = playerY - t.space.sm;
    const rowH = t.metric.settingsRowH + t.space.sm,
      heights = lines.map((line) => lineHeight(line, rowH));
    const maximum = Math.max(0, Math.ceil(heights.reduce((sum, height) => sum + height, 0) - (bottom - top)));
    const scroll = Math.max(0, Math.min(maximum, context.scroll));
    if (scroll !== context.scroll) context.setScroll?.(scroll);
    const column: Column = {
      x,
      w,
      labelSize: t.type.body,
      controlW: t.metric.settingsControlW,
      controlH: t.metric.settingsControlH,
      // A control is enqueued (drawn, focusable, clickable) only while it is fully inside the body.
      enqueue: (control) => {
        if (control.y >= top - 1 && control.y + control.h <= bottom + 1) context.enqueue(control);
      },
    };
    clipBody(context, top, bottom, () => {
      let y = top - scroll;
      lines.forEach((line, index) => {
        const height = heights[index] ?? rowH;
        if (y + height >= top && y <= bottom) drawLine(line, y, height, column);
        y += height;
      });
    });
    miniPlayer(view, x, playerY, w, playerH, enqueueAll);
    pageFooter(context, { back, canScrollUp: scroll > 0, canScrollDown: scroll < maximum });
  }

  return { music };
}
