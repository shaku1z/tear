import type { CardView, ReplayView, ScreenAction, ScreenRenderContext } from "./contracts";

export function ellipsize(context: CanvasRenderingContext2D, value: string, maximumWidth: number): string {
  if (context.measureText(value).width <= maximumWidth) return value;
  const suffix = "…";
  let low = 0, high = value.length;
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
  readonly left: number; readonly right: number; readonly contentWidth: number;
  /** First y available under the header. */
  readonly bodyTop: number;
  /** Last y content may use; everything below belongs to the footer. */
  readonly bodyBottom: number;
  /** Top of the footer row (BACK). */
  readonly footerY: number;
}

export function pageLayout(context: ScreenRenderContext): PageLayout {
  const sheet = context.ui.sheetRect(), metric = context.ui.t.metric;
  const footerY = sheet.y + sheet.h - metric.btnH - 12;
  const left = context.width / 2 - 560;
  return Object.freeze({ sheet, left, right: left + 1120, contentWidth: 1120,
    bodyTop: metric.pageBodyTop, bodyBottom: footerY - 14, footerY });
}

export interface PageHeader {
  readonly title: string; readonly subtitle?: string | undefined; readonly hue?: string | undefined;
  /** Optional right-aligned figure in the header (for example the shop coin balance). */
  readonly stat?: Readonly<{ value: string; label: string; color?: string | undefined; glyph?: string | undefined }> | undefined;
}

