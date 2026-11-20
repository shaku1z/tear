import type { ReplayView, ScreenAction, ScreenRenderContext } from "./contracts";

export function ellipsize(context: CanvasRenderingContext2D, value: string, maximumWidth: number): string {
  if (context.measureText(value).width <= maximumWidth) return value;
  const suffix = "…";
  let low = 0,
    high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (context.measureText(value.slice(0, middle).trimEnd() + suffix).width <= maximumWidth) low = middle;
    else high = middle - 1;
  }
  return value.slice(0, low).trimEnd() + suffix;
}

/**
 * THE PAGE PATTERN shared by every sheet screen: header (title, optional subtitle,
 * optional right-aligned stat) -> clipped scrollable body -> footer with BACK in one
 * consistent position inside the sheet. All geometry derives from the sheet rect.
 */
export interface PageLayout {
  readonly sheet: Readonly<{ x: number; y: number; w: number; h: number }>;
  /** Shared content column (1120 wide, centred). */
  readonly left: number;
  readonly right: number;
  readonly contentWidth: number;
  /** First y available under the header. */
  readonly bodyTop: number;
  /** Last y content may use; everything below belongs to the footer. */
  readonly bodyBottom: number;
  /** Top of the footer row (BACK). */
  readonly footerY: number;
}

export function pageLayout(context: ScreenRenderContext): PageLayout {
  const sheet = context.ui.sheetRect(),
    metric = context.ui.t.metric;
  const footerY = context.ui.sheetFooter().y;
  const left = context.width / 2 - 560;
  return Object.freeze({
    sheet,
    left,
    right: left + 1120,
    contentWidth: 1120,
    bodyTop: metric.pageBodyTop,
    bodyBottom: footerY - 14,
    footerY,
  });
}

/**
 * THE OVERLAY PATTERN shared by run overlays (pause, results, draft, reserve, tier-up):
 * a display title under the safe top, an accent rule, an optional subtitle, a body,
 * and a footer action row. Every y derives from the live tokens and safe insets, so
 * no title can clip and no row can collide at any density (desktop, tablet, phone).
 */
export interface OverlayLayout {
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly centerX: number;
  readonly top: number;
  readonly titleY: number;
  readonly ruleY: number;
  readonly subtitleY: number;
  /** First y under the header (and the subtitle when there is one). */
  readonly bodyTop: number;
  /** Last y body content may use. */
  readonly bodyBottom: number;
  /** Top of the footer action row. */
  readonly footerY: number;
}

export function overlayLayout(
  context: ScreenRenderContext,
  options: Readonly<{ subtitleLines?: number }> = {},
): OverlayLayout {
  const t = context.ui.t,
    inset = context.safeInsets;
  const top = inset.t + t.space.lg,
    bottom = context.height - inset.b - t.space.lg;
  const left = inset.l + t.space.xl,
    right = context.width - inset.r - t.space.xl;
  const titleY = top + Math.round(t.type.display * 0.8),
    ruleY = titleY + t.space.sm;
  const subtitleY = ruleY + 3 + t.space.sm + t.type.caption;
  const lines = options.subtitleLines ?? 0;
  const bodyTop = (lines > 0 ? subtitleY + (lines - 1) * Math.round(t.type.caption * 1.4) : ruleY + 3) + t.space.lg;
  const footerY = bottom - t.metric.btnH;
  return Object.freeze({
    left,
    right,
    width: right - left,
    centerX: context.width / 2,
    top,
    titleY,
    ruleY,
    subtitleY,
    bodyTop,
    bodyBottom: footerY - t.space.md,
    footerY,
  });
}

export interface OverlayHeader {
  readonly title: string;
  /** One or more short lines under the title (run summary, instructions). */
  readonly subtitle?: readonly string[] | undefined;
  readonly hue?: string | undefined;
  /** 0..1 reveal of the accent rule. */
  readonly reveal?: number | undefined;
}

