import type { ReplayView, ScreenAction, ScreenControl, ScreenRenderContext } from "./contracts";
import { backControl, tabs as tabStrip } from "./screen-primitives";

/**
 * THE COMPACT PAGE: the phone-landscape composition shared by the library and shop
 * screens (and, without the sheet, the playground). One header row (title, optional
 * tabs, optional stat), an optional chip toolbar, a body that scrolls by pixels, and
 * the footer row with BACK centred and the scroll hint at its right. Everything is
 * sized from the live (compact) tokens: text at or above the touch floor, every
 * control at least `metric.minTarget` tall. The page owns its scroll extent: it
 * measures its blocks, clamps the scroll and writes it back (`context.setScroll`).
 */
export interface CompactPage {
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly centerX: number;
  /** First y available to the body (under the header rows and any toolbar). */
  readonly top: number;
  /** Last y the body may use; the footer row starts below it. */
  readonly bottom: number;
  /** Top of the footer row. */
  readonly footerY: number;
}

export interface CompactChoice {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean | undefined;
}

export interface CompactHeader {
  readonly title: string;
  readonly hue?: string | undefined;
  readonly tabs?: readonly CompactChoice[] | undefined;
  readonly tabAction?: ((id: string) => ScreenAction) | undefined;
  /** Right-aligned figure in the header row (for example the shop's coin balance). */
  readonly stat?:
    Readonly<{ value: string; label: string; color?: string | undefined; glyph?: string | undefined }> | undefined;
  /** A short muted line beside the title when the row has room (no tabs, no stat). */
  readonly subtitle?: string | undefined;
  /** A view control at the right end of the header row (the codex sort), drawn as a chip. */
  readonly trailing?: Readonly<{ label: string; action: ScreenAction }> | undefined;
  /** Without a sheet (playground overlays) the page spans the safe frame. */
  readonly sheet?: boolean | undefined;
}

/** Where a scroll lays its blocks: a page body, or any panel that scrolls (the Drills list). */
export type ScrollRegion = Pick<CompactPage, "left" | "width" | "top" | "bottom">;

/** What a block sees while it draws: the clipped body span and a visibility-checked enqueue. */
export interface ScrollView {
  readonly top: number;
  readonly bottom: number;
  /** Enqueues a control only while it sits fully inside the scrolled body. */
  enqueue(control: ScreenControl): void;
}

/** One measured piece of a scrolling body. `draw` receives the block's top y. */
export interface ScrollBlock {
  readonly height: number;
  draw(y: number, view: ScrollView): void;
}

export interface ScrollState {
  readonly canScrollUp: boolean;
  readonly canScrollDown: boolean;
}

export interface FlowAction {
  readonly label: string;
  readonly action: ScreenAction;
  readonly enabled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly accent?: string | undefined;
}

/** Inner padding of the compact page inside its sheet (or the safe frame). */
const PAGE_PAD = 40;
/** The narrowest a header tab may be before the strip drops to its own row. */
const TAB_MIN_WIDTH = 150;

/**
 * Where a scrolled body rests: on a block's top edge, or anywhere inside a block taller than the
 * view (so all of it can be read). The view offers whole controls only, so a body resting part-way
 * into a row would drop that row and show an empty band at its top. `maximum` is the first rest at
 * or past the content's end, so the last block is whole as well; `offset` is the rest nearest the
 * input scroll `raw`. The input itself keeps moving freely (it is only clamped), so small wheel or
 * drag steps add up to the next row instead of snapping back.
 */
export function scrollRest(
  heights: readonly number[],
  gap: number,
  visible: number,
  raw: number,
): Readonly<{ offset: number; maximum: number }> {
  const spans: (readonly [number, number])[] = [];
  let top = 0;
  for (const height of heights) {
    spans.push([top, top + Math.max(0, height - visible)]);
    top += height + gap;
  }
  const end = top - gap - visible;
  const last = spans.find(([, to]) => to >= end);
  if (end <= 0 || !last) return { offset: 0, maximum: 0 };
  const maximum = Math.ceil(Math.max(last[0], end)),
    target = Math.max(0, Math.min(maximum, raw));
  let offset = 0;
  for (const [from, to] of spans) {
    if (from > maximum) break;
    const rest = Math.max(from, Math.min(Math.min(to, maximum), target));
    if (Math.abs(rest - target) < Math.abs(offset - target)) offset = rest;
  }
  return { offset, maximum };
}