/** Draws the page header and returns the layout; `bodyTop` sits under the header's last line. */
export function page(context: ScreenRenderContext, header: PageHeader): PageLayout {
  const { canvas, ui, width } = context;
  const layout = pageLayout(context), titleY = ui.t.metric.pageTitleY;
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
function headerStat(context: ScreenRenderContext, stat: NonNullable<PageHeader["stat"]>, statX: number, titleY: number): void {
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
export function pageFooter(context: ScreenRenderContext, options: Readonly<{
  back?: ScreenAction; canScrollUp?: boolean | undefined; canScrollDown?: boolean | undefined;
}> = {}): PageLayout {
  const layout = pageLayout(context);
  backControl(context, options.back);
  scrollHint(context, options.canScrollUp, options.canScrollDown);
  return layout;
}

export function backControl(context: ScreenRenderContext, to: ScreenAction = { type: "navigate", to: "menu" }): void {
  const metric = context.ui.t.metric, layout = pageLayout(context);
  context.enqueue({
    x: context.width / 2 - metric.backW / 2, y: layout.footerY, w: metric.backW, h: metric.btnH,
    label: "‹  BACK", action: to,
  });
}

export function tabs(context: ScreenRenderContext, values: readonly { id: string; label: string; selected?: boolean | undefined }[], action: (id: string) => ScreenAction, y = 124): void {
  if (values.length === 0) return;
  const active = Math.max(0, values.findIndex((value) => value.selected));
  context.ui.tabs(context.canvas, values.map((value) => value.id).join("-"), values.map((value) => value.label), active, y, (button) => {
    const index = button._tab ?? 0;
    const value = values[index];
    if (value === undefined) return;
    context.enqueue({ x: button.x, y: button.y, w: button.w, h: button.h, label: "", hiddenBox: true, action: action(value.id) });
  });
}

export function chips(context: ScreenRenderContext,
  values: readonly { id: string; label: string; selected?: boolean | undefined }[],
  action: (id: string) => ScreenAction, y: number, width: number, height: number, gap = 8, size?: number): void {
  if (values.length === 0) return;
  const start = (context.width - (width * values.length + gap * (values.length - 1))) / 2;
  values.forEach((value, index) => { context.enqueue({
    x: start + index * (width + gap), y, w: width, h: height, label: value.label,
    selected: value.selected, chip: true, action: action(value.id), size: size ?? context.ui.t.type.micro,
  }); });
}

/** Oracle replay-vault/feed row shared by Profile and Leaderboards. */
export function replayRow(context: ScreenRenderContext, replay: ReplayView,
  x: number, y: number, width: number, spineColor?: string, textRightReserve?: number): void {
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
  const title = ui.fitText(canvas, replay.title, textWidth, { size: ui.t.type.lead, floor: ui.t.type.label, bold: true });
  ui.displayText(canvas, title.lines[0] ?? replay.title, x + 156, y + 30, title.size);
  ui.textBox(canvas, replay.detail, x + 156, y + 54, textWidth, { size: ui.t.type.caption, alpha: ui.t.alpha.soft, maxLines: 1 });
  if (replay.timestamp) ui.textBox(canvas, replay.timestamp, x + 156, y + 74, textWidth, { size: ui.t.type.micro, alpha: ui.t.alpha.muted, maxLines: 1 });
}

export function cardGrid(
  context: ScreenRenderContext,
  cards: readonly CardView[],
  action: (id: string, index: number) => ScreenAction,
  options: { readonly top?: number; readonly columns?: number; readonly rows?: number; readonly height?: number } = {},
): void {
  const columns = options.columns ?? 4;
  const rows = options.rows ?? 3;
  const top = options.top ?? 210;
  const height = options.height ?? 150;
  const gap = 18;
  const margin = 210;
  const width = (context.width - margin * 2 - gap * (columns - 1)) / columns;
  const offsetRows = Math.max(0, Math.round(context.scroll / (height + gap)));
  cards.slice(offsetRows * columns, (offsetRows + rows) * columns).forEach((card, localIndex) => {
    const index = offsetRows * columns + localIndex;
    const column = localIndex % columns;
    const row = Math.floor(localIndex / columns);
    const x = margin + column * (width + gap);
    const y = top + row * (height + gap);
    context.ui.card(context.canvas, x, y, width, height, context.focus === index, {
      ...(card.locked ? { dashed: true } : {}),
      ...(!card.locked && card.accent ? { edge: card.accent } : {}),
      ...(card.shimmer !== undefined ? { shimmer: card.shimmer } : {}),
    });
    if (card.previewId) context.renderPreview?.(card.previewId, { x: x + 12, y: y + 32, w: width * 0.28, h: height - 44 });
    if (card.accent) context.ui.accentStrip(context.canvas, x, y, width, card.accent, 4);
    const heading = [card.badge, card.category].filter(Boolean).join("  ·  ");
    if (heading) context.ui.tag(context.canvas, heading, x + 16, y + 24, card.accent, "left", 11);
    context.ui.title(context.canvas, card.label, x + width / 2, y + 54, 20);
    if (card.tierCount && card.tierCount > 1) {
      const selected = Math.max(0, Math.min(card.tier ?? 0, card.tierCount - 1));
      const startX = x + 18;
      for (let tier = 0; tier < card.tierCount; tier++) {
        context.canvas.beginPath(); context.canvas.arc(startX + tier * 16, y + 72, 4, 0, Math.PI * 2);
        if (tier === selected) { context.canvas.fillStyle = card.accent ?? context.ui.t.color.accent; context.canvas.fill(); }
        else { context.canvas.strokeStyle = card.accent ?? context.ui.t.color.muted; context.canvas.lineWidth = 1.5; context.canvas.stroke(); }
      }
      context.ui.tag(context.canvas, selected === 0 ? "BASE" : `TIER ${String(selected + 1)}`, startX + card.tierCount * 16 + 4, y + 76, card.accent, "left", 10);
    }
    if (card.description) {
      if (card.progress !== undefined) {
        context.canvas.font = `${String(context.ui.t.font.bodyWeight)} 11px ${context.ui.t.font.body}`;
        context.ui.text(context.canvas, ellipsize(context.canvas, card.description, width - 36), x + width / 2, y + 74, 11, "center", context.ui.t.alpha.soft);
      } else {
        context.ui.wrappedText(context.canvas, card.description, x + width / 2, y + (card.tierCount && card.tierCount > 1 ? 94 : 78), width - 32, 18, 12, "center");
      }
    }
    if (card.progress !== undefined) {
      context.ui.bar(context.canvas, x + 16, y + height - 32, width - 132, 5, card.progress, card.accent);
      if (card.progressLabel) context.ui.tag(context.canvas, card.progressLabel, x + 16, y + height - 12, card.accent, "left", 10);
    }
    if (card.rewardPrimary) context.ui.tag(context.canvas, card.rewardPrimary, x + width - 14, y + 24, card.accent, "right", 10);
    if (card.rewardSecondary) context.ui.tag(context.canvas, card.rewardSecondary, x + width - 14, y + 42, undefined, "right", 10);
    if (card.cost) context.ui.tag(context.canvas, card.cost, x + width - 14, y + height - 16, card.accent, "right", 11);
    if (card.owned) context.ui.tag(context.canvas, `owned ×${String(card.owned)}`, x + 14, y + height - 16, undefined, "left", 11);
    if (card.footer) context.ui.tag(context.canvas, card.footer, x + width / 2, y + height - 10, undefined, "center", 10);
    context.enqueue({ x, y, w: width, h: height, label: "", hiddenBox: true, enabled: card.enabled, action: action(card.id, index) });
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
  context.ui.scrollHint(context.canvas, layout.sheet.x + layout.sheet.w - 48, layout.footerY + context.ui.t.metric.btnH / 2 + 5, canUp, canDown, "right");
}

export function verticalMenu(context: ScreenRenderContext, items: readonly { label: string; action: ScreenAction; enabled?: boolean }[], x: number, top: number, width = 280): void {
  const height = context.ui.t.metric.btnH;
  const gap = context.ui.t.metric.btnGap;
  items.forEach((item, index) => { context.enqueue({
    x: x - width / 2, y: top + index * (height + gap), w: width, h: height,
    label: item.label, action: item.action, enabled: item.enabled,
  }); });
}
