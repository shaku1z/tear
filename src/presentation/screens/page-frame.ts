import type { ReplayView, ScreenAction, ScreenRenderContext } from "./contracts";
import {
  createCompactPage,
  type CompactChoice,
  type CompactPage,
  type FlowAction,
  type ScrollBlock,
  type ScrollState,
  type ScrollView,
} from "./compact-page";
import { chips, clipBody, page, pageFooter, replayRow, tabs } from "./screen-primitives";

/**
 * THE PAGE FRAME: one screen definition that lays out at both densities. A screen states its
 * chrome (title, tabs, caption, picker groups) and its body as measured blocks (`ScrollBlock`:
 * a height and a draw), and draws its parts with one set of drawers fed from a metrics table.
 * Only this module knows the density:
 *
 * - Desktop draws the design page (`page`, `tabs`, `chips`, `pageFooter` from screen-primitives)
 *   with the chrome at the positions the screen gives in `desktop`. The body starts at a fixed
 *   y: a pinned head, then a clipped list that scrolls by the app's scroll (the app owns the
 *   desktop scroll extent), then a pinned tail above the footer.
 * - Phone (compact density) draws the compact page (`compact-page.ts`): a header row with the
 *   tabs, the pickers as a chip toolbar, and one body that flows the caption, head, list and
 *   tail top to bottom, measures itself and owns its scroll.
 */
export interface PickerGroup {
  readonly items: readonly CompactChoice[];
  readonly action: (id: string) => ScreenAction;
  /** Desktop chip row: centred at `y`, each chip `width` x `height`. */
  readonly desktop: Readonly<{ y: number; width: number; height: number }>;
}

export interface PageSpec {
  readonly title: string;
  readonly hue?: string | undefined;
  readonly tabs?: readonly CompactChoice[] | undefined;
  readonly tabAction?: ((id: string) => ScreenAction) | undefined;
  /** One muted line under the tabs (desktop) or at the top of the body (phone). */
  readonly caption?: string | undefined;
  readonly pickers?: readonly PickerGroup[] | undefined;
  /** Desktop chrome positions. */
  readonly desktop: Readonly<{ tabsY?: number; captionY?: number }>;
}

export interface PageFrame {
  readonly compact: boolean;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly centerX: number;
  /** First y of the body: under the chrome (phone), or the screen's own fixed start (desktop). */
  readonly top: number;
  /** Last y the body may use. */
  readonly bottom: number;
  /** Blocks the phone flows at the top of the body (the caption). Empty on desktop. */
  readonly lead: readonly ScrollBlock[];
  /** The compact page underneath, at phone density. */
  readonly compactPage: CompactPage | null;
}

export interface PageBody {
  readonly head?: readonly ScrollBlock[] | undefined;
  readonly list?: readonly ScrollBlock[] | undefined;
  readonly tail?: readonly ScrollBlock[] | undefined;
  /** Space between blocks: the design spacing on desktop is usually built into the block heights. */
  readonly gap: number;
  /**
   * Desktop: the body's first y, the scroll state the app computed for the list, and which list
   * blocks are drawn: a block whose top is within `cull.above` over the list top and
   * `cull.below` short of its bottom (the design keeps a partly hidden row out).
   */
  readonly desktop: Readonly<{
    top: number;
    cull: Readonly<{ above: number; below: number }>;
    canScrollUp?: boolean | undefined;
    canScrollDown?: boolean | undefined;
  }>;
}

/** Desktop drawing of the content column: the design page's centred 1120 column. */
const DESKTOP_COLUMN = 1120;

