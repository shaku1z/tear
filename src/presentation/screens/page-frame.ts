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
 *   y: a pinned head, then a list (clipped and scrolled by the app's scroll when it scrolls;
 *   the app owns the desktop scroll extent), then a pinned tail above the footer.
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
  /** One muted line beside (phone) or under (desktop) the title. */
  readonly subtitle?: string | undefined;
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

/** A block, or a slot the phone closes up when it has nothing to show (see `prose`). */
type Slot = ScrollBlock | undefined;

/**
 * Page turning for a paged list. Phone: PREVIOUS / NEXT and the page line (with the note) flow
 * at the end of the body. Desktop (`PAGER`): the buttons and the page line sit in the footer row
 * beside BACK, and the note has its own line pinned above the footer.
 */
export interface Pager {
  readonly previous: FlowAction;
  readonly next: FlowAction;
  readonly label: string;
  readonly note?: string | undefined;
}
const PAGER = { previous: [0, 170], next: [182, 150], buttonY: 6, buttonH: 36, label: 30, note: [26, 22] } as const;

export interface PageBody {
  readonly head?: readonly Slot[] | undefined;
  readonly list?: readonly Slot[] | undefined;
  readonly tail?: readonly Slot[] | undefined;
  readonly pager?: Pager | undefined;
  /** Space between blocks: the design spacing on desktop is usually built into the block heights. */
  readonly gap: number;
  /**
   * Desktop: the body's first y, the scroll state the app computed for the list, and which list
   * blocks are drawn: a block whose top is within `cull.above` over the list top and
   * `cull.below` short of its bottom (the design keeps a partly hidden row out). A list that
   * does not scroll (`scrolls: false`) is laid out from its top and drawn unclipped.
   */
  readonly desktop: Readonly<{
    top: number;
    cull: Readonly<{ above: number; below: number }>;
    scrolls?: boolean | undefined;
    canScrollUp?: boolean | undefined;
    canScrollDown?: boolean | undefined;
  }>;
}

/** Wrapped muted copy (see `prose`). `box` draws it as a left text box on desktop, else one `ui.text` line. */
interface ProseOptions {
  readonly size: number;
  readonly maxLines: number;
  readonly align: "center" | "left";
  readonly alpha?: number | undefined;
  /** Desktop: baseline below the block top, and the block height (or the measured height plus `gap`). */
  readonly baseline: number;
  readonly height?: number | undefined;
  readonly gap?: number | undefined;
  readonly box?: boolean | undefined;
}

/** A desktop button position (`x` absolute). */
export type ButtonSlot = Readonly<{ x: number; w: number }>;

const present = (blocks: readonly Slot[] | undefined): ScrollBlock[] =>
  (blocks ?? []).filter((block): block is ScrollBlock => block !== undefined);

/** Desktop drawing of the content column: the design page's centred 1120 column. */
const DESKTOP_COLUMN = 1120;

/** `count` equal desktop buttons across the frame, `gap` apart. */
export function evenSlots(frame: PageFrame, count: number, gap: number): readonly ButtonSlot[] {
  const w = (frame.width - (count - 1) * gap) / count;
  return Array.from({ length: count }, (_, i) => ({ x: frame.left + (i * (frame.width + gap)) / count, w }));
}

