import type { DraftCardView, DraftScreenView, ReserveScreenView, ScreenAction, ScreenRenderContext, TierUpScreenView } from "./contracts";
import { actionRow, overlayHeader, type OverlayLayout } from "./screen-primitives";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const ez = (t: number): number => {
  const k = clamp(t, 0, 1);
  return 1 - (1 - k) * (1 - k);
};

interface ChoiceCardSpec {
  readonly enabled?: boolean | undefined;
  readonly accent: string;
  readonly tag: string;
  readonly tagColor?: string | undefined;
  readonly name: string;
  readonly desc: string;
  readonly foot?: string | undefined;
  readonly pips?: Readonly<{ next: number }> | undefined;
  readonly action: ScreenAction;
}

/** Geometry of the card deck inside the overlay body: one row, or rows of four that scroll by whole rows. */
interface DeckLayout {
  readonly count: number; readonly lineHeight: number;
  readonly perRow: number; readonly cardW: number; readonly cardH: number; readonly gap: number;
  readonly top: number; readonly bottom: number; readonly rowOffset: number; readonly rows: number;
}

/**
 * Draft, reserve and tier-up: consequential choices over the frozen world. One card
 * component for all three (fixed reading order: badge, category, name, tier path,
 * effect, ownership, confirmation hint), sized from its content and the live tokens
 * so a card is never mostly empty and never overflows.
 */
