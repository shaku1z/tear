import type { DraftCardView, DraftScreenView, ReserveScreenView, ScreenAction, ScreenRenderContext, TierUpScreenView } from "./contracts";
import { actionRow, overlayHeader, scrollHint, type OverlayLayout } from "./screen-primitives";

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

/** Geometry of the compact card deck inside the overlay body: one row, or rows of four that scroll by whole rows. */
interface DeckLayout {
  readonly count: number; readonly lineHeight: number;
  readonly perRow: number; readonly cardW: number; readonly cardH: number; readonly gap: number;
  readonly top: number; readonly bottom: number; readonly rowOffset: number; readonly rows: number;
}

/**
 * The established card composition (desktop and tablet). A normal draft or reserve
 * deals one row of tall cards; tier-up and long decks deal rows of four shorter
 * cards that scroll by pixels. Interior offsets are measured from the card top.
 */
const CLASSIC = Object.freeze({
  title: Object.freeze({ y: 122, ruleY: 140, subtitleY: 176, onboardingY: 208, actionsY: 680 }),
  row: Object.freeze({ wide: 322, narrow: 300, h: 384, gap: 34, narrowGap: 24, top: 248,
    strip: 9, tagY: 44, nameY: 96, divY: 110, pipY: 136, descY: 154, descPipY: 172, descLH: 25, selY: 46, footY: 24, badge: 30 }),
  grid: Object.freeze({ w: 300, h: 262, gap: 24, rowGap: 26, top: 196, perRow: 4,
    strip: 7, tagY: 34, nameY: 66, divY: 80, pipY: 102, descY: 128, descPipY: 142, descLH: 21, selY: 30, footY: 14, badge: 24 }),
});

type ClassicMetrics = typeof CLASSIC.row | typeof CLASSIC.grid;

/** Where one classic card sits; `visible` is false when a scrolled grid row is off screen. */
interface ClassicPlacement {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly m: ClassicMetrics; readonly visible: boolean;
}