/** Draws the overlay title, rule and subtitle lines; returns the layout for the body. */
export function overlayHeader(context: ScreenRenderContext, header: OverlayHeader): OverlayLayout {
  const { canvas, ui } = context,
    t = ui.t;
  const subtitle = header.subtitle ?? [];
  const layout = overlayLayout(context, { subtitleLines: subtitle.length });
  const title = ui.fitText(canvas, header.title, layout.width, {
    size: t.type.display,
    floor: t.type.h2,
    bold: true,
    ellipsis: false,
  });
  ui.title(canvas, title.lines[0] ?? header.title, layout.centerX, layout.titleY, title.size);
  const rule = 160 * (header.reveal ?? 1);
  canvas.save();
  canvas.globalAlpha = header.reveal ?? 1;
  canvas.fillStyle = header.hue ?? t.color.accent;
  canvas.fillRect(layout.centerX - rule / 2, layout.ruleY, rule, 3);
  canvas.restore();
  subtitle.forEach((line, index) => {
    const fit = ui.fitText(canvas, line, layout.width, { size: t.type.caption, floor: t.type.micro });
    ui.text(
      canvas,
      fit.lines[0] ?? line,
      layout.centerX,
      layout.subtitleY + index * Math.round(t.type.caption * 1.4),
      fit.size,
      "center",
      t.alpha.muted,
    );
  });
  return layout;
}

/** A centred row of equal buttons in the overlay footer (or at `y`). */
export function actionRow(
  context: ScreenRenderContext,
  items: readonly Readonly<{ label: string; action: ScreenAction; enabled?: boolean; entryFocus?: boolean }>[],
  y: number,
  maxWidth: number,
): void {
  const t = context.ui.t,
    gap = t.metric.btnGap;
  const width = Math.min(t.metric.btnW, (maxWidth - gap * (items.length - 1)) / Math.max(1, items.length));
  const start = context.width / 2 - (width * items.length + gap * (items.length - 1)) / 2;
  items.forEach((item, index) => {
    context.enqueue({
      x: start + index * (width + gap),
      y,
      w: width,
      h: t.metric.btnH,
      label: item.label,
      action: item.action,
      ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
      ...(item.entryFocus === undefined ? {} : { entryFocus: item.entryFocus }),
    });
  });
}

export interface PageHeader {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly hue?: string | undefined;
  /** Optional right-aligned figure in the header (for example the shop coin balance). */
  readonly stat?:
    Readonly<{ value: string; label: string; color?: string | undefined; glyph?: string | undefined }> | undefined;
}

/** Draws the page header and returns the layout; `bodyTop` sits under the header's last line. */
export function page(context: ScreenRenderContext, header: PageHeader): PageLayout {
  const { canvas, ui, width } = context;
  const layout = pageLayout(context),
    titleY = ui.t.metric.pageTitleY;
  ui.title(canvas, header.title, width / 2, titleY, ui.t.type.h1);
  const sweep = 130 * context.enterAmount;
  canvas.save();
  canvas.globalAlpha = context.enterAmount;
  canvas.fillStyle = header.hue ?? ui.t.color.accent;
  canvas.fillRect(width / 2 - sweep / 2, titleY + 16, sweep, 3);
  canvas.restore();
  let bodyTop = titleY + 36;
  if (header.subtitle) {
    ui.text(canvas, header.subtitle, width / 2, titleY + 46, ui.t.type.caption, "center", ui.t.alpha.muted);
    bodyTop = titleY + 64;
  }
  if (header.stat) headerStat(context, header.stat, layout.sheet.x + layout.sheet.w - 48, titleY);
  return Object.freeze({ ...layout, bodyTop: Math.max(layout.bodyTop, bodyTop) });
}

