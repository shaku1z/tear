import type { CardView, ProgressView, ResultLogView, ScreenRenderContext } from "./contracts";

/** A clipped, scrollable panel region inside an overlay body. */
export interface PanelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const clampValue = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/** Section tag over a panel; returns the y where panel content starts. */
export function panelTag(context: ScreenRenderContext, label: string, x: number, y: number): number {
  const t = context.ui.t;
  context.ui.tag(context.canvas, label, x, y + t.type.micro, context.ui.readable(t.color.accent), "left", t.type.micro);
  return y + t.type.micro + t.space.sm;
}

/**
 * A solid surface for content that has no card of its own (progress rows, the wave log), so the
 * faded live scene behind a run overlay never shows through it. It is the same panel the cards use.
 */
export function runContentSurface(context: ScreenRenderContext, x: number, y: number, w: number, h: number): void {
  const { canvas, ui } = context,
    pad = ui.t.metric.panelPad;
  ui.panel(canvas, x - pad, y - pad, w + pad * 2, h + pad * 2);
}

/** Clips `draw` to the panel rect and draws the scroll hint under it when content overflows. */
function scrolled(
  context: ScreenRenderContext,
  rect: PanelRect,
  contentHeight: number,
  draw: (offset: number) => void,
): void {
  const maxScroll = Math.max(0, contentHeight - rect.h);
  const offset = clampValue(context.scroll, 0, maxScroll);
  context.canvas.save();
  context.canvas.beginPath();
  context.canvas.rect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
  context.canvas.clip();
  try {
    draw(offset);
  } finally {
    context.canvas.restore();
  }
  if (maxScroll > 0)
    context.ui.scrollHint(
      context.canvas,
      rect.x + rect.w,
      rect.y - context.ui.t.space.sm,
      offset > 0,
      offset < maxScroll,
      "right",
    );
}

function arsenalCardHeight(context: ScreenRenderContext): number {
  const t = context.ui.t;
  return t.metric.panelPad * 2 + t.type.lead + t.space.xs + Math.round(t.type.caption * 1.45) * 2;
}

/** The player's abilities as compact cards (pause screen), scrolling inside `rect`. */
export function arsenalPanel(context: ScreenRenderContext, abilities: readonly CardView[], rect: PanelRect): number {
  const { canvas, ui } = context,
    t = ui.t,
    pad = t.metric.panelPad;
  if (abilities.length === 0) {
    ui.textBox(canvas, "No abilities yet — they drop between waves.", rect.x, rect.y + t.type.caption, rect.w, {
      size: t.type.caption,
      alpha: t.alpha.muted,
      maxLines: 3,
    });
    return t.type.caption * 3;
  }
  const cardH = arsenalCardHeight(context),
    rowH = cardH + t.space.sm;
  const height = abilities.length * rowH - t.space.sm;
  scrolled(context, rect, height, (offset) => {
    abilities.forEach((ability, index) => {
      const y = rect.y + index * rowH - offset;
      if (y + cardH < rect.y - 2 || y > rect.y + rect.h) return;
      ui.card(canvas, rect.x, y, rect.w, cardH, false);
      ui.accentStrip(canvas, rect.x, y, rect.w, ability.accent);
      canvas.font = ui.font(t.type.micro, true);
      const footW = ability.footer ? canvas.measureText(ability.footer).width + t.space.sm : 0;
      const name = ui.fitText(canvas, ability.label, rect.w - pad * 2 - footW, {
        size: t.type.lead,
        floor: t.type.label,
        bold: true,
      });
      ui.displayText(
        canvas,
        name.lines[0] ?? ability.label,
        rect.x + pad,
        y + pad + Math.round(t.type.lead * 0.85),
        name.size,
      );
      const footColor = ui.readable(ability.accent ?? t.color.accent);
      if (ability.footer)
        ui.tag(canvas, ability.footer, rect.x + rect.w - pad, y + pad + t.type.micro, footColor, "right", t.type.micro);
      ui.textBox(
        canvas,
        ability.description ?? "",
        rect.x + pad,
        y + pad + t.type.lead + t.space.xs + t.type.caption,
        rect.w - pad * 2,
        { size: t.type.caption, alpha: t.alpha.soft, maxLines: 2, lineHeight: Math.round(t.type.caption * 1.45) },
      );
    });
  });
  return Math.min(height, rect.h);
}

function progressRowHeight(context: ScreenRenderContext): number {
  const t = context.ui.t;
  return t.type.caption + t.space.xs + 4 + t.space.md;
}

function progressRow(context: ScreenRenderContext, x: number, y: number, width: number, row: ProgressView): void {
  const { canvas, ui } = context,
    t = ui.t;
  const barColor = row.barColor ?? t.color.accent;
  canvas.font = ui.font(t.type.micro, true);
  const detailW = row.detail ? canvas.measureText(row.detail).width + t.space.sm : 0;
  const label = ui.fitText(canvas, row.label, width - detailW, {
    size: t.type.caption,
    floor: t.type.micro,
    bold: row.done === true,
  });
  canvas.save();
  canvas.fillStyle = row.labelColor ? ui.readable(row.labelColor) : ui.ink;
  canvas.font = ui.font(label.size, row.done === true);
  canvas.textAlign = "left";
  canvas.fillText(label.lines[0] ?? row.label, x, y + t.type.caption);
  canvas.restore();
  if (row.detail)
    ui.tag(canvas, row.detail, x + width, y + t.type.caption, ui.readable(barColor), "right", t.type.micro);
  const barY = y + t.type.caption + t.space.xs;
  canvas.save();
  canvas.globalAlpha = 0.15;
  canvas.fillStyle = ui.ink;
  canvas.fillRect(x, barY, width, 4);
  canvas.globalAlpha = 1;
  canvas.fillStyle = barColor;
  canvas.fillRect(x, barY, width * clampValue(row.goal ? row.current / row.goal : row.done ? 1 : 0, 0, 1), 4);
  canvas.restore();
}

