import type { DraftCardView, DraftScreenView, ReserveScreenView, ScreenAction, ScreenRenderContext, TierUpScreenView } from "./contracts";
import { scrollHint } from "./screen-primitives";

export function createDraftRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function choiceCards(cards: readonly DraftCardView[], action: (index: number) => ScreenAction): void {
    const { canvas } = context;
    const grid = cards.length > 3;
    const columns = grid ? 4 : cards.length;
    const cardWidth = grid ? 300 : 322;
    const cardHeight = grid ? 262 : 384;
    const gap = grid ? 24 : 34;
    cards.forEach((card, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const inRow = Math.min(columns, cards.length - row * columns);
      const rowWidth = cardWidth * inRow + gap * (inRow - 1);
      const x = (width - rowWidth) / 2 + column * (cardWidth + gap);
      const y = (grid ? 196 + row * (cardHeight + 26) - context.scroll : 248);
      if (y + cardHeight < 170 || y > height - 40) return;
      ui.card(canvas, x, y, cardWidth, cardHeight, context.focus === index);
      ui.accentStrip(canvas, x, y, cardWidth, card.accent, grid ? 7 : 9);
      ui.tag(canvas, [card.badge, card.category].filter(Boolean).join("  ·  "), x + 22, y + 34, card.accent, "left", ui.t.type.micro);
      ui.title(canvas, card.label, x + cardWidth / 2, y + (grid ? 66 : 96), grid ? ui.t.type.lead : ui.t.type.title);
      if (card.nextTier) ui.tag(canvas, `TIER ${String(card.tier ?? 1)} → ${String(card.nextTier)}`, x + cardWidth / 2, y + 106, card.accent, "center", ui.t.type.caption);
      if (card.description) ui.wrappedText(canvas, card.description, x + cardWidth / 2, y + (grid ? 128 : 154), cardWidth - 52, grid ? 21 : 25, grid ? ui.t.type.label : ui.t.type.body, "center");
      if (card.owned) ui.tag(canvas, `owned ×${String(card.owned)}`, x + cardWidth / 2, y + cardHeight - 24, ui.t.color.muted, "center", ui.t.type.caption);
      const hint = context.touch ? (context.focus === index ? "TAP AGAIN TO CONFIRM  ✓" : "TAP TO READ") : `press  [ ${String(index + 1)} ]`;
      ui.tag(canvas, hint, x + cardWidth / 2, y + cardHeight - 46, context.focus === index ? (card.accent ?? ui.t.color.accent) : ui.t.color.muted, "center", ui.t.type.micro);
      context.enqueue({ x, y, w: cardWidth, h: cardHeight, label: "", hiddenBox: true, confirm: true, action: action(index) });
    });
  }

  function draft(view: DraftScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.84);
    ui.title(canvas, `WAVE ${String(view.wave)} CLEARED`, width / 2, 122, ui.t.type.display);
    ui.accentStrip(canvas, width / 2 - 80, 140, 160, ui.t.color.accent, 3);
    ui.text(canvas, `CHOOSE AN UPGRADE  ·  press 1 / 2 / 3${view.cards.length > 3 ? " / 4" : ""}`, width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    choiceCards(view.cards, (index) => ({ type: "draft.choose", index }));
    context.enqueue({ x: width / 2 - 150, y: 680, w: 300, h: ui.t.metric.btnH, label: `⟳  REROLL · ${String(view.rerolls)}  [R]`, enabled: view.rerolls > 0, action: { type: "draft.reroll" } });
  }

  function reserve(view: ReserveScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.88);
    ui.title(canvas, "RESERVE A CARD", width / 2, 122, ui.t.type.display);
    ui.accentStrip(canvas, width / 2 - 80, 140, 160, ui.t.color.accent, 3);
    ui.text(canvas, "THIS CARD REPLACES ONE OFFER IN YOUR NEXT NORMAL DRAFT", width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    choiceCards(view.cards, (index) => ({ type: "reserve.choose", index }));
    context.enqueue({ x: width / 2 - 110, y: 680, w: 220, h: ui.t.metric.btnH, label: "SKIP RESERVE", action: { type: "reserve.choose", index: -1 } });
  }

  function tierup(view: TierUpScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.86);
    ui.title(canvas, "THE WAY OPENS", width / 2, 122, ui.t.type.display);
    ui.accentStrip(canvas, width / 2 - 80, 140, 160, ui.t.color.accent, 3);
    ui.text(canvas, "THE BOSS FALLS  ·  EVOLVE ANY ABILITY YOU OWN", width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    choiceCards(view.cards, (index) => ({ type: "tierup.choose", index }));
    scrollHint(context, view.canScrollUp, view.canScrollDown, height - 26);
  }

  return { draft, reserve, tierup };
}