export function createPageFrame(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);

  /** Draws the chrome for the density in use and returns the frame the body lays out in. */
  function open(spec: PageSpec): PageFrame {
    if (ui.density.compact) {
      let compactPage = kit.header({ title: spec.title, hue: spec.hue, tabs: spec.tabs, tabAction: spec.tabAction });
      if (spec.pickers) compactPage = kit.toolbar(compactPage, spec.pickers);
      const lead = spec.caption ? [kit.prose(compactPage, spec.caption, { maxLines: 2 })] : [];
      return Object.freeze({ compact: true, ...compactPage, lead, compactPage });
    }
    const layout = page(context, { title: spec.title, hue: spec.hue });
    if (spec.tabs && spec.tabAction) tabs(context, spec.tabs, spec.tabAction, spec.desktop.tabsY);
    if (spec.caption && spec.desktop.captionY !== undefined)
      ui.text(
        context.canvas,
        spec.caption,
        context.width / 2,
        spec.desktop.captionY,
        ui.t.type.caption,
        "center",
        ui.t.alpha.muted,
      );
    for (const group of spec.pickers ?? [])
      chips(context, group.items, group.action, group.desktop.y, group.desktop.width, group.desktop.height);
    const left = context.width / 2 - DESKTOP_COLUMN / 2;
    return Object.freeze({
      compact: false,
      left,
      right: left + DESKTOP_COLUMN,
      width: DESKTOP_COLUMN,
      centerX: context.width / 2,
      top: layout.bodyTop,
      bottom: layout.bodyBottom,
      lead: [],
      compactPage: null,
    });
  }

  /** Lays the body out and draws it; returns whether it can scroll. */
  function body(frame: PageFrame, spec: PageBody): ScrollState {
    const head = spec.head ?? [],
      list = spec.list ?? [],
      tail = spec.tail ?? [];
    if (frame.compactPage) return kit.scroll(frame.compactPage, [...frame.lead, ...head, ...list, ...tail], spec.gap);
    const fixed: ScrollView = {
      top: frame.top,
      bottom: frame.bottom,
      enqueue(control) {
        context.enqueue(control);
      },
    };
    let y = spec.desktop.top;
    for (const block of head) {
      block.draw(y, fixed);
      y += block.height + spec.gap;
    }
    const tailHeight = tail.reduce((sum, block) => sum + block.height, 0);
    const listTop = y,
      listBottom = frame.bottom - tailHeight;
    if (list.length > 0) {
      const view: ScrollView = {
        top: listTop,
        bottom: listBottom,
        enqueue(control) {
          if (control.y >= listTop && control.y + control.h <= listBottom) context.enqueue(control);
        },
      };
      clipBody(context, listTop, listBottom, () => {
        let rowY = listTop - context.scroll;
        for (const block of list) {
          if (rowY >= listTop - spec.desktop.cull.above && rowY <= listBottom - spec.desktop.cull.below)
            block.draw(rowY, view);
          rowY += block.height + spec.gap;
        }
      });
    }
    let tailY = listBottom;
    for (const block of tail) {
      block.draw(tailY, fixed);
      tailY += block.height;
    }
    return {
      canScrollUp: spec.desktop.canScrollUp === true,
      canScrollDown: spec.desktop.canScrollDown === true,
    };
  }

  /** The footer row: BACK and the scroll hint. */
  function close(frame: PageFrame, state: ScrollState): void {
    if (frame.compactPage) kit.footer(frame.compactPage, state);
    else pageFooter(context, state);
  }

  /**
   * A designed empty, loading, offline or sign-in state with an optional call to action. On
   * desktop the block's y is the top of the body and the state centres `desktopCentre` below it.
   */
  function emptyState(
    frame: PageFrame,
    copy: Readonly<{ glyph: string; line: string; detail?: string | undefined }>,
    cta: FlowAction | undefined,
    desktop: Readonly<{ centre: number; wrap: number; ctaWidth: number; ctaHeight: number }>,
  ): ScrollBlock {
    if (frame.compactPage) return kit.empty(frame.compactPage, copy.glyph, copy.line, copy.detail, cta);
    const draw = (y: number): void => {
      const ctaY = ui.emptyState(
        context.canvas,
        copy.glyph,
        copy.line,
        context.width / 2,
        y + desktop.centre,
        copy.detail,
        desktop.wrap,
      );
      if (cta)
        context.enqueue({
          x: context.width / 2 - desktop.ctaWidth / 2,
          y: ctaY,
          w: desktop.ctaWidth,
          h: desktop.ctaHeight,
          label: cta.label,
          action: cta.action,
        });
    };
    return { height: 0, draw };
  }

  /**
   * One replay row with its actions. Desktop: the oracle row (`replayRow`) with each action as a
   * button at the row's right end; phone: the compact row with its actions flowing under it.
   */
  function replay(
    frame: PageFrame,
    row: ReplayView,
    action: FlowAction,
    spine: string,
    desktop: Readonly<{ x: number; width: number; pitch: number; inset: number; textReserve: number }>,
  ): ScrollBlock {
    if (frame.compactPage) return kit.replayRow(frame.compactPage, row, [action], spine);
    const draw = (y: number, view: ScrollView): void => {
      const rowY = y + desktop.inset;
      replayRow(context, row, desktop.x, rowY, desktop.width, spine, desktop.textReserve);
      view.enqueue({
        x: desktop.x + desktop.width - 140,
        y: rowY + 20,
        w: 120,
        h: 40,
        label: action.label,
        enabled: action.enabled,
        action: action.action,
      });
    };
    return { height: desktop.pitch, draw };
  }

  /** Wrapped muted copy: one centred line on desktop, a measured paragraph on the phone. */
  function prose(
    frame: PageFrame,
    text: string,
    options: Readonly<{ size: number; maxLines: number; align: "center" | "left"; baseline: number; height: number }>,
  ): ScrollBlock {
    if (frame.compactPage)
      return kit.prose(frame.compactPage, text, {
        size: options.size,
        maxLines: options.maxLines,
        align: options.align,
      });
    const draw = (y: number): void => {
      ui.text(context.canvas, text, frame.centerX, y + options.baseline, options.size, options.align, ui.t.alpha.muted);
    };
    return { height: options.height, draw };
  }

  /** A row of flow buttons: one centred button at a fixed size on desktop, wrapping touch targets on the phone. */
  function actions(
    frame: PageFrame,
    items: readonly FlowAction[],
    desktop: Readonly<{ width: number; height: number; size: number; blockHeight: number }>,
  ): ScrollBlock {
    if (frame.compactPage) {
      const width = frame.width;
      return {
        height: kit.actionsHeight(items, width),
        draw: (y, view) => kit.actions(items, frame.left, y, width, view),
      };
    }
    const draw = (y: number, view: ScrollView): void => {
      for (const item of items)
        view.enqueue({
          x: frame.centerX - desktop.width / 2,
          y,
          w: desktop.width,
          h: desktop.height,
          label: item.label,
          size: desktop.size,
          action: item.action,
        });
    };
    return { height: desktop.blockHeight, draw };
  }

  return Object.freeze({
    open,
    body,
    close,
    emptyState,
    replay,
    prose,
    actions,
    textWidth: kit.textWidth,
    lineHeight: kit.lineHeight,
  });
}

export type { ScrollBlock, ScrollState, ScrollView, FlowAction };