/** The right-aligned header figure: optional glyph, value, and a small label under it. */
function headerStat(
  context: ScreenRenderContext,
  stat: NonNullable<PageHeader["stat"]>,
  statX: number,
  titleY: number,
): void {
  const { canvas, ui } = context;
  canvas.save();
  canvas.textAlign = "right";
  canvas.textBaseline = "alphabetic";
  canvas.fillStyle = stat.color ?? ui.ink;
  canvas.font = ui.font(ui.t.type.h2, true);
  const valueWidth = canvas.measureText(stat.value).width;
  canvas.fillText(stat.value, statX, titleY - 4);
  if (stat.glyph) {
    canvas.font = ui.font(ui.t.type.title, true);
    canvas.fillText(stat.glyph, statX - valueWidth - 12, titleY - 4);
  }
  canvas.restore();
  ui.tag(canvas, stat.label, statX, titleY + 18, ui.t.color.muted, "right", ui.t.type.micro);
}

/** Clips drawing to the page body so rows never paint over the header or footer. */
export function clipBody(context: ScreenRenderContext, top: number, bottom: number, draw: () => void): void {
  const sheet = context.ui.sheetRect();
  context.canvas.save();
  context.canvas.beginPath();
  context.canvas.rect(sheet.x + 2, top, sheet.w - 4, Math.max(0, bottom - top));
  context.canvas.clip();
  try {
    draw();
  } finally {
    context.canvas.restore();
  }
}

/** Footer: BACK centred in the sheet footer row; the scroll hint sits to its right, never over rows. */
export function pageFooter(
  context: ScreenRenderContext,
  options: Readonly<{
    back?: ScreenAction;
    canScrollUp?: boolean | undefined;
    canScrollDown?: boolean | undefined;
  }> = {},
): PageLayout {
  const layout = pageLayout(context);
  backControl(context, options.back);
  scrollHint(context, options.canScrollUp, options.canScrollDown);
  return layout;
}

/** The page's BACK control. By default it returns to the screen the page was opened from. */
export function backControl(context: ScreenRenderContext, to: ScreenAction = { type: "navigate.back" }): void {
  const metric = context.ui.t.metric,
    layout = pageLayout(context);
  context.enqueue({
    x: context.width / 2 - metric.backW / 2,
    y: layout.footerY,
    w: metric.backW,
    h: metric.btnH,
    label: "‹  BACK",
    action: to,
  });
}

/**
 * The hub tab strip: one tab per value, the selected one underlined, each a hit box sending
 * `action(id)`. Centred on the stage by default; `frame` places it in a span (a phone page, a
 * panel), the tabs sharing it equally at the frame's height.
 */
export function tabs<Id extends string>(
  context: ScreenRenderContext,
  values: readonly { id: Id; label: string; selected?: boolean | undefined }[],
  action: (id: Id) => ScreenAction,
  y = 124,
  frame?: Readonly<{ x: number; w: number; h: number }>,
): void {
  if (values.length === 0) return;
  const active = Math.max(
    0,
    values.findIndex((value) => value.selected),
  );
  context.ui.tabs(
    context.canvas,
    values.map((value) => value.id).join("-"),
    values.map((value) => value.label),
    active,
    y,
    (button) => {
      const index = button._tab ?? 0;
      const value = values[index];
      if (value === undefined) return;
      context.enqueue({
        x: button.x,
        y: button.y,
        w: button.w,
        h: button.h,
        label: "",
        hiddenBox: true,
        action: action(value.id),
      });
    },
    frame?.w,
    frame,
  );
}

/** A desktop picker row: each item `width` x `height`, 8 px apart, centred unless `left` is given. */
export interface ChipRow {
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left?: number | undefined;
  /** Plain buttons in the default type instead of chips (the ABILITIES filters). */
  readonly buttons?: boolean | undefined;
  /** A view control after the last chip (the codex sort), centred with the row. */
  readonly trailing?: Readonly<{ label: string; action: ScreenAction; width: number }> | undefined;
}

export function chips(
  context: ScreenRenderContext,
  values: readonly { id: string; label: string; selected?: boolean | undefined }[],
  action: (id: string) => ScreenAction,
  row: ChipRow,
): void {
  const { y, width, height, trailing } = row,
    gap = 8,
    reserve = trailing ? trailing.width + gap * 2 : 0;
  const start = row.left ?? (context.width - (width * values.length + gap * (values.length - 1) + reserve)) / 2;
  const style = row.buttons ? {} : { chip: true, size: context.ui.t.type.micro };
  values.forEach((value, index) => {
    const x = start + index * (width + gap);
    context.enqueue({
      x,
      y,
      w: width,
      h: height,
      label: value.label,
      selected: value.selected,
      ...style,
      action: action(value.id),
    });
  });
  if (trailing) {
    const x = start + values.length * (width + gap) + gap;
    context.enqueue({ x, y, w: trailing.width, h: height, label: trailing.label, ...style, action: trailing.action });
  }
}