/**
 * Draft, reserve and tier-up: consequential choices over the frozen world. One card
 * component for all three (fixed reading order: badge, category, name, tier path,
 * effect, ownership, confirmation hint). Desktop and tablet keep the established tall
 * card composition; a phone (compact density) sizes the deck from its copy instead.
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

  /** Smoothed hover progress for card `index` over the rectangle it occupies. */
  function hoverProgress(index: number, x: number, y: number, w: number, h: number): number {
    const mouse = context.mouse;
    const hovered = (mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h) || index === context.focus;
    const key = "cc" + String(index);
    return hoverAnim[key] = lerp(hoverAnim[key] ?? 0, hovered ? 1 : 0, clamp(14 * context.deltaSeconds, 0, 1));
  }

  function choiceCard(index: number, spec: ChoiceCardSpec, deck: DeckLayout): void {
    const { canvas } = context, t = ui.t, pad = t.metric.panelPad;
    const absoluteRow = Math.floor(index / deck.perRow), row = absoluteRow - deck.rowOffset, column = index % deck.perRow;
    const inRow = Math.min(deck.perRow, deck.count - absoluteRow * deck.perRow);                   // centre the last row
    const rowStart = (width - (deck.cardW * inRow + deck.gap * (inRow - 1))) / 2;
    const x = rowStart + column * (deck.cardW + deck.gap), y = deck.top + row * (deck.cardH + deck.gap);
    if (row < 0 || y + deck.cardH > deck.bottom + 1) return;
    const a = hoverProgress(index, x, y, deck.cardW, deck.cardH);
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

  /** The classic card's place: one centred row of tall cards, or rows of four that scroll by pixels. */
  function classicPlacement(index: number, count: number, normalRow: boolean, gridH: number): ClassicPlacement {
    if (normalRow || count <= 3) {
      const m = CLASSIC.row, w = count > 3 ? m.narrow : m.wide, gap = count > 3 ? m.narrowGap : m.gap;
      const x = (width - (w * count + gap * (count - 1))) / 2 + index * (w + gap);
      return { x, y: m.top, w, h: m.h, m, visible: true };
    }
    const m = CLASSIC.grid, row = Math.floor(index / m.perRow), column = index % m.perRow;
    const inRow = Math.min(m.perRow, count - row * m.perRow);                       // centre the last row
    const scroll = Math.ceil(count / m.perRow) > 2 ? context.scroll : 0;
    // Touch type is larger, so the grid starts a step lower to clear the instruction line.
    const top = m.top + (ui.density.touch ? ui.t.space.lg : 0);
    const x = (width - (m.w * inRow + m.gap * (inRow - 1))) / 2 + column * (m.w + m.gap);
    const y = top + row * (gridH + m.rowGap) - scroll;
    return { x, y, w: m.w, h: gridH, m, visible: y + gridH >= 170 && y <= height - 40 };
  }

  /**
   * Grid card height: the established 262, grown for a single row when the live type
   * (touch density) needs more room, so a description never has to be cut.
   */
  function classicGridHeight(specs: readonly ChoiceCardSpec[]): number {
    const t = ui.t, m = CLASSIC.grid;
    if (specs.length > m.perRow) return m.h;
    const lineH = Math.max(m.descLH, Math.round(t.type.label * 1.4));
    const tallest = Math.max(0, ...specs.map((spec) => ui.textBox(context.canvas, spec.desc, 0, 0, m.w - 52,
      { size: t.type.label, lineHeight: lineH, measureOnly: true, maxLines: 8 }).height));
    // The description's last baseline, then the gap and the hint line the card keeps below it.
    return Math.max(m.h, Math.round(m.descPipY + tallest - lineH + t.space.sm + t.type.micro + m.selY));
  }

  /**
   * The established choice card: deal-in from below, hover lift and scale, a key
   * badge (keyboard and mouse), fit-to-width name, tier pips, and a centred
   * description that wraps inside the card at the live body size.
   */
  function classicCard(index: number, count: number, spec: ChoiceCardSpec, normalRow: boolean, gridH: number): void {
    const { canvas } = context, t = ui.t, place = classicPlacement(index, count, normalRow, gridH);
    const { x, y, w, h, m } = place, grid = m === CLASSIC.grid;
    if (!place.visible) {
      context.enqueue({ x, y, w, h, label: "", hiddenBox: true, enabled: false, action: spec.action });
      return;
    }
    const a = hoverProgress(index, x, y, w, h);
    const entrance = clamp(ez((context.enterSeconds - index * 0.06) / 0.34), 0, 1);
    canvas.save();
    canvas.globalAlpha = entrance;
    canvas.translate(0, (1 - entrance) * 46 - a * 12);                       // deal-in from below + hover lift
    const cx = x + w / 2, cy = y + h / 2, scale = 1 + a * 0.035;
    canvas.translate(cx, cy);
    canvas.scale(scale, scale);
    canvas.translate(-cx, -cy);
    ui.card(canvas, x, y, w, h, a > 0.35);
    canvas.globalAlpha = entrance;   // UI.card owns an internal hover wash; restore the deal-in fade for card contents
    ui.accentStrip(canvas, x, y, w, spec.accent, m.strip);
    const badge = context.touch ? 0 : m.badge;
    if (badge > 0) ui.keyBadge(canvas, x + w - badge - (grid ? 14 : 16), y + (grid ? 14 : 24), badge, index + 1, spec.accent);
    const tag = ui.fitText(canvas, spec.tag, w - 44 - (badge > 0 ? badge + t.space.sm : 0), { size: t.type.micro, floor: t.type.micro, bold: true });
    ui.tag(canvas, tag.lines[0] ?? spec.tag, x + 22, y + m.tagY, ui.readable(spec.tagColor ?? spec.accent), "left", t.type.micro);
    ui.fitTitle(canvas, spec.name, cx, y + m.nameY, w - 44, grid ? t.type.lead : t.type.title, t.type.label);
    ui.accentStrip(canvas, cx - 28, y + m.divY, 56, spec.accent, 3);
    if (spec.pips) ui.tierPips(canvas, cx, y + m.pipY, 3, spec.pips.next, spec.accent);
    classicDescription(spec, cx, y + (spec.pips ? m.descPipY : m.descY), w, y + h - m.selY - t.type.micro, grid);
    if (spec.foot) ui.tag(canvas, spec.foot, cx, y + h - m.footY, t.color.muted, "center", t.type.caption);
    const focused = index === context.focus;
    const hint = selectionHint(index, focused, a, spec);
    ui.tag(canvas, hint, cx, y + h - m.selY, (a > 0.5 || (context.touch && focused)) ? ui.readable(spec.accent) : t.color.muted, "center", t.type.micro);
    canvas.restore();
    context.enqueue({ x, y, w, h, label: "", hiddenBox: true, confirm: true,
      ...(spec.enabled === undefined ? {} : { enabled: spec.enabled }), action: spec.action });
  }

  /** Centred description from baseline `top`; wraps within the card and never reaches the hint at `limit`. */
  function classicDescription(spec: ChoiceCardSpec, cx: number, top: number, cardW: number, limit: number, grid: boolean): void {
    const t = ui.t, size = grid ? t.type.label : t.type.body;
    const lineH = Math.max(grid ? CLASSIC.grid.descLH : CLASSIC.row.descLH, Math.round(size * 1.4));
    const maxLines = Math.max(1, Math.floor((limit - t.space.sm - top) / lineH) + 1);
    ui.textBox(context.canvas, spec.desc, cx, top, cardW - 52, { size, align: "center", lineHeight: lineH, maxLines });
  }

  /** The classic header: display title, accent rule and centred instruction lines. */
  function classicHeader(title: string, lines: readonly string[], reveal = 1): void {
    const { canvas } = context, t = ui.t, c = CLASSIC.title;
    const fit = ui.fitText(canvas, title, width - 64, { size: t.type.display, floor: t.type.h2, bold: true, ellipsis: false });
    ui.title(canvas, fit.lines[0] ?? title, width / 2, c.y, fit.size);
    canvas.save();
    canvas.globalAlpha = reveal;
    ui.accentStrip(canvas, width / 2 - 80, c.ruleY, 160, t.color.accent, 3);
    canvas.restore();
    lines.forEach((line, index) => {
      const fitLine = ui.fitText(canvas, line, width - 64, { size: t.type.caption, floor: t.type.micro });
      ui.text(canvas, fitLine.lines[0] ?? line, width / 2, c.subtitleY + index * Math.round(t.type.caption * 1.5), fitLine.size, "center", t.alpha.muted);
    });
  }

  function classicDeck(specs: readonly ChoiceCardSpec[], normalRow: boolean): void {
    const gridH = normalRow ? CLASSIC.grid.h : classicGridHeight(specs);
    specs.forEach((spec, index) => {
      classicCard(index, specs.length, spec, normalRow, gridH);
    });
  }

  /** The keys (or touch) line under each title names the input that owns the screen. */
  function keysLine(count: number, verb: string): string {
    if (context.touch) return `TAP A CARD TO READ IT  ·  TAP AGAIN TO ${verb}`;
    const keys = Array.from({ length: Math.min(4, count) }, (_, index) => String(index + 1)).join(" / ");
    return `press ${keys}`;
  }

  /** The instruction line under each title names the input that owns the screen. */
  function chooseLine(count: number, verb: string): string {
    if (context.touch) return keysLine(count, verb);
    return `${verb} ONE  ·  ${keysLine(count, verb)}`;
  }

  function draftSpec(card: DraftCardView, action: ScreenAction, tagPrefix?: string): ChoiceCardSpec {
    return { enabled: card.enabled, accent: card.accent ?? ui.t.color.accent,
      tag: [tagPrefix, card.badge, card.category].filter(Boolean).join("  ·  "), tagColor: card.badgeColor,
      name: card.label, desc: card.description ?? "", foot: card.owned ? "owned ×" + String(card.owned) : undefined, action };
  }

  function draftActions(view: DraftScreenView): { label: string; action: ScreenAction; enabled?: boolean }[] {
    const actions: { label: string; action: ScreenAction; enabled?: boolean }[] = [
      { label: `⟳  REROLL · ${String(view.rerolls)}${context.touch ? "" : "  [R]"}`, enabled: view.rerolls > 0, action: { type: "draft.reroll" } },
    ];
    if (view.race?.carried) {
      actions.push({ label: `TAKE RESERVED: ${view.race.carried.label}`, enabled: view.race.carried.enabled !== false,
        action: { type: "draft.choose", index: view.cards.length } });
    }
    if (view.race?.pass) actions.push({ label: "NO LEGAL CARDS — CONTINUE", action: { type: "draft.choose", index: -1 } });
    return actions;
  }

  function draft(view: DraftScreenView): void {
    const t = ui.t;
    ui.dim(context.canvas, width, height, 0.84);
    const subtitle = view.race ? `SHARED OFFERS · REROLL ${String(view.race.ordinal)} · CHOOSE ONE LEGAL UPGRADE` : chooseLine(view.cards.length, "TAKE");
    const specs = view.cards.map((card, index) => draftSpec(card, { type: "draft.choose", index }));
    if (!ui.density.compact) {
      classicHeader(`WAVE ${String(view.wave)} CLEARED`, [subtitle]);
      if (view.onboarding) {
        ui.textBox(context.canvas, view.onboarding, width / 2, CLASSIC.title.onboardingY, Math.min(960, width - 64),
          { size: t.type.body, align: "center", alpha: t.alpha.soft, lineHeight: 20, maxLines: 2 });
      }
      classicDeck(specs, true);
      actionRow(context, draftActions(view), CLASSIC.title.actionsY, width - 128);
      return;
    }
    const layout = overlayHeader(context, { title: `WAVE ${String(view.wave)} CLEARED`, subtitle: [subtitle] });
    let body = layout;
    if (view.onboarding) {
      // First-draft guidance wraps at body size above the cards; the deck starts under it.
      const guidance = ui.textBox(context.canvas, view.onboarding, layout.centerX, layout.bodyTop + t.type.body - t.space.sm, Math.min(960, layout.width),
        { size: t.type.body, align: "center", alpha: t.alpha.soft, maxLines: 3 });
      body = { ...layout, bodyTop: layout.bodyTop + guidance.height + t.space.sm };
    }
    deck(body, specs);
    actionRow(context, draftActions(view), layout.footerY, layout.width);
  }

  function reserve(view: ReserveScreenView): void {
    ui.dim(context.canvas, width, height, 0.84);
    const lines = [view.race ? "PERSONAL CARRIED CARD · SHARED OFFERS STAY UNCHANGED · TIER-UPS ARE PERSONAL"
      : "THIS CARD REPLACES ONE OFFER IN YOUR NEXT DRAFT", chooseLine(view.cards.length, "RESERVE")];
    const specs = view.cards.map((card, index) => draftSpec(card, { type: "reserve.choose", index }, "RESERVE"));
    const actions: { label: string; action: ScreenAction }[] = [
      { label: view.race ? "DISCARD RESERVE" : "SKIP RESERVE", action: { type: "reserve.choose", index: -1 } },
    ];
    if (view.keepCarried) actions.push({ label: "KEEP CARRIED CARD", action: { type: "reserve.choose", index: -2 } });
    if (!ui.density.compact) {
      classicHeader("RESERVE A CARD", lines);
      classicDeck(specs, true);
      actionRow(context, actions, CLASSIC.title.actionsY, width - 128);
      return;
    }
    const layout = overlayHeader(context, { title: "RESERVE A CARD", subtitle: lines });
    deck(layout, specs);
    actionRow(context, actions, layout.footerY, layout.width);
  }

  function tierup(view: TierUpScreenView): void {
    ui.dim(context.canvas, width, height, 0.86);
    const reveal = clamp(ez(context.enterSeconds / 0.3), 0, 1);
    const specs = view.cards.map((card, index): ChoiceCardSpec => {
      const next = card.nextTier ?? (card.tier ?? 1) + 1;
      return { enabled: card.enabled, accent: card.accent ?? ui.t.color.accent,
        tag: `TIER ${String(next)}${card.category ? `  ·  ${card.category}` : ""}`, tagColor: card.accent,
        name: card.label, desc: card.description ?? "", pips: { next }, action: { type: "tierup.choose", index } };
    });
    if (!ui.density.compact) {
      // One instruction line: the grid deals right under it.
      classicHeader("THE WAY OPENS", [`THE BOSS FALLS  ·  EVOLVE ONE ABILITY YOU OWN  ·  ${keysLine(view.cards.length, "EVOLVE")}`], reveal);
      classicDeck(specs, false);
      // past two grid rows, the deck scrolls
      if (view.cards.length > 8) scrollHint(context, view.canScrollUp, view.canScrollDown, height - 26);
      return;
    }
    const layout = overlayHeader(context, { title: "THE WAY OPENS", reveal,
      subtitle: ["THE BOSS FALLS  ·  EVOLVE ONE ABILITY YOU OWN", chooseLine(view.cards.length, "EVOLVE")] });
    deck(layout, specs);
  }

  return { draft, reserve, tierup };
}