export function createCompactPage(context: ScreenRenderContext) {
  const { ui } = context;

  /** The page frame: the wide compact sheet, or the safe frame for an overlay without one. */
  function frame(sheet: boolean): Readonly<{ x: number; y: number; w: number; h: number }> {
    if (sheet) return ui.sheetRect();
    const inset = context.safeInsets,
      t = ui.t;
    const x = Math.max(inset.l, 0),
      y = Math.max(inset.t, 0) + t.space.sm;
    return {
      x,
      y,
      w: context.width - x - Math.max(inset.r, 0),
      h: context.height - y - Math.max(inset.b, 0) - t.space.sm,
    };
  }

  /** Footer row top: the sheet's footer row, or the same rhythm at the bottom of the safe frame. */
  function footerTop(sheet: boolean): number {
    if (sheet) return ui.sheetFooter().y;
    const area = frame(false);
    return area.y + area.h - ui.t.metric.btnH - ui.t.space.md;
  }

  function textWidth(text: string, size: number, bold: boolean): number {
    context.canvas.font = ui.font(size, bold);
    return context.canvas.measureText(text).width;
  }

  /** Baseline-to-baseline distance for compact copy at `size`. */
  function lineHeight(size: number): number {
    return Math.round(size * 1.25);
  }

  /** Lines `text` wraps to inside `width` at `size` (at most `maxLines`). */
  function lineCount(text: string, width: number, size: number, maxLines: number): number {
    return ui.textBox(context.canvas, text, 0, 0, width, {
      size,
      maxLines,
      lineHeight: lineHeight(size),
      measureOnly: true,
    }).lines.length;
  }

  /** Right-aligned header figure: value (with an optional glyph) over a small label; returns its width. */
  function stat(value: NonNullable<CompactHeader["stat"]>, right: number, rowTop: number, rowH: number): number {
    const t = ui.t,
      valueW = textWidth(value.value, t.type.h2, true),
      glyphW = value.glyph ? textWidth(value.glyph, t.type.title, true) + t.space.sm : 0;
    const labelW = textWidth(value.label, t.type.micro, true),
      block = t.type.h2 + t.space.xs + t.type.micro;
    const valueY = rowTop + (rowH - block) / 2 + Math.round(t.type.h2 * 0.8);
    ui.tag(context.canvas, value.value, right, valueY, value.color ?? ui.ink, "right", t.type.h2);
    if (value.glyph)
      ui.tag(
        context.canvas,
        value.glyph,
        right - valueW - t.space.sm,
        valueY,
        value.color ?? ui.ink,
        "right",
        t.type.title,
      );
    ui.tag(
      context.canvas,
      value.label,
      right,
      valueY + t.space.xs + t.type.micro,
      t.color.muted,
      "right",
      t.type.micro,
    );
    return Math.max(valueW + glyphW, labelW);
  }

  /** Draws the header rows and returns the page; `top` sits under the last header row. */
  function header(spec: CompactHeader): CompactPage {
    const { canvas } = context,
      t = ui.t,
      sheet = spec.sheet !== false,
      area = frame(sheet);
    const left = area.x + PAGE_PAD,
      right = area.x + area.w - PAGE_PAD,
      rowH = t.metric.btnH,
      rowTop = area.y + t.space.md;
    const titleY = rowTop + rowH / 2 + Math.round(t.type.h1 * 0.35),
      titleW = textWidth(spec.title, t.type.h1, true);
    ui.displayText(canvas, spec.title, left, titleY, t.type.h1, "left");
    canvas.save();
    canvas.globalAlpha = context.enterAmount;
    canvas.fillStyle = spec.hue ?? t.color.accent;
    canvas.fillRect(left, titleY + t.space.sm, Math.min(titleW, 130) * context.enterAmount, 3);
    canvas.restore();
    const chipW = spec.trailing
      ? Math.max(t.metric.minTarget * 1.5, textWidth(spec.trailing.label, t.type.micro, true) + t.space.md * 2)
      : 0;
    const statW =
      (spec.stat ? stat(spec.stat, right, rowTop, rowH) + t.space.xl : 0) + (chipW > 0 ? chipW + t.space.lg : 0);
    let bottom = rowTop + rowH;
    const tabs = spec.tabs ?? [];
    if (tabs.length > 0 && spec.tabAction) {
      const besideX = left + titleW + t.space.xl,
        besideW = right - statW - besideX;
      // A framed tab wraps its label onto two lines, so the longest word decides the fit.
      const longest =
        Math.max(...tabs.flatMap((tab) => tab.label.split(/\s+/u).map((word) => textWidth(word, t.type.label, true)))) +
        t.space.lg * 2;
      const beside = besideW / tabs.length >= Math.max(TAB_MIN_WIDTH, longest);
      const strip = beside
        ? { x: besideX, y: rowTop, w: besideW }
        : { x: left, y: bottom + t.metric.btnGap, w: right - left };
      tabStrip(context, tabs, spec.tabAction, strip.y, { x: strip.x, w: strip.w, h: ui.t.metric.btnH });
      if (!beside) bottom = strip.y + rowH;
    } else if (spec.subtitle && !spec.stat) {
      const room = right - (left + titleW + t.space.xl);
      const line = ui.fitText(canvas, spec.subtitle, room, { size: t.type.caption, floor: t.type.micro });
      if (room > 0) ui.text(canvas, line.lines[0] ?? spec.subtitle, right, titleY, line.size, "right", t.alpha.muted);
    }
    // Enqueued after the tabs, so a screen's first focus lands on its view switcher, not on this chip.
    if (spec.trailing)
      context.enqueue({
        x: right - chipW,
        y: rowTop,
        w: chipW,
        h: rowH,
        label: spec.trailing.label,
        chip: true,
        size: t.type.micro,
        action: spec.trailing.action,
      });
    const footerY = footerTop(sheet);
    return Object.freeze({
      left,
      right,
      width: right - left,
      centerX: (left + right) / 2,
      top: bottom + t.space.md,
      bottom: footerY - t.space.md,
      footerY,
    });
  }

  /**
   * A toolbar of chips under the header (filters, sort, board pickers): as few rows as
   * keep every label's longest word inside its chip. Returns the page below the toolbar.
   */
  function toolbar(
    page: CompactPage,
    groups: readonly Readonly<{ items: readonly CompactChoice[]; action: (id: string) => ScreenAction }>[],
  ): CompactPage {
    const t = ui.t,
      gap = t.space.sm,
      chips = groups.flatMap((group) => group.items.map((item) => ({ item, action: group.action })));
    if (chips.length === 0) return page;
    // A chip's label may wrap onto two lines, so its longest word (plus the label inset) decides the chip width.
    const needed =
      Math.max(
        ...chips.flatMap(({ item }) => item.label.split(/\s+/u).map((word) => textWidth(word, t.type.micro, true))),
      ) +
      t.space.sm * 2;
    let rows = 1;
    while (
      rows < chips.length &&
      (page.width - gap * (Math.ceil(chips.length / rows) - 1)) / Math.ceil(chips.length / rows) < needed
    )
      rows += 1;
    const perRow = Math.ceil(chips.length / rows),
      chipW = (page.width - gap * (perRow - 1)) / perRow,
      chipH = t.metric.minTarget;
    chips.forEach(({ item, action }, index) => {
      context.enqueue({
        x: page.left + (index % perRow) * (chipW + gap),
        y: page.top + Math.floor(index / perRow) * (chipH + gap),
        w: chipW,
        h: chipH,
        label: item.label,
        chip: true,
        selected: item.selected,
        size: t.type.micro,
        action: action(item.id),
      });
    });
    return Object.freeze({ ...page, top: page.top + rows * chipH + (rows - 1) * gap + t.space.md });
  }

  /**
   * Lays blocks top to bottom inside the page body, clamps the scroll to their measured
   * extent (and writes it back), then draws the visible blocks clipped to the body.
   */
  function scroll(page: ScrollRegion, blocks: readonly ScrollBlock[], gap = ui.t.space.md): ScrollState {
    const { canvas } = context,
      visible = page.bottom - page.top;
    const { offset, maximum } = scrollRest(
      blocks.map((block) => block.height),
      gap,
      visible,
      context.scroll,
    );
    const clamped = Math.max(0, Math.min(maximum, context.scroll));
    if (clamped !== context.scroll) context.setScroll?.(clamped);
    const view: ScrollView = {
      top: page.top,
      bottom: page.bottom,
      enqueue(control) {
        if (control.y >= page.top - 1 && control.y + control.h <= page.bottom + 1) context.enqueue(control);
      },
    };
    canvas.save();
    canvas.beginPath();
    canvas.rect(
      page.left - PAGE_PAD + 2,
      page.top - ui.t.space.xs,
      page.width + PAGE_PAD * 2 - 4,
      visible + ui.t.space.xs * 2,
    );
    canvas.clip();
    try {
      let y = page.top - offset;
      for (const block of blocks) {
        if (y + block.height >= page.top - ui.t.space.xs && y <= page.bottom + ui.t.space.xs) block.draw(y, view);
        y += block.height + gap;
      }
    } finally {
      canvas.restore();
    }
    return { canScrollUp: offset > 0, canScrollDown: offset < maximum };
  }

  /**
   * A scrolling list inside a panel, its scroll hint on a line of its own: when the blocks overflow
   * `region`, its last line is kept for the hint, centred under the list, so the hint never sits on
   * what follows. A list that fits takes only its height. `bottom` is the y under the list and hint.
   */
  function list(
    region: ScrollRegion,
    blocks: readonly ScrollBlock[],
    gap = ui.t.space.md,
  ): ScrollState & Readonly<{ bottom: number }> {
    const total = blocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, blocks.length - 1) * gap,
      hintH = lineHeight(ui.t.type.caption) + ui.t.space.xs,
      overflows = total > region.bottom - region.top;
    const body = { ...region, bottom: overflows ? region.bottom - hintH : region.top + total };
    const state = scroll(body, blocks, gap);
    if (overflows)
      ui.scrollHint(
        context.canvas,
        region.left + region.width / 2,
        body.bottom + hintH / 2 + Math.round(ui.t.type.caption * 0.35),
        state.canScrollUp,
        state.canScrollDown,
      );
    return { ...state, bottom: overflows ? region.bottom : body.bottom };
  }

  /** Footer row: BACK centred (when given) and the scroll hint at the right end. */
  function footer(page: CompactPage, state: ScrollState, back?: ScreenAction | null): void {
    if (back !== null) backControl(context, back);
    if (state.canScrollUp || state.canScrollDown) {
      ui.scrollHint(
        context.canvas,
        page.right,
        page.footerY + ui.t.metric.btnH / 2 + Math.round(ui.t.type.caption * 0.35),
        state.canScrollUp,
        state.canScrollDown,
        "right",
      );
    }
  }

  /** Rows of equal cells across `span` (the page by default), `gap` apart: one block per row so scrolling culls whole rows. */
  function grid<Item>(
    span: Readonly<{ left: number; width: number }>,
    items: readonly Item[],
    columns: number,
    rowHeight: (row: readonly Item[]) => number,
    cell: (item: Item, x: number, y: number, w: number, h: number, view: ScrollView, index: number) => void,
    gap = ui.t.space.md,
  ): readonly ScrollBlock[] {
    const page = span,
      w = (page.width - gap * (columns - 1)) / columns,
      blocks: ScrollBlock[] = [];
    for (let start = 0; start < items.length; start += columns) {
      const row = items.slice(start, start + columns),
        h = rowHeight(row);
      const draw = (y: number, view: ScrollView): void => {
        row.forEach((item, index) => {
          cell(item, page.left + index * (w + gap), y, w, h, view, start + index);
        });
      };
      blocks.push({ height: h, draw });
    }
    return blocks;
  }

  /** A section rule (label, optional count, hairline) as a block. */
  function section(page: CompactPage, label: string, hue?: string): ScrollBlock {
    const t = ui.t;
    const draw = (y: number): void => {
      ui.sectionLabel(context.canvas, label, page.left, y + t.type.micro, page.width, hue);
    };
    return { height: t.type.micro + t.space.sm, draw };
  }

  /** Wrapped prose as a block, measured at the live size. */
  function prose(
    page: CompactPage,
    text: string,
    options: Readonly<{
      size?: number;
      alpha?: number;
      maxLines?: number;
      align?: CanvasTextAlign;
      color?: string;
    }> = {},
  ): ScrollBlock {
    const t = ui.t,
      size = options.size ?? t.type.caption,
      x = options.align === "center" ? page.centerX : page.left;
    const box = {
      size,
      maxLines: options.maxLines ?? 4,
      alpha: options.alpha ?? t.alpha.muted,
      ...(options.align ? { align: options.align } : {}),
      ...(options.color ? { color: options.color } : {}),
    };
    const measured = ui.textBox(context.canvas, text, x, 0, page.width, { ...box, measureOnly: true });
    const draw = (y: number): void => {
      ui.textBox(context.canvas, text, x, y + size, page.width, box);
    };
    return { height: measured.height, draw };
  }

  /** Width a flow button needs for its label at the live label size. */
  function actionWidth(item: FlowAction, maxWidth: number): number {
    const t = ui.t;
    return Math.min(
      maxWidth,
      Math.max(t.metric.minTarget * 1.5, textWidth(item.label, t.type.label, true) + t.space.lg * 2),
    );
  }

  /** Width the flow buttons take on one row, capped at `maxWidth` (they wrap beyond it). */
  function actionsWidth(items: readonly FlowAction[], maxWidth: number): number {
    const gap = ui.t.metric.btnGap;
    return Math.min(maxWidth, items.reduce((sum, item) => sum + actionWidth(item, maxWidth) + gap, 0) - gap);
  }

  /** Height a row of flow buttons takes when it wraps inside `width`. */
  function actionsHeight(items: readonly FlowAction[], width: number): number {
    return flowLayout(items, 0, 0, width).height;
  }

  function flowLayout(items: readonly FlowAction[], x: number, y: number, width: number) {
    const t = ui.t,
      gap = t.metric.btnGap,
      h = t.metric.minTarget,
      places: { item: FlowAction; x: number; y: number; w: number }[] = [];
    let cursorX = x,
      cursorY = y;
    for (const item of items) {
      const w = actionWidth(item, width);
      if (cursorX > x && cursorX + w > x + width) {
        cursorX = x;
        cursorY += h + gap;
      }
      places.push({ item, x: cursorX, y: cursorY, w });
      cursorX += w + gap;
    }
    return { places, height: items.length === 0 ? 0 : cursorY - y + h };
  }

  /** Buttons that flow left to right and wrap; each is a full touch target. */
  function actions(items: readonly FlowAction[], x: number, y: number, width: number, view: ScrollView): number {
    const layout = flowLayout(items, x, y, width),
      h = ui.t.metric.minTarget;
    for (const place of layout.places) {
      view.enqueue({
        x: place.x,
        y: place.y,
        w: place.w,
        h,
        label: place.item.label,
        size: ui.t.type.label,
        action: place.item.action,
        ...(place.item.enabled === undefined ? {} : { enabled: place.item.enabled }),
        ...(place.item.selected === undefined ? {} : { selected: place.item.selected }),
        ...(place.item.accent === undefined ? {} : { accent: place.item.accent }),
      });
    }
    return layout.height;
  }

  /** A designed empty, loading or offline state (ghost glyph, line, detail) with an optional call to action. */
  function empty(page: CompactPage, glyph: string, line: string, detail?: string, cta?: FlowAction): ScrollBlock {
    const t = ui.t,
      width = Math.min(page.width, 1100),
      glyphH = Math.round(t.type.h1 * 1.2);
    const detailBox = { size: t.type.caption, maxLines: 3, align: "center" as const, alpha: t.alpha.muted };
    const detailH = detail
      ? ui.textBox(context.canvas, detail, page.centerX, 0, width, { ...detailBox, measureOnly: true }).height +
        t.space.sm
      : 0;
    const ctaH = cta ? t.space.md + t.metric.minTarget : 0;
    const height = glyphH + t.space.sm + t.type.lead + t.space.md + detailH + ctaH;
    const draw = (y: number, view: ScrollView): void => {
      const { canvas } = context;
      canvas.save();
      canvas.globalAlpha = 0.16;
      ui.tag(canvas, glyph, page.centerX, y + glyphH, ui.ink, "center", t.type.h1);
      canvas.restore();
      const lineY = y + glyphH + t.space.sm + t.type.lead;
      ui.displayText(canvas, line, page.centerX, lineY, t.type.lead, "center");
      if (detail) ui.textBox(canvas, detail, page.centerX, lineY + t.space.md + t.type.caption, width, detailBox);
      if (cta)
        actions([cta], page.centerX - actionWidth(cta, width) / 2, lineY + t.space.md * 2 + detailH, width, view);
    };
    return { height, draw };
  }

  /** A replay row (thumbnail, title, detail, date) over a flowing row of its actions. */
  function replayRow(page: CompactPage, replay: ReplayView, items: readonly FlowAction[], spine?: string): ScrollBlock {
    const t = ui.t,
      pad = t.space.md,
      thumbW = 192,
      thumbH = 108,
      textX = page.left + pad * 2 + thumbW,
      textW = page.right - pad - textX;
    const detailLines = lineCount(replay.detail, textW, t.type.caption, 2);
    const infoH = Math.max(
      thumbH,
      t.type.lead +
        t.space.sm +
        detailLines * lineHeight(t.type.caption) +
        (replay.timestamp ? t.space.xs + t.type.micro : 0),
    );
    const actionsH = items.length > 0 ? t.space.md + actionsHeight(items, page.width - pad * 2) : 0;
    const height = pad + infoH + actionsH + pad;
    const draw = (y: number, view: ScrollView): void => {
      const { canvas } = context;
      ui.card(canvas, page.left, y, page.width, height, false);
      if (spine) ui.spine(canvas, page.left, y, height, spine);
      thumbnail(replay, page.left + pad, y + pad, thumbW, thumbH);
      const titleY = y + pad + t.type.lead;
      const title = ui.fitText(canvas, replay.title, textW, { size: t.type.lead, floor: t.type.micro, bold: true });
      ui.displayText(canvas, title.lines[0] ?? replay.title, textX, titleY, title.size);
      const detail = ui.textBox(canvas, replay.detail, textX, titleY + t.space.sm + t.type.caption, textW, {
        size: t.type.caption,
        maxLines: 2,
        lineHeight: lineHeight(t.type.caption),
        alpha: t.alpha.soft,
      });
      if (replay.timestamp)
        ui.textBox(canvas, replay.timestamp, textX, detail.lastBaseline + t.space.xs + t.type.micro, textW, {
          size: t.type.micro,
          maxLines: 1,
          alpha: t.alpha.muted,
        });
      if (items.length > 0) actions(items, page.left + pad, y + pad + infoH + t.space.md, page.width - pad * 2, view);
    };
    return { height, draw };
  }

  /** The replay's captured frame, or a designed dark tile with a play mark when there is none. */
  function thumbnail(replay: ReplayView, x: number, y: number, w: number, h: number): void {
    const { canvas } = context,
      t = ui.t;
    canvas.save();
    canvas.fillStyle = "#0e1017";
    canvas.globalAlpha = replay.thumbnailId ? 0.15 : 0.88;
    canvas.fillRect(x, y, w, h);
    canvas.globalAlpha = 1;
    if (replay.thumbnailId) context.renderPreview?.(replay.thumbnailId, { x, y, w, h });
    else ui.tag(canvas, "▶", x + w / 2, y + h / 2 + Math.round(t.type.h2 * 0.35), t.color.accent, "center", t.type.h2);
    canvas.strokeStyle = ui.ink;
    canvas.globalAlpha = 0.35;
    canvas.lineWidth = 1;
    canvas.strokeRect(x, y, w, h);
    canvas.restore();
  }

  return Object.freeze({
    header,
    toolbar,
    scroll,
    list,
    footer,
    grid,
    section,
    prose,
    actions,
    actionsHeight,
    actionsWidth,
    empty,
    replayRow,
    textWidth,
    lineHeight,
    lineCount,
  });
}

export type CompactPageKit = ReturnType<typeof createCompactPage>;