export function createPageFrame(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);

  /** Draws the chrome for the density in use and returns the frame the body lays out in. */
  function open(spec: PageSpec): PageFrame {
    if (ui.density.compact) {
      let compactPage = kit.header({
        title: spec.title,
        subtitle: spec.subtitle,
        hue: spec.hue,
        tabs: spec.tabs,
        tabAction: spec.tabAction,
      });
      if (spec.pickers) compactPage = kit.toolbar(compactPage, spec.pickers);
      const lead = spec.caption ? [kit.prose(compactPage, spec.caption, { maxLines: 2 })] : [];
      return Object.freeze({ compact: true, ...compactPage, lead, compactPage });
    }
    const layout = page(context, { title: spec.title, subtitle: spec.subtitle, hue: spec.hue });
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

  /** The pager's phone blocks: the buttons, then the page line with the note. */
  function pagerBlocks(frame: PageFrame, pager: Pager | undefined): ScrollBlock[] {
    if (!pager) return [];
    const line = pager.note ? `${pager.label} · ${pager.note}` : pager.label;
    return [
      actions(frame, [pager.previous, pager.next], { height: 0, size: 0, blockHeight: 0, slots: [] }),
      prose(frame, line, { size: ui.t.type.caption, maxLines: 2, align: "left", baseline: 0 }),
    ];
  }

  /** Lays the body out and draws it; returns whether it can scroll. */
  function body(frame: PageFrame, spec: PageBody): ScrollState {
    const head = present(spec.head),
      list = present(spec.list),
      tail = present(spec.tail);
    if (frame.compactPage)
      return kit.scroll(
        frame.compactPage,
        [...frame.lead, ...head, ...list, ...tail, ...pagerBlocks(frame, spec.pager)],
        spec.gap,
      );
    if (spec.pager) {
      const note = spec.pager.note;
      tail.push({
        height: PAGER.note[0],
        draw: (y) => {
          if (note)
            ui.textBox(context.canvas, note, frame.left, y + PAGER.note[1], frame.width, {
              size: ui.t.type.caption,
              alpha: ui.t.alpha.muted,
              maxLines: 1,
            });
        },
      });
    }
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
      listBottom = frame.bottom - tailHeight,
      scrolls = spec.desktop.scrolls !== false;
    if (list.length > 0) {
      const view: ScrollView = {
        top: listTop,
        bottom: listBottom,
        enqueue(control) {
          if (control.y >= listTop && control.y + control.h <= listBottom) context.enqueue(control);
        },
      };
      const drawList = (): void => {
        let rowY = listTop - (scrolls ? context.scroll : 0);
        for (const block of list) {
          if (rowY >= listTop - spec.desktop.cull.above && rowY <= listBottom - spec.desktop.cull.below)
            block.draw(rowY, view);
          rowY += block.height + spec.gap;
        }
      };
      if (scrolls) clipBody(context, listTop, listBottom, drawList);
      else drawList();
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

  /** The footer row: BACK, the scroll hint and, on desktop, the pager. */
  function close(
    frame: PageFrame,
    state: ScrollState,
    options: Readonly<{ back?: ScreenAction | undefined; pager?: Pager | undefined }> = {},
  ): void {
    if (frame.compactPage) {
      kit.footer(frame.compactPage, state, options.back);
      return;
    }
    const footer = pageFooter(context, { ...state, ...(options.back ? { back: options.back } : {}) });
    const pager = options.pager;
    if (!pager) return;
    for (const [item, [x, w]] of [
      [pager.previous, PAGER.previous],
      [pager.next, PAGER.next],
    ] as const)
      context.enqueue({
        x: frame.left + x,
        y: footer.footerY + PAGER.buttonY,
        w,
        h: PAGER.buttonH,
        label: item.label,
        size: ui.t.type.label,
        enabled: item.enabled ?? true,
        action: item.action,
      });
    ui.text(
      context.canvas,
      pager.label,
      frame.right,
      footer.footerY + PAGER.label,
      ui.t.type.caption,
      "right",
      ui.t.alpha.muted,
    );
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

  /**
   * Wrapped copy (muted unless `alpha` says otherwise): a measured paragraph on the phone; on
   * desktop one `ui.text` line or, with `box`, a text box. Without text it is a slot: the phone
   * closes it up, desktop keeps its `height` empty.
   */
  function prose(frame: PageFrame, text: string, options: ProseOptions): ScrollBlock;
  function prose(frame: PageFrame, text: string | undefined, options: ProseOptions): Slot;
  function prose(frame: PageFrame, text: string | undefined, options: ProseOptions): Slot {
    const alpha = options.alpha ?? ui.t.alpha.muted;
    if (frame.compactPage)
      return text === undefined
        ? undefined
        : kit.prose(frame.compactPage, text, {
            size: options.size,
            maxLines: options.maxLines,
            align: options.align,
            alpha,
          });
    if (text === undefined)
      return options.height === undefined ? undefined : { height: options.height, draw: () => undefined };
    const x = options.align === "center" ? frame.centerX : frame.left;
    if (!options.box) {
      const draw = (y: number): void => {
        ui.text(context.canvas, text, x, y + options.baseline, options.size, options.align, alpha);
      };
      return { height: options.height ?? 0, draw };
    }
    const box = { size: options.size, alpha, maxLines: options.maxLines };
    const height =
      options.height ??
      ui.textBox(context.canvas, text, x, 0, frame.width, { ...box, measureOnly: true }).height + (options.gap ?? 0);
    const draw = (y: number): void => {
      ui.textBox(context.canvas, text, x, y + options.baseline, frame.width, box);
    };
    return { height, draw };
  }

  /**
   * A row of flow buttons: wrapping touch targets on the phone; on desktop each item at its
   * slot (the last slot repeats when there are more items than slots).
   */
  function actions(
    frame: PageFrame,
    items: readonly FlowAction[],
    desktop: Readonly<{ height: number; size: number; blockHeight: number; slots: readonly ButtonSlot[] }>,
  ): ScrollBlock {
    if (frame.compactPage) {
      const width = frame.width;
      return {
        height: kit.actionsHeight(items, width),
        draw: (y, view) => kit.actions(items, frame.left, y, width, view),
      };
    }
    const draw = (y: number, view: ScrollView): void => {
      items.forEach((item, index) => {
        const slot = desktop.slots[Math.min(index, desktop.slots.length - 1)];
        if (!slot) return;
        view.enqueue({
          x: slot.x,
          y,
          w: slot.w,
          h: desktop.height,
          label: item.label,
          size: desktop.size,
          ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
          action: item.action,
        });
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
    lineCount: kit.lineCount,
  });
}

export type { ScrollBlock, ScrollState, ScrollView, FlowAction };
