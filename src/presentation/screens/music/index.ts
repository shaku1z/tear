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
      context.enqueue({
        x,
        y: rowY,
        w,
        h,
        label: entry.label,
        size: t.type.label,
        selected: entry.selected,
        ghost: !entry.selected,
        action: musicPage(entry.id),
      });
      rowY += h + t.space.xs;
    }
    if (view.stages.length === 0) return;
    rowY += t.space.lg;
    ui.textBox(context.canvas, "STAGES", x, rowY, w, { size: t.type.micro, color: t.color.muted });
    rowY += t.space.sm;
    const openId = view.collection?.id;
    for (const stage of view.stages) {
      context.enqueue({
        x,
        y: rowY,
        w,
        h,
        label: stage.title,
        size: t.type.micro,
        dot: stage.cover?.hues[0],
        selected: stage.id === openId,
        ghost: stage.id !== openId,
        action: openCollection(stage.id),
      });
      rowY += h;
    }
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
      tileMin: 132,
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
    const rowH = Math.max(t.metric.minTarget * 1.5, Math.round(t.type.label * 1.25) + Math.round(t.type.micro * 1.25));
    const transportH = rowH + t.space.sm * 2,
      transportY = page.bottom - transportH;
    const body: CompactPage = { ...page, bottom: transportY - t.space.sm };
    const m: MusicMetrics = {
      x: page.left,
      w: page.width,
      compact: true,
      tileMax: 132,
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