/** Daily challenges and achievement progress for this run; returns the height used. */
export function runProgressPanel(
  context: ScreenRenderContext,
  rows: readonly ProgressView[],
  x: number,
  y: number,
  width: number,
  bottom: number,
): number {
  const t = context.ui.t,
    rowH = progressRowHeight(context);
  const sections: readonly (readonly [string, readonly ProgressView[]])[] = [
    ["", rows.filter((row) => row.kind !== "achievement")],
    ["ACHIEVEMENTS", rows.filter((row) => row.kind === "achievement")],
  ];
  // Lay the rows out first so the solid surface under them is exactly as tall as they are.
  let cursor = y + t.type.micro + t.space.sm;
  const placed: { label?: string; labelY: number; row?: ProgressView; y: number }[] = [];
  layout: for (const [label, group] of sections) {
    if (label) {
      placed.push({ label, labelY: cursor + t.space.sm, y: cursor });
      cursor += t.space.sm + t.type.micro + t.space.sm;
    }
    for (const row of group) {
      if (cursor + rowH > bottom) break layout;
      placed.push({ row, labelY: 0, y: cursor });
      cursor += rowH;
    }
  }
  const noAchievements = rows.every((row) => row.kind !== "achievement");
  runContentSurface(context, x, y, width, cursor - y + (noAchievements ? t.type.caption * 3 : 0));
  panelTag(context, "DAILY CHALLENGES", x, y);
  for (const item of placed) {
    if (item.label) panelTag(context, item.label, x, item.labelY);
    else if (item.row) progressRow(context, x, item.y, width, item.row);
  }
  if (rows.every((row) => row.kind !== "achievement")) {
    context.ui.textBox(context.canvas, "Keep fighting to make progress.", x, cursor + t.type.caption, width, {
      size: t.type.caption,
      alpha: t.alpha.muted,
      maxLines: 2,
    });
  }
  return cursor - y;
}

/** Per-wave run log (defeat screen and victory), scrolling inside `rect`. */
export function waveLogPanel(context: ScreenRenderContext, rows: readonly ResultLogView[], rect: PanelRect): void {
  const { canvas, ui } = context,
    t = ui.t;
  const columns = [rect.w * 0.45, rect.w * 0.68, rect.w];
  runContentSurface(context, rect.x, rect.y, rect.w, rect.h);
  const headerY = rect.y + t.type.label;
  canvas.save();
  canvas.globalAlpha = t.alpha.soft;
  canvas.fillStyle = ui.ink;
  canvas.font = ui.font(t.type.label, true);
  canvas.textAlign = "left";
  canvas.fillText("WAVE", rect.x, headerY);
  canvas.textAlign = "right";
  for (const [index, name] of ["TIME", "KILLS", "PEAK"].entries())
    canvas.fillText(name, rect.x + (columns[index] ?? rect.w), headerY);
  canvas.restore();
  ui.divider(canvas, rect.x, headerY + t.space.sm, rect.w, 0.4);
  const top = headerY + t.space.sm + t.space.md,
    rowH = t.type.body + t.space.md;
  if (rows.length === 0) {
    ui.text(
      canvas,
      "No waves cleared.",
      rect.x + rect.w / 2,
      top + t.type.caption,
      t.type.caption,
      "center",
      t.alpha.muted,
    );
    return;
  }
  const body = { x: rect.x, y: top, w: rect.w, h: rect.y + rect.h - top };
  scrolled(context, body, rows.length * rowH, (offset) => {
    rows.forEach((row, index) => {
      const y = top + index * rowH - offset + t.type.body;
      if (y < top - rowH || y > body.y + body.h + rowH) return;
      canvas.textAlign = "left";
      canvas.fillStyle = row.died ? ui.readable(t.color.danger) : ui.ink;
      canvas.font = ui.font(t.type.body, true);
      canvas.fillText((row.died ? "✗ " : "") + row.wave, rect.x, y);
      canvas.textAlign = "right";
      canvas.fillStyle = ui.ink;
      canvas.font = ui.font(t.type.body, false);
      canvas.fillText(row.time, rect.x + (columns[0] ?? 0), y);
      canvas.fillText(String(row.kills), rect.x + (columns[1] ?? 0), y);
      canvas.fillStyle = row.peakColor ? ui.readable(row.peakColor) : ui.ink;
      canvas.font = ui.font(t.type.body, true);
      canvas.fillText(row.peak, rect.x + rect.w, y);
      ui.divider(canvas, rect.x, y + t.space.sm, rect.w, 0.06);
    });
  });
  canvas.textAlign = "left";
}
