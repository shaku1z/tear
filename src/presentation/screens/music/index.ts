import type { MusicScreenView, ScreenAction, ScreenControl, ScreenRenderContext } from "../contracts";
import { createCompactPage, type CompactPage, type ScrollBlock } from "../compact-page";
import { pageFooter, pageLayout } from "../screen-primitives";
import { collectionBlocks, settingsBlocks } from "./pages";
import { homeBlocks, openCollection, type MusicMetrics } from "./shelf";
import { drawTransport } from "./transport";

const musicPage = (tab: string): ScreenAction => ({ type: "navigate", to: "music", tab });

/** "‹ Home" over a collection opened from Home (or Songs); none on the rail's own pages. */
function crumb(view: MusicScreenView): Readonly<{ label: string; action: ScreenAction }> | null {
  const { back } = view;
  if (view.page !== "collection" || back.type !== "navigate" || back.to !== "music") return null;
  const from = view.rail.find((entry) => entry.id === back.tab);
  return { label: `‹ ${from?.label ?? "Music"}`, action: back };
}

/**
 * MUSIC: a rail (Home · Songs · Settings, then the stages) beside the page, and the transport
 * under it. Home is shelves; a collection's page is the album view; Settings is the playback rows.
 * Phone landscape: the rail becomes the header's chip strip and the transport sits above BACK.
 */
export function createMusicRenderers(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);

  function pageBlocks(view: MusicScreenView, m: MusicMetrics): readonly ScrollBlock[] {
    if (view.page === "settings") return settingsBlocks(context, m, view.playback);
    if (view.page === "collection" && view.collection)
      return collectionBlocks(context, m, view.collection, m.compact ? null : crumb(view));
    return homeBlocks(context, m, view);
  }

  /** The desktop rail: wordmark, the page entries, then a Stages list of the stage collections. */
  function rail(view: MusicScreenView, x: number, y: number, w: number): void {
    const t = ui.t,
      h = t.metric.minTarget;
    ui.displayText(context.canvas, view.title, x, y + t.type.h1, t.type.h1, "left");
    let rowY = y + t.type.h1 + t.space.xl;
    for (const entry of view.rail) {
      railEntry(entry.label, null, entry.selected === true, musicPage(entry.id), x, rowY, w, h, t.type.label);
      rowY += h;
    }
    if (view.stages.length === 0) return;
    rowY += t.space.lg;
    ui.textBox(context.canvas, "STAGES", x, rowY, w, { size: t.type.micro, color: t.color.muted });
    rowY += t.space.sm;
    const openId = view.collection?.id;
    for (const stage of view.stages) {
      const hue = stage.cover?.hues[0] ?? t.color.accent;
      railEntry(stage.title, hue, stage.id === openId, openCollection(stage.id), x, rowY, w, h, t.type.micro);
      rowY += h;
    }
  }

  /** One rail line: plain text (a hue dot for a stage); the current one gets a tint and an accent bar. */
  function railEntry(
    label: string,
    hue: string | null,
    selected: boolean,
    action: ScreenAction,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
  ): void {
    const { canvas } = context,
      t = ui.t;
    if (selected) {
      canvas.save();
      canvas.globalAlpha = 0.12;
      canvas.fillStyle = t.color.accent;
      canvas.fillRect(x, y, w, h);
      canvas.globalAlpha = 1;
      canvas.fillRect(x, y, 3, h);
      canvas.restore();
    }
    let textX = x + t.space.md;
    if (hue) {
      canvas.save();
      canvas.fillStyle = hue;
      canvas.fillRect(textX, y + h / 2 - 4, 8, 8);
      canvas.restore();
      textX += 8 + t.space.sm;
    }
    ui.textBox(canvas, label, textX, y + h / 2 + Math.round(size * 0.35), x + w - textX, {
      size,
      bold: selected,
      maxLines: 1,
    });
    context.enqueue({ x, y, w, h, label: "", hiddenBox: true, selected, action });
  }

  function desktop(view: MusicScreenView): void {
    const t = ui.t,
      layout = pageLayout(context),
      railW = 200,
      top = layout.sheet.y + t.space.xl;
    rail(view, layout.left, top, railW);
    const x = layout.left + railW + t.space.xl * 2,
      w = layout.right - x;
    const transportH = t.metric.btnH + t.space.md,
      transportY = layout.footerY - t.space.md - transportH;
    const page: CompactPage = {
      left: x,
      right: x + w,
      width: w,
      centerX: x + w / 2,
      top,
      bottom: transportY - t.space.md,
      footerY: layout.footerY,
    };
    const m: MusicMetrics = {
      x,
      w,
      compact: false,
      tileMax: 200,
      tileMin: 120,
      rowH: t.metric.settingsRowH,
      cover: 44,
      columns: 3,
      rowsDeep: 4,
      gap: t.space.md,
    };
    const state = kit.scroll(page, pageBlocks(view, m), t.space.sm);
    drawTransport(context, view, { x, y: transportY, w, h: transportH, compact: false }, (control) => {
      context.enqueue(control);
    });
    pageFooter(context, { back: view.back, canScrollUp: state.canScrollUp, canScrollDown: state.canScrollDown });
  }

  function compact(view: MusicScreenView): void {
    const t = ui.t;
    const page = kit.header({
      title: view.title,
      tabs: view.rail,
      tabAction: musicPage,
    });
    const rowH = Math.max(
      t.metric.minTarget,
      Math.round(t.type.label * 1.25) + Math.round(t.type.micro * 1.25) + t.space.xs * 2,
    );
    // A slim bar: one touch target tall, so the page above keeps its room.
    const transportH = t.metric.minTarget + t.space.xs * 2,
      transportY = page.bottom - transportH;
    const body: CompactPage = { ...page, bottom: transportY - t.space.sm };
    const m: MusicMetrics = {
      x: page.left,
      w: page.width,
      compact: true,
      tileMax: 240,
      tileMin: 100,
      rowH,
      cover: 40,
      columns: 1,
      rowsDeep: 3,
      gap: t.space.sm,
    };
    const state = kit.scroll(body, pageBlocks(view, m), t.space.sm);
    const enqueue = (control: ScreenControl): void => {
      context.enqueue(control);
    };
    drawTransport(context, view, { x: page.left, y: transportY, w: page.width, h: transportH, compact: true }, enqueue);
    kit.footer(page, state, view.back);
  }

  function music(view: MusicScreenView): void {
    if (ui.density.compact) compact(view);
    else desktop(view);
  }

  return { music };
}