export function createDraftRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;
  // per-card hover animation state persists across frames (source: hoverAnim["cc"+i])
  const hoverAnim: Record<string, number> = {};

  function inner(cardW: number): number {
    return cardW - ui.t.metric.panelPad * 2;
  }

  function lineHeight(): number {
    return Math.round(ui.t.type.body * 1.45);
  }

  /** Height a card needs for its copy at the live tokens. */
  function contentHeight(spec: ChoiceCardSpec, cardW: number): number {
    const t = ui.t, pad = t.metric.panelPad;
    const description = ui.textBox(context.canvas, spec.desc, 0, 0, inner(cardW),
      { size: t.type.body, measureOnly: true, maxLines: 8, lineHeight: lineHeight() });
    return pad + 6 + t.space.sm + t.type.micro + t.space.md + t.type.title + (spec.pips ? t.space.md + 12 : 0)
      + t.space.md + 3 + t.space.md + description.height + (spec.foot ? t.space.sm + t.type.caption : 0) + t.space.lg + t.type.micro + pad;
  }

  function deckLayout(layout: OverlayLayout, specs: readonly ChoiceCardSpec[]): DeckLayout {
    const t = ui.t, gap = t.space.lg, count = Math.max(1, specs.length);
    const perRow = Math.min(4, count), rows = Math.ceil(count / perRow);
    const cardW = Math.min(420, (layout.width - gap * (perRow - 1)) / perRow);
    const available = layout.bodyBottom - layout.bodyTop;
    const needed = Math.max(...specs.map((spec) => contentHeight(spec, cardW)), t.type.title * 6);
    const cardH = Math.min(needed, rows > 1 ? (available - gap) / 2 : available);
    const visibleRows = Math.max(1, Math.floor((available + gap) / (cardH + gap)));
    const rowOffset = rows > visibleRows ? clamp(Math.round(context.scroll / (cardH + gap)), 0, rows - visibleRows) : 0;
    return { count, lineHeight: lineHeight(), perRow, cardW, cardH, gap, top: layout.bodyTop, bottom: layout.bodyBottom, rowOffset, rows };
  }

  function selectionHint(index: number, focused: boolean, hovered: number, spec: ChoiceCardSpec): string {
    if (spec.enabled === false) return "UNAVAILABLE FOR YOUR BUILD";
    if (context.touch) return focused ? "TAP AGAIN  ✓" : "TAP TO READ";
    return hovered > 0.5 ? "▸  SELECT" : `press  [ ${String(index + 1)} ]`;
  }

  function choiceCard(index: number, spec: ChoiceCardSpec, deck: DeckLayout): void {
    const { canvas } = context, t = ui.t, pad = t.metric.panelPad;
    const absoluteRow = Math.floor(index / deck.perRow), row = absoluteRow - deck.rowOffset, column = index % deck.perRow;
    const inRow = Math.min(deck.perRow, deck.count - absoluteRow * deck.perRow);                   // centre the last row
    const rowStart = (width - (deck.cardW * inRow + deck.gap * (inRow - 1))) / 2;
    const x = rowStart + column * (deck.cardW + deck.gap), y = deck.top + row * (deck.cardH + deck.gap);
    if (row < 0 || y + deck.cardH > deck.bottom + 1) return;
    const mouse = context.mouse;
    const hovered = (mouse.x >= x && mouse.x <= x + deck.cardW && mouse.y >= y && mouse.y <= y + deck.cardH) || index === context.focus;
    const key = "cc" + String(index);
    const a = hoverAnim[key] = lerp(hoverAnim[key] ?? 0, hovered ? 1 : 0, clamp(14 * context.deltaSeconds, 0, 1));
    const entrance = clamp(ez((context.enterSeconds - index * 0.06) / 0.34), 0, 1);
    canvas.save();
    canvas.globalAlpha = entrance;
    canvas.translate(0, (1 - entrance) * 46);   // deal-in from below; the card never moves off its hit box
    ui.card(canvas, x, y, deck.cardW, deck.cardH, a > 0.35);
    canvas.globalAlpha = entrance;   // UI.card owns an internal hover wash; restore the deal-in fade for card contents
    ui.accentStrip(canvas, x, y, deck.cardW, spec.accent, 6);
    const left = x + pad, cx = x + deck.cardW / 2, innerW = inner(deck.cardW);
    let cursor = y + 6 + t.space.sm + t.type.micro;
    const badge = context.touch ? 0 : t.type.micro + t.space.sm;
    if (badge > 0) ui.keyBadge(canvas, x + deck.cardW - pad - badge, cursor - t.type.micro, badge, index + 1, spec.accent);
    const tag = ui.fitText(canvas, spec.tag, innerW - badge - t.space.sm, { size: t.type.micro, floor: t.type.micro, bold: true });
    ui.tag(canvas, tag.lines[0] ?? spec.tag, left, cursor, ui.readable(spec.tagColor ?? spec.accent), "left", t.type.micro);
    cursor += t.space.md + t.type.title;
    ui.fitTitle(canvas, spec.name, cx, cursor, innerW, t.type.title, t.type.label);
    if (spec.pips) {
      cursor += t.space.md + 6;
      ui.tierPips(canvas, cx, cursor, 3, spec.pips.next, spec.accent);
      cursor += 6;
    }
    cursor += t.space.md;
    ui.accentStrip(canvas, cx - 28, cursor, 56, spec.accent, 3);
    cursor += 3 + t.space.md + t.type.body;
    const hintY = y + deck.cardH - pad;
    const footH = spec.foot ? t.space.sm + t.type.caption : 0;
    const lines = Math.max(1, Math.floor((hintY - t.space.lg - footH - cursor + t.type.body) / deck.lineHeight));
    const description = ui.textBox(canvas, spec.desc, left, cursor, innerW,
      { size: t.type.body, alpha: t.alpha.soft, maxLines: lines, lineHeight: deck.lineHeight });
    if (spec.foot) ui.text(canvas, spec.foot, left, description.lastBaseline + t.space.sm + t.type.caption, t.type.caption, "left", t.alpha.muted);
    const focused = index === context.focus;
    const hint = selectionHint(index, focused, a, spec);
    ui.tag(canvas, hint, cx, hintY, (a > 0.5 || (context.touch && focused)) ? ui.readable(spec.accent) : t.color.muted, "center", t.type.micro);
    canvas.restore();
    context.enqueue({ x, y, w: deck.cardW, h: deck.cardH, label: "", hiddenBox: true, confirm: true,
      ...(spec.enabled === undefined ? {} : { enabled: spec.enabled }), action: spec.action });
  }

  function deck(layout: OverlayLayout, specs: readonly ChoiceCardSpec[]): void {
    const geometry = deckLayout(layout, specs);
    specs.forEach((spec, index) => { choiceCard(index, spec, geometry); });
    const visibleRows = Math.max(1, Math.floor((geometry.bottom - geometry.top + geometry.gap) / (geometry.cardH + geometry.gap)));
    if (geometry.rows > visibleRows) {
      ui.scrollHint(context.canvas, layout.right, layout.bodyTop - ui.t.space.sm, geometry.rowOffset > 0,
        geometry.rowOffset < geometry.rows - visibleRows, "right");
    }
  }

  /** The instruction line under each title names the input that owns the screen. */
  function chooseLine(count: number, verb: string): string {
    if (context.touch) return `TAP A CARD TO READ IT  ·  TAP AGAIN TO ${verb}`;
    const keys = Array.from({ length: Math.min(4, count) }, (_, index) => String(index + 1)).join(" / ");
    return `${verb} ONE  ·  press ${keys}`;
  }

  function draftSpec(card: DraftCardView, action: ScreenAction, tagPrefix?: string): ChoiceCardSpec {
    return { enabled: card.enabled, accent: card.accent ?? ui.t.color.accent,
      tag: [tagPrefix, card.badge, card.category].filter(Boolean).join("  ·  "), tagColor: card.badgeColor,
      name: card.label, desc: card.description ?? "", foot: card.owned ? "owned ×" + String(card.owned) : undefined, action };
  }

  function draft(view: DraftScreenView): void {
    const t = ui.t;
    ui.dim(context.canvas, width, height, 0.84);
    const subtitle = [view.race ? `SHARED OFFERS · REROLL ${String(view.race.ordinal)} · CHOOSE ONE LEGAL UPGRADE` : chooseLine(view.cards.length, "TAKE")];
    const layout = overlayHeader(context, { title: `WAVE ${String(view.wave)} CLEARED`, subtitle });
    let body = layout;
    if (view.onboarding) {
      // First-draft guidance wraps at body size above the cards; the deck starts under it.
      const guidance = ui.textBox(context.canvas, view.onboarding, layout.centerX, layout.bodyTop + t.type.body - t.space.sm, Math.min(960, layout.width),
        { size: t.type.body, align: "center", alpha: t.alpha.soft, maxLines: 3 });
      body = { ...layout, bodyTop: layout.bodyTop + guidance.height + t.space.sm };
    }
    deck(body, view.cards.map((card, index) => draftSpec(card, { type: "draft.choose", index })));
    const actions: { label: string; action: ScreenAction; enabled?: boolean }[] = [
      { label: `⟳  REROLL · ${String(view.rerolls)}${context.touch ? "" : "  [R]"}`, enabled: view.rerolls > 0, action: { type: "draft.reroll" } },
    ];
    if (view.race?.carried) {
      actions.push({ label: `TAKE RESERVED: ${view.race.carried.label}`, enabled: view.race.carried.enabled !== false,
        action: { type: "draft.choose", index: view.cards.length } });
    }
    if (view.race?.pass) actions.push({ label: "NO LEGAL CARDS — CONTINUE", action: { type: "draft.choose", index: -1 } });
    actionRow(context, actions, layout.footerY, layout.width);
  }

  function reserve(view: ReserveScreenView): void {
    ui.dim(context.canvas, width, height, 0.84);
    const layout = overlayHeader(context, { title: "RESERVE A CARD", subtitle: [view.race
      ? "PERSONAL CARRIED CARD · SHARED OFFERS STAY UNCHANGED · TIER-UPS ARE PERSONAL"
      : "THIS CARD REPLACES ONE OFFER IN YOUR NEXT DRAFT", chooseLine(view.cards.length, "RESERVE")] });
    deck(layout, view.cards.map((card, index) => draftSpec(card, { type: "reserve.choose", index }, "RESERVE")));
    const actions: { label: string; action: ScreenAction }[] = [
      { label: view.race ? "DISCARD RESERVE" : "SKIP RESERVE", action: { type: "reserve.choose", index: -1 } },
    ];
    if (view.keepCarried) actions.push({ label: "KEEP CARRIED CARD", action: { type: "reserve.choose", index: -2 } });
    actionRow(context, actions, layout.footerY, layout.width);
  }

  function tierup(view: TierUpScreenView): void {
    ui.dim(context.canvas, width, height, 0.86);
    const layout = overlayHeader(context, { title: "THE WAY OPENS", reveal: clamp(ez(context.enterSeconds / 0.3), 0, 1),
      subtitle: ["THE BOSS FALLS  ·  EVOLVE ONE ABILITY YOU OWN", chooseLine(view.cards.length, "EVOLVE")] });
    deck(layout, view.cards.map((card, index) => {
      const next = card.nextTier ?? (card.tier ?? 1) + 1;
      return { enabled: card.enabled, accent: card.accent ?? ui.t.color.accent,
        tag: `TIER ${String(next)}${card.category ? `  ·  ${card.category}` : ""}`, tagColor: card.accent,
        name: card.label, desc: card.description ?? "", pips: { next }, action: { type: "tierup.choose", index } };
    }));
  }

  return { draft, reserve, tierup };
}
