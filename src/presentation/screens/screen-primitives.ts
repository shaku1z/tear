import type { CardView, ScreenAction, ScreenRenderContext } from "./contracts";

export function backControl(context: ScreenRenderContext, to: ScreenAction = { type: "navigate", to: "menu" }): void {
  context.enqueue({
    x: context.width / 2 - 110, y: context.height - 70, w: 220, h: 48,
    label: "‹  BACK", action: to,
  });
}

export function tabs(context: ScreenRenderContext, values: readonly { id: string; label: string; selected?: boolean | undefined }[], action: (id: string) => ScreenAction, y = 124): void {
  if (values.length === 0) return;
  const gap = 8;
  const width = Math.min(180, (context.width - 360 - gap * (values.length - 1)) / values.length);
  const start = (context.width - (width * values.length + gap * (values.length - 1))) / 2;
  values.forEach((value, index) => { context.enqueue({
    x: start + index * (width + gap), y, w: width, h: 38,
    label: value.label, selected: value.selected, action: action(value.id), size: 12,
  }); });
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
    context.ui.text(context.canvas, card.label, x + width / 2, y + 54, 18, "center");
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
    if (card.description) context.ui.wrappedText(context.canvas, card.description, x + width / 2, y + (card.tierCount && card.tierCount > 1 ? 94 : 78), width - 32, 18, 12, "center");
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

export function scrollHint(context: ScreenRenderContext, canUp = false, canDown = false, y = context.height - 88): void {
  if (canUp || canDown) context.ui.scrollHint(context.canvas, context.width / 2, y, canUp, canDown);
}

export function verticalMenu(context: ScreenRenderContext, items: readonly { label: string; action: ScreenAction; enabled?: boolean }[], x: number, top: number, width = 280): void {
  const height = context.ui.t.metric.btnH;
  const gap = context.ui.t.metric.btnGap;
  items.forEach((item, index) => { context.enqueue({
    x: x - width / 2, y: top + index * (height + gap), w: width, h: height,
    label: item.label, action: item.action, enabled: item.enabled,
  }); });
}