/** Oracle replay-vault/feed row shared by Profile and Leaderboards. */
export function replayRow(
  context: ScreenRenderContext,
  replay: ReplayView,
  x: number,
  y: number,
  width: number,
  spineColor?: string,
  textRightReserve?: number,
): void {
  const { canvas, ui } = context;
  ui.card(canvas, x, y, width, 84, false);
  if (spineColor) ui.spine(canvas, x, y, 84, spineColor);
  canvas.save();
  // Without a captured thumbnail the slot shows a designed dark tile, never an empty box.
  canvas.fillStyle = "#0e1017";
  canvas.globalAlpha = replay.thumbnailId ? 0.15 : 0.88;
  canvas.fillRect(x + 12, y + 6, 128, 72);
  canvas.globalAlpha = 1;
  if (replay.thumbnailId) context.renderPreview?.(replay.thumbnailId, { x: x + 12, y: y + 6, w: 128, h: 72 });
  else {
    canvas.fillStyle = ui.t.color.accent;
    canvas.font = ui.font(ui.t.type.h2, true);
    canvas.textAlign = "center";
    canvas.textBaseline = "middle";
    canvas.fillText("▶", x + 76, y + 40);
    canvas.textBaseline = "alphabetic";
  }
  canvas.strokeStyle = ui.ink;
  canvas.globalAlpha = 0.35;
  canvas.lineWidth = 1;
  canvas.strokeRect(x + 12, y + 6, 128, 72);
  canvas.restore();
  const textWidth = Math.max(120, width - 156 - (textRightReserve ?? 400));
  const title = ui.fitText(canvas, replay.title, textWidth, {
    size: ui.t.type.lead,
    floor: ui.t.type.label,
    bold: true,
  });
  ui.displayText(canvas, title.lines[0] ?? replay.title, x + 156, y + 30, title.size);
  ui.textBox(canvas, replay.detail, x + 156, y + 54, textWidth, {
    size: ui.t.type.caption,
    alpha: ui.t.alpha.soft,
    maxLines: 1,
  });
  if (replay.timestamp)
    ui.textBox(canvas, replay.timestamp, x + 156, y + 74, textWidth, {
      size: ui.t.type.micro,
      alpha: ui.t.alpha.muted,
      maxLines: 1,
    });
}

/** Scroll affordance in the page footer row (right of BACK), so it can never overlap the last row. */
export function scrollHint(context: ScreenRenderContext, canUp = false, canDown = false, legacyCentreY?: number): void {
  if (!canUp && !canDown) return;
  // Overlay screens without a sheet (draft, playground) keep their centred hint.
  if (legacyCentreY !== undefined) {
    context.ui.scrollHint(context.canvas, context.width / 2, legacyCentreY, canUp, canDown);
    return;
  }
  const layout = pageLayout(context);
  context.ui.scrollHint(
    context.canvas,
    layout.sheet.x + layout.sheet.w - 48,
    layout.footerY + context.ui.t.metric.btnH / 2 + 5,
    canUp,
    canDown,
    "right",
  );
}

export function verticalMenu(
  context: ScreenRenderContext,
  items: readonly { label: string; action: ScreenAction; enabled?: boolean }[],
  x: number,
  top: number,
  width = 280,
): void {
  const height = context.ui.t.metric.btnH;
  const gap = context.ui.t.metric.btnGap;
  items.forEach((item, index) => {
    context.enqueue({
      x: x - width / 2,
      y: top + index * (height + gap),
      w: width,
      h: height,
      label: item.label,
      action: item.action,
      enabled: item.enabled,
    });
  });
}
